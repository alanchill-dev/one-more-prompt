use super::*;
use std::{
    env, fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::json;

fn codex_event(session_id: &str) -> CodexTokenUsageEvent {
    CodexTokenUsageEvent {
        cache_write_input_tokens: None,
        has_unrecorded_cache_writes: true,
        owner_id: session_id.to_string(),
        request_id: None,
        session_id: session_id.to_string(),
        timestamp: "2026-01-02T00:00:00.000Z".to_string(),
        model: Some("gpt-5".to_string()),
        input_tokens: 100,
        cached_input_tokens: 10,
        output_tokens: 50,
        reasoning_output_tokens: 0,
        total_tokens: 150,
        is_fallback_model: false,
    }
}

#[test]
fn keeps_matching_codex_usage_events_from_distinct_sessions() {
    let mut events = vec![codex_event("session-a"), codex_event("session-b")];

    dedupe_codex_events(&mut events);

    assert_eq!(events.len(), 2);
}

fn temp_dir(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = env::temp_dir().join(format!("ccusage-codex-exec-{name}-{nanos}"));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn loads_saved_codex_exec_json_usage() {
    let dir = temp_dir("json-usage");
    let file = dir.join("run.jsonl");
    fs::write(
        &file,
        [
            json!({
                "type": "turn.completed",
                "timestamp": "2026-01-02T03:04:05.000Z",
                "model": "gpt-5.2-codex",
                "usage": {
                    "input_tokens": 120,
                    "cached_input_tokens": 20,
                    "output_tokens": 30,
                    "total_tokens": 150,
                },
            })
            .to_string(),
            json!({
                "type": "result",
                "data": {
                    "timestamp": "2026-01-02T03:05:05.000Z",
                    "model_name": "gpt-5.2-codex",
                    "usage": {
                        "prompt_tokens": 50,
                        "cached_tokens": 5,
                        "completion_tokens": 12,
                    },
                },
            })
            .to_string(),
        ]
        .join("\n"),
    )
    .unwrap();

    let events = load_codex_events_from_directory(&dir, true).unwrap();

    assert_eq!(events.len(), 2);
    assert_eq!(events[0].session_id, "run");
    assert_eq!(events[0].timestamp, "2026-01-02T03:04:05.000Z");
    assert_eq!(events[0].model.as_deref(), Some("gpt-5.2-codex"));
    assert_eq!(events[0].input_tokens, 120);
    assert_eq!(events[0].cached_input_tokens, 20);
    assert_eq!(events[0].output_tokens, 30);
    assert_eq!(events[0].total_tokens, 150);
    assert_eq!(events[1].timestamp, "2026-01-02T03:05:05.000Z");
    assert_eq!(events[1].model.as_deref(), Some("gpt-5.2-codex"));
    assert_eq!(events[1].input_tokens, 50);
    assert_eq!(events[1].cached_input_tokens, 5);
    assert_eq!(events[1].output_tokens, 12);
    assert_eq!(events[1].total_tokens, 62);

    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn uses_nested_model_name_for_standalone_exec_usage() {
    let dir = temp_dir("model-name");
    let file = dir.join("solo.jsonl");
    fs::write(
        &file,
        json!({
            "data": {
                "timestamp": "2026-03-01T00:00:00.000Z",
                "model_name": "gpt-5.2-codex",
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "total_tokens": 15,
                },
            },
        })
        .to_string(),
    )
    .unwrap();

    let events = load_codex_events_from_directory(&dir, true).unwrap();

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].session_id, "solo");
    assert_eq!(events[0].model.as_deref(), Some("gpt-5.2-codex"));
    assert_eq!(events[0].input_tokens, 10);
    assert_eq!(events[0].output_tokens, 5);
    assert_eq!(events[0].total_tokens, 15);

    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn compression_preserves_session_identity() {
    let root = std::path::Path::new("/tmp/sessions");
    assert_eq!(
        codex_session_id(root, &root.join("2026/10/03/rollout.jsonl")),
        codex_session_id(root, &root.join("2026/10/03/rollout.jsonl.zst"))
    );
}
