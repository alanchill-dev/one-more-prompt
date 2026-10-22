use std::{
    env, fs,
    path::{Path, PathBuf},
    thread,
};

use compact_str::CompactString;
use serde_json::Value;

use crate::{
    chunk_file_indexes_by_size, cli::SharedArgs, cli_error, fast::FxHashSet, home,
    non_empty_json_string, progress, CodexRawUsage, CodexTokenUsageEvent, Result, TimestampMs,
};

mod request_usage;
mod session_files;
mod session_reader;
pub(crate) use session_files::collect_codex_files;

pub(crate) use session_reader::visit_codex_session_file;
pub(crate) const MAX_CODEX_FILE_READERS: usize = 4;

pub(crate) fn load_codex_events_from_directory(
    sessions_dir: &Path,
    single_thread: bool,
) -> Result<Vec<CodexTokenUsageEvent>> {
    let mut files = Vec::new();
    collect_codex_files(sessions_dir, &mut files)?;
    let mut events = if single_thread {
        files
            .iter()
            .map(|file| read_codex_session_file(sessions_dir, file))
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
    } else {
        read_codex_session_files_parallel(sessions_dir, &files)?
    };
    dedupe_codex_events(&mut events);
    Ok(events)
}

pub(crate) fn load_codex_events(shared: &SharedArgs) -> Result<Vec<CodexTokenUsageEvent>> {
    progress::track_usage_load(progress::UsageLoadAgent::Codex, shared.json, || {
        load_codex_events_inner(shared)
    })
}

fn load_codex_events_inner(shared: &SharedArgs) -> Result<Vec<CodexTokenUsageEvent>> {
    let mut events = Vec::new();
    for path in codex_usage_paths()? {
        events.extend(load_codex_events_from_directory(
            &path,
            shared.single_thread,
        )?);
    }
    dedupe_codex_events(&mut events);
    Ok(events)
}

fn read_codex_session_files_parallel(
    sessions_dir: &Path,
    files: &[PathBuf],
) -> Result<Vec<CodexTokenUsageEvent>> {
    let worker_count = thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1)
        .min(MAX_CODEX_FILE_READERS)
        .min(files.len());
    if worker_count <= 1 {
        return files
            .iter()
            .map(|file| read_codex_session_file(sessions_dir, file))
            .collect::<Result<Vec<_>>>()
            .map(|files| files.into_iter().flatten().collect());
    }

    let chunks = chunk_file_indexes_by_size(files, worker_count);
    thread::scope(|scope| {
        let mut handles = Vec::with_capacity(chunks.len());
        for chunk in chunks {
            handles.push(scope.spawn(move || {
                chunk
                    .into_iter()
                    .map(|index| (index, read_codex_session_file(sessions_dir, &files[index])))
                    .collect::<Vec<_>>()
            }));
        }

        let mut loaded_files = Vec::with_capacity(files.len());
        loaded_files.resize_with(files.len(), || None);
        for handle in handles {
            for (index, events) in handle
                .join()
                .map_err(|_| cli_error("codex worker panicked"))?
            {
                loaded_files[index] = Some(events?);
            }
        }
        Ok(loaded_files.into_iter().flatten().flatten().collect())
    })
}

pub(crate) fn codex_usage_paths() -> Result<Vec<PathBuf>> {
    let mut paths = Vec::new();
    let mut seen = FxHashSet::default();
    for path in codex_home_paths()? {
        let sessions = path.join("sessions");
        if sessions.is_dir() {
            if seen.insert(sessions.clone()) {
                paths.push(sessions);
            }
        } else if seen.insert(path.clone()) {
            paths.push(path);
        }
    }
    Ok(paths)
}

fn codex_home_paths() -> Result<Vec<PathBuf>> {
    if let Ok(env_paths) = crate::env_var("CODEX_HOME") {
        return Ok(env_paths
            .split(',')
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(PathBuf::from)
            .collect());
    }

    let home = home::home_dir().ok_or_else(|| cli_error("home directory is not set"))?;
    Ok(vec![home.join(".codex")])
}

fn read_codex_session_file(sessions_dir: &Path, path: &Path) -> Result<Vec<CodexTokenUsageEvent>> {
    let mut events = Vec::new();
    visit_codex_session_file(sessions_dir, path, |event| {
        events.push(event);
        Ok(())
    })?;
    Ok(events)
}

fn codex_line_may_contain_usage(line: &[u8]) -> bool {
    memchr::memmem::find(line, b"turn_context").is_some()
        || memchr::memmem::find(line, b"session_meta").is_some()
        || memchr::memmem::find(line, b"token_usage_record").is_some()
        || memchr::memmem::find(line, b"task_started").is_some()
        || memchr::memmem::find(line, b"task_complete").is_some()
        || memchr::memmem::find(line, b"turn_aborted").is_some()
        || memchr::memmem::find(line, b"user_message").is_some()
        || memchr::memmem::find(line, b"\"user\"").is_some()
        || memchr::memmem::find(line, b"token_count").is_some()
        || memchr::memmem::find(line, br#""usage":"#).is_some()
        || memchr::memmem::find(line, br#""input_tokens":"#).is_some()
        || memchr::memmem::find(line, br#""prompt_tokens":"#).is_some()
}

fn parsed_model_is_missing(
    model: &Option<String>,
    current_model: &Option<String>,
    current_model_is_fallback: bool,
) -> bool {
    model.is_some() && current_model.is_some() && current_model_is_fallback
}

fn codex_session_id(sessions_dir: &Path, path: &Path) -> String {
    let relative = path.strip_prefix(sessions_dir).unwrap_or(path);
    let canonical = if relative.extension().is_some_and(|ext| ext == "zst") {
        relative.with_extension("")
    } else {
        relative.to_owned()
    };
    let mut session_id = canonical
        .with_extension("")
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/");
    if session_id.is_empty() {
        session_id = "unknown".to_string();
    }
    session_id
}

fn codex_model_from_payload(value: Option<&Value>) -> Option<String> {
    let value = value?;
    ["model", "model_name"]
        .into_iter()
        .find_map(|key| non_empty_json_string(value.get(key)))
        .or_else(|| {
            value
                .get("metadata")
                .and_then(|metadata| non_empty_json_string(metadata.get("model")))
        })
}

fn codex_model_from_result(value: &Value) -> Option<String> {
    codex_model_from_payload(Some(value))
        .or_else(|| codex_model_from_payload(value.get("data")))
        .or_else(|| codex_model_from_payload(value.get("result")))
        .or_else(|| codex_model_from_payload(value.get("response")))
}

fn usage_from_result(value: &Value) -> Option<&Value> {
    value
        .get("usage")
        .or_else(|| value.get("data").and_then(|data| data.get("usage")))
        .or_else(|| value.get("result").and_then(|result| result.get("usage")))
        .or_else(|| {
            value
                .get("response")
                .and_then(|response| response.get("usage"))
        })
}

fn codex_timestamp_from_result(value: &Value) -> Option<String> {
    normalize_codex_timestamp(value.get("timestamp"))
        .or_else(|| normalize_codex_timestamp(value.get("created_at")))
        .or_else(|| normalize_codex_timestamp(value.get("createdAt")))
        .or_else(|| {
            value
                .get("data")
                .and_then(|data| normalize_codex_timestamp(data.get("timestamp")))
        })
        .or_else(|| {
            value
                .get("result")
                .and_then(|result| normalize_codex_timestamp(result.get("timestamp")))
        })
        .or_else(|| {
            value
                .get("response")
                .and_then(|response| normalize_codex_timestamp(response.get("timestamp")))
        })
}

fn normalize_codex_timestamp(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() {
                return None;
            }
            crate::parse_ts_timestamp(text).map(crate::format_rfc3339_millis)
        }
        Value::Number(number) => {
            let raw = number.as_u64()?;
            let millis = if raw > 10_000_000_000 {
                raw
            } else {
                raw.checked_mul(1_000)?
            };
            Some(crate::format_rfc3339_millis(TimestampMs::from_millis(
                millis.min(i64::MAX as u64) as i64,
            )))
        }
        _ => None,
    }
}

fn normalize_headless_codex_usage(value: &Value) -> Option<CodexRawUsage> {
    let usage = usage_from_result(value)?;
    let input = json_u64(usage.get("input_tokens"))
        .or_else(|| json_u64(usage.get("prompt_tokens")))
        .or_else(|| json_u64(usage.get("input")))
        .unwrap_or(0);
    let cached = json_u64(usage.get("cached_input_tokens"))
        .or_else(|| json_u64(usage.get("cache_read_input_tokens")))
        .or_else(|| json_u64(usage.get("cached_tokens")))
        .unwrap_or(0);
    let output = json_u64(usage.get("output_tokens"))
        .or_else(|| json_u64(usage.get("completion_tokens")))
        .or_else(|| json_u64(usage.get("output")))
        .unwrap_or(0);
    let reasoning = json_u64(usage.get("reasoning_output_tokens"))
        .or_else(|| json_u64(usage.get("reasoning_tokens")))
        .unwrap_or(0);
    let total = json_u64(usage.get("total_tokens")).unwrap_or(0);
    if input == 0 && cached == 0 && output == 0 && reasoning == 0 && total == 0 {
        return None;
    }
    Some(CodexRawUsage {
        input_tokens: input,
        cached_input_tokens: cached,
        cache_write_input_tokens: json_u64(usage.get("cache_write_input_tokens"))
            .map(|written| written.min(input.saturating_sub(cached))),
        has_unrecorded_cache_writes: json_u64(usage.get("cache_write_input_tokens")).is_none(),
        output_tokens: output,
        reasoning_output_tokens: reasoning,
        total_tokens: if total > 0 { total } else { input + output },
    })
}

fn normalize_codex_raw_usage(value: &Value) -> Option<CodexRawUsage> {
    if !value.is_object() {
        return None;
    }
    let input = json_u64(value.get("input_tokens"));
    let cached = json_u64(value.get("cached_input_tokens"))
        .or_else(|| json_u64(value.get("cache_read_input_tokens")))
        .unwrap_or(0);
    let output = json_u64(value.get("output_tokens"));
    let reasoning = json_u64(value.get("reasoning_output_tokens"));
    let total = json_u64(value.get("total_tokens"));
    let input = input.unwrap_or(0);
    let output = output.unwrap_or(0);
    let reasoning = reasoning.unwrap_or(0);
    Some(CodexRawUsage {
        input_tokens: input,
        cached_input_tokens: cached,
        cache_write_input_tokens: json_u64(value.get("cache_write_input_tokens"))
            .map(|written| written.min(input.saturating_sub(cached))),
        has_unrecorded_cache_writes: json_u64(value.get("cache_write_input_tokens")).is_none(),
        output_tokens: output,
        reasoning_output_tokens: reasoning,
        total_tokens: total.unwrap_or(input + output),
    })
}

fn json_u64(value: Option<&Value>) -> Option<u64> {
    match value {
        Some(Value::Number(number)) => number.as_u64(),
        Some(Value::String(text)) => text.trim().parse::<u64>().ok(),
        _ => None,
    }
}

fn file_modified_timestamp(path: &Path) -> String {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| {
            crate::format_rfc3339_millis(TimestampMs::from_millis(
                duration.as_millis().min(i64::MAX as u128) as i64,
            ))
        })
        .unwrap_or_else(|| crate::format_rfc3339_millis(TimestampMs::UNIX_EPOCH))
}

fn subtract_codex_raw_usage(
    current: &CodexRawUsage,
    previous: Option<&CodexRawUsage>,
) -> CodexRawUsage {
    if previous.is_some_and(|previous| current.total_tokens < previous.total_tokens) {
        return current.clone();
    }
    let input = current
        .input_tokens
        .saturating_sub(previous.map_or(0, |usage| usage.input_tokens));
    let cached = current
        .cached_input_tokens
        .saturating_sub(previous.map_or(0, |usage| usage.cached_input_tokens))
        .min(input);
    CodexRawUsage {
        input_tokens: input,
        cached_input_tokens: cached,
        cache_write_input_tokens: current.cache_write_input_tokens.map(|written| {
            written
                .saturating_sub(
                    previous
                        .and_then(|usage| usage.cache_write_input_tokens)
                        .unwrap_or(0),
                )
                .min(input.saturating_sub(cached))
        }),
        has_unrecorded_cache_writes: current.has_unrecorded_cache_writes
            || previous.is_some_and(|usage| usage.has_unrecorded_cache_writes),
        output_tokens: current
            .output_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.output_tokens)),
        reasoning_output_tokens: current
            .reasoning_output_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.reasoning_output_tokens)),
        total_tokens: current
            .total_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.total_tokens)),
    }
}

fn dedupe_codex_events(events: &mut Vec<CodexTokenUsageEvent>) {
    let mut seen = FxHashSet::default();
    let mut requests = FxHashSet::default();
    events.retain(|event| {
        if let Some(id) = &event.request_id {
            return requests.insert(CompactString::new(id));
        }
        seen.insert((
            CompactString::new(&event.owner_id),
            CompactString::new(&event.timestamp),
            event.model.as_deref().map(CompactString::new),
            event.input_tokens,
            event.cached_input_tokens,
            event.output_tokens,
            event.reasoning_output_tokens,
            event.total_tokens,
        ))
    });
}

#[cfg(test)]
mod tests;
