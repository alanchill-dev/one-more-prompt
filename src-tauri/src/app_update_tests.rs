use super::*;
use serde_json::json;
use std::io::{Read, Write};
use std::net::TcpListener;

fn release(version: &str) -> Release {
    serde_json::from_value(json!({
        "tag_name": format!("v{version}"),
        "html_url": format!("{RELEASE_BASE}/tag/v{version}"),
        "draft": false,
        "prerelease": false,
        "published_at": "2026-10-21T00:00:00Z",
        "assets": [
            {"name":format!("One-More-Prompt-{version}.dmg"),"size":1024,"state":"uploaded",
             "browser_download_url": format!("{RELEASE_BASE}/download/v{version}/One-More-Prompt-{version}.dmg")},
            {"name":format!("One-More-Prompt-{version}-windows-x64-portable.zip"),"size":2048,"state":"uploaded",
             "browser_download_url": format!("{RELEASE_BASE}/download/v{version}/One-More-Prompt-{version}-windows-x64-portable.zip")}
        ]
    })).unwrap()
}

#[test]
fn selects_platform_package_for_a_newer_stable_release() {
    for (platform, suffix) in [("macos", ".dmg"), ("windows", "-windows-x64-portable.zip")] {
        let result = evaluate_release(release("1.0.1"), "1.0.0", platform).unwrap();
        assert_eq!(result.status, AppUpdateStatus::Available);
        assert!(result.download_url.unwrap().ends_with(suffix));
        assert_eq!(result.latest_version.as_deref(), Some("1.0.1"));
    }
}

#[test]
fn compares_numeric_versions_and_ignores_build_metadata() {
    assert_eq!(
        evaluate_release(release("1.0.10"), "1.0.9", "macos")
            .unwrap()
            .status,
        AppUpdateStatus::Available
    );
    for current in ["1.0.10", "1.0.10+local", "1.1.0"] {
        let result = evaluate_release(release("1.0.10"), current, "macos").unwrap();
        assert_eq!(result.status, AppUpdateStatus::UpToDate);
        assert!(result.download_url.is_none());
    }
    assert_eq!(
        evaluate_release(release("1.0.0"), "1.0.0-beta.1", "macos")
            .unwrap()
            .status,
        AppUpdateStatus::Available
    );
}

#[test]
fn accepts_unprefixed_release_tags() {
    let mut candidate = release("1.0.1");
    candidate.tag_name = "1.0.1".into();
    candidate.html_url = format!("{RELEASE_BASE}/tag/1.0.1");
    for asset in &mut candidate.assets {
        asset.browser_download_url = asset.browser_download_url.replace("/v1.0.1/", "/1.0.1/");
    }
    assert!(evaluate_release(candidate, "1.0.0", "macos").is_ok());
}

#[test]
fn rejects_drafts_prereleases_missing_publication_and_invalid_versions() {
    let mut candidates = vec![
        release("1.0.1"),
        release("1.0.1"),
        release("1.0.1"),
        release("1.1.0-beta.1"),
        release("invalid"),
    ];
    candidates[0].draft = true;
    candidates[1].prerelease = true;
    candidates[2].published_at = None;
    for candidate in candidates {
        assert!(evaluate_release(candidate, "1.0.0", "macos").is_err());
    }
    assert!(evaluate_release(release("1.0.1"), "invalid", "macos").is_err());
}

#[test]
fn rejects_missing_incomplete_and_untrusted_packages() {
    for mode in 0..4 {
        let mut candidate = release("1.0.1");
        match mode {
            0 => candidate.assets.clear(),
            1 => candidate.assets[0].size = 0.0,
            2 => candidate.assets[0].state = "new".into(),
            _ => candidate.assets[0].browser_download_url = "https://example.com/app.dmg".into(),
        }
        assert!(evaluate_release(candidate, "1.0.0", "macos").is_err());
    }
    let mut candidate = release("1.0.1");
    candidate.html_url = "https://github.com/another/repo/releases/tag/v1.0.1".into();
    assert!(evaluate_release(candidate, "1.0.0", "macos").is_err());
}

fn serve(status: &str, body: Vec<u8>) -> (String, std::thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/latest", listener.local_addr().unwrap());
    let status = status.to_string();
    let handle = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut request = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            let count = stream.read(&mut chunk).unwrap();
            if count == 0 {
                break;
            }
            request.extend_from_slice(&chunk[..count]);
            if request.windows(4).any(|part| part == b"\r\n\r\n") {
                break;
            }
        }
        write!(
            stream,
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .unwrap();
        let _ = stream.write_all(&body);
        String::from_utf8(request).unwrap()
    });
    (url, handle)
}

#[test]
fn actual_http_request_is_anonymous_and_404_is_not_up_to_date() {
    let (url, server) = serve("404 Not Found", b"{}".to_vec());
    let result = fetch_release(&url, "1.0.0", "macos").unwrap();
    assert_eq!(result.status, AppUpdateStatus::NotPublished);
    assert!(result.latest_version.is_none());
    let request = server.join().unwrap().to_lowercase();
    assert!(request.starts_with("get /latest http/1.1"));
    assert!(request.contains("user-agent: one-more-prompt/1.0.0"));
    assert!(!request.contains("authorization:"));
    assert!(!request.contains("cookie:"));
}

#[test]
fn actual_http_response_parses_release_and_rejects_failures() {
    let valid = json!({
        "tag_name":"v1.0.0", "html_url":format!("{RELEASE_BASE}/tag/v1.0.0"),
        "draft":false,"prerelease":false,"published_at":"2026-10-21T00:00:00Z","assets":[]
    });
    let (url, server) = serve("200 OK", serde_json::to_vec(&valid).unwrap());
    assert_eq!(
        fetch_release(&url, "1.0.0", "macos").unwrap().status,
        AppUpdateStatus::UpToDate
    );
    server.join().unwrap();
    for (status, body) in [
        ("403 Forbidden", b"{}".to_vec()),
        ("429 Too Many Requests", b"{}".to_vec()),
        ("500 Internal Server Error", b"{}".to_vec()),
        ("200 OK", b"not json".to_vec()),
        ("200 OK", vec![b' '; MAX_RESPONSE_BYTES as usize + 1]),
    ] {
        let (url, server) = serve(status, body);
        assert!(fetch_release(&url, "1.0.0", "macos").is_err(), "{status}");
        server.join().unwrap();
    }
}
