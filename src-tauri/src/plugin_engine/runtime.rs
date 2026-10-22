use crate::plugin_engine::host_api;
use crate::plugin_engine::manifest::LoadedPlugin;
use crate::plugin_engine::pricing_cache::PricingEstimationStatus;
use crate::plugin_engine::reset_credits::{self, ResetCredits};
use crate::plugin_engine::scan_progress::{self, ScanProgressCallback};
use rquickjs::{Array, Context, Ctx, Error, Object, Promise, Runtime, Value};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::time::{Duration, Instant};

const PROBE_TIMEOUT_SECS: u64 = 30;
// Cold local history can span gigabytes; HTTP calls keep their own shorter limits.
const CODEX_HISTORY_TIMEOUT_SECS: u64 = 300;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProgressFormat {
    Percent,
    Dollars,
    Count { suffix: String },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BarChartGranularity {
    Daily,
    Hourly,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BarChartModelUsage {
    pub(crate) name: String,
    pub(crate) tokens: f64,
    #[serde(default)]
    pub(crate) cost_usd: Option<f64>,
    #[serde(default)]
    pub(crate) estimation_status: Option<PricingEstimationStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BarChartPoint {
    pub(crate) label: String,
    pub(crate) value: f64,
    #[serde(rename = "valueLabel")]
    pub(crate) value_label: Option<String>,
    #[serde(rename = "startAt")]
    pub(crate) start_at: Option<String>,
    #[serde(default)]
    pub(crate) model_usage: Vec<BarChartModelUsage>,
    #[serde(default)]
    pub(crate) cost_usd: Option<f64>,
    #[serde(default)]
    pub(crate) estimation_status: Option<PricingEstimationStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MetricLine {
    Text {
        label: String,
        value: String,
        color: Option<String>,
        subtitle: Option<String>,
        #[serde(rename = "resetExpiry")]
        reset_expiry: Option<Vec<String>>,
        #[serde(default, rename = "resetCredits")]
        reset_credits: Option<ResetCredits>,
    },
    Progress {
        label: String,
        used: f64,
        limit: f64,
        format: ProgressFormat,
        #[serde(rename = "resetsAt")]
        resets_at: Option<String>,
        #[serde(rename = "periodDurationMs")]
        period_duration_ms: Option<f64>,
        color: Option<String>,
    },
    Badge {
        label: String,
        text: String,
        color: Option<String>,
        subtitle: Option<String>,
    },
    #[serde(rename = "barChart")]
    BarChart {
        label: String,
        points: Vec<BarChartPoint>,
        granularity: Option<BarChartGranularity>,
        note: Option<String>,
        color: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PluginOutput {
    pub provider_id: String,
    pub display_name: String,
    pub plan: Option<String>,
    pub lines: Vec<MetricLine>,
    pub icon_url: String,
}

pub fn run_probe(plugin: &LoadedPlugin, app_data_dir: &PathBuf, app_version: &str) -> PluginOutput {
    run_probe_with_timeout(
        plugin,
        app_data_dir,
        app_version,
        Duration::from_secs(if plugin.manifest.id == "codex" {
            CODEX_HISTORY_TIMEOUT_SECS
        } else {
            PROBE_TIMEOUT_SECS
        }),
    )
}

pub fn run_prompt_usage_probe(
    plugin: &LoadedPlugin,
    app_data_dir: &PathBuf,
    app_version: &str,
) -> PluginOutput {
    run_plugin_function_with_timeout(
        plugin,
        app_data_dir,
        app_version,
        "probePromptUsage",
        Duration::from_secs(CODEX_HISTORY_TIMEOUT_SECS),
        None,
    )
}

pub fn run_prompt_usage_probe_with_progress(
    plugin: &LoadedPlugin,
    app_data_dir: &PathBuf,
    app_version: &str,
    on_progress: ScanProgressCallback,
) -> PluginOutput {
    run_plugin_function_with_timeout(
        plugin,
        app_data_dir,
        app_version,
        "probePromptUsage",
        Duration::from_secs(CODEX_HISTORY_TIMEOUT_SECS),
        Some(on_progress),
    )
}

pub fn run_active_codex_rate_limit_probe(
    plugin: &LoadedPlugin,
    app_data_dir: &PathBuf,
    app_version: &str,
) -> PluginOutput {
    run_plugin_function_with_timeout(
        plugin,
        app_data_dir,
        app_version,
        "probeActive",
        Duration::from_secs(PROBE_TIMEOUT_SECS),
        None,
    )
}

fn run_probe_with_timeout(
    plugin: &LoadedPlugin,
    app_data_dir: &PathBuf,
    app_version: &str,
    timeout: Duration,
) -> PluginOutput {
    run_plugin_function_with_timeout(plugin, app_data_dir, app_version, "probe", timeout, None)
}

fn run_plugin_function_with_timeout(
    plugin: &LoadedPlugin,
    app_data_dir: &PathBuf,
    app_version: &str,
    function_name: &'static str,
    timeout: Duration,
    on_progress: Option<ScanProgressCallback>,
) -> PluginOutput {
    let fallback = error_output(plugin, "runtime error".to_string());
    let timeout_message = probe_timeout_message(timeout);
    let deadline_at = Instant::now()
        .checked_add(timeout)
        .unwrap_or_else(Instant::now);
    let deadline = host_api::ProbeDeadline::at(deadline_at);

    let rt = match Runtime::new() {
        Ok(rt) => rt,
        Err(_) => return fallback,
    };
    rt.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline_at)));

    let ctx = match Context::full(&rt) {
        Ok(ctx) => ctx,
        Err(_) => return fallback,
    };

    let plugin_id = plugin.manifest.id.clone();
    let display_name = plugin.manifest.name.clone();
    let entry_script = plugin.entry_script.clone();
    let icon_url = plugin.icon_data_url.clone();
    let app_data = app_data_dir.clone();

    ctx.with(|ctx| {
        if host_api::inject_host_api_with_deadline(
            &ctx,
            &plugin_id,
            &app_data,
            app_version,
            deadline,
        )
        .is_err()
        {
            if deadline.has_elapsed() {
                return error_output(plugin, timeout_message.clone());
            }
            return error_output(plugin, "host api injection failed".to_string());
        }
        if let Some(on_progress) = on_progress {
            if scan_progress::inject(&ctx, on_progress).is_err() {
                return error_output(plugin, "scan progress injection failed".to_string());
            }
        }
        if host_api::patch_http_wrapper(&ctx).is_err() {
            if deadline.has_elapsed() {
                return error_output(plugin, timeout_message.clone());
            }
            return error_output(plugin, "http wrapper patch failed".to_string());
        }
        if host_api::patch_ls_wrapper(&ctx).is_err() {
            if deadline.has_elapsed() {
                return error_output(plugin, timeout_message.clone());
            }
            return error_output(plugin, "ls wrapper patch failed".to_string());
        }
        if host_api::patch_ccusage_wrapper(&ctx).is_err() {
            if deadline.has_elapsed() {
                return error_output(plugin, timeout_message.clone());
            }
            return error_output(plugin, "ccusage wrapper patch failed".to_string());
        }
        if host_api::inject_utils(&ctx).is_err() {
            if deadline.has_elapsed() {
                return error_output(plugin, timeout_message.clone());
            }
            return error_output(plugin, "utils injection failed".to_string());
        }

        if ctx.eval::<(), _>(entry_script.as_bytes()).is_err() {
            if deadline.has_elapsed() {
                return error_output(plugin, timeout_message.clone());
            }
            return error_output(plugin, "script eval failed".to_string());
        }

        let globals = ctx.globals();
        let plugin_obj: Object = match globals.get("__one_more_prompt_plugin") {
            Ok(obj) => obj,
            Err(_) => return error_output(plugin, "missing __one_more_prompt_plugin".to_string()),
        };

        let probe_fn: rquickjs::Function = match plugin_obj.get(function_name) {
            Ok(f) => f,
            Err(_) => return error_output(plugin, format!("missing {function_name}()")),
        };

        let probe_ctx: Value = globals
            .get("__one_more_prompt_ctx")
            .unwrap_or_else(|_| Value::new_undefined(ctx.clone()));

        let result_value: Value = match probe_fn.call((probe_ctx,)) {
            Ok(r) => r,
            Err(_) => {
                if deadline.has_elapsed() {
                    return error_output(plugin, timeout_message.clone());
                }
                return error_output(plugin, extract_error_string(&ctx));
            }
        };
        if deadline.has_elapsed() {
            return error_output(plugin, timeout_message.clone());
        }
        let result: Object = if result_value.is_promise() {
            let promise: Promise = match result_value.into_promise() {
                Some(promise) => promise,
                None => {
                    return error_output(plugin, "probe() returned invalid promise".to_string());
                }
            };
            match promise.finish::<Object>() {
                Ok(obj) => obj,
                Err(Error::WouldBlock) if !deadline.has_elapsed() => {
                    return error_output(plugin, "probe() returned unresolved promise".to_string());
                }
                Err(_) => {
                    if deadline.has_elapsed() {
                        return error_output(plugin, timeout_message.clone());
                    }
                    return error_output(plugin, extract_error_string(&ctx));
                }
            }
        } else {
            match result_value.into_object() {
                Some(obj) => obj,
                None => return error_output(plugin, "probe() returned non-object".to_string()),
            }
        };
        if deadline.has_elapsed() {
            return error_output(plugin, timeout_message.clone());
        }

        let plan: Option<String> = result
            .get::<_, String>("plan")
            .ok()
            .filter(|s| !s.is_empty());

        let lines = match parse_lines(&result) {
            Ok(lines) if !lines.is_empty() => lines,
            Ok(_) => vec![error_line("no lines returned".to_string())],
            Err(msg) => vec![error_line(msg)],
        };

        PluginOutput {
            provider_id: plugin_id,
            display_name,
            plan,
            lines,
            icon_url,
        }
    })
}

fn parse_lines(result: &Object) -> Result<Vec<MetricLine>, String> {
    let lines: Array = result
        .get("lines")
        .map_err(|_| "missing lines".to_string())?;

    let mut out = Vec::new();
    let len = lines.len();
    for idx in 0..len {
        let line: Object = lines
            .get(idx)
            .map_err(|_| format!("invalid line at index {}", idx))?;

        let line_type: String = line.get("type").unwrap_or_default();
        let label = line.get::<_, String>("label").unwrap_or_default();
        let color = line.get::<_, String>("color").ok();
        let subtitle = line.get::<_, String>("subtitle").ok();

        match line_type.as_str() {
            "text" => {
                let value = line.get::<_, String>("value").unwrap_or_default();
                // resetExpiry can be a single ISO string or an array of ISO strings
                let reset_expiry = line
                    .get::<_, Vec<String>>("resetExpiry")
                    .ok()
                    .or_else(|| line.get::<_, String>("resetExpiry").ok().map(|s| vec![s]))
                    .filter(|v| !v.is_empty());
                let reset_credits = reset_credits::parse(
                    line.get("resetCredits")
                        .map_err(|_| "invalid reset credits".to_string())?,
                )?;
                out.push(MetricLine::Text {
                    label,
                    value,
                    color,
                    subtitle,
                    reset_expiry,
                    reset_credits,
                });
            }
            "progress" => {
                let used_value: Value = match line.get("used") {
                    Ok(v) => v,
                    Err(_) => {
                        out.push(error_line(format!(
                            "progress line at index {} missing used",
                            idx
                        )));
                        continue;
                    }
                };
                let used = match used_value.as_number() {
                    Some(n) => n,
                    None => {
                        out.push(error_line(format!(
                            "progress line at index {} invalid used (expected number)",
                            idx
                        )));
                        continue;
                    }
                };

                let limit_value: Value = match line.get("limit") {
                    Ok(v) => v,
                    Err(_) => {
                        out.push(error_line(format!(
                            "progress line at index {} missing limit",
                            idx
                        )));
                        continue;
                    }
                };
                let limit = match limit_value.as_number() {
                    Some(n) => n,
                    None => {
                        out.push(error_line(format!(
                            "progress line at index {} invalid limit (expected number)",
                            idx
                        )));
                        continue;
                    }
                };

                if !used.is_finite() || used < 0.0 {
                    out.push(error_line(format!(
                        "progress line at index {} invalid used: {}",
                        idx, used
                    )));
                    continue;
                }
                if !limit.is_finite() || limit <= 0.0 {
                    out.push(error_line(format!(
                        "progress line at index {} invalid limit: {}",
                        idx, limit
                    )));
                    continue;
                }

                let format_obj: Object = match line.get("format") {
                    Ok(obj) => obj,
                    Err(_) => {
                        out.push(error_line(format!(
                            "progress line at index {} missing format",
                            idx
                        )));
                        continue;
                    }
                };
                let kind_value: Value = match format_obj.get("kind") {
                    Ok(v) => v,
                    Err(_) => {
                        out.push(error_line(format!(
                            "progress line at index {} missing format.kind",
                            idx
                        )));
                        continue;
                    }
                };
                let kind = match kind_value.as_string() {
                    Some(s) => s.to_string().unwrap_or_default(),
                    None => {
                        out.push(error_line(format!(
                            "progress line at index {} invalid format.kind (expected string)",
                            idx
                        )));
                        continue;
                    }
                };
                let format = match kind.as_str() {
                    "percent" => {
                        if limit != 100.0 {
                            out.push(error_line(format!(
                                "progress line at index {}: percent format requires limit=100 (got {})",
                                idx, limit
                            )));
                            continue;
                        }
                        ProgressFormat::Percent
                    }
                    "dollars" => ProgressFormat::Dollars,
                    "count" => {
                        let suffix_value: Value = match format_obj.get("suffix") {
                            Ok(v) => v,
                            Err(_) => {
                                out.push(error_line(format!(
                                    "progress line at index {}: count format missing suffix",
                                    idx
                                )));
                                continue;
                            }
                        };
                        let suffix = match suffix_value.as_string() {
                            Some(s) => s.to_string().unwrap_or_default(),
                            None => {
                                out.push(error_line(format!(
                                    "progress line at index {}: count format suffix must be a string",
                                    idx
                                )));
                                continue;
                            }
                        };
                        let suffix = suffix.trim().to_string();
                        if suffix.is_empty() {
                            out.push(error_line(format!(
                                "progress line at index {}: count format suffix must be non-empty",
                                idx
                            )));
                            continue;
                        }
                        ProgressFormat::Count { suffix }
                    }
                    _ => {
                        out.push(error_line(format!(
                            "progress line at index {} invalid format.kind: {}",
                            idx, kind
                        )));
                        continue;
                    }
                };

                let resets_at = match line.get::<_, Value>("resetsAt") {
                    Ok(v) => {
                        if v.is_null() || v.is_undefined() {
                            None
                        } else if let Some(s) = v.as_string() {
                            let raw = s.to_string().unwrap_or_default();
                            let value = raw.trim().to_string();
                            if value.is_empty() {
                                None
                            } else {
                                let parsed = time::OffsetDateTime::parse(
                                    &value,
                                    &time::format_description::well_known::Rfc3339,
                                );
                                if parsed.is_ok() {
                                    Some(value)
                                } else {
                                    // ISO-like but missing timezone: assume UTC.
                                    let is_missing_tz =
                                        value.contains('T') && !value.ends_with('Z') && {
                                            let tail = value.splitn(2, 'T').nth(1).unwrap_or("");
                                            !tail.contains('+') && !tail.contains('-')
                                        };
                                    if is_missing_tz {
                                        let with_z = format!("{}Z", value);
                                        let parsed_with_z = time::OffsetDateTime::parse(
                                            &with_z,
                                            &time::format_description::well_known::Rfc3339,
                                        );
                                        if parsed_with_z.is_ok() {
                                            Some(with_z)
                                        } else {
                                            log::warn!(
                                                "invalid resetsAt at index {} (value='{}'), omitting",
                                                idx,
                                                raw
                                            );
                                            None
                                        }
                                    } else {
                                        log::warn!(
                                            "invalid resetsAt at index {} (value='{}'), omitting",
                                            idx,
                                            raw
                                        );
                                        None
                                    }
                                }
                            }
                        } else {
                            log::warn!("invalid resetsAt at index {} (non-string), omitting", idx);
                            None
                        }
                    }
                    Err(_) => None,
                };

                // Parse optional periodDurationMs
                let period_duration_ms: Option<f64> = match line.get::<_, Value>("periodDurationMs")
                {
                    Ok(val) => {
                        if val.is_null() || val.is_undefined() {
                            None
                        } else if let Some(n) = val.as_number() {
                            let ms = n as f64;
                            if ms > 0.0 {
                                Some(ms)
                            } else {
                                log::warn!(
                                    "periodDurationMs at index {} must be positive, omitting",
                                    idx
                                );
                                None
                            }
                        } else {
                            log::warn!(
                                "invalid periodDurationMs at index {} (non-number), omitting",
                                idx
                            );
                            None
                        }
                    }
                    Err(_) => None,
                };

                out.push(MetricLine::Progress {
                    label,
                    used,
                    limit,
                    format,
                    resets_at,
                    period_duration_ms,
                    color,
                });
            }
            "badge" => {
                let text = line.get::<_, String>("text").unwrap_or_default();
                out.push(MetricLine::Badge {
                    label,
                    text,
                    color,
                    subtitle,
                });
            }
            "barChart" => {
                let (chart, errors) = parse_bar_chart_line(&line, idx, label, color);
                for message in errors {
                    out.push(error_line(message));
                }
                if let Some(chart) = chart {
                    out.push(chart);
                }
            }
            _ => {
                out.push(error_line(format!(
                    "unknown line type at index {}: {}",
                    idx, line_type
                )));
            }
        }
    }

    Ok(out)
}

// Upper bound on barChart points parsed from a plugin. The chart is daily
// history (plugins emit ~31), so a year of points is generous headroom while
// keeping the loop and allocations bounded — parse_lines runs natively after
// the JS returns, so the probe's interrupt-based timeout can't cap it here.
const MAX_BAR_CHART_POINTS: usize = 366;

// A single day should only contain a small set of models. Keep plugin-provided
// composition bounded independently from the point limit so malformed output
// cannot multiply the native parsing work or cached payload size without bound.
const MAX_BAR_CHART_MODEL_USAGE_ITEMS: usize = 64;

fn parse_bar_chart_granularity<'js>(
    line: &Object<'js>,
    line_idx: usize,
) -> Option<BarChartGranularity> {
    let Ok(value) = line.get::<_, Value>("granularity") else {
        return None;
    };
    let Some(value) = value.as_string() else {
        if !value.is_null() && !value.is_undefined() {
            log::warn!(
                "invalid barChart granularity at line {}, omitting",
                line_idx
            );
        }
        return None;
    };
    let value = value.to_string().unwrap_or_default();
    match value.trim().to_ascii_lowercase().as_str() {
        "daily" => Some(BarChartGranularity::Daily),
        "hourly" => Some(BarChartGranularity::Hourly),
        "" => None,
        _ => {
            log::warn!(
                "unknown barChart granularity at line {}, omitting",
                line_idx
            );
            None
        }
    }
}

fn parse_bar_chart_model_usage<'js>(
    point: &Object<'js>,
    line_idx: usize,
    point_idx: usize,
) -> Vec<BarChartModelUsage> {
    let usage_array: Array = match point.get("modelUsage") {
        Ok(items) => items,
        Err(_) => return Vec::new(),
    };

    let total_items = usage_array.len();
    let scan_count = total_items.min(MAX_BAR_CHART_MODEL_USAGE_ITEMS);
    if total_items > MAX_BAR_CHART_MODEL_USAGE_ITEMS {
        log::warn!(
            "barChart line {} point {} has {} model usage items; capping at {}",
            line_idx,
            point_idx,
            total_items,
            MAX_BAR_CHART_MODEL_USAGE_ITEMS
        );
    }

    let mut model_usage = Vec::new();
    for usage_idx in 0..scan_count {
        let usage: Object = match usage_array.get(usage_idx) {
            Ok(usage) => usage,
            Err(_) => {
                log::warn!(
                    "invalid barChart model usage at line {} point {} item {}, omitting",
                    line_idx,
                    point_idx,
                    usage_idx
                );
                continue;
            }
        };

        let name = usage
            .get::<_, String>("name")
            .unwrap_or_default()
            .trim()
            .to_string();
        if name.is_empty() {
            log::warn!(
                "empty barChart model name at line {} point {} item {}, omitting",
                line_idx,
                point_idx,
                usage_idx
            );
            continue;
        }

        let tokens = match usage.get::<_, Value>("tokens") {
            Ok(value) => match value.as_number() {
                Some(tokens) if tokens.is_finite() && tokens > 0.0 => tokens,
                _ => {
                    log::warn!(
                        "invalid barChart model tokens at line {} point {} item {}, omitting",
                        line_idx,
                        point_idx,
                        usage_idx
                    );
                    continue;
                }
            },
            Err(_) => {
                log::warn!(
                    "missing barChart model tokens at line {} point {} item {}, omitting",
                    line_idx,
                    point_idx,
                    usage_idx
                );
                continue;
            }
        };

        let cost_usd = match usage.get::<_, Value>("costUsd") {
            Ok(value) if value.is_null() || value.is_undefined() => None,
            Ok(value) => match value.as_number() {
                Some(cost) if cost.is_finite() && cost >= 0.0 => Some(cost),
                _ => {
                    log::warn!(
                        "invalid barChart model costUsd at line {} point {} item {}, omitting",
                        line_idx,
                        point_idx,
                        usage_idx
                    );
                    None
                }
            },
            Err(_) => None,
        };
        let estimation_status = match usage.get::<_, String>("estimationStatus") {
            Ok(value) => match value.trim() {
                "historical_rate" => Some(PricingEstimationStatus::HistoricalRate),
                "current_rate" => Some(PricingEstimationStatus::CurrentRate),
                "partial_rate" => Some(PricingEstimationStatus::PartialRate),
                "unknown" => Some(PricingEstimationStatus::Unknown),
                _ => {
                    log::warn!(
                        "invalid barChart model estimationStatus at line {} point {} item {}, omitting",
                        line_idx,
                        point_idx,
                        usage_idx
                    );
                    None
                }
            },
            Err(_) => None,
        };
        model_usage.push(BarChartModelUsage {
            name,
            tokens,
            cost_usd,
            estimation_status,
        });
    }

    model_usage
}

// Parses a barChart line, keeping its point/value/note validation out of
// parse_lines. Returns the built line (when at least one point is valid) plus
// any per-point error messages the caller should surface as error lines.
fn parse_bar_chart_line<'js>(
    line: &Object<'js>,
    idx: usize,
    label: String,
    color: Option<String>,
) -> (Option<MetricLine>, Vec<String>) {
    let mut errors: Vec<String> = Vec::new();
    let granularity = parse_bar_chart_granularity(line, idx);

    let points_array: Array = match line.get("points") {
        Ok(points) => points,
        Err(_) => {
            errors.push(format!("barChart line at index {} missing points", idx));
            return (None, errors);
        }
    };

    // Bound the loop to a plugin-independent maximum so a huge points array
    // can't exhaust CPU/memory in this native (non-interruptible) path.
    let total_points = points_array.len();
    let scan_count = total_points.min(MAX_BAR_CHART_POINTS);
    if total_points > MAX_BAR_CHART_POINTS {
        log::warn!(
            "barChart line at index {} has {} points; capping at {}",
            idx,
            total_points,
            MAX_BAR_CHART_POINTS
        );
    }

    let mut points = Vec::new();
    for point_idx in 0..scan_count {
        let point: Object = match points_array.get(point_idx) {
            Ok(point) => point,
            Err(_) => {
                errors.push(format!(
                    "barChart line at index {} has invalid point at index {}",
                    idx, point_idx
                ));
                continue;
            }
        };
        let point_label = point.get::<_, String>("label").unwrap_or_default();
        let point_label = point_label.trim().to_string();
        if point_label.is_empty() {
            errors.push(format!(
                "barChart line at index {} has empty point label at index {}",
                idx, point_idx
            ));
            continue;
        }

        let value: Value = match point.get("value") {
            Ok(v) => v,
            Err(_) => {
                errors.push(format!(
                    "barChart line at index {} point {} missing value",
                    idx, point_idx
                ));
                continue;
            }
        };
        let value = match value.as_number() {
            Some(n) if n.is_finite() && n >= 0.0 => n,
            _ => {
                errors.push(format!(
                    "barChart line at index {} point {} invalid value",
                    idx, point_idx
                ));
                continue;
            }
        };

        let value_label = match point.get::<_, Value>("valueLabel") {
            Ok(v) => {
                if v.is_null() || v.is_undefined() {
                    None
                } else if let Some(s) = v.as_string() {
                    let value = s.to_string().unwrap_or_default();
                    let trimmed = value.trim().to_string();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed)
                    }
                } else {
                    log::warn!(
                        "invalid barChart valueLabel at line {} point {}, omitting",
                        idx,
                        point_idx
                    );
                    None
                }
            }
            Err(_) => None,
        };

        let start_at = match point.get::<_, Value>("startAt") {
            Ok(v) => {
                if v.is_null() || v.is_undefined() {
                    None
                } else if let Some(s) = v.as_string() {
                    let value = s.to_string().unwrap_or_default();
                    let trimmed = value.trim().to_string();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed)
                    }
                } else {
                    log::warn!(
                        "invalid barChart startAt at line {} point {}, omitting",
                        idx,
                        point_idx
                    );
                    None
                }
            }
            Err(_) => None,
        };

        let model_usage = parse_bar_chart_model_usage(&point, idx, point_idx);
        let cost_usd = match point.get::<_, Value>("costUsd") {
            Ok(v) if v.is_null() || v.is_undefined() => None,
            Ok(v) => match v.as_number() {
                Some(value) if value.is_finite() && value >= 0.0 => Some(value),
                _ => {
                    log::warn!(
                        "invalid barChart costUsd at line {} point {}, omitting",
                        idx,
                        point_idx
                    );
                    None
                }
            },
            Err(_) => None,
        };
        let estimation_status = match point.get::<_, String>("estimationStatus") {
            Ok(value) => match value.trim() {
                "historical_rate" => Some(PricingEstimationStatus::HistoricalRate),
                "current_rate" => Some(PricingEstimationStatus::CurrentRate),
                "partial_rate" => Some(PricingEstimationStatus::PartialRate),
                "unknown" => Some(PricingEstimationStatus::Unknown),
                _ => {
                    log::warn!(
                        "invalid barChart estimationStatus at line {} point {}, omitting",
                        idx,
                        point_idx
                    );
                    None
                }
            },
            Err(_) => None,
        };

        points.push(BarChartPoint {
            label: point_label,
            value,
            value_label,
            start_at,
            model_usage,
            cost_usd,
            estimation_status,
        });
    }

    if points.is_empty() && granularity != Some(BarChartGranularity::Hourly) {
        errors.push(format!(
            "barChart line at index {} has no valid points",
            idx
        ));
        return (None, errors);
    }

    let note = match line.get::<_, Value>("note") {
        Ok(v) => {
            if v.is_null() || v.is_undefined() {
                None
            } else if let Some(s) = v.as_string() {
                let value = s.to_string().unwrap_or_default();
                let trimmed = value.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            } else {
                log::warn!("invalid note at index {} (non-string), omitting", idx);
                None
            }
        }
        Err(_) => None,
    };

    (
        Some(MetricLine::BarChart {
            label,
            points,
            granularity,
            note,
            color,
        }),
        errors,
    )
}

fn error_output(plugin: &LoadedPlugin, message: String) -> PluginOutput {
    PluginOutput {
        provider_id: plugin.manifest.id.clone(),
        display_name: plugin.manifest.name.clone(),
        plan: None,
        lines: vec![error_line(message)],
        icon_url: plugin.icon_data_url.clone(),
    }
}

fn extract_error_string(ctx: &Ctx<'_>) -> String {
    let exc = ctx.catch();
    if exc.is_null() || exc.is_undefined() {
        return "The plugin failed, try again or contact plugin author.".to_string();
    }
    if let Some(str_val) = exc.as_string() {
        let message: String = str_val.to_string().unwrap_or_default();
        let trimmed = message.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    "The plugin failed, try again or contact plugin author.".to_string()
}

fn probe_timeout_message(timeout: Duration) -> String {
    if timeout.subsec_millis() == 0 {
        return format!("probe timed out after {}s", timeout.as_secs());
    }
    if timeout.as_secs() == 0 {
        return format!("probe timed out after {}ms", timeout.as_millis());
    }
    format!("probe timed out after {:.3}s", timeout.as_secs_f64())
}

fn error_line(message: String) -> MetricLine {
    MetricLine::Badge {
        label: "Error".to_string(),
        text: message,
        color: Some("#ef4444".to_string()),
        subtitle: None,
    }
}

/// True when a probe returned a rate-limit status badge instead of failing.
/// These responses may omit live usage progress and must not overwrite the cache.
pub fn is_rate_limited_output(output: &PluginOutput) -> bool {
    output.lines.iter().any(|line| {
        matches!(
            line,
            MetricLine::Badge { label, text, .. }
                if label == "Status"
                    && text.to_ascii_lowercase().contains("rate limited")
        )
    })
}

#[cfg(test)]
#[path = "runtime_local_history_tests.rs"]
mod local_history_tests;

#[cfg(test)]
#[path = "runtime_promise_tests.rs"]
mod promise_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_engine::manifest::{LoadedPlugin, PluginManifest};
    use serde_json::Value as JsonValue;

    #[test]
    fn reset_credits_parse_lines_preserves_details_and_accepts_legacy_text() {
        let runtime = Runtime::new().unwrap();
        let context = Context::full(&runtime).unwrap();
        context.with(|ctx| {
            let result: Object = ctx.eval(r#"({lines: [
                {type: "text", label: "Rate Limit Resets", value: "1 available", resetExpiry: ["2026-10-01T00:00:00Z"],
                 resetCredits: {availableCount: 1, credits: [{id: "credit-1", grantedAt: null, expiresAt: "2026-10-01T00:00:00Z"}],
                    history: [{id: "event-1", kind: "used", occurredAt: "2026-09-12T00:00:00Z"}], historyState: "ready",
                    historyWindowStart: "2026-08-14T00:00:00Z", historyAsOf: "2026-09-13T00:00:00Z"}},
                {type: "text", label: "Credits", value: "10 credits"}
            ]})"#).unwrap();
            let lines = serde_json::to_value(parse_lines(&result).unwrap()).unwrap();
            assert_eq!(lines[0]["resetCredits"]["history"][0]["kind"], "used");
            assert_eq!(lines[0]["resetCredits"]["history"][0]["occurredAt"], "2026-09-12T00:00:00Z");
            assert_eq!(lines[0]["resetExpiry"][0], "2026-10-01T00:00:00Z");
            assert!(lines[1]["resetCredits"].is_null());
        });
    }
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    pub(super) fn test_plugin(entry_script: &str) -> LoadedPlugin {
        LoadedPlugin {
            manifest: PluginManifest {
                schema_version: 1,
                id: "test".to_string(),
                name: "Test".to_string(),
                version: "0.0.0".to_string(),
                entry: "plugin.js".to_string(),
                icon: "icon.svg".to_string(),
                brand_color: None,
                lines: vec![],
                links: vec![],
                detect: vec![],
                multi_tray_lines: vec![],
                tray_primary_label: None,
            },
            plugin_dir: PathBuf::from("."),
            entry_script: entry_script.to_string(),
            icon_data_url: "data:image/svg+xml;base64,".to_string(),
        }
    }

    pub(super) fn temp_app_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("one-more-prompt-test-{}-{}", label, nanos))
    }

    pub(super) fn error_text(output: PluginOutput) -> String {
        match output.lines.first() {
            Some(MetricLine::Badge { text, .. }) => text.clone(),
            other => panic!("expected error badge, got {:?}", other),
        }
    }

    #[test]
    fn run_probe_returns_thrown_string_from_sync_error() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe() {
                    throw "boom";
                }
            };
            "#,
        );
        let output = run_probe(&plugin, &temp_app_dir("sync"), "0.0.0");
        assert_eq!(error_text(output), "boom");
    }

    #[test]
    fn onboarding_progress_is_injected_only_for_the_requested_probe() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probePromptUsage(ctx) {
                    if (typeof ctx.host.scanProgress === "function") {
                        ctx.host.scanProgress("reading", 0, 2);
                        ctx.host.scanProgress("reading", 1, 2);
                        ctx.host.scanProgress("reading", 2, 2);
                        ctx.host.scanProgress("summarizing", 2, 2);
                    }
                    return { lines: [ctx.line.text({ label: "Progress", value: typeof ctx.host.scanProgress })] };
                }
            };
            "#,
        );
        let updates = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = updates.clone();
        let output = run_prompt_usage_probe_with_progress(
            &plugin,
            &temp_app_dir("progress"),
            "0.0.0",
            std::sync::Arc::new(move |progress| sink.lock().unwrap().push(progress)),
        );
        assert!(
            matches!(output.lines.first(), Some(MetricLine::Text { value, .. }) if value == "function")
        );
        let updates = updates.lock().unwrap();
        assert_eq!(updates.len(), 4);
        assert_eq!(updates[0].processed_files, 0.0);
        assert_eq!(updates[2].processed_files, 2.0);
        assert_eq!(
            updates[3].phase,
            crate::plugin_engine::scan_progress::ScanPhase::Summarizing
        );
        let regular = run_prompt_usage_probe(&plugin, &temp_app_dir("no-progress"), "0.0.0");
        assert!(
            matches!(regular.lines.first(), Some(MetricLine::Text { value, .. }) if value == "undefined")
        );
    }

    #[test]
    fn onboarding_progress_rejects_invalid_plugin_payloads() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probePromptUsage(ctx) {
                    ctx.host.scanProgress("reading", 3, 2);
                    return { lines: [] };
                }
            };
            "#,
        );
        let output = run_prompt_usage_probe_with_progress(
            &plugin,
            &temp_app_dir("invalid-progress"),
            "0.0.0",
            std::sync::Arc::new(|_| panic!("invalid progress must not reach the receiver")),
        );
        assert_eq!(
            error_text(output),
            "The plugin failed, try again or contact plugin author."
        );
    }

    #[test]
    fn run_prompt_usage_probe_calls_the_local_only_entrypoint() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe(ctx) {
                    return { lines: [ctx.line.text({ label: "Mode", value: "full" })] };
                },
                probePromptUsage(ctx) {
                    return { lines: [ctx.line.text({ label: "Prompt Usage", value: "local" })] };
                }
            };
            "#,
        );

        let output = run_prompt_usage_probe(&plugin, &temp_app_dir("prompt-usage"), "0.0.0");

        assert!(matches!(
            output.lines.first(),
            Some(MetricLine::Text { label, value, .. }) if label == "Prompt Usage" && value == "local"
        ));
    }

    #[test]
    fn run_active_codex_rate_limit_probe_calls_the_lightweight_entrypoint() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe(ctx) {
                    return { lines: [ctx.line.text({ label: "Mode", value: "full" })] };
                },
                probeActive(ctx) {
                    return { lines: [ctx.line.progress({ label: "Session", used: 42, limit: 100, format: { kind: "percent" } })] };
                }
            };
            "#,
        );

        let output = run_active_codex_rate_limit_probe(&plugin, &temp_app_dir("active"), "0.0.0");

        assert!(matches!(
            output.lines.first(),
            Some(MetricLine::Progress { label, used, .. }) if label == "Session" && *used == 42.0
        ));
    }

    #[test]
    fn run_probe_returns_thrown_string_from_async_error() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe: async function () {
                    throw "boom";
                }
            };
            "#,
        );
        let output = run_probe(&plugin, &temp_app_dir("async"), "0.0.0");
        assert_eq!(error_text(output), "boom");
    }

    #[test]
    fn run_probe_times_out_cpu_bound_script() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe() {
                    while (true) {}
                }
            };
            "#,
        );

        let output = run_probe_with_timeout(
            &plugin,
            &temp_app_dir("timeout"),
            "0.0.0",
            Duration::from_millis(5),
        );

        assert_eq!(error_text(output), "probe timed out after 5ms");
    }

    #[test]
    fn progress_resets_at_serializes_as_resets_at_camelcase() {
        let line = MetricLine::Progress {
            label: "Session".to_string(),
            used: 1.0,
            limit: 100.0,
            format: ProgressFormat::Percent,
            resets_at: Some("2099-01-01T00:00:00.000Z".to_string()),
            period_duration_ms: None,
            color: None,
        };

        let json: JsonValue = serde_json::to_value(&line).expect("serialize");
        let obj = json.as_object().expect("object");
        assert!(obj.get("resetsAt").is_some(), "expected resetsAt key");
        assert!(
            obj.get("resets_at").is_none(),
            "did not expect resets_at key"
        );
    }

    #[test]
    fn bar_chart_line_round_trips_from_builder() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe(ctx) {
                    return {
                        lines: [
                            ctx.line.barChart({
                                label: "Usage Trend",
                                points: [
                                    {
                                        label: "Today",
                                        value: 42,
                                        valueLabel: "42 tokens",
                                        startAt: "2026-08-22T09:00:00+08:00",
                                        modelUsage: [
                                            { name: "gpt-5.6-sol", tokens: 30 },
                                            { name: "", tokens: 12 },
                                            { name: "invalid", tokens: -1 }
                                        ]
                                    },
                                    { label: "Yesterday", value: 12 }
                                ],
                                note: "Estimated from local logs"
                            })
                        ]
                    };
                }
            };
            "#,
        );

        let output = run_probe(&plugin, &temp_app_dir("bar-chart"), "0.0.0");
        let json: JsonValue = serde_json::to_value(&output.lines[0]).expect("serialize");
        assert_eq!(json["type"], "barChart");
        assert_eq!(json["label"], "Usage Trend");
        assert_eq!(json["points"][0]["valueLabel"], "42 tokens");
        assert_eq!(json["points"][0]["startAt"], "2026-08-22T09:00:00+08:00");
        assert_eq!(json["points"][0]["modelUsage"][0]["name"], "gpt-5.6-sol");
        assert_eq!(json["points"][0]["modelUsage"][0]["tokens"], 30.0);
        assert_eq!(
            json["points"][0]["modelUsage"][0]["costUsd"],
            JsonValue::Null
        );
        assert_eq!(
            json["points"][0]["modelUsage"][0]["estimationStatus"],
            JsonValue::Null
        );
        assert_eq!(
            json["points"][0]["modelUsage"]
                .as_array()
                .expect("model usage array")
                .len(),
            1
        );
        assert_eq!(
            json["points"][1]["modelUsage"],
            JsonValue::Array(Vec::new())
        );
        assert_eq!(json["note"], "Estimated from local logs");
    }

    #[test]
    fn bar_chart_model_estimates_validate_costs_and_statuses() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe(ctx) {
                    return { lines: [ctx.line.barChart({
                        label: "Usage Trend",
                        points: [{ label: "Today", value: 50, modelUsage: [
                            { name: "priced", tokens: 10, costUsd: 1.25, estimationStatus: "historical_rate" },
                            { name: "partial", tokens: 10, costUsd: 0, estimationStatus: "partial_rate" },
                            { name: "unknown", tokens: 10, costUsd: null, estimationStatus: "unknown" },
                            { name: "invalid", tokens: 10, costUsd: -1, estimationStatus: "free" },
                            { name: "infinite", tokens: 10, costUsd: Infinity, estimationStatus: "current_rate" }
                        ] }]
                    })] };
                }
            };
            "#,
        );
        let output = run_probe(&plugin, &temp_app_dir("bar-chart-model-estimates"), "0.0.0");
        let json: JsonValue = serde_json::to_value(&output.lines[0]).expect("serialize");
        let models = &json["points"][0]["modelUsage"];
        assert_eq!(models[0]["costUsd"], 1.25);
        assert_eq!(models[0]["estimationStatus"], "historical_rate");
        assert_eq!(models[1]["costUsd"], 0.0);
        assert_eq!(models[1]["estimationStatus"], "partial_rate");
        assert_eq!(models[2]["costUsd"], JsonValue::Null);
        assert_eq!(models[2]["estimationStatus"], "unknown");
        assert_eq!(models[3]["costUsd"], JsonValue::Null);
        assert_eq!(models[3]["estimationStatus"], JsonValue::Null);
        assert_eq!(models[4]["costUsd"], JsonValue::Null);
        assert_eq!(models[4]["estimationStatus"], "current_rate");

        let cached: BarChartModelUsage = serde_json::from_value(serde_json::json!({
            "name": "old-cache", "tokens": 10
        }))
        .expect("legacy model usage");
        assert_eq!(cached.cost_usd, None);
        assert_eq!(cached.estimation_status, None);
    }

    #[test]
    fn hourly_bar_chart_keeps_an_empty_success_series() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe(ctx) {
                    return {
                        lines: [ctx.line.barChart({
                            label: "Today Activity",
                            granularity: "hourly",
                            points: []
                        })]
                    };
                }
            };
            "#,
        );

        let output = run_probe(&plugin, &temp_app_dir("bar-chart-hourly-empty"), "0.0.0");
        let json: JsonValue = serde_json::to_value(&output.lines[0]).expect("serialize");
        assert_eq!(json["type"], "barChart");
        assert_eq!(json["granularity"], "hourly");
        assert_eq!(json["points"], JsonValue::Array(Vec::new()));
    }

    #[test]
    fn bar_chart_caps_excessive_points() {
        // A plugin-controlled points array must not parse unbounded: this path
        // is native and runs after the JS deadline interrupt can fire.
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe(ctx) {
                    var points = [];
                    for (var i = 0; i < 5000; i++) {
                        points.push({ label: "d" + i, value: i });
                    }
                    return { lines: [ctx.line.barChart({ label: "Big", points: points })] };
                }
            };
            "#,
        );

        let output = run_probe(&plugin, &temp_app_dir("bar-chart-cap"), "0.0.0");
        let json: JsonValue = serde_json::to_value(&output.lines[0]).expect("serialize");
        assert_eq!(json["type"], "barChart");
        assert_eq!(
            json["points"].as_array().expect("points array").len(),
            MAX_BAR_CHART_POINTS
        );
    }

    #[test]
    fn bar_chart_caps_model_usage_without_dropping_the_point() {
        let plugin = test_plugin(
            r#"
            globalThis.__one_more_prompt_plugin = {
                probe(ctx) {
                    var modelUsage = [];
                    for (var i = 0; i < 5000; i++) {
                        modelUsage.push({ name: "model-" + i, tokens: i + 1 });
                    }
                    return {
                        lines: [ctx.line.barChart({
                            label: "Usage Trend",
                            points: [{ label: "Today", value: 42, modelUsage: modelUsage }]
                        })]
                    };
                }
            };
            "#,
        );

        let output = run_probe(&plugin, &temp_app_dir("bar-chart-model-cap"), "0.0.0");
        let json: JsonValue = serde_json::to_value(&output.lines[0]).expect("serialize");
        assert_eq!(json["type"], "barChart");
        assert_eq!(
            json["points"][0]["modelUsage"]
                .as_array()
                .expect("model usage array")
                .len(),
            MAX_BAR_CHART_MODEL_USAGE_ITEMS
        );
    }

    #[test]
    fn bar_chart_point_deserializes_legacy_cache_without_model_usage() {
        let point: BarChartPoint = serde_json::from_value(serde_json::json!({
            "label": "Today",
            "value": 42,
            "valueLabel": "42 tokens"
        }))
        .expect("legacy bar chart point should deserialize");

        assert!(point.model_usage.is_empty());
    }

    #[test]
    fn is_rate_limited_output_detects_status_badge() {
        let output = PluginOutput {
            provider_id: "claude".to_string(),
            display_name: "Claude".to_string(),
            plan: None,
            lines: vec![MetricLine::Badge {
                label: "Status".to_string(),
                text: "Rate limited, retry in ~5m".to_string(),
                color: Some("#f59e0b".to_string()),
                subtitle: None,
            }],
            icon_url: String::new(),
        };
        assert!(is_rate_limited_output(&output));
    }

    #[test]
    fn is_rate_limited_output_ignores_successful_probes() {
        let output = PluginOutput {
            provider_id: "claude".to_string(),
            display_name: "Claude".to_string(),
            plan: None,
            lines: vec![MetricLine::Progress {
                label: "Session".to_string(),
                used: 42.0,
                limit: 100.0,
                format: ProgressFormat::Percent,
                resets_at: None,
                period_duration_ms: None,
                color: None,
            }],
            icon_url: String::new(),
        };
        assert!(!is_rate_limited_output(&output));
    }
}
