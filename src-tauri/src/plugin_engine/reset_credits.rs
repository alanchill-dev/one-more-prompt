use rquickjs::Value;
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ResetCredit {
    pub id: String,
    pub granted_at: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ResetCreditEventKind {
    Granted,
    Used,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ResetCreditEvent {
    pub id: String,
    pub kind: ResetCreditEventKind,
    pub occurred_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ResetCreditHistoryState {
    Ready,
    Unavailable,
    Disabled,
    Partial,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ResetCredits {
    pub available_count: f64,
    pub credits: Option<Vec<ResetCredit>>,
    pub history: Vec<ResetCreditEvent>,
    pub history_state: ResetCreditHistoryState,
    pub history_window_start: Option<String>,
    pub history_as_of: Option<String>,
}

/// The plugin normalizes this payload; serde enforces its IPC shape at the JS boundary.
pub fn parse(value: Value<'_>) -> Result<Option<ResetCredits>, String> {
    if value.is_null() || value.is_undefined() {
        return Ok(None);
    }
    let json = value
        .ctx()
        .json_stringify(value.clone())
        .map_err(|_| "invalid reset credit payload".to_string())?
        .ok_or_else(|| "missing reset credit payload".to_string())?
        .to_string()
        .map_err(|_| "invalid reset credit payload string".to_string())?;
    let credits: ResetCredits = serde_json::from_str(&json)
        .map_err(|_| "invalid reset credit payload shape".to_string())?;
    if !credits.available_count.is_finite()
        || credits.available_count < 0.0
        || credits.available_count.fract() != 0.0
    {
        return Err("invalid reset credit count".to_string());
    }
    Ok(Some(credits))
}

/// Credit metadata can include referral names and profile links that are not displayed by the app.
pub(crate) fn redact_response(body: &str) -> Option<String> {
    let is_list = body.contains("\"available_count\"") && body.contains("\"credits\"");
    let is_history = body.contains("\"window_start\"") && body.contains("\"events\"");
    if !is_list && !is_history {
        return None;
    }
    let mut value: serde_json::Value = serde_json::from_str(body).ok()?;
    let entries = if is_list {
        value.get_mut("credits")
    } else {
        value.get_mut("events")
    }?
    .as_array_mut()?;
    for entry in entries {
        for key in [
            "id",
            "title",
            "description",
            "profile_user_id",
            "profile_image_url",
        ] {
            if let Some(field) = entry.get_mut(key) {
                *field = serde_json::Value::String("[REDACTED]".into());
            }
        }
    }
    serde_json::to_string(&value).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_engine::host_api;
    use rquickjs::{Context, Object, Runtime};

    #[test]
    fn reset_credits_crosses_the_real_line_builder_with_used_event_dates() {
        let runtime = Runtime::new().unwrap();
        let context = Context::full(&runtime).unwrap();
        context.with(|ctx| {
            ctx.eval::<(), _>("globalThis.__one_more_prompt_ctx = {};").unwrap();
            host_api::inject_utils(&ctx).unwrap();
            let line: Object = ctx.eval(r#"__one_more_prompt_ctx.line.text({
                label: "Rate Limit Resets", value: "1 available", resetExpiry: ["2026-10-01T00:00:00Z"],
                resetCredits: { availableCount: 1, credits: [{id: "credit-1", grantedAt: null, expiresAt: "2026-10-01T00:00:00Z"}],
                    history: [{id: "event-1", kind: "used", occurredAt: "2026-09-12T00:00:00Z"}], historyState: "ready",
                    historyWindowStart: "2026-08-14T00:00:00Z", historyAsOf: "2026-09-13T00:00:00Z" }
            })"#).unwrap();
            let normalized = parse(line.get("resetCredits").unwrap()).unwrap().unwrap();
            assert_eq!(normalized.available_count, 1.0);
            assert_eq!(normalized.history[0].kind, ResetCreditEventKind::Used);
            assert_eq!(normalized.history[0].occurred_at, "2026-09-12T00:00:00Z");
            let serialized = serde_json::to_value(normalized).unwrap();
            assert_eq!(serialized["credits"][0]["grantedAt"], serde_json::Value::Null);
            assert_eq!(serialized["historyState"], "ready");
            assert!(line.get::<_, Vec<String>>("resetExpiry").is_ok());
        });
    }

    #[test]
    fn reset_credits_rejects_unknown_event_kinds_and_invalid_counts() {
        let runtime = Runtime::new().unwrap();
        let context = Context::full(&runtime).unwrap();
        context.with(|ctx| {
            for input in [
                r#"({availableCount: -1, credits: null, history: [], historyState: "unavailable"})"#,
                r#"({availableCount: 1, credits: null, history: [{id:"event",kind:"redeemed",occurredAt:"2026-09-12T00:00:00Z"}], historyState:"ready"})"#,
            ] {
                assert!(parse(ctx.eval(input).unwrap()).is_err());
            }
        });
    }
}
