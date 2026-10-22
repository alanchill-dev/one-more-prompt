use super::*;
use crate::plugin_engine::runtime::ProgressFormat;
use serial_test::serial;
use std::time::Instant;

fn progress(used: f64) -> MetricLine {
    MetricLine::Progress {
        label: "Session".into(),
        used,
        limit: 100.0,
        format: ProgressFormat::Percent,
        resets_at: None,
        period_duration_ms: None,
        color: None,
    }
}

fn output(lines: Vec<MetricLine>) -> PluginOutput {
    PluginOutput {
        provider_id: "codex".into(),
        display_name: "Codex".into(),
        plan: None,
        lines,
        icon_url: String::new(),
    }
}

fn wait_for_writer() {
    let deadline = Instant::now() + Duration::from_secs(2);
    while cache_state().lock().unwrap().flush_scheduled {
        assert!(Instant::now() < deadline, "cache writer did not finish");
        std::thread::sleep(Duration::from_millis(5));
    }
}

#[test]
#[serial]
fn pending_write_shares_history_and_keeps_its_snapshot_during_quota_update() {
    let dir = std::env::temp_dir().join(format!("omp-cache-memory-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    init(
        &dir,
        vec!["codex".into()],
        HashSet::from(["codex".to_string()]),
    );

    // No worker is scheduled until the update: pin the generation deterministically.
    let history = MetricLine::Text {
        label: "Prompt Usage".into(),
        value: "1 prompt · 1 session".into(),
        color: None,
        subtitle: Some("private history".repeat(4096)),
        reset_expiry: None,
        reset_credits: None,
    };
    {
        let mut state = cache_state().lock().unwrap();
        state.snapshots.insert(
            "codex".into(),
            Arc::new(CachedPluginSnapshot {
                provider_id: "codex".into(),
                display_name: "Codex".into(),
                plan: None,
                lines: vec![progress(10.0), history],
                fetched_at: "2026-10-02T00:00:00Z".into(),
            }),
        );
        state.dirty_generation = 1;
    }

    let (_, _, pending) = pending_cache_write().unwrap();
    {
        let state = cache_state().lock().unwrap();
        assert!(
            Arc::ptr_eq(&pending["codex"], &state.snapshots["codex"]),
            "queueing a disk write must not duplicate history"
        );
    }
    assert!(cache_active_rate_limit_output(&output(vec![progress(
        42.0
    )])));
    let current = enabled_usage_snapshots();
    assert!(matches!(
        pending["codex"].lines[0],
        MetricLine::Progress { used: 10.0, .. }
    ));
    assert!(matches!(
        current[0].lines[0],
        MetricLine::Progress { used: 42.0, .. }
    ));
    assert_eq!(pending["codex"].lines.len(), current[0].lines.len());

    flush_cache();
    wait_for_writer();
    let persisted = load_cache(&dir);
    assert!(matches!(
        persisted["codex"].lines[0],
        MetricLine::Progress { used: 42.0, .. }
    ));
    assert!(
        matches!(&persisted["codex"].lines[1], MetricLine::Text { subtitle: Some(text), .. }
        if text == &"private history".repeat(4096))
    );
    // Leave this temporary test directory for the operating system to reclaim.
}

#[test]
fn buffered_persistence_preserves_large_private_strings_and_existing_schema() {
    let dir = std::env::temp_dir().join(format!("omp-cache-stream-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let text = concat!(r#"prompt with unicode 記憶體 and escaped "text""#, "\n").repeat(10_000);
    let snapshot = CachedPluginSnapshot {
        provider_id: "codex".into(),
        display_name: "Codex".into(),
        plan: None,
        lines: vec![MetricLine::Text {
            label: "Prompt Usage".into(),
            value: text.clone(),
            color: None,
            subtitle: None,
            reset_expiry: None,
            reset_credits: None,
        }],
        fetched_at: "2026-10-02T00:00:00Z".into(),
    };
    save_cache(&dir, &HashMap::from([("codex".into(), Arc::new(snapshot))])).unwrap();
    let parsed: serde_json::Value =
        serde_json::from_reader(std::fs::File::open(dir.join(CACHE_FILE_NAME)).unwrap()).unwrap();
    assert_eq!(parsed["version"], 1);
    assert_eq!(parsed["snapshots"]["codex"]["lines"][0]["value"], text);
    assert!(!dir.join(".usage-api-cache.json.tmp").exists());
}
