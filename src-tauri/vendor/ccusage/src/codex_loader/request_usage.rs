use std::collections::{HashMap, HashSet};

use serde_json::Value;

use super::{codex_model_from_payload, json_u64, normalize_codex_raw_usage};
use crate::{cli_error, non_empty_json_string, CodexTokenUsageEvent, Result};

#[derive(Default)]
pub(super) struct RequestUsage {
    thread: Option<String>,
    models: HashMap<String, String>,
    seen: HashSet<String>,
    // Every request is followed by one compatibility counter, including replays.
    partner_is_local: Option<bool>,
}

impl RequestUsage {
    pub(super) fn owner_id(&self, fallback: &str) -> String {
        match &self.thread {
            Some(thread) => format!("thread:{thread}"),
            None => format!("file:{fallback}"),
        }
    }

    pub(super) fn observe(&mut self, value: &Value) {
        let kind = value.get("type").and_then(Value::as_str);
        let payload = value.get("payload");
        match kind {
            Some("session_meta") => {
                if self.thread.is_none() {
                    self.thread = payload.and_then(|p| non_empty_json_string(p.get("id")));
                }
                self.partner_is_local = None;
            }
            Some("turn_context") => {
                if let Some((turn, model)) = payload.and_then(|p| {
                    Some((
                        non_empty_json_string(p.get("turn_id"))?,
                        codex_model_from_payload(Some(p))?,
                    ))
                }) {
                    self.models.insert(turn, model);
                }
                self.partner_is_local = None;
            }
            Some("event_msg")
                if matches!(
                    payload.and_then(|p| p.get("type")).and_then(Value::as_str),
                    Some("user_message" | "task_started" | "task_complete" | "turn_aborted")
                ) =>
            {
                self.partner_is_local = None
            }
            Some("response_item")
                if payload.and_then(|p| p.get("role")).and_then(Value::as_str) == Some("user") =>
            {
                self.partner_is_local = None
            }
            _ => {}
        }
    }

    pub(super) fn take_partner(&mut self) -> Option<bool> {
        self.partner_is_local.take()
    }

    pub(super) fn record(
        &mut self,
        value: &Value,
        session_id: &str,
        current_model: Option<&str>,
    ) -> Result<Option<CodexTokenUsageEvent>> {
        let payload = value
            .get("payload")
            .ok_or_else(|| cli_error("Codex request usage has no payload"))?;
        let field = |key| {
            non_empty_json_string(payload.get(key))
                .ok_or_else(|| cli_error(format!("Codex request usage has no {key}")))
        };
        let thread = field("thread_id")?;
        let turn = field("turn_id")?;
        let response = field("response_id")?;
        let local = self.thread.as_ref().is_none_or(|id| id == &thread);
        self.partner_is_local = Some(local);
        if !local {
            return Ok(None);
        }
        let identity = serde_json::to_string(&(&thread, &turn, &response))?;
        if !self.seen.insert(identity.clone()) {
            return Ok(None);
        }
        let usage = payload
            .get("usage")
            .ok_or_else(|| cli_error("Codex request usage has no usage"))?;
        let raw = normalize_codex_raw_usage(usage)
            .ok_or_else(|| cli_error("Codex request usage is not an object"))?;
        let timestamp = non_empty_json_string(value.get("timestamp"))
            .ok_or_else(|| cli_error("Codex request usage has no timestamp"))?;
        let model = codex_model_from_payload(Some(payload))
            .or_else(|| self.models.get(&turn).cloned())
            .or_else(|| current_model.map(str::to_owned))
            .unwrap_or_else(|| "Unknown Model".to_string());
        Ok(Some(CodexTokenUsageEvent {
            owner_id: self.owner_id(session_id),
            session_id: session_id.to_string(),
            timestamp,
            model: Some(model),
            input_tokens: raw.input_tokens,
            cached_input_tokens: raw.cached_input_tokens.min(raw.input_tokens),
            cache_write_input_tokens: raw.cache_write_input_tokens,
            has_unrecorded_cache_writes: raw.has_unrecorded_cache_writes,
            output_tokens: raw.output_tokens,
            reasoning_output_tokens: raw.reasoning_output_tokens,
            total_tokens: json_u64(usage.get("total_tokens"))
                .unwrap_or(raw.input_tokens + raw.output_tokens),
            is_fallback_model: false,
            request_id: Some(identity),
        }))
    }
}
