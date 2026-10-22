use super::*;
use serial_test::serial;

#[test]
#[serial]
fn retired_provider_ids_cannot_reenter_http_or_ui_through_settings_and_cache() {
    let root = std::env::temp_dir().join(format!("omp-cache-boundary-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    std::fs::write(
        root.join(SETTINGS_FILE_NAME),
        r#"{"plugins":{"order":["retired","codex"],"disabled":[]}}"#,
    )
    .unwrap();
    let make = |id: &str| CachedPluginSnapshot {
        provider_id: id.into(),
        display_name: id.into(),
        plan: None,
        lines: vec![],
        fetched_at: "2026-10-01T00:00:00Z".into(),
    };
    save_cache(
        &root,
        &HashMap::from([
            ("retired".into(), make("retired")),
            ("codex".into(), make("codex")),
            ("forged".into(), make("codex")),
        ]),
    )
    .unwrap();
    init(&root, vec!["codex".into()], HashSet::new());
    assert_eq!(
        read_enabled_plugin_ids(&root, &["codex".into()], &HashSet::new()),
        ["codex"]
    );
    assert_eq!(
        enabled_usage_snapshots()
            .iter()
            .map(|s| s.provider_id.as_str())
            .collect::<Vec<_>>(),
        ["codex"]
    );
    {
        let mut state = cache_state().lock().unwrap();
        assert_eq!(state.snapshots.len(), 1);
        // Defense at publication also handles an old in-memory snapshot.
        state
            .snapshots
            .insert("retired".into(), Arc::new(make("retired")));
        assert_eq!(
            enabled_public_snapshots_ordered(&state)
                .iter()
                .map(|s| s.provider_id.as_str())
                .collect::<Vec<_>>(),
            ["codex"]
        );
    }
    std::fs::remove_dir_all(root).unwrap();
}
