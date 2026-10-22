use super::tests::{error_text, temp_app_dir, test_plugin};
use super::*;

#[test]
fn run_probe_resolves_chained_promise_metrics() {
    let plugin = test_plugin(
        r#"
        globalThis.__one_more_prompt_plugin = {
            probe(ctx) {
                return Promise.resolve("first")
                    .then(function (value) { return value + "-second"; })
                    .then(function (value) {
                        return { lines: [ctx.line.text({ label: "Promise", value: value })] };
                    });
            }
        };
        "#,
    );
    let output = run_probe(&plugin, &temp_app_dir("chained-promise"), "0.0.0");

    assert!(matches!(
        output.lines.as_slice(),
        [MetricLine::Text { label, value, .. }] if label == "Promise" && value == "first-second"
    ));
}

#[test]
fn run_probe_reports_unresolved_promise_when_job_queue_is_empty() {
    let plugin = test_plugin(
        r#"
        globalThis.__one_more_prompt_plugin = {
            probe() {
                return new Promise(function () {});
            }
        };
        "#,
    );
    let output = run_probe(&plugin, &temp_app_dir("unresolved-promise"), "0.0.0");

    assert_eq!(error_text(output), "probe() returned unresolved promise");
}

#[test]
fn run_probe_times_out_cpu_bound_promise_microtask() {
    let plugin = test_plugin(
        r#"
        globalThis.__one_more_prompt_plugin = {
            probe(ctx) {
                return Promise.resolve().then(function () {
                    ctx.host.fs.writeText(ctx.app.appDataDir + "/microtask-started", "entered");
                    while (true) {}
                });
            }
        };
        "#,
    );
    let app_dir = temp_app_dir("promise-timeout");
    let output = run_probe_with_timeout(&plugin, &app_dir, "0.0.0", Duration::from_millis(100));

    // Prove the deadline interrupted the queued callback rather than setup.
    assert_eq!(
        std::fs::read_to_string(app_dir.join("microtask-started")).unwrap(),
        "entered"
    );
    assert_eq!(error_text(output), "probe timed out after 100ms");
}
