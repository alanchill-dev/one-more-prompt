use crate::startup_serialization::{launch_agent_plist, windows_command_line};
use plist::Value;

#[test]
fn windows_quotes_executable_and_preserves_background_launch() {
    for path in [
        r"C:\Apps\app.exe",
        r"C:\Users\Demo User\One More Prompt\app.exe",
        r"C:\使用者\雪😀\app.exe",
        r"\\server\share name\app.exe",
    ] {
        assert_eq!(
            windows_command_line(path, &["--background".into()]).unwrap(),
            format!("\"{path}\" --background")
        );
        assert_eq!(
            windows_command_line(path, &[]).unwrap(),
            format!("\"{path}\"")
        );
    }
}

#[test]
fn windows_serializes_literal_argument_boundaries() {
    let cases = [
        ("", r#""""#),
        ("two words", r#""two words""#),
        ("a\tb", "\"a\tb\""),
        (r#"a"b"#, r#""a\"b""#),
        (r#"a\"b"#, r#""a\\\"b""#),
        (r#"a\\"b"#, r#""a\\\\\"b""#),
        (r"C:\plain\", r"C:\plain\"),
        (r"C:\two words\", r#""C:\two words\\""#),
        (r"C:\two words\\", r#""C:\two words\\\\""#),
        ("雪😀", "雪😀"),
        ("%PATH%&|<>^", "%PATH%&|<>^"),
    ];
    for (input, encoded) in cases {
        assert_eq!(
            windows_command_line("app.exe", &[input.into()]).unwrap(),
            format!("\"app.exe\" {encoded}"),
            "{input:?}"
        );
    }
    assert_eq!(
        windows_command_line("app.exe", &["".into(), "x".into(), "".into()]).unwrap(),
        r#""app.exe" "" x """#
    );
}

#[test]
fn windows_rejects_unrepresentable_paths_and_arguments() {
    for path in [
        "",
        "app\0.exe",
        "a\"b.exe",
        "\"",
        "\"\"",
        "\"app.exe",
        "app.exe\"",
        "\"\"app.exe\"\"",
    ] {
        assert_eq!(
            windows_command_line(path, &[]).unwrap_err().kind(),
            std::io::ErrorKind::InvalidInput
        );
    }
    assert_eq!(
        windows_command_line("app.exe", &["bad\0arg".into()])
            .unwrap_err()
            .kind(),
        std::io::ErrorKind::InvalidInput
    );
}

#[test]
fn windows_accepts_one_existing_surrounding_quote_pair() {
    assert_eq!(
        windows_command_line(r#""C:\Two Words\app.exe""#, &["--background".into()]).unwrap(),
        r#""C:\Two Words\app.exe" --background"#
    );
}

fn assert_parsed_plist(name: &str, path: &str, args: &[String]) {
    let xml = launch_agent_plist(name, path, args).expect("representable LaunchAgent values");
    // XML 1.0 normalizes physical line endings before expanding character references.
    let normalized = xml.replace("\r\n", "\n").replace('\r', "\n");
    let parsed = Value::from_reader_xml(normalized.as_bytes())
        .expect("production LaunchAgent output must parse as a plist");
    let dictionary = parsed.as_dictionary().expect("LaunchAgent dictionary");
    assert_eq!(
        dictionary.get("Label").and_then(Value::as_string),
        Some(name)
    );
    assert_eq!(
        dictionary.get("RunAtLoad").and_then(Value::as_boolean),
        Some(true)
    );
    let actual = dictionary
        .get("ProgramArguments")
        .and_then(Value::as_array)
        .unwrap()
        .iter()
        .map(|value| value.as_string().unwrap().to_string())
        .collect::<Vec<_>>();
    let expected = std::iter::once(path.to_owned())
        .chain(args.iter().cloned())
        .collect::<Vec<_>>();
    assert_eq!(actual, expected);
}

#[test]
fn macos_serializes_special_paths_labels_and_literal_arguments() {
    assert_parsed_plist(
        "One & More <Prompt> 雪",
        "/Applications/Tools & Apps/One More Prompt.app/Contents/MacOS/one-more-prompt",
        &[
            "--background".into(),
            "quoted \"text\" & <value> 'literal'".into(),
            "".into(),
            "雪😀".into(),
            "already &amp; encoded".into(),
        ],
    );
}

#[test]
fn macos_preserves_spaces_unicode_and_background_args() {
    for path in [
        "/Applications/One More Prompt.app/Contents/MacOS/one-more-prompt",
        "/Volumes/測試 雪😀/One More Prompt.app/Contents/MacOS/one-more-prompt",
    ] {
        assert_parsed_plist("one-more-prompt", path, &["--background".into()]);
        assert_parsed_plist("one-more-prompt", path, &[]);
    }
}

#[test]
fn macos_refresh_replaces_the_invalid_serialized_value() {
    let invalid = b"<plist version=\"1.0\"><dict><key>ProgramArguments</key><array><string>/Applications/Tools & Apps/app</string></array></dict></plist>";
    assert!(Value::from_reader_xml(invalid.as_slice()).is_err());
    assert_parsed_plist(
        "one-more-prompt",
        "/Applications/Tools & Apps/app",
        &["--background".into()],
    );
}

#[test]
fn macos_preserves_carriage_returns_without_xml_newline_normalization() {
    assert_parsed_plist(
        "one-more\rprompt",
        "/Applications/Tools\rApps/One More Prompt.app/Contents/MacOS/one-more-prompt",
        &["--background".into(), "CR\rLF\r\nTAB\tnewline\n".into()],
    );
}

#[test]
fn macos_rejects_xml_unrepresentable_values_before_registration() {
    for character in [
        '\0', '\u{1}', '\u{8}', '\u{b}', '\u{c}', '\u{e}', '\u{1f}', '\u{fffe}', '\u{ffff}',
    ] {
        let invalid = format!("before{character}after");
        for result in [
            launch_agent_plist(&invalid, "/Applications/App.app/app", &[]),
            launch_agent_plist("one-more-prompt", &invalid, &[]),
            launch_agent_plist(
                "one-more-prompt",
                "/Applications/App.app/app",
                &[invalid.clone()],
            ),
        ] {
            assert_eq!(
                result.unwrap_err().kind(),
                std::io::ErrorKind::InvalidInput,
                "{character:?}"
            );
        }
    }
}
