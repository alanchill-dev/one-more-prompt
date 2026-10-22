//! Copy previously shipped user data before any stores or webviews are opened.
use std::fs;
use std::io;
use std::path::Path;

const LEGACY_IDENTIFIER: &str = "com.alanchou.usagepal.codex";
pub const APP_IDENTIFIER: &str = "com.alanchill.onemoreprompt";
const LEGACY_CONFIG_DIRECTORY: &str = ".usagepal";

pub fn migrate_user_data() -> io::Result<()> {
    let mut roots = Vec::new();
    for root in [dirs::data_dir(), dirs::data_local_dir(), dirs::config_dir()]
        .into_iter()
        .flatten()
    {
        if !roots.contains(&root) {
            roots.push(root);
        }
    }
    #[cfg(target_os = "macos")]
    if let Some(home) = dirs::home_dir() {
        // WKWebView's default store follows the bundle identifier, not app_data_dir.
        roots.push(home.join("Library/WebKit"));
    }
    for root in roots {
        copy_if_absent(&root.join(LEGACY_IDENTIFIER), &root.join(APP_IDENTIFIER))?;
    }
    if let Some(home) = dirs::home_dir() {
        copy_if_absent(
            &home.join(LEGACY_CONFIG_DIRECTORY).join("config.json"),
            &home.join(".one-more-prompt/config.json"),
        )?;
    }
    Ok(())
}

fn copy_if_absent(source: &Path, destination: &Path) -> io::Result<()> {
    if path_exists(destination)? || !path_exists(source)? {
        return Ok(());
    }
    let parent = destination.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "Migration destination has no parent",
        )
    })?;
    fs::create_dir_all(parent)?;
    let staging = parent.join(format!(
        ".one-more-prompt-migration-{}",
        uuid::Uuid::new_v4()
    ));
    // Only this app-created, unpublished copy is disposable. Never remove the
    // legacy source or a destination created by a concurrent migration.
    let copied = copy_tree(source, &staging);
    finish_copy(&staging, destination, copied)
}

fn finish_copy(staging: &Path, destination: &Path, copied: io::Result<()>) -> io::Result<()> {
    let published = copied.and_then(|()| {
        if path_exists(destination)? {
            Ok(())
        } else {
            fs::rename(staging, destination)
        }
    });
    // A successful rename no longer has a staging path. Cleanup also covers a
    // partial copy, destination conflict, failed destination check, or rename.
    let cleanup = match fs::symlink_metadata(staging) {
        Ok(metadata) if metadata.is_dir() => fs::remove_dir_all(staging),
        Ok(_) => fs::remove_file(staging),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    };
    match (published, cleanup) {
        (Err(error), Ok(())) => Err(io::Error::new(
            error.kind(),
            format!("Could not copy saved app data: {error}"),
        )),
        (_, Err(error)) => Err(io::Error::new(
            error.kind(),
            format!("Could not clean unpublished saved-data copy: {error}"),
        )),
        (Ok(()), Ok(())) => Ok(()),
    }
}

fn path_exists(path: &Path) -> io::Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

fn copy_tree(source: &Path, destination: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Saved app data contains a symbolic link; migration stopped without changing the source",
        ));
    }
    if metadata.is_file() {
        fs::copy(source, destination)?;
    } else if metadata.is_dir() {
        fs::create_dir(destination)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(destination, fs::Permissions::from_mode(0o700))?;
        }
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_tree(&entry.path(), &destination.join(entry.file_name()))?;
        }
        fs::set_permissions(destination, metadata.permissions())?;
    } else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Unsupported saved app data file",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "one-more-prompt-migration-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir(&root).unwrap();
        root
    }

    #[test]
    fn preserves_settings_pins_webview_and_original_files() {
        let root = fixture();
        let source = root.join("old");
        fs::create_dir_all(source.join("WebsiteData/LocalStorage")).unwrap();
        fs::write(
            source.join("settings.json"),
            r#"{"language":"ja","startOnLogin":true}"#,
        )
        .unwrap();
        fs::write(
            source.join("WebsiteData/LocalStorage/pins.sqlite3"),
            b"local pins and unread state",
        )
        .unwrap();
        let destination = root.join("new");
        copy_if_absent(&source, &destination).unwrap();
        for relative in ["settings.json", "WebsiteData/LocalStorage/pins.sqlite3"] {
            assert_eq!(
                fs::read(source.join(relative)).unwrap(),
                fs::read(destination.join(relative)).unwrap()
            );
        }
        // Tests only create disposable directories; no real app data is read.
    }

    #[test]
    fn existing_destination_wins_without_merging_old_data() {
        let root = fixture();
        let source = root.join("old");
        let destination = root.join("new");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&destination).unwrap();
        fs::write(source.join("settings.json"), "old").unwrap();
        fs::write(source.join("old-only.json"), "do not resurrect").unwrap();
        fs::write(destination.join("settings.json"), "newer").unwrap();
        copy_if_absent(&source, &destination).unwrap();
        assert_eq!(
            fs::read_to_string(destination.join("settings.json")).unwrap(),
            "newer"
        );
        assert!(!destination.join("old-only.json").exists());
    }

    #[test]
    fn copies_proxy_config_once_and_ignores_a_missing_source() {
        let root = fixture();
        let source = root.join("config.json");
        let destination = root.join("new/config.json");
        copy_if_absent(&source, &destination).unwrap();
        assert!(!destination.exists());
        fs::write(
            &source,
            r#"{"proxy":{"enabled":true,"url":"http://example.test:8888"}}"#,
        )
        .unwrap();
        copy_if_absent(&source, &destination).unwrap();
        fs::write(&source, "changed legacy source").unwrap();
        copy_if_absent(&source, &destination).unwrap();
        assert!(
            fs::read_to_string(destination)
                .unwrap()
                .contains("example.test")
        );
    }

    #[test]
    fn discarded_copies_leave_existing_destination_and_source_untouched() {
        let root = fixture();
        let source = root.join("source");
        let stage = root.join(".one-more-prompt-migration-owned");
        let destination = root.join("new");
        fs::write(&source, "legacy").unwrap();
        fs::copy(&source, &stage).unwrap();
        fs::write(&destination, "newer").unwrap();
        finish_copy(&stage, &destination, Ok(())).unwrap();
        assert!(!stage.exists());
        assert_eq!(fs::read_to_string(&destination).unwrap(), "newer");
        assert_eq!(fs::read_to_string(&source).unwrap(), "legacy");

        fs::copy(&source, &stage).unwrap();
        let failure = finish_copy(&stage, &root.join("missing/new"), Ok(())).unwrap_err();
        assert_eq!(failure.kind(), io::ErrorKind::NotFound);
        assert!(!stage.exists(), "failed rename must discard its owned copy");

        fs::copy(&source, &stage).unwrap();
        assert!(finish_copy(&stage, &source.join("not-a-directory/new"), Ok(())).is_err());
        assert!(
            !stage.exists(),
            "failed destination inspection must discard its owned copy"
        );
        assert_eq!(fs::read_to_string(source).unwrap(), "legacy");
    }

    #[cfg(unix)]
    #[test]
    fn failed_copy_is_never_published_and_retry_can_complete() {
        let root = fixture();
        let source = root.join("old");
        let destination = root.join("new");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("settings.json"), "preserve").unwrap();
        let link = source.join("linked-data");
        std::os::unix::fs::symlink(source.join("settings.json"), &link).unwrap();
        for _ in 0..3 {
            assert!(copy_if_absent(&source, &destination).is_err());
            assert!(
                !fs::read_dir(&root).unwrap().any(|entry| entry
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".one-more-prompt-migration-")),
                "failed retries must not retain unpublished copies"
            );
        }
        assert!(!destination.exists());
        assert_eq!(
            fs::read_to_string(source.join("settings.json")).unwrap(),
            "preserve"
        );
        // Move the disposable symlink aside; never delete real user data.
        fs::rename(link, root.join("link-aside")).unwrap();
        copy_if_absent(&source, &destination).unwrap();
        assert_eq!(
            fs::read_to_string(destination.join("settings.json")).unwrap(),
            "preserve"
        );
    }
}
