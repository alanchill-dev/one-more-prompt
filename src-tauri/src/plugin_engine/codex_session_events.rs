use std::collections::HashSet;
use std::io::{self, BufRead, BufReader, Read};
use std::path::Path;
use std::sync::LazyLock;

const PREFIX_BYTES: u64 = 4_096;
static TYPE_RE: LazyLock<regex_lite::Regex> = LazyLock::new(|| {
    regex_lite::Regex::new(r#""type"\s*:\s*"([^"]+)""#).expect("valid event type regex")
});
static USER_ROLE_RE: LazyLock<regex_lite::Regex> = LazyLock::new(|| {
    regex_lite::Regex::new(r#""role"\s*:\s*"user""#).expect("valid user role regex")
});
static CALL_ID_RE: LazyLock<regex_lite::Regex> = LazyLock::new(|| {
    regex_lite::Regex::new(r#""call_id"\s*:\s*"([^"\\]+)""#).expect("valid call id regex")
});
static OUTGOING_TASK_RE: LazyLock<regex_lite::Regex> = LazyLock::new(|| {
    regex_lite::Regex::new(
        r"\bawait\s+tools\.codex_app__(?:create_thread|send_message_to_thread|handoff_thread)\s*\(",
    )
    .expect("valid Codex outgoing task regex")
});

#[derive(PartialEq)]
enum EventKind {
    Keep,
    CustomCall,
    CustomOutput,
    Skip,
}

fn event_kind(prefix: &str, outgoing_call_ids: &HashSet<String>) -> EventKind {
    let mut types = TYPE_RE.captures_iter(prefix);
    let Some(record) = types.next() else {
        return EventKind::Skip;
    };
    match &record[1] {
        "session_meta" | "turn_context" | "token_usage_record" => EventKind::Keep,
        "response_item" => match types.next().as_ref().map(|capture| &capture[1]) {
            Some("message") if USER_ROLE_RE.is_match(prefix) => EventKind::Keep,
            Some("custom_tool_call") => EventKind::CustomCall,
            Some("custom_tool_call_output") => {
                // Tool output can be tens of megabytes; only read the response to a tracked call.
                if CALL_ID_RE
                    .captures(prefix)
                    .is_some_and(|id| !outgoing_call_ids.contains(&id[1]))
                {
                    EventKind::Skip
                } else {
                    EventKind::CustomOutput
                }
            }
            _ => EventKind::Skip,
        },
        "event_msg" => match types.next().as_ref().map(|capture| &capture[1]) {
            Some(
                "user_message" | "token_count" | "sub_agent_activity" | "task_started"
                | "task_complete" | "turn_aborted",
            ) => EventKind::Keep,
            _ => EventKind::Skip,
        },
        _ => EventKind::Skip,
    }
}

pub(super) fn read_codex_session_events(path: &Path) -> io::Result<String> {
    let result = (|| {
        let file = std::fs::File::open(path)?;
        let input: Box<dyn Read> = if path.to_string_lossy().ends_with(".jsonl.zst") {
            Box::new(zstd::stream::read::Decoder::new(file)?)
        } else {
            Box::new(file)
        };
        filter_events(BufReader::with_capacity(65_536, input))
    })();
    result.map_err(|error: io::Error| {
        io::Error::new(
            error.kind(),
            format!("Could not read Codex session {}: {error}", path.display()),
        )
    })
}

fn filter_events(mut reader: impl BufRead) -> io::Result<String> {
    let mut line = Vec::new();
    let mut output = String::new();
    let mut outgoing_call_ids = HashSet::new();
    loop {
        line.clear();
        if reader
            .by_ref()
            .take(PREFIX_BYTES)
            .read_until(b'\n', &mut line)?
            == 0
        {
            break;
        }
        let kind = event_kind(&String::from_utf8_lossy(&line), &outgoing_call_ids);
        if kind == EventKind::Skip {
            if !line.ends_with(b"\n") {
                reader.skip_until(b'\n')?;
            }
            continue;
        }
        if !line.ends_with(b"\n") {
            reader.read_until(b'\n', &mut line)?;
        }
        let keep = match kind {
            EventKind::Keep => true,
            EventKind::CustomCall | EventKind::CustomOutput => {
                let value = serde_json::from_slice::<serde_json::Value>(&line).ok();
                let payload = value.as_ref().and_then(|value| value.get("payload"));
                let call_id = payload
                    .and_then(|value| value.get("call_id"))
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|id| !id.is_empty());
                match (kind, payload, call_id) {
                    (EventKind::CustomCall, Some(payload), Some(id))
                        if payload
                            .get("input")
                            .and_then(serde_json::Value::as_str)
                            .is_some_and(|input| OUTGOING_TASK_RE.is_match(input)) =>
                    {
                        outgoing_call_ids.insert(id.to_owned());
                        true
                    }
                    (EventKind::CustomOutput, _, Some(id)) => outgoing_call_ids.remove(id),
                    _ => false,
                }
            }
            EventKind::Skip => false,
        };
        if keep {
            output.push_str(&String::from_utf8_lossy(&line));
            if !line.ends_with(b"\n") {
                output.push('\n');
            }
        }
        if line.capacity() > 1_048_576 {
            line = Vec::new();
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    const EVENTS: &str = concat!(
        "{\"type\":\"session_meta\",\"payload\":{\"id\":\"session\",\"forked_from_id\":\"parent\"}}\n",
        "{ \"type\" : \"turn_context\", \"payload\":{\"model\":\"gpt-6-sol\"}}\n",
        "{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":\"保留完整內容\"}}\n",
        "{\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_tokens\":8}}}\n",
        "{\"type\":\"token_usage_record\",\"payload\":{\"thread_id\":\"session\",\"turn_id\":\"turn\",\"response_id\":\"request\",\"usage\":{\"input_tokens\":5,\"output_tokens\":3},\"thread_token_usage\":{\"total_tokens\":8}}}\n",
    );

    fn temp_root() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("omp-events-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        path
    }

    #[test]
    fn plain_and_concatenated_zstd_frames_have_identical_events_without_source_writes() {
        let root = temp_root();
        let plain = root.join("rollout.jsonl");
        let compressed = root.join("rollout.jsonl.zst");
        let ignored = "{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"assistant\",\"content\":\"irrelevant\"}}\n";
        std::fs::write(&plain, format!("{EVENTS}{ignored}")).unwrap();
        let mut frames = zstd::stream::encode_all(EVENTS.as_bytes(), 1).unwrap();
        frames.extend(zstd::stream::encode_all(ignored.as_bytes(), 1).unwrap());
        std::fs::write(&compressed, &frames).unwrap();
        let before: Vec<_> = [&plain, &compressed]
            .map(|path| {
                let mut permissions = std::fs::metadata(path).unwrap().permissions();
                permissions.set_readonly(true);
                std::fs::set_permissions(path, permissions).unwrap();
                std::fs::metadata(path).unwrap().modified().unwrap()
            })
            .into();
        assert_eq!(read_codex_session_events(&plain).unwrap(), EVENTS);
        assert_eq!(read_codex_session_events(&compressed).unwrap(), EVENTS);
        assert_eq!(std::fs::read(&compressed).unwrap(), frames);
        assert_eq!(
            std::fs::read_to_string(&plain).unwrap(),
            format!("{EVENTS}{ignored}")
        );
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 2);
        for (path, modified) in [&plain, &compressed].into_iter().zip(before) {
            assert_eq!(
                std::fs::metadata(path).unwrap().modified().unwrap(),
                modified
            );
            let mut permissions = std::fs::metadata(path).unwrap().permissions();
            #[allow(clippy::permissions_set_readonly_false)]
            permissions.set_readonly(false);
            std::fs::set_permissions(path, permissions).unwrap();
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn corrupt_or_truncated_zstd_reports_an_error_instead_of_empty_history() {
        let root = temp_root();
        let path = root.join("broken.jsonl.zst");
        let mut frames = zstd::stream::encode_all(EVENTS.as_bytes(), 1).unwrap();
        frames.truncate(frames.len() - 3);
        for bytes in [&b"not a zstd frame"[..], &frames[..]] {
            std::fs::write(&path, bytes).unwrap();
            let error = read_codex_session_events(&path).unwrap_err().to_string();
            assert!(error.contains("Could not read Codex session"));
            assert!(error.contains("broken.jsonl.zst"));
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn skips_large_unrelated_output_and_preserves_long_user_text_and_final_newline() {
        let ignored = "{\"type\":\"response_item\",\"payload\":{\"type\":\"custom_tool_call_output\",\"call_id\":\"untracked\",\"output\":\"";
        let user = format!(
            "{{\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"role\":\"user\",\"content\":\"{}\"}}}}",
            "保留".repeat(40_000)
        );
        let input = Cursor::new(ignored)
            .chain(io::repeat(b'x').take(66_000_000))
            .chain(Cursor::new(format!("\"}}}}\n{user}")));
        let filtered = filter_events(BufReader::new(input)).unwrap();
        assert_eq!(filtered, format!("{user}\n"));
    }
}
