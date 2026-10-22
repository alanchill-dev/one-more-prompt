use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "omp-accounting-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(root.join("sessions")).unwrap();
        Self(root)
    }
    fn write(&self, name: &str, rows: &[Value]) {
        let text = rows
            .iter()
            .map(Value::to_string)
            .collect::<Vec<_>>()
            .join("\n");
        let bytes = if name.ends_with(".zst") {
            zstd::stream::encode_all(text.as_bytes(), 1).unwrap()
        } else {
            text.into_bytes()
        };
        fs::write(self.0.join("sessions").join(name), bytes).unwrap();
    }
    fn reports(&self) -> [Value; 2] {
        [
            ccusage_vendor::codex_daily_json(Some(&self.0), None, None, None).unwrap(),
            ccusage_vendor::codex_hourly_json(Some(&self.0), None, None, None).unwrap(),
        ]
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn event(second: u8, kind: &str, payload: Value) -> Value {
    json!({"timestamp":format!("2026-10-22T09:00:{second:02}.000Z"),"type":kind,"payload":payload})
}
fn context(thread: &str) -> Vec<Value> {
    vec![
        event(0, "session_meta", json!({"id":thread})),
        event(
            1,
            "turn_context",
            json!({"turn_id":"turn","model":"gpt-5.5"}),
        ),
    ]
}
fn usage(n: u64) -> Value {
    json!({"input_tokens":n,"output_tokens":0,"total_tokens":n})
}
fn legacy(second: u8, last: Value, total: Option<Value>) -> Value {
    let mut info = json!({"last_token_usage":last});
    if let Some(total) = total {
        info["total_token_usage"] = total;
    }
    event(
        second,
        "event_msg",
        json!({"type":"token_count","info":info}),
    )
}
fn total(report: &Value) -> u64 {
    report["totals"]["totalTokens"].as_u64().unwrap()
}
fn model(report: &Value) -> &Value {
    let rows = report
        .get("daily")
        .or_else(|| report.get("hourly"))
        .unwrap();
    &rows[0]["models"]["gpt-5.5"]
}

#[test]
fn unchanged_cumulative_replays_do_not_recharge_but_growth_and_new_segments_do() {
    for suffix in ["jsonl", "jsonl.zst"] {
        let home = Fixture::new();
        let mut rows = context("thread");
        rows.extend([
            legacy(2, usage(100), Some(usage(100))),
            legacy(3, usage(100), Some(usage(100))),
            legacy(4, usage(100), Some(usage(200))),
            legacy(5, Value::Null, Some(usage(30))),
        ]);
        home.write(&format!("run.{suffix}"), &rows);
        for report in home.reports() {
            assert_eq!(total(&report), 230, "{report}");
        }
    }
}

#[test]
fn legacy_dedupe_uses_logical_thread_owner_and_still_deduplicates_copies() {
    let home = Fixture::new();
    for (file, thread) in [
        ("a.jsonl", "thread-a"),
        ("a.jsonl.zst", "thread-a"),
        ("continued.jsonl.zst", "thread-a"),
        ("b.jsonl.zst", "thread-b"),
    ] {
        let mut rows = context(thread);
        rows.push(legacy(2, usage(7), Some(usage(7))));
        home.write(file, &rows);
    }
    for report in home.reports() {
        assert_eq!(total(&report), 14, "{report}");
    }
}

#[test]
fn anonymous_copies_share_a_file_owner_without_colliding_with_a_named_thread() {
    let home = Fixture::new();
    let anonymous = [
        event(1, "turn_context", json!({"model":"gpt-5.5"})),
        legacy(2, usage(7), Some(usage(7))),
    ];
    home.write("anonymous.jsonl", &anonymous);
    home.write("anonymous.jsonl.zst", &anonymous);
    let mut named = context("anonymous");
    named.push(legacy(2, usage(7), Some(usage(7))));
    home.write("different.jsonl.zst", &named);
    for report in home.reports() {
        assert_eq!(total(&report), 14, "{report}");
    }
}

#[test]
fn rate_limit_only_updates_leave_request_partners_and_cumulative_baselines_intact() {
    for suffix in ["jsonl", "jsonl.zst"] {
        let home = Fixture::new();
        let mut rows = context("thread");
        for (second, response, total_so_far) in [(2, "first", 7), (3, "next", 14)] {
            rows.push(event(second,"token_usage_record",json!({"thread_id":"thread","turn_id":"turn","response_id":response,"usage":usage(7)})));
            rows.push(event(second,"event_msg",json!({"type":"token_count","info":null,"rate_limits":{"primary":{"used_percent":8}}})));
            rows.push(legacy(second, usage(7), Some(usage(total_so_far))));
        }
        rows.push(event(
            4,
            "event_msg",
            json!({"type":"token_count","info":null,"rate_limits":{"primary":{"used_percent":9}}}),
        ));
        rows.push(legacy(5, usage(7), Some(usage(14))));
        rows.push(legacy(6, Value::Null, Some(usage(19))));
        home.write(&format!("requests.{suffix}"), &rows);
        for report in home.reports() {
            assert_eq!(total(&report), 19, "{report}");
            assert_eq!(model(&report)["totalTokens"], 19);
        }
    }
}

#[test]
fn missing_legacy_total_does_not_add_reasoning_a_second_time() {
    for suffix in ["jsonl", "jsonl.zst"] {
        for headless in [false, true] {
            let home = Fixture::new();
            let mut rows = context("thread");
            let measured =
                json!({"input_tokens":100,"output_tokens":10,"reasoning_output_tokens":5});
            rows.push(if headless {
                json!({"timestamp":"2026-10-22T09:00:02.000Z","type":"turn.completed","model":"gpt-5.5","usage":measured})
            } else {
                legacy(2, measured, None)
            });
            home.write(&format!("run.{suffix}"), &rows);
            for report in home.reports() {
                assert_eq!(total(&report), 110, "{report}");
                assert_eq!(model(&report)["reasoningOutputTokens"], 5);
            }
        }
    }
}

#[test]
fn headless_and_cumulative_only_usage_preserve_explicit_cache_writes() {
    for suffix in ["jsonl", "jsonl.zst"] {
        for headless in [false, true] {
            let home = Fixture::new();
            let mut rows = context("thread");
            for (second, input, written) in [(2, 100, 20), (3, 200, 30)] {
                let measured = json!({"input_tokens":input,"cache_write_input_tokens":written,"total_tokens":input});
                rows.push(if headless {
                    json!({"timestamp":format!("2026-10-22T09:00:{second:02}.000Z"),"type":"turn.completed","model":"gpt-5.5","usage":measured})
                } else {
                    legacy(second, Value::Null, Some(measured))
                });
            }
            home.write(&format!("run.{suffix}"), &rows);
            for report in home.reports() {
                assert_eq!(total(&report), if headless { 300 } else { 200 });
                assert_eq!(
                    model(&report)["cacheWriteInputTokens"],
                    if headless { 50 } else { 30 }
                );
                assert_eq!(model(&report)["cacheWriteInputTokensComplete"], true);
            }
        }
    }
}

#[test]
fn request_and_legacy_write_counts_preserve_known_zero_and_completeness() {
    for suffix in ["jsonl", "jsonl.zst"] {
        for (writes, complete) in [
            (vec![Some(20), Some(0)], true),
            (vec![Some(0), Some(0)], true),
            (vec![Some(20), None], false),
            (vec![None, None], false),
        ] {
            let home = Fixture::new();
            let mut rows = context("thread");
            for (index, written) in writes.iter().enumerate() {
                let mut measured = json!({"input_tokens":100,"cached_input_tokens":30,"output_tokens":10,"reasoning_output_tokens":5,"total_tokens":110});
                if let Some(written) = written {
                    measured["cache_write_input_tokens"] = json!(written);
                }
                if index == 0 {
                    rows.push(event(2,"token_usage_record",json!({"thread_id":"thread","turn_id":"turn","response_id":"request","usage":measured})));
                    rows.push(legacy(2, measured.clone(), Some(usage(110))));
                } else {
                    rows.push(legacy(3, measured, None));
                }
            }
            home.write(&format!("run.{suffix}"), &rows);
            for report in home.reports() {
                assert_eq!(total(&report), 220);
                let expected = if writes.iter().any(Option::is_some) {
                    json!(writes.iter().filter_map(|value| *value).sum::<u64>())
                } else {
                    Value::Null
                };
                let rows = report
                    .get("daily")
                    .or_else(|| report.get("hourly"))
                    .unwrap();
                for value in [model(&report), &report["totals"], &rows[0]] {
                    assert_eq!(value["cacheWriteInputTokens"], expected, "{report}");
                    assert_eq!(value["cacheWriteInputTokensComplete"], complete, "{report}");
                    assert_eq!(
                        value["inputTokens"], 140,
                        "non-cache-read input remains unchanged"
                    );
                }
            }
        }
    }
}

#[test]
fn write_metadata_survives_parallel_group_merge_and_native_fee_arithmetic() {
    let home = Fixture::new();
    for (file, writes, second) in [("a.jsonl", Some(20), 2), ("b.jsonl.zst", None, 3)] {
        let mut rows = context(file);
        let mut measured = json!({"input_tokens":100,"cached_input_tokens":30,"output_tokens":10,"total_tokens":110});
        if let Some(writes) = writes {
            measured["cache_write_input_tokens"] = json!(writes);
        }
        rows.push(legacy(second, measured, None));
        home.write(file, &rows);
    }
    for report in home.reports() {
        assert_eq!(model(&report)["cacheWriteInputTokens"], 20);
        assert_eq!(model(&report)["cacheWriteInputTokensComplete"], false);
    }
    let priced = Fixture::new();
    let mut rows = context("priced");
    rows.push(legacy(2,json!({"input_tokens":100000000,"cached_input_tokens":30000000,"cache_write_input_tokens":20000000,"output_tokens":10000000,"total_tokens":110000000}),None));
    priced.write("priced.jsonl.zst", &rows);
    let overlay = r#"{"gpt-5.5":{"input_cost_per_token":0.000002,"output_cost_per_token":0.00001,"cache_read_input_token_cost":0.0000002,"cache_creation_input_token_cost":0.0000025}}"#;
    for report in [
        ccusage_vendor::codex_daily_json(Some(&priced.0), None, None, Some(overlay)).unwrap(),
        ccusage_vendor::codex_hourly_json(Some(&priced.0), None, None, Some(overlay)).unwrap(),
    ] {
        assert!(
            (report["totals"]["costUSD"].as_f64().unwrap() - 256.0).abs() < 1e-10,
            "{report}"
        );
    }
}
