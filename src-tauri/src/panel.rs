use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, LogicalSize, Manager, Position, Size};
use tauri_nspanel::{
    CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt, tauri_panel,
};

const PANEL_EDGE_INSET: f64 = 8.0;
const PREFERRED_PANEL_HEIGHT: f64 = 875.0;
const MIN_PANEL_HEIGHT: f64 = 480.0;
static PANEL_PINNED: AtomicBool = AtomicBool::new(false);

fn is_pinned() -> bool {
    PANEL_PINNED.load(Ordering::Acquire)
}

fn should_hide_on_focus_loss(pinned: bool, guide_active: bool) -> bool {
    !pinned && !guide_active
}

fn clamp_panel_height(available_height: f64) -> f64 {
    available_height
        .max(MIN_PANEL_HEIGHT)
        .min(PREFERRED_PANEL_HEIGHT)
}

fn display_safe_panel_height(window: &tauri::WebviewWindow) -> Option<f64> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    Some(clamp_panel_height(
        monitor.work_area().size.height as f64 / monitor.scale_factor(),
    ))
}

fn apply_display_safe_panel_height(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let Some(height) = display_safe_panel_height(window) else {
        return Ok(());
    };
    let inner_size = window.inner_size()?;
    let scale_factor = window.scale_factor()?;
    let width = inner_size.width as f64 / scale_factor;
    let current_height = inner_size.height as f64 / scale_factor;
    if (current_height - height).abs() > f64::EPSILON {
        window.set_size(Size::Logical(LogicalSize::new(width, height)))?;
    }
    Ok(())
}

/// Return the panel's logical left edge while keeping it inside the active
/// monitor whenever the panel can fit. When the panel is wider than the
/// monitor, no placement can satisfy both bounds; pinning its left edge to the
/// inset keeps the origin on-screen and avoids a negative screen coordinate.
fn clamp_panel_x(
    tray_center_x: f64,
    monitor_left: f64,
    monitor_width: f64,
    panel_width: f64,
) -> f64 {
    let min_x = monitor_left + PANEL_EDGE_INSET;
    let max_x = (monitor_left + monitor_width - panel_width - PANEL_EDGE_INSET).max(min_x);
    (tray_center_x - (panel_width / 2.0)).clamp(min_x, max_x)
}

fn monitor_contains_physical_point(
    origin_x: f64,
    origin_y: f64,
    width: f64,
    height: f64,
    point_x: f64,
    point_y: f64,
) -> bool {
    point_x >= origin_x
        && point_x < origin_x + width
        && point_y >= origin_y
        && point_y < origin_y + height
}

unsafe fn set_panel_frame_top_left(panel: &tauri_nspanel::NSPanel, x: f64, y: f64) {
    let point = tauri_nspanel::NSPoint::new(x, y);
    let _: () = objc2::msg_send![panel, setFrameTopLeftPoint: point];
}

fn set_panel_top_left_immediately(
    window: &tauri::WebviewWindow,
    app_handle: &AppHandle,
    panel_x: f64,
    panel_y: f64,
    primary_logical_h: f64,
) {
    let Ok(panel_handle) = app_handle.get_webview_panel("main") else {
        return;
    };

    let target_x = panel_x;
    let target_y = primary_logical_h - panel_y;

    if objc2_foundation::MainThreadMarker::new().is_some() {
        unsafe {
            set_panel_frame_top_left(panel_handle.as_panel(), target_x, target_y);
        }
        return;
    }

    let (tx, rx) = std::sync::mpsc::channel();
    let panel_handle = panel_handle.clone();

    if let Err(error) = window.run_on_main_thread(move || {
        unsafe {
            set_panel_frame_top_left(panel_handle.as_panel(), target_x, target_y);
        }
        let _ = tx.send(());
    }) {
        log::warn!("Failed to position panel on main thread: {}", error);
        return;
    }

    if rx.recv().is_err() {
        log::warn!("Failed waiting for panel position on main thread");
    }
}

/// Macro to get existing panel or initialize it if needed.
/// Returns Option<Panel> - Some if panel is available, None on error.
macro_rules! get_or_init_panel {
    ($app_handle:expr) => {
        match $app_handle.get_webview_panel("main") {
            Ok(panel) => Some(panel),
            Err(_) => {
                if let Err(err) = crate::panel::init($app_handle) {
                    log::error!("Failed to init panel: {}", err);
                    None
                } else {
                    match $app_handle.get_webview_panel("main") {
                        Ok(panel) => Some(panel),
                        Err(err) => {
                            log::error!("Panel missing after init: {:?}", err);
                            None
                        }
                    }
                }
            }
        }
    };
}

/// Retrieve the tray icon rect and position the panel beneath it.
/// No-ops gracefully if the tray icon or its rect is unavailable.
/// Re-anchor the panel to the current tray icon without changing visibility.
///
/// The frontend calls this after a native resize completes. macOS preserves
/// the window's old top-left origin during `setSize`, so reusing the tray
/// positioning path keeps the panel's right edge and tray alignment stable.
pub fn reposition_panel_from_tray(app_handle: &AppHandle) {
    if is_pinned() {
        return;
    }
    let Some(tray) = app_handle.tray_by_id("tray") else {
        log::debug!("position_panel_from_tray: tray icon not found");
        return;
    };
    match tray.rect() {
        Ok(Some(rect)) => {
            position_panel_at_tray_icon(app_handle, rect.position, rect.size);
        }
        Ok(None) => {
            log::debug!("position_panel_from_tray: tray rect not available yet");
        }
        Err(e) => {
            log::warn!("position_panel_from_tray: failed to get tray rect: {}", e);
        }
    }
}

pub fn set_pinned(app_handle: &AppHandle, pinned: bool) -> Result<(), String> {
    let Some(panel) = get_or_init_panel!(app_handle) else {
        return Err("Main panel is not available".to_string());
    };

    if pinned {
        PANEL_PINNED.store(true, Ordering::Release);
    }
    panel.set_level(if pinned {
        PanelLevel::Normal.value()
    } else {
        PanelLevel::MainMenu.value() + 1
    });
    if !pinned {
        PANEL_PINNED.store(false, Ordering::Release);
        reposition_panel_from_tray(app_handle);
    }
    Ok(())
}

pub fn hide_panel(app_handle: &AppHandle) {
    let handle = app_handle.clone();
    let hide = move || {
        if let Ok(panel) = handle.get_webview_panel("main") {
            panel.hide();
        }
    };
    // NSPanel bypasses Tauri's dispatch. Async commands must return to AppKit's thread.
    if objc2_foundation::MainThreadMarker::new().is_some() {
        hide();
    } else if let Err(error) = app_handle.run_on_main_thread(hide) {
        log::error!("Failed to hide panel on main thread: {error}");
    }
}

pub fn show_panel(app_handle: &AppHandle) {
    if crate::onboarding::show_required_setup(app_handle) {
        return;
    }
    let Some(panel) = get_or_init_panel!(app_handle) else {
        return;
    };

    panel.show_and_make_key();
    reposition_panel_from_tray(app_handle);
}

/// Toggle panel visibility. If visible, hide it. If hidden, show it.
/// Used by global shortcut handler.
pub fn toggle_panel(app_handle: &AppHandle) {
    if crate::onboarding::show_required_setup(app_handle) {
        return;
    }
    let Some(panel) = get_or_init_panel!(app_handle) else {
        return;
    };

    if panel.is_visible() {
        log::debug!("toggle_panel: hiding panel");
        panel.hide();
    } else {
        log::debug!("toggle_panel: showing panel");
        show_panel(app_handle);
    }
}

pub fn show_panel_from_tray(app_handle: &AppHandle, view: &str) {
    if crate::onboarding::show_required_setup(app_handle) {
        return;
    }
    show_panel(app_handle);

    if let Err(error) = app_handle.emit("tray:navigate", view) {
        log::error!("failed to emit tray:navigate {view}: {error}");
    }
}

/// Build (or show) a 560×620 chromeless, transparent, centered window — the shape
/// shared by the onboarding setup window and the what's-new window. If a window
/// with the given label already exists, just show and focus it.
pub fn create_chromeless_window(
    app_handle: &AppHandle,
    label: &str,
    url: &str,
    title: &str,
    width: f64,
    height: f64,
    min_width: f64,
    min_height: f64,
    resizable: bool,
) -> tauri::Result<()> {
    if let Some(window) = app_handle.get_webview_window(label) {
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(app_handle, label, tauri::WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(width, height)
        .min_inner_size(min_width, min_height)
        .resizable(resizable)
        .decorations(false)
        .transparent(true)
        .center()
        .visible(true)
        .focused(true)
        .build()?;

    Ok(())
}

/// Show the tray panel at the requested view, then close the source window.
/// Used by both `finish_onboarding` and `dismiss_whats_new`.
pub fn close_window_and_show_panel(
    app_handle: &AppHandle,
    label: &str,
    view: &str,
) -> Result<(), String> {
    show_panel_from_tray(app_handle, view);
    if let Some(window) = app_handle.get_webview_window(label) {
        window
            .close()
            .map_err(|error| format!("failed to close {label} window: {error}"))?;
    }
    Ok(())
}

pub fn toggle_panel_at_tray_rect(app_handle: &AppHandle, icon_position: Position, icon_size: Size) {
    if crate::onboarding::show_required_setup(app_handle) {
        return;
    }
    let Some(panel) = get_or_init_panel!(app_handle) else {
        return;
    };

    if panel.is_visible() {
        log::info!("tray click: hiding panel");
        panel.hide();
        return;
    }
    log::info!("tray click: showing panel on the last active view");
    show_panel(app_handle);
    position_panel_at_tray_icon(app_handle, icon_position, icon_size);
}

// Define our panel class and event handler together
tauri_panel! {
    panel!(OneMorePromptPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })

    panel_event!(OneMorePromptPanelEventHandler {
        window_did_resign_key(notification: &NSNotification) -> ()
    })
}

pub fn init(app_handle: &tauri::AppHandle) -> tauri::Result<()> {
    if app_handle.get_webview_panel("main").is_ok() {
        return Ok(());
    }

    let window = app_handle.get_webview_window("main").unwrap();

    apply_display_safe_panel_height(&window)?;

    let panel = window.to_panel::<OneMorePromptPanel>()?;

    // Disable native shadow - it causes gray border on transparent windows
    // Let CSS handle shadow via shadow-xl class
    panel.set_has_shadow(false);
    panel.set_opaque(false);

    // Configure panel behavior
    panel.set_level(PanelLevel::MainMenu.value() + 1);

    panel.set_collection_behavior(
        CollectionBehavior::new()
            .move_to_active_space()
            .full_screen_auxiliary()
            .value(),
    );

    panel.set_style_mask(StyleMask::empty().nonactivating_panel().value());

    // Set up event handler to hide panel when it loses focus
    let event_handler = OneMorePromptPanelEventHandler::new();

    let handle = app_handle.clone();
    event_handler.window_did_resign_key(move |_notification| {
        if should_hide_on_focus_loss(is_pinned(), crate::onboarding::contextual_guide_active()) {
            if let Ok(panel) = handle.get_webview_panel("main") {
                panel.hide();
            }
        }
    });

    panel.set_event_handler(Some(event_handler.as_ref()));
    let handle = app_handle.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if crate::onboarding::can_skip_onboarding(handle.clone()) {
                hide_panel(&handle);
            }
        }
    });

    Ok(())
}

pub fn position_panel_at_tray_icon(
    app_handle: &tauri::AppHandle,
    icon_position: Position,
    icon_size: Size,
) {
    let window = app_handle.get_webview_window("main").unwrap();

    let (icon_phys_x, icon_phys_y) = match &icon_position {
        Position::Physical(pos) => (pos.x as f64, pos.y as f64),
        Position::Logical(pos) => (pos.x, pos.y),
    };
    let (icon_phys_w, icon_phys_h) = match &icon_size {
        Size::Physical(s) => (s.width as f64, s.height as f64),
        Size::Logical(s) => (s.width, s.height),
    };

    let monitors = window.available_monitors().expect("failed to get monitors");
    let primary_logical_h = window
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.size().height as f64 / m.scale_factor())
        .unwrap_or(0.0);

    let icon_center_x = icon_phys_x + (icon_phys_w / 2.0);
    let icon_center_y = icon_phys_y + (icon_phys_h / 2.0);

    let found_monitor = monitors.iter().find(|monitor| {
        let origin = monitor.position();
        let size = monitor.size();
        monitor_contains_physical_point(
            origin.x as f64,
            origin.y as f64,
            size.width as f64,
            size.height as f64,
            icon_center_x,
            icon_center_y,
        )
    });

    let monitor = match found_monitor {
        Some(m) => m.clone(),
        None => {
            log::warn!(
                "No monitor found for tray rect center at ({:.0}, {:.0}), using primary",
                icon_center_x,
                icon_center_y
            );
            match window.primary_monitor() {
                Ok(Some(m)) => m,
                _ => return,
            }
        }
    };

    let target_scale = monitor.scale_factor();
    let mon_phys_x = monitor.position().x as f64;
    let mon_phys_y = monitor.position().y as f64;
    let mon_logical_x = mon_phys_x / target_scale;
    let mon_logical_y = mon_phys_y / target_scale;
    let mon_logical_w = monitor.size().width as f64 / target_scale;

    let icon_logical_x = mon_logical_x + (icon_phys_x - mon_phys_x) / target_scale;
    let icon_logical_y = mon_logical_y + (icon_phys_y - mon_phys_y) / target_scale;
    let icon_logical_w = icon_phys_w / target_scale;
    let icon_logical_h = icon_phys_h / target_scale;

    // Read panel width from the window, converted to logical points.
    // outer_size() returns physical pixels at the window's current scale factor.
    // If the window isn't available yet, parse the configured width from tauri.conf.json
    // (embedded at compile time) so it stays in sync automatically.
    let panel_width = match (window.outer_size(), window.scale_factor()) {
        (Ok(s), Ok(win_scale)) => s.width as f64 / win_scale,
        _ => {
            let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
                .expect("tauri.conf.json must be valid JSON");
            conf["app"]["windows"][0]["width"]
                .as_f64()
                .expect("width must be set in tauri.conf.json")
        }
    };

    let icon_center_x = icon_logical_x + (icon_logical_w / 2.0);
    let panel_x = clamp_panel_x(icon_center_x, mon_logical_x, mon_logical_w, panel_width);
    let nudge_up: f64 = 6.0;
    // Clamp to the monitor's top edge: when the menu bar is set to auto-hide,
    // the tray rect sits above the visible screen, which would otherwise push
    // the panel's top edge off-screen and clip it.
    let panel_y = (icon_logical_y + icon_logical_h - nudge_up).max(mon_logical_y);

    set_panel_top_left_immediately(&window, app_handle, panel_x, panel_y, primary_logical_h);
}

#[cfg(test)]
mod tests {
    use super::{
        MIN_PANEL_HEIGHT, PREFERRED_PANEL_HEIGHT, clamp_panel_height, clamp_panel_x,
        should_hide_on_focus_loss,
    };

    #[test]
    fn keeps_the_preferred_panel_height_when_the_display_has_room() {
        assert_eq!(clamp_panel_height(1_080.0), PREFERRED_PANEL_HEIGHT);
    }

    #[test]
    fn reduces_the_panel_height_to_a_short_display() {
        assert_eq!(clamp_panel_height(760.0), 760.0);
    }

    #[test]
    fn preserves_the_native_minimum_for_extremely_short_displays() {
        assert_eq!(clamp_panel_height(320.0), MIN_PANEL_HEIGHT);
    }

    #[test]
    fn centers_panel_under_tray_when_there_is_room() {
        assert_eq!(clamp_panel_x(820.0, 100.0, 1_440.0, 760.0), 440.0);
    }

    #[test]
    fn clamps_panel_to_left_edge_with_inset() {
        assert_eq!(clamp_panel_x(200.0, 100.0, 1_440.0, 760.0), 108.0);
    }

    #[test]
    fn clamps_panel_to_right_edge_with_inset() {
        assert_eq!(clamp_panel_x(1_500.0, 100.0, 1_440.0, 760.0), 772.0);
    }

    #[test]
    fn keeps_the_right_edge_fixed_when_width_changes_at_the_right_boundary() {
        let narrow_width = 760.0;
        let wide_width = 1_120.0;
        let narrow_x = clamp_panel_x(1_500.0, 100.0, 1_440.0, narrow_width);
        let wide_x = clamp_panel_x(1_500.0, 100.0, 1_440.0, wide_width);

        assert!((narrow_x + narrow_width - (wide_x + wide_width)).abs() < f64::EPSILON);
    }

    #[test]
    fn pins_panel_to_left_inset_when_it_is_wider_than_monitor() {
        assert_eq!(clamp_panel_x(350.0, 50.0, 600.0, 760.0), 58.0);
    }

    #[test]
    fn pinned_panels_ignore_focus_loss() {
        assert!(!should_hide_on_focus_loss(true, false));
        assert!(should_hide_on_focus_loss(false, false));
        assert!(!should_hide_on_focus_loss(false, true));
        assert!(!should_hide_on_focus_loss(true, true));
    }
}
