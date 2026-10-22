//! Opt-in acceptance against local history. Sources are read-only; indexes stay in a temporary directory.
use super::*;
use crate::plugin_engine::manifest;
use crate::plugin_engine::scan_progress::OnboardingScanProgress;
use serde_json::json;
use std::sync::{Arc, Mutex};

#[test]
#[ignore = "Reads the local Codex corpus; run explicitly with --ignored --nocapture"]
fn local_history_corpus_cold_and_warm() {
    let plugins = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../plugins");
    let plugin = manifest::load_plugins_from_dir(&plugins)
        .into_iter()
        .find(|plugin| plugin.manifest.id == "codex")
        .expect("Codex plugin");
    let app_dir = std::env::temp_dir().join(format!("omp-native-history-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&app_dir).unwrap();
    let pricing_file = app_dir.join("pricing/litellm-pricing.json");
    std::fs::create_dir_all(pricing_file.parent().unwrap()).unwrap();
    if let Some(source) = dirs::data_dir().map(|dir| dir.join("com.alanchill.onemoreprompt/pricing/litellm-pricing.json")) {
        if source.exists() {
            std::fs::copy(source, &pricing_file).unwrap();
        }
    }
    // Only cached/embedded prices are read; no pricing refresh is started.
    crate::plugin_engine::pricing_cache::init_for_tests(&app_dir, "http://127.0.0.1:9");
    let progress = Arc::new(Mutex::new(Vec::<OnboardingScanProgress>::new()));
    let observed = progress.clone();
    let callback: ScanProgressCallback = Arc::new(move |value| {
        let mut values = observed.lock().unwrap();
        if values.last().is_none_or(|last| last.phase != value.phase || value.processed_files - last.processed_files >= 50.0 || value.processed_files == value.total_files) {
            println!("local-history-progress {}", serde_json::to_string(&value).unwrap());
            values.push(value);
        }
    });
    let started = Instant::now();
    let cold = run_prompt_usage_probe_with_progress(&plugin, &app_dir, "1.0.0", callback);
    let cold_ms = started.elapsed().as_millis();
    assert_no_error(&cold);
    let old_count = cold.lines.iter().filter(|line| historical_prompt(line)).count();
    assert!(old_count > 0, "compressed history before September 16 must be present");
    let started = Instant::now();
    let warm = run_prompt_usage_probe(&plugin, &app_dir, "1.0.0");
    let warm_ms = started.elapsed().as_millis();
    assert_no_error(&warm);
    let mut cold_history = historical_rows(&cold);
    let mut warm_history = historical_rows(&warm);
    cold_history.sort();
    warm_history.sort();
    assert_eq!(cold_history, warm_history, "warm cache must preserve historical prompt data");
    let values = progress.lock().unwrap();
    let last = values.last().expect("real file progress");
    assert_eq!(last.phase, scan_progress::ScanPhase::Summarizing);
    assert_eq!(last.processed_files, last.total_files);
    assert!(last.total_files >= 770.0, "compressed sources must enter progress totals");
    let summary = json!({
        "coldMs":cold_ms,"warmMs":warm_ms,"files":last.total_files,
        "historicalPromptsBeforeSep16":old_count,"promptRows":prompt_count(&cold),
        "appDataDir":app_dir,"sourceReadOnly":true,"warmHistoricalParity":true,
    });
    std::fs::write(app_dir.join("summary.json"), serde_json::to_vec_pretty(&summary).unwrap()).unwrap();
    // This private output is available for the formal component/UI acceptance harness.
    std::fs::write(app_dir.join("output-private.json"), serde_json::to_vec(&warm).unwrap()).unwrap();
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&app_dir, std::fs::Permissions::from_mode(0o700)).unwrap();
        std::fs::set_permissions(app_dir.join("output-private.json"), std::fs::Permissions::from_mode(0o600)).unwrap();
    }
    println!("local-history-result {summary}");
}

fn assert_no_error(output: &PluginOutput) {
    for line in &output.lines {
        if let MetricLine::Badge { label, text, .. } = line {
            assert_ne!(label, "Error", "native history probe failed: {text}");
        }
    }
}

fn historical_prompt(line: &MetricLine) -> bool {
    let MetricLine::Text { label, subtitle: Some(subtitle), .. } = line else { return false };
    if label != "Prompt" { return false; }
    serde_json::from_str::<serde_json::Value>(subtitle).ok()
        .and_then(|row| row.get("startedAt").and_then(|value| value.as_str()).map(str::to_owned))
        .is_some_and(|at| at.as_str() < "2026-09-16")
}

fn historical_rows(output: &PluginOutput) -> Vec<String> {
    output.lines.iter().filter(|line| historical_prompt(line))
        .map(|line| serde_json::to_string(line).unwrap()).collect()
}

fn prompt_count(output: &PluginOutput) -> usize {
    output.lines.iter().filter(|line| matches!(line, MetricLine::Text { label, .. } if label == "Prompt")).count()
}
