use std::{
    fs,
    io::{self, BufRead, BufReader},
    path::Path,
};

use serde_json::Value;

use super::{
    codex_line_may_contain_usage, codex_model_from_payload, codex_model_from_result,
    codex_session_id, codex_timestamp_from_result, file_modified_timestamp,
    normalize_codex_raw_usage, normalize_headless_codex_usage, parsed_model_is_missing,
    subtract_codex_raw_usage,
};
use crate::{cli_error, CodexRawUsage, CodexTokenUsageEvent, Result};

const LINE_BUFFER_CAPACITY: usize = 64 * 1024;

fn read_byte_line(reader: &mut impl BufRead, line: &mut Vec<u8>) -> io::Result<bool> {
    line.clear();
    // A large message or image must not keep its allocation for the rest of the scan.
    // This is a retention bound, not a line-length limit: every line is still read whole.
    if line.capacity() > LINE_BUFFER_CAPACITY {
        *line = Vec::with_capacity(LINE_BUFFER_CAPACITY);
    }
    if reader.read_until(b'\n', line)? == 0 {
        return Ok(false);
    }
    if line.last() == Some(&b'\n') {
        line.pop();
    }
    Ok(true)
}

pub(crate) fn visit_codex_session_file(
    sessions_dir: &Path,
    path: &Path,
    mut visit: impl FnMut(CodexTokenUsageEvent) -> Result<()>,
) -> Result<()> {
    let file = fs::File::open(path).map_err(|error| {
        cli_error(format!(
            "Failed to open Codex session {}: {error}",
            path.display()
        ))
    })?;
    let source: Box<dyn io::Read> = if path.extension().is_some_and(|ext| ext == "zst") {
        Box::new(zstd::stream::read::Decoder::new(file).map_err(|error| {
            cli_error(format!(
                "Failed to decode Codex session {}: {error}",
                path.display()
            ))
        })?)
    } else {
        Box::new(file)
    };
    let mut reader = BufReader::with_capacity(LINE_BUFFER_CAPACITY, source);
    let mut line = Vec::with_capacity(LINE_BUFFER_CAPACITY);
    let session_id = codex_session_id(sessions_dir, path);
    let mut previous_totals: Option<CodexRawUsage> = None;
    let mut current_model: Option<String> = None;
    let mut current_model_is_fallback = false;
    let mut requests = super::request_usage::RequestUsage::default();
    let fallback_timestamp = file_modified_timestamp(path);

    while read_byte_line(&mut reader, &mut line).map_err(|error| {
        cli_error(format!(
            "Failed to read Codex session {}: {error}",
            path.display()
        ))
    })? {
        let line = line.as_slice();
        if !codex_line_may_contain_usage(line) {
            continue;
        }
        let Ok(value) = serde_json::from_slice::<Value>(line) else {
            continue;
        };
        let entry_type = value.get("type").and_then(Value::as_str);
        requests.observe(&value);
        if entry_type == Some("token_usage_record") {
            let explicit_model = if current_model_is_fallback {
                None
            } else {
                current_model.as_deref()
            };
            if let Some(event) = requests
                .record(&value, &session_id, explicit_model)
                .map_err(|error| {
                    cli_error(format!(
                        "Failed to read Codex session {}: {error}",
                        path.display()
                    ))
                })?
            {
                visit(event)?;
            }
            continue;
        }
        if entry_type == Some("session_meta") {
            continue;
        }
        if entry_type == Some("turn_context") {
            if let Some(model) = codex_model_from_payload(value.get("payload")) {
                current_model = Some(model);
                current_model_is_fallback = false;
            }
            continue;
        }
        if entry_type != Some("event_msg") {
            add_codex_exec_event(
                &session_id,
                &requests.owner_id(&session_id),
                &value,
                &fallback_timestamp,
                &mut current_model,
                &mut current_model_is_fallback,
                &mut visit,
            )?;
            continue;
        }
        let Some(timestamp) = value.get("timestamp").and_then(Value::as_str) else {
            continue;
        };
        let Some(payload) = value.get("payload") else {
            continue;
        };
        if payload.get("type").and_then(Value::as_str) != Some("token_count") {
            continue;
        }
        let info = payload.get("info");
        let total_usage = info.and_then(|info| {
            info.get("total_token_usage")
                .and_then(normalize_codex_raw_usage)
        });
        let last_usage = info.and_then(|info| {
            info.get("last_token_usage")
                .and_then(normalize_codex_raw_usage)
        });
        // Rate-limit-only updates are not the request's compatibility counter.
        if total_usage.is_none() && last_usage.is_none() {
            continue;
        }
        let partner = requests.take_partner();
        if partner == Some(false) {
            continue;
        }
        if partner == Some(true) {
            if let Some(usage) = total_usage {
                previous_totals = Some(usage);
            }
            continue;
        }
        // A later compatibility snapshot can repeat the previous request's usage.
        if total_usage
            .as_ref()
            .zip(previous_totals.as_ref())
            .is_some_and(|(a, b)| {
                (
                    a.input_tokens,
                    a.cached_input_tokens,
                    a.output_tokens,
                    a.reasoning_output_tokens,
                    a.total_tokens,
                ) == (
                    b.input_tokens,
                    b.cached_input_tokens,
                    b.output_tokens,
                    b.reasoning_output_tokens,
                    b.total_tokens,
                )
            })
        {
            previous_totals = total_usage;
            continue;
        }
        let raw_usage = last_usage.or_else(|| {
            total_usage
                .as_ref()
                .map(|usage| subtract_codex_raw_usage(usage, previous_totals.as_ref()))
        });
        if let Some(total_usage) = total_usage {
            previous_totals = Some(total_usage);
        }
        let Some(raw_usage) = raw_usage else {
            continue;
        };
        if raw_usage.input_tokens == 0
            && raw_usage.cached_input_tokens == 0
            && raw_usage.output_tokens == 0
            && raw_usage.reasoning_output_tokens == 0
        {
            continue;
        }

        let parsed_model = codex_model_from_payload(Some(payload))
            .or_else(|| info.and_then(|info| codex_model_from_payload(Some(info))));
        if let Some(model) = parsed_model.clone() {
            current_model = Some(model);
            current_model_is_fallback = false;
        }
        let mut is_fallback_model = false;
        let model = parsed_model.or_else(|| current_model.clone()).or_else(|| {
            is_fallback_model = true;
            current_model_is_fallback = true;
            current_model = Some("gpt-5".to_string());
            current_model.clone()
        });
        if parsed_model_is_missing(&model, &current_model, current_model_is_fallback) {
            is_fallback_model = true;
        }

        visit(CodexTokenUsageEvent {
            request_id: None,
            owner_id: requests.owner_id(&session_id),
            session_id: session_id.clone(),
            timestamp: timestamp.to_string(),
            model,
            input_tokens: raw_usage.input_tokens,
            cached_input_tokens: raw_usage.cached_input_tokens.min(raw_usage.input_tokens),
            cache_write_input_tokens: raw_usage.cache_write_input_tokens,
            has_unrecorded_cache_writes: raw_usage.has_unrecorded_cache_writes,
            output_tokens: raw_usage.output_tokens,
            reasoning_output_tokens: raw_usage.reasoning_output_tokens,
            total_tokens: raw_usage.total_tokens,
            is_fallback_model,
        })?;
    }

    Ok(())
}

fn add_codex_exec_event(
    session_id: &str,
    owner_id: &str,
    value: &Value,
    fallback_timestamp: &str,
    current_model: &mut Option<String>,
    current_model_is_fallback: &mut bool,
    visit: &mut impl FnMut(CodexTokenUsageEvent) -> Result<()>,
) -> Result<()> {
    let Some(raw_usage) = normalize_headless_codex_usage(value) else {
        return Ok(());
    };
    let parsed_model = codex_model_from_result(value);
    if let Some(model) = parsed_model.clone() {
        *current_model = Some(model);
        *current_model_is_fallback = false;
    }
    let mut is_fallback_model = false;
    let model = parsed_model.or_else(|| current_model.clone()).or_else(|| {
        is_fallback_model = true;
        *current_model_is_fallback = true;
        *current_model = Some("gpt-5".to_string());
        current_model.clone()
    });
    if parsed_model_is_missing(&model, current_model, *current_model_is_fallback) {
        is_fallback_model = true;
    }
    visit(CodexTokenUsageEvent {
        request_id: None,
        owner_id: owner_id.to_string(),
        session_id: session_id.to_string(),
        timestamp: codex_timestamp_from_result(value)
            .unwrap_or_else(|| fallback_timestamp.to_string()),
        model,
        input_tokens: raw_usage.input_tokens,
        cached_input_tokens: raw_usage.cached_input_tokens.min(raw_usage.input_tokens),
        cache_write_input_tokens: raw_usage.cache_write_input_tokens,
        has_unrecorded_cache_writes: raw_usage.has_unrecorded_cache_writes,
        output_tokens: raw_usage.output_tokens,
        reasoning_output_tokens: raw_usage.reasoning_output_tokens,
        total_tokens: raw_usage.total_tokens,
        is_fallback_model,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        env,
        io::Cursor,
        time::{SystemTime, UNIX_EPOCH},
    };

    use serde_json::json;

    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = env::temp_dir().join(format!("ccusage-codex-stream-{name}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn cumulative_event(input: u64, cached: u64, output: u64, reasoning: u64) -> Value {
        json!({
            "type": "event_msg",
            "timestamp": "2026-01-02T03:04:05.000Z",
            "payload": {
                "type": "token_count",
                "info": {
                    "total_token_usage": {
                        "input_tokens": input,
                        "cached_input_tokens": cached,
                        "output_tokens": output,
                        "reasoning_output_tokens": reasoning,
                        "total_tokens": input + output + reasoning
                    }
                }
            }
        })
    }

    #[test]
    fn streams_large_ignored_lines_context_crlf_and_unterminated_usage() {
        let dir = temp_dir("large-lines");
        let path = dir.join("session.jsonl");
        let ignored = json!({
            "type": "response_item",
            "payload": {"message": "x".repeat(LINE_BUFFER_CAPACITY * 16 + 7)}
        });
        // Relevant markers may appear anywhere, including beyond the first reader buffer.
        let context = format!(
            "{{\"padding\":\"{}\",\"type\":\"turn_context\",\"payload\":{{\"model\":\"gpt-5.2-codex\"}}}}",
            "y".repeat(LINE_BUFFER_CAPACITY * 2 - 5)
        );
        let mut bytes = ignored.to_string().into_bytes();
        bytes.extend_from_slice(b"\r\n\xff token_count\n{\"type\":\"token_count\",bad}\n\n");
        bytes.extend_from_slice(context.as_bytes());
        bytes.extend_from_slice(b"\r\n");
        bytes.extend_from_slice(cumulative_event(100, 150, 20, 2).to_string().as_bytes());
        bytes.extend_from_slice(b"\r\n");
        bytes.extend_from_slice(cumulative_event(160, 180, 28, 5).to_string().as_bytes());
        fs::write(&path, bytes).unwrap();

        let mut events = Vec::new();
        visit_codex_session_file(&dir, &path, |event| {
            events.push(event);
            Ok(())
        })
        .unwrap();
        fs::remove_dir_all(dir).unwrap();

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].session_id, "session");
        assert_eq!(events[0].model.as_deref(), Some("gpt-5.2-codex"));
        assert!(!events[0].is_fallback_model);
        assert_eq!(events[0].input_tokens, 100);
        assert_eq!(events[0].cached_input_tokens, 100);
        assert_eq!(events[0].output_tokens, 20);
        assert_eq!(events[0].reasoning_output_tokens, 2);
        assert_eq!(events[0].total_tokens, 122);
        assert_eq!(events[1].model.as_deref(), Some("gpt-5.2-codex"));
        assert_eq!(events[1].input_tokens, 60);
        assert_eq!(events[1].cached_input_tokens, 30);
        assert_eq!(events[1].output_tokens, 8);
        assert_eq!(events[1].reasoning_output_tokens, 3);
        assert_eq!(events[1].total_tokens, 71);
    }

    #[test]
    fn releases_large_line_allocation_before_reading_the_next_line() {
        let mut bytes = vec![b'x'; LINE_BUFFER_CAPACITY * 16 + 7];
        bytes.extend_from_slice(b"\nshort\r\nlast");
        let mut reader = BufReader::with_capacity(31, Cursor::new(bytes));
        let mut line = Vec::new();

        assert!(read_byte_line(&mut reader, &mut line).unwrap());
        assert_eq!(line.len(), LINE_BUFFER_CAPACITY * 16 + 7);
        assert!(line.capacity() > LINE_BUFFER_CAPACITY);
        assert!(read_byte_line(&mut reader, &mut line).unwrap());
        assert_eq!(line, b"short\r");
        assert!(line.capacity() <= LINE_BUFFER_CAPACITY);
        assert!(read_byte_line(&mut reader, &mut line).unwrap());
        assert_eq!(line, b"last");
        assert!(!read_byte_line(&mut reader, &mut line).unwrap());
        assert!(line.is_empty());
    }

    #[test]
    fn returns_visitor_error_without_visiting_later_usage() {
        let dir = temp_dir("visitor-error");
        let path = dir.join("session.jsonl");
        let first = cumulative_event(100, 0, 20, 0).to_string();
        let second = cumulative_event(200, 0, 40, 0).to_string();
        fs::write(&path, format!("{first}\n{second}")).unwrap();
        let mut visited = 0;

        let error = visit_codex_session_file(&dir, &path, |_| {
            visited += 1;
            Err(cli_error("visitor stopped"))
        })
        .unwrap_err();
        fs::remove_dir_all(dir).unwrap();

        assert_eq!(visited, 1);
        assert_eq!(error.to_string(), "visitor stopped");
    }

    #[test]
    fn returns_reader_errors() {
        struct FailingReader;
        impl io::Read for FailingReader {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::new(io::ErrorKind::Other, "reader stopped"))
            }
        }
        let mut reader = BufReader::new(FailingReader);
        let mut line = Vec::new();

        assert_eq!(
            read_byte_line(&mut reader, &mut line)
                .unwrap_err()
                .to_string(),
            "reader stopped"
        );
    }
}
