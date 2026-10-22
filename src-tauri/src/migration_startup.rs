//! Minimal failure surface used before normal plugins, stores or setup start.
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub fn show_error(error: &std::io::Error, mut context: tauri::Context<tauri::Wry>) {
    // Avoid copying a private path from an OS error into diagnostics.
    eprintln!(
        "Saved-data migration failed ({:?}); original data is unchanged. Check access and free disk space, then reopen One More Prompt.",
        error.kind()
    );
    context.config_mut().app.windows.clear();
    let result = tauri::Builder::default()
        .setup(|app| {
            WebviewWindowBuilder::new(
                app,
                "migration-error",
                WebviewUrl::App("migration-error.html".into()),
            )
            .title("One More Prompt — Saved Data Needs Attention")
            .inner_size(560.0, 440.0)
            .resizable(false)
            .center()
            .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                window.app_handle().exit(1);
            }
        })
        .run(context);
    if let Err(error) = result {
        eprintln!(
            "Could not open the saved-data error window: {}",
            crate::plugin_engine::host_api::redact_log_message(&error.to_string())
        );
    }
}
