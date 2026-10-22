#[cfg(any(test, target_os = "windows"))]
pub(crate) fn windows_command_line(app_path: &str, args: &[String]) -> std::io::Result<String> {
    let app_path = app_path
        .strip_prefix('"')
        .and_then(|path| path.strip_suffix('"'))
        .unwrap_or(app_path);
    if app_path.is_empty() || app_path.contains(['\0', '"']) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "app_path must be nonempty and contain no embedded quotes or NUL characters",
        ));
    }
    if args.iter().any(|arg| arg.contains('\0')) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "startup arguments cannot contain NUL characters",
        ));
    }
    let mut command = format!("\"{app_path}\"");
    for arg in args {
        command.push(' ');
        push_windows_argument(&mut command, arg);
    }
    Ok(command)
}

#[cfg(any(test, target_os = "windows"))]
fn push_windows_argument(command: &mut String, arg: &str) {
    if !arg.is_empty() && !arg.contains([' ', '\t', '"']) {
        command.push_str(arg);
        return;
    }
    // Windows CRT quoting preserves literal quotes and trailing backslashes.
    command.push('"');
    let mut backslashes = 0;
    for c in arg.chars() {
        if c == '\\' {
            backslashes += 1;
            continue;
        }
        let count = if c == '"' {
            backslashes * 2 + 1
        } else {
            backslashes
        };
        command.extend(std::iter::repeat('\\').take(count));
        command.push(c);
        backslashes = 0;
    }
    command.extend(std::iter::repeat('\\').take(backslashes * 2));
    command.push('"');
}

#[cfg(any(test, target_os = "macos"))]
pub(crate) fn launch_agent_plist(
    app_name: &str,
    app_path: &str,
    args: &[String],
) -> std::io::Result<String> {
    for value in [app_name, app_path]
        .into_iter()
        .chain(args.iter().map(String::as_str))
    {
        if value.chars().any(|character| !matches!(character,
            '\t' | '\n' | '\r' | '\u{20}'..='\u{d7ff}' | '\u{e000}'..='\u{fffd}' | '\u{10000}'..='\u{10ffff}'
        )) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "LaunchAgent values contain a character that cannot be represented in XML 1.0",
            ));
        }
    }
    let mut full_args = vec![app_path.to_string()];
    full_args.extend_from_slice(args);
    let section = full_args
        .iter()
        .map(|arg| format!("<string>{}</string>", plist_text(arg)))
        .collect::<String>();
    let app_name = plist_text(app_name);
    Ok(format!(
        "{}\n{}\n<plist version=\"1.0\"><dict><key>Label</key><string>{app_name}</string><key>ProgramArguments</key><array>{section}</array><key>RunAtLoad</key><true/></dict></plist>",
        r#"<?xml version="1.0" encoding="UTF-8"?>"#,
        r#"<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">"#,
    ))
}

#[cfg(any(test, target_os = "macos"))]
fn plist_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\r', "&#13;")
}
