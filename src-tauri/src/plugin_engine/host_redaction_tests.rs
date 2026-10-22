use super::*;

#[test]
fn supported_paths_with_spaces_never_leave_private_suffixes_in_diagnostics() {
    for message in [
        r"auth loaded from file: C:\Users\Synthetic Person\Private Project\auth.json",
        r"history failed: \\office-server\private-share\Private Project\session.jsonl: access denied",
        "auth loaded from file: /Users/Synthetic Person/Private Project/auth.json",
    ] {
        let redacted = redact_log_message(message);
        assert!(!redacted.contains("Private Project"), "{redacted}");
        assert!(!redacted.contains("Synthetic Person"), "{redacted}");
        assert!(!redacted.contains("private-share"), "{redacted}");
        assert!(redacted.contains("[PATH]"), "{redacted}");
    }
    assert_eq!(
        redact_log_message("gpt-6.1-sol · High"),
        "gpt-6.1-sol · High"
    );
}

#[test]
fn sensitive_json_strings_with_escapes_are_redacted_as_complete_values() {
    for private in [
        r#"Synthetic "PRIVATE_MARKER" Account"#,
        r#"Synthetic \"PRIVATE_MARKER\" Account"#,
        r"Private\\Folder\\PRIVATE_MARKER",
        "Private\nPRIVATE_MARKER",
    ] {
        let body =
            serde_json::json!({"account_display_name": private, "safe": "keep me"}).to_string();
        let redacted = redact_body(&body);
        assert!(!redacted.contains("PRIVATE_MARKER"), "{redacted}");
        let value: serde_json::Value =
            serde_json::from_str(&redacted).expect("redaction preserves JSON syntax");
        assert_eq!(value["safe"], "keep me");
    }
}

#[test]
fn nested_response_paths_are_redacted_without_consuming_other_json_fields() {
    let body = serde_json::json!({"items":[{"homePath": "C:\\Synthetic Person\\Private Project\\auth.json", "safe": "retained"}], "root": "ok"});
    let result: serde_json::Value = serde_json::from_str(&redact_body(&body.to_string())).unwrap();
    assert_eq!(result["items"][0]["homePath"], "[PATH]");
    assert_eq!(result["items"][0]["safe"], "retained");
    assert_eq!(result["root"], "ok");
}

#[test]
fn network_urls_are_not_mistaken_for_windows_drive_paths() {
    let message = "GET https://chatgpt.com/backend-api/wham/usage failed";
    assert_eq!(redact_log_message(message), message);
}
