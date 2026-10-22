use super::cache::{cache_state, enabled_public_snapshots_ordered, public_snapshot};
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

#[path = "request.rs"]
mod request;

const BIND_ADDR: &str = "127.0.0.1:6736";
const MAX_CONCURRENT_CONNECTIONS: usize = 16;
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(5);

struct ConnectionLimiter {
    active: Arc<AtomicUsize>,
    max: usize,
}

struct ConnectionPermit {
    active: Arc<AtomicUsize>,
}

impl ConnectionLimiter {
    fn new(max: usize) -> Self {
        Self {
            active: Arc::new(AtomicUsize::new(0)),
            max,
        }
    }

    fn acquire(&self) -> Option<ConnectionPermit> {
        loop {
            let active = self.active.load(Ordering::Acquire);
            if active >= self.max {
                return None;
            }
            if self
                .active
                .compare_exchange(active, active + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Some(ConnectionPermit {
                    active: Arc::clone(&self.active),
                });
            }
        }
    }

    #[cfg(test)]
    fn active_count(&self) -> usize {
        self.active.load(Ordering::Acquire)
    }
}

impl Drop for ConnectionPermit {
    fn drop(&mut self) {
        self.active.fetch_sub(1, Ordering::AcqRel);
    }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

pub fn start_server() {
    std::thread::spawn(|| {
        let listener = match TcpListener::bind(BIND_ADDR) {
            Ok(l) => {
                log::info!("local HTTP API listening on {}", BIND_ADDR);
                l
            }
            Err(e) => {
                log::warn!(
                    "failed to bind local HTTP API on {}: {} — feature disabled for this session",
                    BIND_ADDR,
                    e
                );
                return;
            }
        };

        let limiter = ConnectionLimiter::new(MAX_CONCURRENT_CONNECTIONS);
        for stream in listener.incoming() {
            match stream {
                Ok(mut stream) => {
                    let Some(permit) = limiter.acquire() else {
                        log::warn!(
                            "local HTTP API connection limit reached (max={})",
                            MAX_CONCURRENT_CONNECTIONS
                        );
                        let _ = stream.set_write_timeout(Some(CONNECTION_TIMEOUT));
                        let _ = stream.write_all(response_service_unavailable().as_bytes());
                        let _ = stream.flush();
                        continue;
                    };
                    std::thread::spawn(move || handle_connection(stream, permit));
                }
                Err(e) => log::debug!("local HTTP API accept error: {}", e),
            }
        }
    });
}

fn handle_connection(mut stream: TcpStream, _permit: ConnectionPermit) {
    let _ = stream.set_write_timeout(Some(CONNECTION_TIMEOUT));
    let response = request::read_head(&mut stream, CONNECTION_TIMEOUT)
        .and_then(|head| {
            let request = request::parse(&head)?;
            let path = request.target.split('?').next().unwrap_or(request.target);
            let path = if path.len() > 1 {
                path.trim_end_matches('/')
            } else {
                path
            };
            Ok(route(request.method, path, request.origin))
        })
        .unwrap_or_else(response_request_error);
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn response_request_error(error: request::RequestError) -> String {
    let (status, reason, code) = match error {
        request::RequestError::BadRequest => (400, "Bad Request", "bad_request"),
        request::RequestError::Forbidden => (403, "Forbidden", "forbidden"),
        request::RequestError::TooLarge => (
            431,
            "Request Header Fields Too Large",
            "request_headers_too_large",
        ),
        request::RequestError::Timeout => (408, "Request Timeout", "request_timeout"),
    };
    response_json(status, reason, &format!(r#"{{"error":"{code}"}}"#), None)
}

fn route(method: &str, path: &str, origin: Option<&str>) -> String {
    // Match routes
    if path == "/v1/usage" {
        return match method {
            "GET" => handle_get_usage_collection(origin),
            "OPTIONS" => response_no_content(origin),
            _ => response_method_not_allowed(origin),
        };
    }

    if let Some(provider_id) = path.strip_prefix("/v1/usage/") {
        if !provider_id.is_empty() && !provider_id.contains('/') {
            return match method {
                "GET" => handle_get_usage_single(provider_id, origin),
                "OPTIONS" => response_no_content(origin),
                _ => response_method_not_allowed(origin),
            };
        }
    }

    response_not_found("not_found", origin)
}

fn handle_get_usage_collection(origin: Option<&str>) -> String {
    let snapshots = {
        let state = cache_state().lock().expect("cache state poisoned");
        enabled_public_snapshots_ordered(&state)
    };
    let body = serde_json::to_string(&snapshots).unwrap_or_else(|_| "[]".to_string());
    response_json(200, "OK", &body, origin)
}

fn handle_get_usage_single(provider_id: &str, origin: Option<&str>) -> String {
    let state = cache_state().lock().expect("cache state poisoned");

    // Check if provider is known at all
    let is_known = state.known_plugin_ids.iter().any(|id| id == provider_id);
    if !is_known {
        return response_not_found("provider_not_found", origin);
    }

    match state.snapshots.get(provider_id) {
        Some(snapshot) => {
            let public = public_snapshot(snapshot);
            let body = serde_json::to_string(&public).unwrap_or_else(|_| "{}".to_string());
            response_json(200, "OK", &body, origin)
        }
        None => response_no_content(origin),
    }
}

// ---------------------------------------------------------------------------
// HTTP response builders
// ---------------------------------------------------------------------------

fn cors_header(origin: Option<&str>) -> String {
    let Some(allowed) = origin else {
        return String::new();
    };
    format!(
        "Access-Control-Allow-Origin: {}\r\n\
         Access-Control-Allow-Methods: GET, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n",
        allowed
    )
}

fn response_json(status: u16, reason: &str, body: &str, origin: Option<&str>) -> String {
    format!(
        "HTTP/1.1 {} {}\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\n{}Content-Length: {}\r\n\r\n{}",
        status,
        reason,
        cors_header(origin),
        body.len(),
        body,
    )
}

fn response_no_content(origin: Option<&str>) -> String {
    format!(
        "HTTP/1.1 204 No Content\r\nConnection: close\r\n{}\r\n",
        cors_header(origin),
    )
}

fn response_not_found(error_code: &str, origin: Option<&str>) -> String {
    let body = format!(r#"{{"error":"{}"}}"#, error_code);
    response_json(404, "Not Found", &body, origin)
}

fn response_method_not_allowed(origin: Option<&str>) -> String {
    let body = r#"{"error":"method_not_allowed"}"#;
    response_json(405, "Method Not Allowed", body, origin)
}

fn response_service_unavailable() -> String {
    let body = r#"{"error":"server_busy"}"#;
    response_json(503, "Service Unavailable", &body, None)
}

#[cfg(test)]
#[path = "server_tests.rs"]
mod tests;
