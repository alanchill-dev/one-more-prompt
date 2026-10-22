use tauri_plugin_notification::NotificationExt;

#[cfg(any(target_os = "windows", test))]
mod windows;

#[cfg(target_os = "macos")]
pub fn register_application_identifier(identifier: &str) -> Result<(), String> {
    application_registration_result(mac_notification_sys::set_application(identifier))
}

#[cfg(target_os = "macos")]
fn application_registration_result(
    result: mac_notification_sys::error::NotificationResult<()>,
) -> Result<(), String> {
    match result {
        Ok(())
        | Err(mac_notification_sys::error::Error::Application(
            mac_notification_sys::error::ApplicationError::AlreadySet(_),
        )) => Ok(()),
        Err(error) => Err(format!(
            "failed to set notification application identity: {error}"
        )),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn register_application_identifier(_identifier: &str) -> Result<(), String> {
    Ok(())
}

pub fn register_application(app_handle: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows::register_application(app_handle)
    }
    #[cfg(not(target_os = "windows"))]
    {
        register_application_identifier(&app_handle.config().identifier)
    }
}

#[cfg(target_os = "windows")]
pub fn send(app_handle: &tauri::AppHandle, title: &str, body: &str) -> Result<(), String> {
    windows::send(app_handle, title, body)
}

#[tauri::command]
#[specta::specta]
pub fn register_notifications(app_handle: tauri::AppHandle) -> Result<(), String> {
    register_application(&app_handle)
}

#[tauri::command]
#[specta::specta]
pub fn request_notification_permission(app_handle: tauri::AppHandle) -> Result<String, String> {
    register_application(&app_handle)?;
    app_handle
        .notification()
        .request_permission()
        .map(|state| state.to_string())
        .map_err(|error| format!("failed to request notification permission: {error}"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn notification_registration_already_set_is_ok() {
        #[cfg(target_os = "macos")]
        {
            super::application_registration_result(Err(
                mac_notification_sys::error::ApplicationError::AlreadySet(
                    "com.alanchill.onemoreprompt.test".to_string(),
                )
                .into(),
            ))
            .expect("AlreadySet should be treated as success");
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            super::register_application_identifier("com.alanchill.onemoreprompt.test")
                .expect("other platforms do not need application registration");
        }
    }
}
