use crate::PromptUsageUpdated;
use crate::plugin_engine::manifest::LoadedPlugin;
use crate::plugin_engine::runtime::{self, MetricLine, PluginOutput};
use crate::plugin_engine::scan_progress::{
    OnboardingScanProgress, ScanPhase, ScanProgressCallback,
};
use crate::prompt_activity::PromptActivityState;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, mpsc};
use std::time::Duration;
use tauri::Emitter;

const PROMPT_USAGE_DEBOUNCE: Duration = Duration::from_millis(350);

fn codex_probe_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub fn run_probe(plugin: &LoadedPlugin, app_data_dir: &PathBuf, app_version: &str) -> PluginOutput {
    if plugin.manifest.id != "codex" {
        return runtime::run_probe(plugin, app_data_dir, app_version);
    }
    let _guard = codex_probe_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    runtime::run_probe(plugin, app_data_dir, app_version)
}

pub fn run_local_prompt_usage_probe(
    plugin: &LoadedPlugin,
    app_data_dir: &PathBuf,
    app_version: &str,
) -> PluginOutput {
    let _guard = codex_probe_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    runtime::run_prompt_usage_probe(plugin, app_data_dir, app_version)
}

pub fn run_local_prompt_usage_probe_with_progress(
    plugin: &LoadedPlugin,
    app_data_dir: &PathBuf,
    app_version: &str,
    on_progress: ScanProgressCallback,
) -> PluginOutput {
    on_progress(OnboardingScanProgress::phase(ScanPhase::Waiting));
    let _guard = codex_probe_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    on_progress(OnboardingScanProgress::phase(ScanPhase::Discovering));
    runtime::run_prompt_usage_probe_with_progress(plugin, app_data_dir, app_version, on_progress)
}

fn path_needs_refresh(path: &Path, codex_home: &Path, sessions_root: &Path) -> bool {
    if path.starts_with(sessions_root) {
        return path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".jsonl") || name.ends_with(".jsonl.zst"));
    }
    if path.parent() != Some(codex_home) {
        return false;
    }
    matches!(
        path.file_name().and_then(|name| name.to_str()),
        Some(
            ".codex-global-state.json"
                | "session_index.jsonl"
                | "state_5.sqlite"
                | "state_5.sqlite-wal"
                | "state_5.sqlite-shm"
        )
    )
}

fn event_needs_refresh(event: &Event, codex_home: &Path, sessions_root: &Path) -> bool {
    !matches!(event.kind, EventKind::Access(_))
        && event
            .paths
            .iter()
            .any(|path| path_needs_refresh(path, codex_home, sessions_root))
}

fn refresh_prompt_usage(
    app_handle: &tauri::AppHandle,
    plugin: &LoadedPlugin,
    app_data_dir: &PathBuf,
    app_version: &str,
    prompt_activity: &PromptActivityState,
) {
    let output = run_local_prompt_usage_probe(plugin, app_data_dir, app_version);
    prompt_activity.set_active(output_has_active_prompt_usage(&output));
    if let Some(MetricLine::Badge { text, .. }) = output
        .lines
        .iter()
        .find(|line| matches!(line, MetricLine::Badge { label, .. } if label == "Error"))
    {
        log::error!("prompt usage live refresh failed: {text}");
        return;
    }
    if crate::local_http_api::cache_prompt_usage_output(&output) {
        if let Err(error) = app_handle.emit("prompt-usage:updated", PromptUsageUpdated {}) {
            log::warn!("failed to emit prompt usage update: {error}");
        }
    } else {
        log::debug!("prompt usage live refresh deferred until the Codex cache is ready");
    }
}

pub fn start(
    app_handle: tauri::AppHandle,
    plugin: Arc<LoadedPlugin>,
    app_data_dir: PathBuf,
    app_version: String,
    prompt_activity: Arc<PromptActivityState>,
) {
    let codex_home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".codex")));
    let Some(codex_home) = codex_home else {
        log::error!("prompt usage live sync could not resolve the Codex home directory");
        return;
    };
    let sessions_root = codex_home.join("sessions");

    std::thread::spawn(move || {
        let (event_tx, event_rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(event_tx) {
            Ok(watcher) => watcher,
            Err(error) => {
                log::error!("prompt usage live sync could not start: {error}");
                return;
            }
        };
        if let Err(error) = watcher.watch(&codex_home, RecursiveMode::NonRecursive) {
            log::error!("prompt usage live sync could not watch Codex metadata: {error}");
            return;
        }
        if sessions_root.is_dir() {
            if let Err(error) = watcher.watch(&sessions_root, RecursiveMode::Recursive) {
                log::error!("prompt usage live sync could not watch Codex sessions: {error}");
                return;
            }
        } else {
            log::warn!("prompt usage live sync found no Codex sessions directory");
        }

        refresh_prompt_usage(
            &app_handle,
            &plugin,
            &app_data_dir,
            &app_version,
            &prompt_activity,
        );
        let mut dirty = false;
        loop {
            let wait = if dirty {
                PROMPT_USAGE_DEBOUNCE
            } else {
                Duration::from_secs(3_600)
            };
            match event_rx.recv_timeout(wait) {
                Ok(Ok(event)) => {
                    if event_needs_refresh(&event, &codex_home, &sessions_root) {
                        dirty = true;
                    }
                }
                Ok(Err(error)) => log::warn!("prompt usage live sync watch error: {error}"),
                Err(mpsc::RecvTimeoutError::Timeout) if dirty => {
                    dirty = false;
                    refresh_prompt_usage(
                        &app_handle,
                        &plugin,
                        &app_data_dir,
                        &app_version,
                        &prompt_activity,
                    );
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    log::error!("prompt usage live sync watcher disconnected");
                    return;
                }
            }
        }
    });
}

fn output_has_active_prompt_usage(output: &PluginOutput) -> bool {
    output.lines.iter().any(|line| {
        let MetricLine::Text {
            label,
            subtitle: Some(subtitle),
            ..
        } = line
        else {
            return false;
        };
        if label != "Project Group" && label != "Session" {
            return false;
        }
        serde_json::from_str::<serde_json::Value>(subtitle)
            .ok()
            .and_then(|value| value.get("isActive").and_then(serde_json::Value::as_bool))
            .unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watches_compressed_log_creation_renames_and_removal() {
        use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
        let home = Path::new("/tmp/.codex");
        let sessions = home.join("sessions");
        let plain = sessions.join("2026/04/28/task.jsonl");
        let compressed = sessions.join("2026/04/28/task.jsonl.zst");
        for event in [
            Event::new(EventKind::Create(CreateKind::File)).add_path(compressed.clone()),
            Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
                .add_path(plain)
                .add_path(compressed.clone()),
            Event::new(EventKind::Remove(RemoveKind::File)).add_path(compressed),
        ] {
            assert!(event_needs_refresh(&event, home, &sessions));
        }
    }

    #[test]
    fn watches_session_logs_and_codex_ui_metadata_only() {
        let codex_home = Path::new("/tmp/.codex");
        let sessions_root = Path::new("/tmp/.codex/sessions");

        assert!(path_needs_refresh(
            Path::new("/tmp/.codex/sessions/2026/08/24/task.jsonl"),
            codex_home,
            sessions_root,
        ));
        assert!(path_needs_refresh(
            Path::new("/tmp/.codex/.codex-global-state.json"),
            codex_home,
            sessions_root,
        ));
        assert!(path_needs_refresh(
            Path::new("/tmp/.codex/state_5.sqlite-wal"),
            codex_home,
            sessions_root,
        ));
        assert!(!path_needs_refresh(
            Path::new("/tmp/.codex/memories/MEMORY.md"),
            codex_home,
            sessions_root,
        ));
    }

    #[test]
    fn uses_prompt_usage_activity_metadata_for_the_native_refresh_state() {
        let output = PluginOutput {
            provider_id: "codex".to_string(),
            display_name: "Codex".to_string(),
            plan: None,
            icon_url: String::new(),
            lines: vec![
                MetricLine::Text {
                    label: "Prompt Usage".to_string(),
                    value: "1 prompt · 1 session".to_string(),
                    color: None,
                    subtitle: None,
                    reset_expiry: None,
                    reset_credits: None,
                },
                MetricLine::Text {
                    label: "Session".to_string(),
                    value: "Running".to_string(),
                    color: None,
                    subtitle: Some(r#"{"isActive":true}"#.to_string()),
                    reset_expiry: None,
                    reset_credits: None,
                },
            ],
        };
        assert!(output_has_active_prompt_usage(&output));
    }
}
