use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
struct Home(PathBuf);
impl Home {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "omp-codex-zstd-{}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(p.join("sessions")).unwrap();
        Self(p)
    }
    fn write(&self, name: &str, records: &[Value]) {
        let bytes = records
            .iter()
            .map(Value::to_string)
            .collect::<Vec<_>>()
            .join("\n");
        let bytes = if name.ends_with(".zst") {
            zstd::stream::encode_all(bytes.as_bytes(), 1).unwrap()
        } else {
            bytes.into_bytes()
        };
        fs::write(self.0.join("sessions").join(name), bytes).unwrap();
    }
    fn query(&self, hourly: bool) -> Result<Value, String> {
        if hourly {
            ccusage_vendor::codex_hourly_json(Some(&self.0), None, None, None)
        } else {
            ccusage_vendor::codex_daily_json(Some(&self.0), None, None, None)
        }
    }
}
impl Drop for Home {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn event(s: u8, kind: &str, payload: Value) -> Value {
    json!({"type":kind,"timestamp":format!("2026-10-03T15:55:{s:02}.000Z"),"payload":payload})
}
fn usage(n: u64) -> Value {
    json!({"input_tokens":n,"cached_input_tokens":0,"output_tokens":0,"reasoning_output_tokens":0,"total_tokens":n})
}
fn context(turn: &str, model: &str) -> Value {
    event(0, "turn_context", json!({"turn_id":turn,"model":model}))
}
fn meta(thread: &str) -> Value {
    event(0, "session_meta", json!({"id":thread}))
}
fn legacy(s: u8, last: u64, total: u64) -> Value {
    event(
        s,
        "event_msg",
        json!({"type":"token_count","info":{"last_token_usage":usage(last),"total_token_usage":usage(total)}}),
    )
}
fn request(s: u8, n: u64, response: &str, thread: &str, turn: &str) -> Value {
    event(
        s,
        "token_usage_record",
        json!({"thread_id":thread,"turn_id":turn,"response_id":response,"usage":usage(n)}),
    )
}
fn total(v: &Value) -> u64 {
    v["totals"]["totalTokens"].as_u64().unwrap()
}
#[test]
fn compressed_reports_match_plain_and_coexisting_formats_without_losing_continuations() {
    let p = Home::new();
    let c = Home::new();
    let a = vec![meta("thread"), context("first", "gpt-5.5"), legacy(1, 7, 7)];
    let b = vec![
        meta("thread"),
        context("next", "gpt-5.5"),
        legacy(2, 11, 11),
    ];
    p.write("a.jsonl", &a);
    p.write("next.jsonl", &b);
    c.write("a.jsonl.zst", &a);
    c.write("next.jsonl.zst", &b);
    for h in [false, true] {
        assert_eq!(p.query(h).unwrap(), c.query(h).unwrap());
    }
    c.write("a.jsonl", &a);
    assert_eq!(total(&c.query(false).unwrap()), 18);
    assert_eq!(p.query(true).unwrap(), c.query(true).unwrap());
}
#[test]
fn request_records_keep_legacy_prefix_and_suffix_without_double_counting_partners() {
    let h = Home::new();
    h.write(
        "mixed.jsonl.zst",
        &[
            meta("thread"),
            context("turn", "gpt-5.5"),
            legacy(1, 10, 10),
            request(2, 20, "a", "thread", "turn"),
            legacy(2, 20, 30),
            legacy(3, 5, 35),
        ],
    );
    for hourly in [false, true] {
        assert_eq!(total(&h.query(hourly).unwrap()), 35);
    }
}
#[test]
fn request_identity_preserves_distinct_equal_responses_and_suppresses_replays() {
    let h = Home::new();
    h.write(
        "requests.jsonl",
        &[
            meta("thread"),
            context("turn", "gpt-5.5"),
            request(2, 7, "a", "thread", "turn"),
            legacy(2, 7, 7),
            request(2, 7, "a", "thread", "turn"),
            legacy(2, 7, 7),
            request(2, 7, "b", "thread", "turn"),
            legacy(2, 7, 14),
        ],
    );
    assert_eq!(total(&h.query(false).unwrap()), 14);
}
#[test]
fn new_requests_override_stale_legacy_and_use_their_own_turn_model() {
    let h = Home::new();
    h.write(
        "requests.jsonl.zst",
        &[
            meta("thread"),
            context("first", "gpt-5.4"),
            legacy(1, 100, 100),
            context("next", "gpt-5.5"),
            request(2, 20, "a", "thread", "first"),
            legacy(2, 0, 100),
            request(3, 30, "b", "thread", "next"),
            legacy(3, 0, 100),
        ],
    );
    let v = h.query(false).unwrap();
    assert_eq!(total(&v), 150);
    assert_eq!(v["daily"][0]["models"]["gpt-5.4"]["totalTokens"], 120);
    assert_eq!(v["daily"][0]["models"]["gpt-5.5"]["totalTokens"], 30);
}
#[test]
fn foreign_records_and_partner_do_not_change_local_cumulative_baseline() {
    let h = Home::new();
    h.write(
        "foreign.jsonl.zst",
        &[
            meta("thread"),
            context("turn", "gpt-5.5"),
            legacy(1, 10, 10),
            request(2, 100, "foreign", "other", "turn"),
            legacy(2, 100, 100),
            event(
                3,
                "event_msg",
                json!({"type":"token_count","info":{"total_token_usage":usage(15)}}),
            ),
        ],
    );
    assert_eq!(total(&h.query(false).unwrap()), 15);
}
#[test]
fn unpaired_requests_do_not_hide_a_new_turns_legacy_only_usage() {
    let h = Home::new();
    h.write(
        "unpaired.jsonl.zst",
        &[
            meta("thread"),
            context("first", "gpt-5.5"),
            request(1, 7, "a", "thread", "first"),
            context("next", "gpt-5.5"),
            legacy(2, 11, 11),
        ],
    );
    assert_eq!(total(&h.query(false).unwrap()), 18);
}
#[test]
fn model_less_new_records_keep_usage_without_guessing_gpt_five() {
    let h = Home::new();
    h.write(
        "unknown.jsonl.zst",
        &[
            meta("thread"),
            request(1, 7, "a", "thread", "turn"),
            legacy(1, 7, 7),
        ],
    );
    for hourly in [false, true] {
        let v = h.query(hourly).unwrap();
        assert_eq!(total(&v), 7);
        let rows = if hourly { "hourly" } else { "daily" };
        let models = v[rows][0]["models"].as_object().unwrap();
        assert!(!models.contains_key("gpt-5"));
        assert_eq!(models.len(), 1);
    }
}
#[test]
fn corrupt_compressed_input_returns_a_path_specific_error() {
    let h = Home::new();
    fs::write(h.0.join("sessions/broken.jsonl.zst"), b"not zstandard").unwrap();
    let e = h.query(false).unwrap_err();
    assert!(e.contains("broken.jsonl.zst"), "{e}");
}
#[test]
fn concatenated_frames_large_lines_crlf_and_final_line_keep_identical_usage() {
    let h = Home::new();
    let p = Home::new();
    let a = format!(
        "{}\r\n{}\r\n{}\r\n",
        meta("thread"),
        context("turn", "gpt-5.5"),
        json!({"type":"response_item","payload":{"message":"x".repeat(1024*1024+7)}})
    );
    let b = legacy(2, 9, 9).to_string();
    let mut bytes = zstd::stream::encode_all(a.as_bytes(), 1).unwrap();
    bytes.extend(zstd::stream::encode_all(b.as_bytes(), 1).unwrap());
    fs::write(h.0.join("sessions/run.jsonl.zst"), bytes).unwrap();
    fs::write(p.0.join("sessions/run.jsonl"), a + &b).unwrap();
    assert_eq!(h.query(false).unwrap(), p.query(false).unwrap());
    assert_eq!(total(&h.query(true).unwrap()), 9);
}

#[test]
fn request_replay_across_formats_and_continuation_files_counts_only_response_identity() {
    let h = Home::new();
    let a = vec![
        meta("thread"),
        context("turn", "gpt-5.5"),
        request(1, 7, "a", "thread", "turn"),
        legacy(1, 7, 7),
    ];
    h.write("a.jsonl", &a);
    h.write("a.jsonl.zst", &a);
    h.write(
        "continued.jsonl.zst",
        &[
            meta("thread"),
            context("turn", "gpt-5.5"),
            request(2, 7, "a", "thread", "turn"),
            legacy(2, 7, 7),
            request(3, 11, "b", "thread", "turn"),
            legacy(3, 11, 18),
        ],
    );
    assert_eq!(total(&h.query(false).unwrap()), 18);
}
#[test]
fn truncated_compressed_input_never_returns_a_partial_success() {
    let h = Home::new();
    let mut data = zstd::stream::encode_all(legacy(1, 7, 7).to_string().as_bytes(), 1).unwrap();
    data.truncate(data.len() - 3);
    fs::write(h.0.join("sessions/truncated.jsonl.zst"), data).unwrap();
    for hourly in [false, true] {
        let e = h.query(hourly).unwrap_err();
        assert!(e.contains("truncated.jsonl.zst"));
    }
}
#[test]
fn first_session_metadata_remains_owner_when_parent_metadata_is_replayed() {
    let h = Home::new();
    h.write(
        "history.jsonl.zst",
        &[
            meta("thread"),
            meta("parent"),
            context("turn", "gpt-5.5"),
            request(1, 7, "a", "thread", "turn"),
            legacy(1, 7, 7),
        ],
    );
    assert_eq!(total(&h.query(false).unwrap()), 7);
}

#[test]
fn unrelated_tool_and_completion_events_do_not_break_request_partner_pairing() {
    let h = Home::new();
    h.write(
        "interleaved.jsonl.zst",
        &[
            meta("thread"),
            context("turn", "gpt-5.5"),
            request(1, 7, "a", "thread", "turn"),
            event(
                1,
                "response_item",
                json!({"type":"custom_tool_call_output","output":"done"}),
            ),
            event(
                1,
                "event_msg",
                json!({"type":"item_completed","usage":"metadata"}),
            ),
            legacy(1, 7, 7),
        ],
    );
    assert_eq!(total(&h.query(false).unwrap()), 7);
}

#[test]
fn user_only_boundary_clears_a_pending_request_before_legacy_usage() {
    let h = Home::new();
    h.write("user-boundary.jsonl.zst", &[meta("thread"), context("first", "gpt-5.5"), request(1, 7, "a", "thread", "first"), event(2, "response_item", json!({"type":"message", "role":"user", "content":[{"type":"input_text", "text":"Continue"}]})), legacy(3, 11, 11)]);
    assert_eq!(total(&h.query(false).unwrap()), 18);
}
