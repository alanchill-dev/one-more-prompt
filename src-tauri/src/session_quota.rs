//! Read-only official session lifetime usage. Never persist or expose credentials.
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    collections::HashSet,
    io::Read,
    path::PathBuf,
    time::{Duration, Instant},
};

const URL: &str = "https://chatgpt.com/backend-api/wham/usage/thread_usage/query_v2";
const MAX_RESPONSE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_PROJECT_SESSIONS: usize = 10_000;
const HTTP_BATCH_SESSIONS: usize = 40;
const HTTP_TIMEOUT: Duration = Duration::from_secs(20);
const PROJECT_QUERY_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const INVALID_RESPONSE: &str = "Official session usage returned an invalid response.";
const SIGN_IN_CHANGED: &str = "Codex sign-in changed. Refresh session usage.";
const PROJECT_TIMED_OUT: &str = "Official session usage took too long. Refresh session usage.";

#[derive(Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionQuotaRequest {
    pub thread_id: String,
    pub created_at: String,
    pub descendant_thread_ids: Vec<String>,
}

#[derive(Deserialize, Serialize, Type, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionQuotaResponse {
    pub data_as_of: Option<String>,
    pub entries: Vec<SessionQuotaEntry>,
}

#[derive(Deserialize, Serialize, Type, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionQuotaEntry {
    pub thread_id: String,
    pub weekly_percent: Option<f64>,
    pub status: SessionQuotaStatus,
}

#[derive(Deserialize, Serialize, Type, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionQuotaStatus {
    Available,
    Partial,
    Unavailable,
}

#[derive(PartialEq, Eq)]
struct Credentials {
    token: Option<String>,
    account: Option<String>,
}

fn parse_credentials(bytes: &[u8]) -> Option<Credentials> {
    let value: serde_json::Value = serde_json::from_slice(bytes).ok().or_else(|| {
        let text = std::str::from_utf8(bytes).ok()?.trim();
        let hex = text
            .strip_prefix("0x")
            .or_else(|| text.strip_prefix("0X"))
            .unwrap_or(text);
        if hex.len() % 2 != 0 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let decoded: Option<Vec<_>> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
            .collect();
        serde_json::from_slice(&decoded?).ok()
    })?;
    let token = value
        .pointer("/tokens/access_token")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    // An API-key login takes precedence over later auth files, just as in the
    // Codex plugin. Do not silently query a different subscription account.
    if token.is_none()
        && !value
            .get("OPENAI_API_KEY")
            .and_then(|v| v.as_str())
            .is_some_and(|v| !v.is_empty())
    {
        return None;
    }
    Some(Credentials {
        token: token.map(str::to_owned),
        account: value
            .pointer("/tokens/account_id")
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .map(str::to_owned),
    })
}

fn auth_paths() -> Vec<PathBuf> {
    let home = dirs::home_dir();
    if let Ok(path) = std::env::var("CODEX_HOME") {
        let path = path.trim();
        if !path.is_empty() {
            let base = match (path.strip_prefix("~/"), &home) {
                (Some(rest), Some(home)) => home.join(rest),
                _ => PathBuf::from(path),
            };
            return vec![base.join("auth.json")];
        }
    }
    home.map(|home| {
        vec![
            home.join(".config/codex/auth.json"),
            home.join(".codex/auth.json"),
        ]
    })
    .unwrap_or_default()
}

fn file_credentials() -> Vec<Credentials> {
    auth_paths()
        .iter()
        .filter_map(|path| match std::fs::read(path) {
            Ok(bytes) => {
                let auth = parse_credentials(&bytes);
                if auth.is_none() {
                    log::warn!("Session usage: Codex auth file has no usable sign-in token");
                }
                auth
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => {
                log::warn!("Session usage: could not read a Codex auth file");
                None
            }
        })
        .collect()
}

fn keychain_credentials() -> Option<Credentials> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("/usr/bin/security")
            .args(["find-generic-password", "-s", "Codex Auth", "-w"])
            .output()
            .ok()?;
        if output.status.success() {
            return parse_credentials(&output.stdout);
        }
    }
    None
}

fn validate_request(threads: &[SessionQuotaRequest]) -> Result<(), String> {
    if threads.is_empty() || threads.len() > MAX_PROJECT_SESSIONS {
        return Err(format!(
            "Request between 1 and {MAX_PROJECT_SESSIONS} sessions at a time."
        ));
    }
    let mut ids = HashSet::new();
    for thread in threads {
        if uuid::Uuid::parse_str(&thread.thread_id).is_err()
            || thread.created_at.len() > 40
            || parse_timestamp(&thread.created_at).is_err()
            || thread.descendant_thread_ids.len() > 1000
            || !ids.insert(thread.thread_id.as_str())
        {
            return Err("Invalid session usage request.".into());
        }
        for id in &thread.descendant_thread_ids {
            if uuid::Uuid::parse_str(id).is_err() || !ids.insert(id.as_str()) {
                return Err("Session usage groups must not overlap.".into());
            }
        }
    }
    Ok(())
}

fn normalize_response(
    bytes: &[u8],
    threads: &[SessionQuotaRequest],
) -> Result<SessionQuotaResponse, String> {
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| INVALID_RESPONSE)?;
    let data_as_of = match value.get("data_as_of") {
        Some(serde_json::Value::Null) => None,
        Some(serde_json::Value::String(value)) if parse_timestamp(value).is_ok() => {
            Some(value.to_owned())
        }
        _ => return Err(INVALID_RESPONSE.into()),
    };
    let rows = value
        .get("threads")
        .and_then(|v| v.as_array())
        .ok_or(INVALID_RESPONSE)?;
    let mut remaining: HashSet<_> = threads.iter().map(|t| t.thread_id.as_str()).collect();
    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        let id = row
            .get("thread_id")
            .and_then(|v| v.as_str())
            .ok_or(INVALID_RESPONSE)?;
        if !remaining.remove(id) {
            return Err(INVALID_RESPONSE.into());
        }
        let raw_percent = row.get("weekly_limit_percent").ok_or(INVALID_RESPONSE)?;
        let percent = if raw_percent.is_null() {
            None
        } else {
            Some(
                raw_percent
                    .as_f64()
                    .filter(|v| v.is_finite() && *v >= 0.0)
                    .ok_or(INVALID_RESPONSE)?,
            )
        };
        let status = match row.get("data_status").and_then(|v| v.as_str()) {
            Some("available") => SessionQuotaStatus::Available,
            Some("partial") => SessionQuotaStatus::Partial,
            Some("unavailable") => SessionQuotaStatus::Unavailable,
            _ => return Err(INVALID_RESPONSE.into()),
        };
        if status == SessionQuotaStatus::Unavailable && percent.is_some() {
            return Err(INVALID_RESPONSE.into());
        }
        // An available session may have no weekly allowance; null is never zero.
        entries.push(SessionQuotaEntry {
            thread_id: id.into(),
            weekly_percent: percent,
            status,
        });
    }
    if !remaining.is_empty() {
        return Err(INVALID_RESPONSE.into());
    }
    Ok(SessionQuotaResponse {
        data_as_of,
        entries,
    })
}

fn fetch(
    client: &reqwest::blocking::Client,
    auth: &Credentials,
    body: &str,
    timeout: Duration,
) -> Result<Option<Vec<u8>>, String> {
    let token = auth
        .token
        .as_deref()
        .ok_or("Session allowance is unavailable for API-key sign-in.")?;
    let mut request = client
        .post(URL)
        .bearer_auth(token)
        .header("Content-Type", "application/json")
        .timeout(timeout)
        .body(body.to_owned());
    if let Some(account) = &auth.account {
        request = request.header("ChatGPT-Account-Id", account);
    }
    let response = request
        .send()
        .map_err(|_| "Could not reach official session usage. Check your connection.")?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!(
            "Official session usage request failed (HTTP {}).",
            response.status().as_u16()
        ));
    }
    let mut bytes = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Could not read official session usage.")?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return Err(INVALID_RESPONSE.into());
    }
    Ok(Some(bytes))
}

fn parse_timestamp(value: &str) -> Result<time::OffsetDateTime, time::error::Parse> {
    time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339)
}

fn merge_response(total: &mut SessionQuotaResponse, next: SessionQuotaResponse) {
    // An unknown batch time makes the combined time unknown. Known times are
    // normalized, so compare instants rather than UTC offset representations.
    total.data_as_of = if total.entries.is_empty() {
        next.data_as_of
    } else {
        match (total.data_as_of.take(), next.data_as_of) {
            (Some(current), Some(next)) => Some(
                if parse_timestamp(&next).unwrap() < parse_timestamp(&current).unwrap() {
                    next
                } else {
                    current
                },
            ),
            _ => None,
        }
    };
    total.entries.extend(next.entries);
}

fn fetch_batches(
    threads: &[SessionQuotaRequest],
    deadline: Instant,
    mut send: impl FnMut(&str, Duration) -> Result<Option<Vec<u8>>, String>,
    mut credentials_unchanged: impl FnMut() -> bool,
) -> Result<Option<SessionQuotaResponse>, String> {
    let mut total = SessionQuotaResponse {
        data_as_of: None,
        entries: Vec::new(),
    };
    for batch in threads.chunks(HTTP_BATCH_SESSIONS) {
        request_timeout(deadline)?;
        if !credentials_unchanged() {
            return Err(SIGN_IN_CHANGED.into());
        }
        let body = serde_json::json!({"threads": batch.iter().map(|t| serde_json::json!({
            "thread_id": t.thread_id, "created_at": t.created_at,
            "descendant_thread_ids": t.descendant_thread_ids,
        })).collect::<Vec<_>>()})
        .to_string();
        let result = send(&body, request_timeout(deadline)?);
        if !credentials_unchanged() {
            return Err(SIGN_IN_CHANGED.into());
        }
        request_timeout(deadline)?;
        let bytes = result?;
        let Some(bytes) = bytes else {
            return Ok(None);
        };
        merge_response(&mut total, normalize_response(&bytes, batch)?);
    }
    request_timeout(deadline)?;
    Ok(Some(total))
}

fn request_timeout(deadline: Instant) -> Result<Duration, String> {
    deadline
        .checked_duration_since(Instant::now())
        .filter(|remaining| !remaining.is_zero())
        .map(|remaining| remaining.min(HTTP_TIMEOUT))
        .ok_or_else(|| PROJECT_TIMED_OUT.into())
}

fn query(threads: Vec<SessionQuotaRequest>) -> Result<SessionQuotaResponse, String> {
    validate_request(&threads)?;
    let deadline = Instant::now() + PROJECT_QUERY_TIMEOUT;
    let client = reqwest::blocking::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not initialize official session usage.")?;
    let files = file_credentials();
    for auth in &files {
        if let Some(response) = fetch_batches(
            &threads,
            deadline,
            |body, timeout| fetch(&client, auth, body, timeout),
            || files == file_credentials(),
        )? {
            if files != file_credentials() {
                return Err(SIGN_IN_CHANGED.into());
            }
            request_timeout(deadline)?;
            return Ok(response);
        }
    }
    if let Some(auth) = keychain_credentials() {
        if let Some(response) = fetch_batches(
            &threads,
            deadline,
            |body, timeout| fetch(&client, &auth, body, timeout),
            || files == file_credentials() && keychain_credentials().as_ref() == Some(&auth),
        )? {
            if files != file_credentials() || Some(auth) != keychain_credentials() {
                return Err(SIGN_IN_CHANGED.into());
            }
            request_timeout(deadline)?;
            return Ok(response);
        }
    }
    Err("Open Codex and sign in again to load session usage.".into())
}

#[tauri::command]
#[specta::specta]
pub async fn query_session_quota(
    threads: Vec<SessionQuotaRequest>,
) -> Result<SessionQuotaResponse, String> {
    let result = tauri::async_runtime::spawn_blocking(move || query(threads))
        .await
        .map_err(|_| "Session usage worker failed.".to_string())?;
    if let Err(error) = &result {
        log::warn!("Session usage: {error}");
    }
    result
}

#[cfg(test)]
#[path = "session_quota_tests.rs"]
mod tests;
