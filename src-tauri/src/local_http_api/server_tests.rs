use super::super::cache::{CachedPluginSnapshot, cache_state};
use super::*;
use crate::plugin_engine::runtime::MetricLine;
use serial_test::serial;
use std::io::Read;

fn make_snapshot(id: &str, name: &str) -> CachedPluginSnapshot {
    CachedPluginSnapshot {
        provider_id: id.to_string(),
        display_name: name.to_string(),
        plan: Some("Pro".to_string()),
        lines: vec![],
        fetched_at: "2026-03-26T08:15:30Z".to_string(),
    }
}

#[test]
fn route_get_usage_returns_200() {
    let resp = route("GET", "/v1/usage", Some("http://localhost:6736"));
    assert!(resp.starts_with("HTTP/1.1 200"));
}

#[test]
fn route_unknown_path_returns_404() {
    let resp = route("GET", "/v2/something", Some("http://localhost:6736"));
    assert!(resp.starts_with("HTTP/1.1 404"));
}

#[test]
fn route_post_returns_405() {
    let resp = route("POST", "/v1/usage", Some("http://localhost:6736"));
    assert!(resp.starts_with("HTTP/1.1 405"));
}

#[test]
fn route_options_returns_204_with_cors() {
    let resp = route("OPTIONS", "/v1/usage", Some("http://localhost:6736"));
    assert!(resp.starts_with("HTTP/1.1 204"));
    assert!(resp.contains("Access-Control-Allow-Origin: http://localhost:6736"));
}

#[test]
#[serial]
fn route_unknown_provider_returns_404() {
    {
        let mut state = cache_state().lock().unwrap();
        state.known_plugin_ids = vec!["claude".to_string()];
        state.snapshots.clear();
    }

    let resp = route(
        "GET",
        "/v1/usage/nonexistent",
        Some("http://localhost:6736"),
    );
    assert!(resp.starts_with("HTTP/1.1 404"));
    assert!(resp.contains("provider_not_found"));
}

#[test]
#[serial]
fn route_known_uncached_provider_returns_204() {
    {
        let mut state = cache_state().lock().unwrap();
        state.known_plugin_ids = vec!["claude".to_string()];
        state.snapshots.clear();
    }

    let resp = route("GET", "/v1/usage/claude", Some("http://localhost:6736"));
    assert!(resp.starts_with("HTTP/1.1 204"));
}

#[test]
#[serial]
fn route_known_cached_provider_returns_200() {
    {
        let mut state = cache_state().lock().unwrap();
        state.known_plugin_ids = vec!["claude".to_string()];
        state.snapshots.insert(
            "claude".to_string(),
            std::sync::Arc::new(make_snapshot("claude", "Claude")),
        );
    }

    let resp = route("GET", "/v1/usage/claude", Some("http://localhost:6736"));
    assert!(resp.starts_with("HTTP/1.1 200"));
    assert!(resp.contains("fetchedAt"));
}

#[test]
#[serial]
fn route_codex_omits_private_prompt_usage_lines() {
    let mut snapshot = make_snapshot("codex", "Codex");
    snapshot.lines = vec![
        MetricLine::Text {
            label: "Today".to_string(),
            value: "12M tokens".to_string(),
            color: None,
            subtitle: None,
            reset_expiry: None,
            reset_credits: None,
        },
        MetricLine::Text {
            label: "Prompt Usage".to_string(),
            value: "1 recent turn".to_string(),
            color: None,
            subtitle: None,
            reset_expiry: None,
            reset_credits: None,
        },
        MetricLine::Text {
            label: "16:10 · Secret prompt".to_string(),
            value: "5M tokens".to_string(),
            color: None,
            subtitle: Some("Project: private-project".to_string()),
            reset_expiry: None,
            reset_credits: None,
        },
    ];
    {
        let mut state = cache_state().lock().unwrap();
        state.known_plugin_ids = vec!["codex".to_string()];
        state.snapshots.clear();
        state
            .snapshots
            .insert("codex".to_string(), std::sync::Arc::new(snapshot));
    }

    let response = route("GET", "/v1/usage/codex", Some("https://example.com"));

    assert!(response.starts_with("HTTP/1.1 200"));
    assert!(response.contains("Today"));
    assert!(!response.contains("Prompt Usage"));
    assert!(!response.contains("Secret prompt"));
    assert!(!response.contains("private-project"));
}

#[test]
fn route_options_on_provider_returns_204() {
    let resp = route("OPTIONS", "/v1/usage/claude", Some("http://localhost:6736"));
    assert!(resp.starts_with("HTTP/1.1 204"));
    assert!(resp.contains("Access-Control-Allow-Methods: GET, OPTIONS"));
}

#[test]
fn response_json_includes_cors_headers() {
    let resp = response_json(200, "OK", "[]", Some("http://localhost:6736"));
    assert!(resp.contains("Access-Control-Allow-Origin: http://localhost:6736"));
    assert!(resp.contains("Content-Type: application/json; charset=utf-8"));
}

#[test]
fn connection_limiter_rejects_above_capacity_and_releases_on_drop() {
    let limiter = ConnectionLimiter::new(2);
    let first = limiter.acquire().expect("first permit");
    let second = limiter.acquire().expect("second permit");

    assert!(limiter.acquire().is_none());
    assert_eq!(limiter.active_count(), 2);

    drop(first);

    let third = limiter.acquire().expect("permit after release");
    assert_eq!(limiter.active_count(), 2);

    drop(second);
    drop(third);
    assert_eq!(limiter.active_count(), 0);
}

#[test]
fn response_service_unavailable_returns_503_json() {
    let resp = response_service_unavailable();

    assert!(resp.starts_with("HTTP/1.1 503"));
    assert!(resp.contains(r#""error":"server_busy""#));
    assert!(!resp.contains("Access-Control-Allow-Origin:"));
}

fn request_over_socket(request: &[u8]) -> String {
    request_chunks_over_socket(&[request])
}

fn request_chunks_over_socket(chunks: &[&[u8]]) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let permit = ConnectionLimiter::new(1).acquire().unwrap();
        handle_connection(stream, permit);
    });
    let mut client = TcpStream::connect(address).unwrap();
    client
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    for (index, chunk) in chunks.iter().enumerate() {
        client.write_all(chunk).unwrap();
        if index + 1 < chunks.len() {
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    client.shutdown(std::net::Shutdown::Write).unwrap();
    let mut response = String::new();
    client.read_to_string(&mut response).unwrap();
    server.join().unwrap();
    response
}

#[test]
#[serial]
fn socket_rejects_null_origin_before_returning_usage() {
    seed_synthetic_usage();
    let response = request_over_socket(
        b"GET /v1/usage/codex HTTP/1.1\r\nHost: 127.0.0.1:6736\r\nOrigin: null\r\n\r\n",
    );
    assert!(response.starts_with("HTTP/1.1 403"), "{response}");
    assert!(!response.contains("Synthetic Usage"));
    assert!(!response.contains("Access-Control-Allow-Origin:"));
}

fn seed_synthetic_usage() {
    {
        let mut state = cache_state().lock().unwrap();
        state.known_plugin_ids = vec!["codex".into()];
        state.snapshots.clear();
        state.snapshots.insert(
            "codex".into(),
            Arc::new(make_snapshot("codex", "Synthetic Usage")),
        );
    }
}

#[test]
#[serial]
fn socket_rejects_untrusted_origins_hosts_and_ambiguous_headers() {
    seed_synthetic_usage();
    let cases = [
        (
            "web origin",
            "Host: 127.0.0.1:6736\r\nOrigin: https://example.com",
            403,
        ),
        ("empty origin", "Host: localhost:6736\r\nOrigin:", 403),
        (
            "wrong origin port",
            "Host: localhost:6736\r\nOrigin: http://localhost:3000",
            403,
        ),
        ("host suffix", "Host: localhost.evil.example:6736", 403),
        ("wrong port", "Host: localhost:80", 403),
        ("no port", "Host: localhost", 403),
        ("non-loopback", "Host: example.com:6736", 403),
        ("IP alias", "Host: 2130706433:6736", 403),
        ("host userinfo", "Host: user@127.0.0.1:6736", 403),
        ("host path", "Host: localhost:6736/", 403),
        (
            "duplicate Host",
            "Host: localhost:6736\r\nhOsT: localhost:6736",
            400,
        ),
        (
            "duplicate Origin",
            "Host: localhost:6736\r\nOrigin: http://localhost\r\noRiGiN: null",
            400,
        ),
        ("missing Host", "Accept: application/json", 400),
        ("empty Host", "Host:", 400),
        (
            "malformed header",
            "Host: localhost:6736\r\nOrigin http://localhost",
            400,
        ),
        (
            "whitespace field name",
            "Host: localhost:6736\r\nOrigin : null",
            400,
        ),
        (
            "folded header",
            "Host: localhost:6736\r\n Origin: null",
            400,
        ),
        (
            "control character",
            "Host: localhost:6736\r\nX-Test: value\u{7f}",
            400,
        ),
    ];
    for (label, headers, status) in cases {
        let request = format!("GET /v1/usage/codex HTTP/1.1\r\n{headers}\r\n\r\n");
        let response = request_over_socket(request.as_bytes());
        assert!(
            response.starts_with(&format!("HTTP/1.1 {status}")),
            "{label}: {response}"
        );
        assert!(!response.contains("Synthetic Usage"), "{label}");
        assert!(
            !response.contains("Access-Control-Allow-Origin:"),
            "{label}"
        );
    }
}

#[test]
#[serial]
fn socket_keeps_cli_and_exact_loopback_clients_available() {
    seed_synthetic_usage();
    let cli = request_over_socket(
        b"GET /v1/usage/codex/?test=1 HTTP/1.1\r\nHost: 127.0.0.1:6736\r\n\r\n",
    );
    assert!(cli.starts_with("HTTP/1.1 200"), "{cli}");
    assert!(cli.contains("Synthetic Usage"));
    assert!(!cli.contains("Access-Control-Allow-"));
    assert!(
        cli.split_once("\r\n\r\n")
            .unwrap()
            .0
            .contains("Content-Length:")
    );
    for origin in [
        "http://127.0.0.1:6736",
        "http://localhost:6736",
        "http://127.0.0.1",
        "http://localhost",
    ] {
        let request = format!(
            "GET /v1/usage/codex HTTP/1.1\r\nhOsT:\tLOCALHOST:6736 \r\noRiGiN: {origin}\r\n\r\n"
        );
        let response = request_over_socket(request.as_bytes());
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
        assert!(response.contains("Synthetic Usage"));
        assert!(response.contains(&format!("Access-Control-Allow-Origin: {origin}\r\n")));
    }
}

#[test]
fn socket_preflight_has_only_the_allowed_origin() {
    let response = request_over_socket(b"OPTIONS /v1/usage HTTP/1.1\r\nHost: localhost:6736\r\nOrigin: http://localhost:6736\r\n\r\n");
    assert!(response.starts_with("HTTP/1.1 204"), "{response}");
    assert!(response.contains("Access-Control-Allow-Origin: http://localhost:6736\r\n"));
    assert!(response.split_once("\r\n\r\n").unwrap().1.is_empty());
}

#[test]
#[serial]
fn socket_waits_for_the_complete_header_before_origin_validation() {
    seed_synthetic_usage();
    let denied = request_chunks_over_socket(&[
        b"GET /v1/usage/codex HTTP/1.1\r\nHost: localhost:6736\r\n",
        b"Origin: null\r\n\r\n",
    ]);
    assert!(denied.starts_with("HTTP/1.1 403"), "{denied}");
    assert!(!denied.contains("Synthetic Usage"));
    let cli = request_chunks_over_socket(&[
        b"GET /v1/usage/codex HTTP/1.1\r\nHo",
        b"st: localhost:6736\r\n\r\n",
    ]);
    assert!(cli.starts_with("HTTP/1.1 200"), "{cli}");
    assert!(cli.contains("Synthetic Usage"));
}

#[test]
fn socket_bounds_and_validates_request_headers() {
    let prefix = b"GET /v1/usage HTTP/1.1\r\nHost: localhost:6736\r\nX-Fill: ";
    let mut oversized = prefix.to_vec();
    oversized.resize(4096, b'a');
    let response = request_over_socket(&oversized);
    assert!(response.starts_with("HTTP/1.1 431"), "{response}");
    for request in [
        b"GET /v1/usage HTTP/1.1\r\nHost: localhost:6736\r\n".as_slice(),
        b"GET /v1/usage HTTP/1.1\r\nHost: localhost:6736\r\nX-Test: \xff\r\n\r\n",
        b"GET /v1/usage HTTP/1.1 extra\r\nHost: localhost:6736\r\n\r\n",
        b"GET http://localhost:6736/v1/usage HTTP/1.1\r\nHost: localhost:6736\r\n\r\n",
    ] {
        let response = request_over_socket(request);
        assert!(response.starts_with("HTTP/1.1 400"), "{response}");
        assert!(!response.contains("Access-Control-Allow-Origin:"));
    }
}

#[test]
fn partial_header_traffic_cannot_extend_the_total_read_deadline() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let client = std::thread::spawn(move || {
        let mut stream = TcpStream::connect(address).unwrap();
        for _ in 0..10 {
            if stream.write_all(b"G").is_err() {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    });
    let (mut stream, _) = listener.accept().unwrap();
    let result = request::read_head(&mut stream, Duration::from_millis(80));
    drop(stream);
    client.join().unwrap();
    assert!(
        matches!(result, Err(request::RequestError::Timeout)),
        "{result:?}"
    );
}
