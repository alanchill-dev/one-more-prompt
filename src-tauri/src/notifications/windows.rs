use std::path::{Path, PathBuf};

fn notification_icon_path(resource_dir: &Path) -> Result<PathBuf, String> {
    let icon_path = resource_dir.join("icons/icon.png");
    let metadata = std::fs::metadata(&icon_path)
        .map_err(|error| format!("Couldn't read Windows notification icon: {error}"))?;
    if !metadata.is_file() {
        return Err("Windows notification icon is not a file".to_string());
    }
    Ok(icon_path)
}

#[cfg(target_os = "windows")]
fn write_identity(
    identifier: &str,
    display_name: &str,
    icon_path: &Path,
) -> windows_registry::Result<()> {
    let key = windows_registry::CURRENT_USER
        .create(format!(r"SOFTWARE\Classes\AppUserModelId\{identifier}"))?;
    key.set_string("DisplayName", display_name)?;
    key.set_string("IconBackgroundColor", "0")?;
    key.set_hstring("IconUri", &icon_path.into())
}

#[cfg(target_os = "windows")]
pub(super) fn register_application(app_handle: &tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|error| format!("Couldn't resolve Windows notification resources: {error}"))?;
    let icon_path = notification_icon_path(&resource_dir)?;
    let config = app_handle.config();
    write_identity(
        &config.identifier,
        config
            .product_name
            .as_deref()
            .unwrap_or(env!("CARGO_PKG_NAME")),
        &icon_path,
    )
    .map_err(|error| format!("Couldn't register Windows notification identity: {error}"))
}

#[cfg(target_os = "windows")]
pub(super) fn send(app_handle: &tauri::AppHandle, title: &str, body: &str) -> Result<(), String> {
    let result = register_application(app_handle).and_then(|()| {
        tauri_winrt_notification::Toast::new(&app_handle.config().identifier)
            .title(title)
            .text1(body)
            .sound(Some(tauri_winrt_notification::Sound::Default))
            .show()
            .map_err(|error| format!("Couldn't send Windows notification: {error}"))
    });
    if let Err(error) = &result {
        log::error!("Windows notification submission failed: {error}");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notification_icon_follows_resource_folder_and_preserves_unicode() {
        let first = std::env::temp_dir().join(format!("通知-{}", uuid::Uuid::new_v4()));
        let moved = std::env::temp_dir().join(format!("移動-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(first.join("icons")).unwrap();
        std::fs::write(first.join("icons/icon.png"), b"image").unwrap();
        let original = notification_icon_path(&first).unwrap();
        std::fs::rename(&first, &moved).unwrap();
        let new_path = notification_icon_path(&moved).unwrap();
        let stale_result = notification_icon_path(&first);
        std::fs::remove_dir_all(&moved).unwrap();

        assert!(original.is_absolute());
        assert_eq!(new_path, moved.join("icons/icon.png"));
        assert_ne!(original, new_path);
        assert!(stale_result.is_err());
    }

    #[test]
    fn notification_registration_rejects_missing_or_directory_icon() {
        let root = std::env::temp_dir().join(format!("notification-{}", uuid::Uuid::new_v4()));
        assert!(notification_icon_path(&root).is_err());
        std::fs::create_dir_all(root.join("icons/icon.png")).unwrap();
        let result = notification_icon_path(&root);
        std::fs::remove_dir_all(root).unwrap();
        assert_eq!(
            result.unwrap_err(),
            "Windows notification icon is not a file"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn notification_identity_updates_existing_registration() {
        let identifier = format!("com.alanchill.onemoreprompt.test.{}", uuid::Uuid::new_v4());
        let registry_path = format!(r"SOFTWARE\Classes\AppUserModelId\{identifier}");
        let original = std::env::temp_dir().join("原位置/icon.png");
        let moved = std::env::temp_dir().join("新位置/icon.png");
        let result = (|| -> windows_registry::Result<_> {
            write_identity(&identifier, "One More Prompt", &original)?;
            write_identity(&identifier, "One More Prompt", &moved)?;
            let key = windows_registry::CURRENT_USER.open(&registry_path)?;
            Ok((key.get_string("DisplayName")?, key.get_hstring("IconUri")?))
        })();
        windows_registry::CURRENT_USER
            .remove_tree(registry_path)
            .unwrap();
        let (display_name, icon_path) = result.unwrap();
        assert_eq!(display_name, "One More Prompt");
        assert_eq!(icon_path, windows_registry::HSTRING::from(moved.as_path()));
    }
}
