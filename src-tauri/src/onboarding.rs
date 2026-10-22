use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;
use specta::Type;
use tauri::{Emitter, Manager};
use tauri_plugin_store::StoreExt;

use crate::plugin_engine::runtime::MetricLine;
use crate::plugin_engine::scan_progress::{OnboardingScanProgress, ScanProgressCallback};

pub const SETTINGS_STORE: &str = "settings.json";
pub const ONBOARDING_COMPLETED_KEY: &str = "onboardingCompleted";
pub const ONBOARDING_COMPLETED_AT_KEY: &str = "onboardingCompletedAt";
pub const ONBOARDING_SETUP_COMPLETED_KEY: &str = "onboardingSetupCompleted";
pub const ONBOARDING_GUIDE_PENDING_KEY: &str = "onboardingGuidePending";
pub const ONBOARDING_GUIDE_REQUIRED_KEY: &str = "onboardingGuideRequired";
static CONTEXTUAL_GUIDE_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn contextual_guide_active() -> bool {
    CONTEXTUAL_GUIDE_ACTIVE.load(Ordering::Acquire)
}

#[tauri::command]
#[specta::specta]
pub fn set_contextual_guide_active(active: bool) {
    CONTEXTUAL_GUIDE_ACTIVE.store(active, Ordering::Release);
}

// Store-independent completion marker. The settings store silently loads as
// empty when settings.json is corrupt or truncated, which would re-trigger
// onboarding on every such launch; this file survives that failure mode.
// The old flag and marker could be written by Skip Setup.
const COMPLETION_MARKER_FILE: &str = "onboarding-setup-complete";

pub fn onboarding_completed_from_value(value: Option<&serde_json::Value>) -> bool {
    matches!(value, Some(serde_json::Value::Bool(true)))
}

pub fn onboarding_completed(store_flag: Option<&serde_json::Value>, marker_exists: bool) -> bool {
    onboarding_completed_from_value(store_flag) || marker_exists
}

fn completion_marker_path(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    match app_handle.path().app_data_dir() {
        Ok(dir) => Some(dir.join(COMPLETION_MARKER_FILE)),
        Err(error) => {
            log::warn!("failed to resolve app data dir for onboarding marker: {error}");
            None
        }
    }
}

fn completion_marker_exists(app_handle: &tauri::AppHandle) -> bool {
    completion_marker_path(app_handle).is_some_and(|path| path.exists())
}

fn write_completion_marker(app_handle: &tauri::AppHandle) {
    let Some(path) = completion_marker_path(app_handle) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Err(error) = std::fs::write(&path, b"") {
        log::warn!("failed to write onboarding completion marker: {error}");
    }
}

pub fn is_onboarding_completed(app_handle: &tauri::AppHandle) -> bool {
    let value = app_handle
        .store(SETTINGS_STORE)
        .ok()
        .and_then(|store| store.get(ONBOARDING_SETUP_COMPLETED_KEY));
    let marker = completion_marker_exists(app_handle);
    let flag = onboarding_completed_from_value(value.as_ref());
    if marker && !flag {
        log::warn!(
            "onboarding flag missing from settings store but completion marker exists; \
             settings.json may have been reset or corrupted"
        );
    }
    if flag && !marker {
        // Backfill for installs that completed onboarding before the marker
        // existed.
        write_completion_marker(app_handle);
    }
    onboarding_completed(value.as_ref(), marker)
}

pub fn show_setup_window_if_needed(app_handle: &tauri::AppHandle) -> tauri::Result<()> {
    if is_onboarding_completed(app_handle) {
        return Ok(());
    }

    show_setup_window(app_handle)
}

pub fn show_required_setup(app_handle: &tauri::AppHandle) -> bool {
    if is_onboarding_completed(app_handle) {
        return false;
    }
    if let Err(error) = show_setup_window(app_handle) {
        log::error!("Failed to show required setup: {error}");
    }
    true
}

fn show_setup_window(app_handle: &tauri::AppHandle) -> tauri::Result<()> {
    let already_open = app_handle.get_webview_window("setup").is_some();
    crate::panel::create_chromeless_window(
        app_handle,
        "setup",
        "index.html#/setup",
        "One More Prompt Setup",
        720.0,
        640.0,
        560.0,
        540.0,
        true,
    )?;
    if !already_open {
        if let Some(window) = app_handle.get_webview_window("setup") {
            let handle = app_handle.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if !is_onboarding_completed(&handle) {
                        api.prevent_close();
                    }
                }
            });
        }
    }
    Ok(())
}

fn validate_setup_completion(completed: bool, skip_setup: bool) -> Result<(), &'static str> {
    if skip_setup && !completed {
        return Err("Complete the first setup before continuing.");
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn can_skip_onboarding(app_handle: tauri::AppHandle) -> bool {
    is_onboarding_completed(&app_handle)
}

fn save_onboarding_completion(
    app_handle: &tauri::AppHandle,
    show_guide: bool,
    skip_setup: bool,
) -> Result<(), String> {
    let setup_completed = is_onboarding_completed(app_handle);
    validate_setup_completion(setup_completed, skip_setup)?;
    let store = app_handle
        .store(SETTINGS_STORE)
        .map_err(|error| format!("failed to open settings store: {error}"))?;
    store.set(ONBOARDING_GUIDE_REQUIRED_KEY, serde_json::json!(false));
    store.set(
        ONBOARDING_GUIDE_PENDING_KEY,
        serde_json::json!(offer_guide_after_setup(
            setup_completed,
            show_guide,
            skip_setup
        )),
    );
    if !skip_setup {
        store.set(ONBOARDING_SETUP_COMPLETED_KEY, serde_json::json!(true));
        store.set(ONBOARDING_COMPLETED_KEY, serde_json::json!(true));
        store.set(
            ONBOARDING_COMPLETED_AT_KEY,
            serde_json::json!(crate::unix_now_ms()),
        );
    }
    store
        .save()
        .map_err(|error| format!("failed to save onboarding completion: {error}"))?;
    if !skip_setup {
        write_completion_marker(app_handle);
    }
    Ok(())
}

fn offer_guide_after_setup(setup_completed: bool, show_guide: bool, skip_setup: bool) -> bool {
    !skip_setup && (!setup_completed || show_guide)
}

#[derive(Debug, Clone, Copy, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OnboardingDestination {
    Overview,
    PromptUsage,
}

impl OnboardingDestination {
    fn panel_view(self) -> &'static str {
        match self {
            Self::Overview => "home",
            Self::PromptUsage => "prompt-usage",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingCodexScan {
    pub prompt_count: f64,
    pub session_count: f64,
    pub credentials_detected: bool,
}

fn parse_prompt_usage_count_value(value: &str) -> Option<(f64, f64)> {
    let (prompts, sessions) = value.split_once('·')?;
    let prompt_count = prompts.split_whitespace().next()?.parse::<f64>().ok()?;
    let session_count = sessions.split_whitespace().next()?.parse::<f64>().ok()?;
    Some((prompt_count, session_count))
}

#[tauri::command]
#[specta::specta]
pub async fn scan_onboarding_codex(
    on_progress: tauri::ipc::Channel<OnboardingScanProgress>,
    state: tauri::State<'_, std::sync::Mutex<crate::AppState>>,
) -> Result<OnboardingCodexScan, String> {
    let (plugin, app_data_dir, app_version, credentials_detected) = {
        let locked = state
            .lock()
            .map_err(|_| "Local Codex state is unavailable.".to_string())?;
        let plugin = locked
            .plugins
            .iter()
            .find(|plugin| plugin.manifest.id == "codex")
            .cloned()
            .ok_or_else(|| "Codex support is unavailable in this build.".to_string())?;
        let detected = crate::plugin_engine::manifest::is_plugin_detected(&plugin.manifest);
        (
            plugin,
            locked.app_data_dir.clone(),
            locked.app_version.clone(),
            detected,
        )
    };

    let channel_failed = AtomicBool::new(false);
    let progress_callback: ScanProgressCallback = std::sync::Arc::new(move |progress| {
        if !channel_failed.load(Ordering::Relaxed) && on_progress.send(progress).is_err() {
            channel_failed.store(true, Ordering::Relaxed);
            log::warn!("onboarding scan progress receiver disconnected");
        }
    });
    let output = tauri::async_runtime::spawn_blocking(move || {
        crate::prompt_usage_watcher::run_local_prompt_usage_probe_with_progress(
            &plugin,
            &app_data_dir,
            &app_version,
            progress_callback,
        )
    })
    .await
    .map_err(|error| {
        log::error!("onboarding Codex scan worker failed: {error}");
        "The local Codex scan could not be completed.".to_string()
    })?;

    if let Some(MetricLine::Badge { text, .. }) = output
        .lines
        .iter()
        .find(|line| matches!(line, MetricLine::Badge { label, .. } if label == "Error"))
    {
        log::warn!(
            "onboarding Codex scan failed: {}",
            crate::plugin_engine::host_api::redact_log_message(text)
        );
        return Err("Local Codex data could not be read.".to_string());
    }

    let counts = output.lines.iter().find_map(|line| match line {
        MetricLine::Text { label, value, .. } if label == "Prompt Usage" => {
            parse_prompt_usage_count_value(value)
        }
        _ => None,
    });
    let Some((prompt_count, session_count)) = counts else {
        log::warn!("onboarding Codex scan returned no Prompt Usage summary");
        return Err("Local Codex history could not be summarized.".to_string());
    };

    Ok(OnboardingCodexScan {
        prompt_count,
        session_count,
        credentials_detected,
    })
}

#[tauri::command]
#[specta::specta]
pub fn finish_onboarding(
    app_handle: tauri::AppHandle,
    destination: OnboardingDestination,
    show_guide: bool,
    skip_setup: bool,
) -> Result<(), String> {
    save_onboarding_completion(&app_handle, show_guide, skip_setup)?;
    crate::whats_new::save_last_seen_version(
        &app_handle,
        &app_handle.package_info().version.to_string(),
    )?;

    crate::panel::close_window_and_show_panel(&app_handle, "setup", destination.panel_view())?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn replay_contextual_guide(app_handle: tauri::AppHandle) -> Result<(), String> {
    let store = app_handle
        .store(SETTINGS_STORE)
        .map_err(|error| format!("failed to open settings store: {error}"))?;
    store.set(ONBOARDING_GUIDE_PENDING_KEY, serde_json::json!(true));
    store.set(ONBOARDING_GUIDE_REQUIRED_KEY, serde_json::json!(false));
    store
        .save()
        .map_err(|error| format!("failed to queue operation guide: {error}"))?;
    let handle = app_handle.clone();
    app_handle
        .run_on_main_thread(move || {
            crate::panel::show_panel(&handle);
            if let Err(error) = handle.emit("contextual-guide-requested", ()) {
                log::error!("failed to request operation guide: {error}");
            }
        })
        .map_err(|error| format!("failed to open operation guide: {error}"))
}

// Windows WebView creation deadlocks inside synchronous commands.
#[tauri::command]
#[specta::specta]
pub async fn reset_onboarding(app_handle: tauri::AppHandle) -> Result<(), String> {
    let store = app_handle
        .store(SETTINGS_STORE)
        .map_err(|error| format!("failed to open settings store: {error}"))?;
    // Rechecking Codex preserves first-run completion and does not replay the guide.
    store.set(ONBOARDING_GUIDE_PENDING_KEY, serde_json::json!(false));
    store.set(ONBOARDING_GUIDE_REQUIRED_KEY, serde_json::json!(false));
    store
        .save()
        .map_err(|error| format!("failed to save onboarding reset: {error}"))?;
    show_setup_window(&app_handle)
        .map_err(|error| format!("failed to reopen onboarding: {error}"))?;
    crate::panel::hide_panel(&app_handle);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        COMPLETION_MARKER_FILE, ONBOARDING_SETUP_COMPLETED_KEY, OnboardingDestination,
        offer_guide_after_setup, onboarding_completed, onboarding_completed_from_value,
        parse_prompt_usage_count_value, validate_setup_completion,
    };

    #[test]
    fn legacy_setup_and_guide_flags_do_not_prove_the_two_screen_setup_was_completed() {
        let settings = serde_json::json!({
            "onboardingCompleted": true,
            "onboardingGuidePending": false,
            "onboardingGuideRequired": false,
            "onboardingGuideCompletedAt": 1234.0,
            "onboardingGuideFinishedAt": 1234.0,
        });
        assert!(!onboarding_completed(
            settings.get(ONBOARDING_SETUP_COMPLETED_KEY),
            false
        ));
        assert_ne!(COMPLETION_MARKER_FILE, "onboarding-complete");
    }

    #[test]
    fn completed_setup_does_not_require_the_optional_guide_to_be_finished() {
        let settings = serde_json::json!({
            "onboardingSetupCompleted": true,
            "onboardingGuidePending": true,
            "onboardingGuideRequired": true,
        });
        assert!(onboarding_completed(
            settings.get(ONBOARDING_SETUP_COMPLETED_KEY),
            false
        ));
    }

    #[test]
    fn first_setup_cannot_be_skipped() {
        assert!(validate_setup_completion(false, true).is_err());
    }

    #[test]
    fn first_setup_offers_the_demo_guide_without_requiring_history() {
        assert_eq!(validate_setup_completion(false, false), Ok(()));
        assert!(offer_guide_after_setup(false, false, false));
        assert!(offer_guide_after_setup(false, true, false));
    }

    #[test]
    fn codex_recheck_does_not_force_the_guide() {
        assert!(!offer_guide_after_setup(true, false, false));
        assert!(!offer_guide_after_setup(true, true, true));
        assert!(offer_guide_after_setup(true, true, false));
    }

    #[test]
    fn completed_setup_replays_can_skip_or_finish() {
        assert_eq!(validate_setup_completion(true, true), Ok(()));
        assert_eq!(validate_setup_completion(true, false), Ok(()));
    }

    #[test]
    fn marker_counts_as_completed_when_store_flag_missing() {
        assert!(onboarding_completed(None, true));
        assert!(onboarding_completed(Some(&serde_json::json!(false)), true));
    }

    #[test]
    fn fresh_install_shows_onboarding() {
        assert!(!onboarding_completed(None, false));
    }

    #[test]
    fn store_flag_alone_counts_as_completed() {
        assert!(onboarding_completed(Some(&serde_json::json!(true)), false));
    }

    #[test]
    fn onboarding_completed_defaults_to_false() {
        assert!(!onboarding_completed_from_value(None));
        assert!(!onboarding_completed_from_value(Some(&serde_json::json!(
            false
        ))));
        assert!(!onboarding_completed_from_value(Some(&serde_json::json!(
            "true"
        ))));
    }

    #[test]
    fn onboarding_completed_reads_true() {
        assert!(onboarding_completed_from_value(Some(&serde_json::json!(
            true
        ))));
    }

    #[test]
    fn parses_prompt_usage_counts() {
        assert_eq!(
            parse_prompt_usage_count_value("12 prompts · 3 sessions"),
            Some((12.0, 3.0))
        );
        assert_eq!(
            parse_prompt_usage_count_value("1 prompt · 1 session"),
            Some((1.0, 1.0))
        );
        assert_eq!(parse_prompt_usage_count_value("unavailable"), None);
    }

    #[test]
    fn onboarding_destinations_map_to_known_panel_views() {
        assert_eq!(OnboardingDestination::Overview.panel_view(), "home");
        assert_eq!(
            OnboardingDestination::PromptUsage.panel_view(),
            "prompt-usage"
        );
    }
}
