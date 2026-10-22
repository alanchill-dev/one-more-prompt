use crate::plugin_engine::{
    host_api,
    pricing_cache::{self, PricingEstimationStatus},
    runtime::{BarChartModelUsage, BarChartPoint},
};
use serde::Deserialize;
use std::collections::BTreeMap;
use time::{Date, Month, OffsetDateTime, format_description::well_known::Rfc3339};

#[derive(Deserialize)]
struct HourlyReport {
    hourly: Vec<HourlyRow>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HourlyRow {
    start_at: String,
    total_tokens: f64,
    models: BTreeMap<String, HourlyModelUsage>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HourlyModelUsage {
    total_tokens: f64,
    input_tokens: f64,
    cached_input_tokens: f64,
    #[serde(default)]
    cache_write_input_tokens: Option<f64>,
    #[serde(default)]
    cache_write_input_tokens_complete: bool,
    output_tokens: f64,
}

pub(crate) fn query(date_key: &str) -> Result<Vec<BarChartPoint>, String> {
    let bound = query_bound(date_key)?;
    let report = host_api::query_codex_hourly_usage(&bound, &bound)?;
    convert_report(report)
}

fn query_bound(date_key: &str) -> Result<String, String> {
    let bytes = date_key.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return Err("Date must use YYYY-MM-DD format".to_string());
    }

    let year = date_key[..4]
        .parse::<i32>()
        .map_err(|_| "Date contains an invalid year".to_string())?;
    let month_number = date_key[5..7]
        .parse::<u8>()
        .map_err(|_| "Date contains an invalid month".to_string())?;
    let day = date_key[8..]
        .parse::<u8>()
        .map_err(|_| "Date contains an invalid day".to_string())?;
    let month = Month::try_from(month_number)
        .map_err(|_| format!("{date_key} is not a valid calendar date"))?;
    Date::from_calendar_date(year, month, day)
        .map_err(|_| format!("{date_key} is not a valid calendar date"))?;

    Ok(format!("{year:04}{month_number:02}{day:02}"))
}

fn convert_report(value: serde_json::Value) -> Result<Vec<BarChartPoint>, String> {
    let mut rows: HourlyReport = serde_json::from_value(value)
        .map_err(|error| format!("Malformed Codex hourly usage response: {error}"))?;
    rows.hourly
        .sort_by(|left, right| left.start_at.cmp(&right.start_at));
    rows.hourly.into_iter().map(convert_row).collect()
}

fn convert_row(row: HourlyRow) -> Result<BarChartPoint, String> {
    let parsed = OffsetDateTime::parse(&row.start_at, &Rfc3339)
        .map_err(|error| format!("Malformed Codex hourly startAt: {error}"))?;
    validate_tokens(row.total_tokens, "hour total")?;

    let usage_at = row.start_at.clone();
    let mut cost_usd = 0.0;
    let mut estimation_status = PricingEstimationStatus::HistoricalRate;
    let mut has_priced_usage = false;
    let mut has_unpriced_usage = false;
    let mut has_ignored_usage = false;
    let mut model_usage = row
        .models
        .into_iter()
        .map(|(name, usage)| {
            if name.trim().is_empty() {
                return Err("Malformed Codex hourly model name".to_string());
            }
            validate_tokens(usage.total_tokens, "model total")?;
            validate_tokens(usage.input_tokens, "model input")?;
            validate_tokens(usage.cached_input_tokens, "model cached input")?;
            if let Some(written) = usage.cache_write_input_tokens {
                validate_tokens(written, "model cache write input")?;
            }
            validate_tokens(usage.output_tokens, "model output")?;
            let has_usage = usage.total_tokens > 0.0
                || usage.input_tokens > 0.0
                || usage.cached_input_tokens > 0.0
                || usage.output_tokens > 0.0;
            let (model_cost, model_status) = if has_usage
                && is_ignored_internal_pricing_model(&name)
            {
                has_ignored_usage = true;
                (Some(0.0), PricingEstimationStatus::CurrentRate)
            } else {
                let estimate = pricing_cache::estimate_codex_usage_at(
                    &name,
                    Some(&usage_at),
                    usage.input_tokens,
                    usage.cached_input_tokens,
                    usage.cache_write_input_tokens,
                    usage.cache_write_input_tokens_complete,
                    usage.output_tokens,
                );
                match estimate.cost_usd {
                    Some(model_cost) if has_usage => {
                        cost_usd += model_cost;
                        has_priced_usage = true;
                    }
                    None if has_usage => has_unpriced_usage = true,
                    _ => {}
                }
                if estimate.estimation_status == PricingEstimationStatus::CurrentRate {
                    estimation_status = PricingEstimationStatus::CurrentRate;
                }
                if has_usage && estimate.estimation_status == PricingEstimationStatus::PartialRate {
                    has_unpriced_usage = true;
                }
                (estimate.cost_usd, estimate.estimation_status)
            };
            Ok(BarChartModelUsage {
                name: prettify_model_name(&name),
                tokens: usage.total_tokens,
                cost_usd: model_cost,
                estimation_status: Some(model_status),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    model_usage.retain(|model| model.tokens > 0.0);
    model_usage.sort_by(|left, right| {
        right
            .tokens
            .total_cmp(&left.tokens)
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(BarChartPoint {
        label: format!("{}:00", parsed.hour()),
        value: row.total_tokens,
        value_label: Some(format_tokens(row.total_tokens)),
        start_at: Some(row.start_at),
        model_usage,
        cost_usd: (has_priced_usage || (has_ignored_usage && !has_unpriced_usage))
            .then_some(cost_usd),
        estimation_status: Some(if has_priced_usage && has_unpriced_usage {
            PricingEstimationStatus::PartialRate
        } else if has_priced_usage {
            estimation_status
        } else if has_ignored_usage && !has_unpriced_usage {
            PricingEstimationStatus::CurrentRate
        } else {
            PricingEstimationStatus::Unknown
        }),
    })
}

fn is_ignored_internal_pricing_model(model: &str) -> bool {
    model.eq_ignore_ascii_case("codex-auto-review")
}

fn validate_tokens(value: f64, field: &str) -> Result<(), String> {
    if value.is_finite() && value >= 0.0 {
        Ok(())
    } else {
        Err(format!("Malformed Codex hourly {field}"))
    }
}

fn prettify_model_name(raw: &str) -> String {
    let Some(suffix) = raw.strip_prefix("gpt-") else {
        return raw.to_string();
    };
    let mut parts = suffix.split('-');
    let Some(version) = parts.next().filter(|part| {
        !part.is_empty()
            && part.chars().all(|ch| ch.is_ascii_digit() || ch == '.')
            && !part.starts_with('.')
            && !part.ends_with('.')
            && !part.contains("..")
    }) else {
        return raw.to_string();
    };

    let mut pretty = format!("GPT-{version}");
    for part in parts {
        pretty.push(' ');
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            pretty.extend(first.to_uppercase());
            pretty.extend(chars);
        }
    }
    pretty
}

fn format_tokens(value: f64) -> String {
    for (threshold, suffix) in [(1e9, "B"), (1e6, "M"), (1e3, "K")] {
        if value >= threshold {
            let scaled = value / threshold;
            return if scaled >= 10.0 {
                format!("{scaled:.0}{suffix}")
            } else {
                format!("{scaled:.1}{suffix}").replace(&format!(".0{suffix}"), suffix)
            };
        }
    }
    format!("{value:.0}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_and_compacts_real_calendar_dates() {
        assert_eq!(query_bound("2024-02-29").unwrap(), "20240229");
        assert!(query_bound("2026-02-29").is_err());
        assert!(query_bound("2026-2-03").is_err());
        assert!(query_bound("not-a-date").is_err());
    }

    #[test]
    fn converts_and_sorts_hourly_rows_and_models() {
        let points = convert_report(json!({
            "hourly": [{
                "startAt": "2026-08-04T10:00:00+08:00",
                "totalTokens": 100,
                "models": {
                    "gpt-5": { "totalTokens": 25, "inputTokens": 10, "cachedInputTokens": 5, "outputTokens": 10 },
                    "gpt-5.6-sol": { "totalTokens": 75, "inputTokens": 30, "cachedInputTokens": 20, "outputTokens": 25 }
                }
            }, {
                "startAt": "2026-08-04T09:00:00+08:00",
                "totalTokens": 200,
                "models": { "gpt-5.6-luna": { "totalTokens": 200, "inputTokens": 80, "cachedInputTokens": 70, "outputTokens": 50 } }
            }]
        }))
        .unwrap();

        assert_eq!(points[0].label, "9:00");
        assert_eq!(points[0].value, 200.0);
        assert_eq!(
            points[1].start_at.as_deref(),
            Some("2026-08-04T10:00:00+08:00")
        );
        assert_eq!(points[1].model_usage[0].name, "GPT-5.6 Sol");
        assert_eq!(points[1].model_usage[0].tokens, 75.0);
        assert_eq!(points[1].model_usage[1].tokens, 25.0);
    }

    #[test]
    fn unknown_model_price_is_not_reported_as_zero() {
        let points = convert_report(json!({
            "hourly": [{
                "startAt": "2026-08-04T09:00:00+08:00",
                "totalTokens": 10,
                "models": {
                    "definitely-unknown-pricing-model": {
                        "totalTokens": 10,
                        "inputTokens": 5,
                        "cachedInputTokens": 0,
                        "cacheWriteInputTokens": 0,
                        "cacheWriteInputTokensComplete": true,
                        "outputTokens": 5
                    }
                }
            }]
        }))
        .unwrap();

        assert_eq!(points[0].cost_usd, None);
        assert_eq!(points[0].model_usage[0].cost_usd, None);
        assert_eq!(
            points[0].model_usage[0].estimation_status,
            Some(PricingEstimationStatus::Unknown)
        );
        assert_eq!(
            points[0].estimation_status,
            Some(PricingEstimationStatus::Unknown)
        );
    }

    #[test]
    fn explicit_cache_writes_are_priced_once_and_missing_measurement_stays_partial() {
        let pricing_dir = pricing_cache::test_fixtures::temp_dir("hourly-cache-writes");
        pricing_cache::init_for_tests(&pricing_dir, "http://127.0.0.1:9/unreachable");
        for (written, complete, expected_cost, expected_status) in [
            (
                Some(20_000_000),
                true,
                384.0,
                PricingEstimationStatus::CurrentRate,
            ),
            (
                Some(20_000_000),
                false,
                384.0,
                PricingEstimationStatus::PartialRate,
            ),
            (Some(0), true, 369.0, PricingEstimationStatus::CurrentRate),
            (None, false, 369.0, PricingEstimationStatus::PartialRate),
        ] {
            let points = convert_report(json!({"hourly": [{
                "startAt": "2026-08-04T09:00:00+08:00", "totalTokens": 110_000_000,
                "models": {"claude-sonnet-4-5-20250929": {
                    "totalTokens": 110_000_000, "inputTokens": 70_000_000,
                    "cachedInputTokens": 30_000_000, "outputTokens": 10_000_000,
                    "cacheWriteInputTokens": written, "cacheWriteInputTokensComplete": complete,
                }}
            }]}))
            .unwrap();
            assert!((points[0].cost_usd.unwrap() - expected_cost).abs() < 1e-8);
            assert_eq!(points[0].estimation_status, Some(expected_status));
            assert_eq!(
                points[0].model_usage[0].estimation_status,
                Some(expected_status)
            );
        }
    }

    #[test]
    fn mixed_models_keep_the_priced_portion_and_mark_it_partial() {
        let pricing_dir = pricing_cache::test_fixtures::temp_dir("hourly-partial-rate");
        pricing_cache::init_for_tests(&pricing_dir, "http://127.0.0.1:9/unreachable");
        let points = convert_report(json!({
            "hourly": [{
                "startAt": "2026-08-04T09:00:00+08:00",
                "totalTokens": 20,
                "models": {
                    "claude-sonnet-4-5-20250929": {
                        "totalTokens": 10,
                        "inputTokens": 5,
                        "cachedInputTokens": 0,
                        "cacheWriteInputTokens": 0,
                        "cacheWriteInputTokensComplete": true,
                        "outputTokens": 5
                    },
                    "definitely-unknown-pricing-model": {
                        "totalTokens": 10,
                        "inputTokens": 5,
                        "cachedInputTokens": 0,
                        "cacheWriteInputTokens": 0,
                        "cacheWriteInputTokensComplete": true,
                        "outputTokens": 5
                    }
                }
            }]
        }))
        .unwrap();

        assert!(points[0].cost_usd.is_some_and(|cost| cost > 0.0));
        assert_eq!(
            points[0].estimation_status,
            Some(PricingEstimationStatus::PartialRate)
        );
        let known = points[0]
            .model_usage
            .iter()
            .find(|model| model.name == "claude-sonnet-4-5-20250929")
            .unwrap();
        let unknown = points[0]
            .model_usage
            .iter()
            .find(|model| model.name == "definitely-unknown-pricing-model")
            .unwrap();
        assert_eq!(known.cost_usd, points[0].cost_usd);
        assert_eq!(
            known.estimation_status,
            Some(PricingEstimationStatus::CurrentRate)
        );
        assert_eq!(unknown.cost_usd, None);
        assert_eq!(
            unknown.estimation_status,
            Some(PricingEstimationStatus::Unknown)
        );
    }

    #[test]
    fn internal_auto_review_usage_does_not_downgrade_a_priced_hour() {
        let pricing_dir = pricing_cache::test_fixtures::temp_dir("hourly-internal-model");
        pricing_cache::init_for_tests(&pricing_dir, "http://127.0.0.1:9/unreachable");
        let points = convert_report(json!({
            "hourly": [{
                "startAt": "2026-08-04T09:00:00+08:00",
                "totalTokens": 20,
                "models": {
                    "claude-sonnet-4-5-20250929": {
                        "totalTokens": 10,
                        "inputTokens": 5,
                        "cachedInputTokens": 0,
                        "cacheWriteInputTokens": 0,
                        "cacheWriteInputTokensComplete": true,
                        "outputTokens": 5
                    },
                    "codex-auto-review": {
                        "totalTokens": 10,
                        "inputTokens": 5,
                        "cachedInputTokens": 0,
                        "cacheWriteInputTokens": 0,
                        "cacheWriteInputTokensComplete": true,
                        "outputTokens": 5
                    }
                }
            }]
        }))
        .unwrap();

        assert!(points[0].cost_usd.is_some_and(|cost| cost > 0.0));
        assert_eq!(
            points[0].estimation_status,
            Some(PricingEstimationStatus::CurrentRate)
        );
        let internal = points[0]
            .model_usage
            .iter()
            .find(|model| model.name == "codex-auto-review")
            .unwrap();
        assert_eq!(internal.cost_usd, Some(0.0));
        assert_eq!(
            internal.estimation_status,
            Some(PricingEstimationStatus::CurrentRate)
        );
    }

    #[test]
    fn malformed_hourly_data_is_an_error_not_an_empty_success() {
        assert!(
            convert_report(json!({ "hourly": [{
            "startAt": "not-a-timestamp",
            "totalTokens": 1,
            "models": {}
        }] }))
            .is_err()
        );
        assert!(
            convert_report(json!({ "hourly": [{
            "startAt": "2026-08-04T09:00:00+08:00",
            "totalTokens": 1
        }] }))
            .is_err()
        );
    }
}
