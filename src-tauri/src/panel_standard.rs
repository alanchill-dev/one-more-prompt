use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WindowEvent,
};

const PANEL_EDGE_INSET: f64 = 8.0;
const PANEL_GAP: f64 = 6.0;
const PREFERRED_PANEL_HEIGHT: f64 = 875.0;
const MIN_PANEL_HEIGHT: f64 = 480.0;
static PANEL_INITIALIZED: AtomicBool = AtomicBool::new(false);
static PANEL_PINNED: AtomicBool = AtomicBool::new(false);

fn is_pinned() -> bool {
    PANEL_PINNED.load(Ordering::Acquire)
}

fn should_hide_on_focus_loss(pinned: bool, guide_active: bool) -> bool {
    !pinned && !guide_active
}

#[cfg(any(target_os = "windows", test))]
fn should_hide_for_foreground(
    pinned: bool,
    guide_active: bool,
    own_window: usize,
    foreground: usize,
    foreground_root: usize,
) -> bool {
    should_hide_on_focus_loss(pinned, guide_active)
        && foreground != 0
        && foreground != own_window
        && foreground_root != own_window
}

fn main_window(app_handle: &AppHandle) -> Option<tauri::WebviewWindow> {
    app_handle.get_webview_window("main")
}

fn logical_rect(position: &Position, size: &Size, scale: f64) -> (f64, f64, f64, f64) {
    match (position, size) {
        (Position::Physical(position), Size::Physical(size)) => (
            position.x as f64 / scale,
            position.y as f64 / scale,
            size.width as f64 / scale,
            size.height as f64 / scale,
        ),
        (Position::Logical(position), Size::Logical(size)) => {
            (position.x, position.y, size.width, size.height)
        }
        (Position::Physical(position), Size::Logical(size)) => (
            position.x as f64 / scale,
            position.y as f64 / scale,
            size.width,
            size.height,
        ),
        (Position::Logical(position), Size::Physical(size)) => (
            position.x,
            position.y,
            size.width as f64 / scale,
            size.height as f64 / scale,
        ),
    }
}

fn clamp_panel_height(available_height: f64) -> f64 {
    available_height
        .max(MIN_PANEL_HEIGHT)
        .min(PREFERRED_PANEL_HEIGHT)
}

fn apply_display_safe_panel_height(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
    else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let height = clamp_panel_height(monitor.work_area().size.height as f64 / scale);
    let width = window.inner_size()?.width as f64 / window.scale_factor()?;
    window.set_size(Size::Logical(LogicalSize::new(width, height)))
}

pub fn init(app_handle: &AppHandle) -> tauri::Result<()> {
    let Some(window) = main_window(app_handle) else {
        return Err(tauri::Error::WindowNotFound);
    };

    apply_display_safe_panel_height(&window)?;
    if PANEL_INITIALIZED.load(Ordering::Acquire) {
        return Ok(());
    }

    // Reapplying Windows native styles can interrupt WebView2 focus during launch.
    // Windows native shadows add a second frame around our transparent CSS shell.
    #[cfg(target_os = "windows")]
    window.set_shadow(false)?;

    window.set_always_on_top(!is_pinned())?;
    window.set_skip_taskbar(!is_pinned())?;

    if !PANEL_INITIALIZED.swap(true, Ordering::AcqRel) {
        let handle = app_handle.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if crate::onboarding::can_skip_onboarding(handle.clone()) {
                    hide_panel(&handle);
                }
                return;
            }
            if !matches!(event, WindowEvent::Focused(false)) {
                return;
            }
            #[cfg(target_os = "windows")]
            {
                use windows::Win32::UI::WindowsAndMessaging::{
                    GA_ROOT, GetAncestor, GetForegroundWindow,
                };

                let Some(window) = main_window(&handle) else {
                    return;
                };
                let own_window = match window.hwnd() {
                    Ok(hwnd) => hwnd,
                    Err(error) => {
                        log::warn!("Failed to read panel HWND on focus loss: {error}");
                        return;
                    }
                };
                // WebView2 child focus also queues parent Focused(false) events.
                let foreground = unsafe { GetForegroundWindow() };
                let root = if foreground.0.is_null() {
                    foreground
                } else {
                    unsafe { GetAncestor(foreground, GA_ROOT) }
                };
                if !should_hide_for_foreground(
                    is_pinned(),
                    crate::onboarding::contextual_guide_active(),
                    own_window.0 as usize,
                    foreground.0 as usize,
                    root.0 as usize,
                ) {
                    return;
                }
            }
            #[cfg(not(target_os = "windows"))]
            if !should_hide_on_focus_loss(is_pinned(), crate::onboarding::contextual_guide_active())
            {
                return;
            }
            hide_panel(&handle);
        });
    }
    Ok(())
}

pub fn set_pinned(app_handle: &AppHandle, pinned: bool) -> Result<(), String> {
    let window =
        main_window(app_handle).ok_or_else(|| "Main window is not available".to_string())?;
    let previous = is_pinned();
    if pinned {
        PANEL_PINNED.store(true, Ordering::Release);
    }
    if let Err(error) = window.set_always_on_top(!pinned) {
        PANEL_PINNED.store(previous, Ordering::Release);
        return Err(format!("Failed to update window level: {error}"));
    }
    if let Err(error) = window.set_skip_taskbar(!pinned) {
        let _ = window.set_always_on_top(!previous);
        PANEL_PINNED.store(previous, Ordering::Release);
        return Err(format!("Failed to update taskbar visibility: {error}"));
    }
    if !pinned {
        PANEL_PINNED.store(false, Ordering::Release);
        reposition_panel_from_tray(app_handle);
    }
    Ok(())
}

pub fn hide_panel(app_handle: &AppHandle) {
    if let Some(window) = main_window(app_handle) {
        let _ = window.hide();
    }
}

pub fn show_panel(app_handle: &AppHandle) {
    if crate::onboarding::show_required_setup(app_handle) {
        return;
    }
    let Some(window) = main_window(app_handle) else {
        return;
    };
    if let Err(error) = init(app_handle)
        .and_then(|_| window.show())
        .and_then(|_| window.unminimize())
        .and_then(|_| window.set_focus())
    {
        log::error!("Failed to show panel: {error}");
    }
    reposition_panel_from_tray(app_handle);
}

pub fn reposition_panel_from_tray(app_handle: &AppHandle) {
    if is_pinned() {
        return;
    }
    let Some(tray) = app_handle.tray_by_id("tray") else {
        return;
    };
    match tray.rect() {
        Ok(Some(rect)) => position_panel_at_tray_icon(app_handle, rect.position, rect.size),
        Ok(None) => log::debug!("Tray position is not available yet"),
        Err(error) => log::warn!("Failed to read tray position: {error}"),
    }
}

pub fn toggle_panel(app_handle: &AppHandle) {
    if crate::onboarding::show_required_setup(app_handle) {
        return;
    }
    let Some(window) = main_window(app_handle) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        hide_panel(app_handle);
    } else {
        show_panel(app_handle);
    }
}

pub fn show_panel_from_tray(app_handle: &AppHandle, view: &str) {
    if crate::onboarding::show_required_setup(app_handle) {
        return;
    }
    show_panel(app_handle);
    if let Err(error) = app_handle.emit("tray:navigate", view) {
        log::error!("Failed to navigate tray panel to {view}: {error}");
    }
}

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
        .shadow(!cfg!(target_os = "windows"))
        .transparent(true)
        .center()
        .visible(true)
        .focused(true)
        .build()?;
    Ok(())
}

pub fn close_window_and_show_panel(
    app_handle: &AppHandle,
    label: &str,
    view: &str,
) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window(label) {
        window
            .close()
            .map_err(|error| format!("Failed to close {label} window: {error}"))?;
    }
    show_panel_from_tray(app_handle, view);
    Ok(())
}

pub fn toggle_panel_at_tray_rect(app_handle: &AppHandle, icon_position: Position, icon_size: Size) {
    if crate::onboarding::show_required_setup(app_handle) {
        return;
    }
    let Some(window) = main_window(app_handle) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        hide_panel(app_handle);
        return;
    }
    show_panel(app_handle);
    position_panel_at_tray_icon(app_handle, icon_position, icon_size);
}

pub fn position_panel_at_tray_icon(
    app_handle: &AppHandle,
    icon_position: Position,
    icon_size: Size,
) {
    let Some(window) = main_window(app_handle) else {
        return;
    };
    let (point_x, point_y) = match &icon_position {
        Position::Physical(position) => (position.x as f64, position.y as f64),
        Position::Logical(position) => (position.x, position.y),
    };
    let Ok(Some(monitor)) = window.monitor_from_point(point_x, point_y) else {
        let _ = window.center();
        return;
    };

    let scale = monitor.scale_factor();
    let (icon_x, icon_y, icon_width, icon_height) = logical_rect(&icon_position, &icon_size, scale);
    let work_area = monitor.work_area();
    let work_x = work_area.position.x as f64 / scale;
    let work_y = work_area.position.y as f64 / scale;
    let work_width = work_area.size.width as f64 / scale;
    let work_height = work_area.size.height as f64 / scale;
    let Ok(size) = window.outer_size() else {
        return;
    };
    let panel_width = size.width as f64 / window.scale_factor().unwrap_or(scale);
    let panel_height = size.height as f64 / window.scale_factor().unwrap_or(scale);

    let min_x = work_x + PANEL_EDGE_INSET;
    let max_x = (work_x + work_width - panel_width - PANEL_EDGE_INSET).max(min_x);
    let x = (icon_x + icon_width / 2.0 - panel_width / 2.0).clamp(min_x, max_x);
    let below = icon_y + icon_height + PANEL_GAP;
    let above = icon_y - panel_height - PANEL_GAP;
    let preferred_y = if icon_y > work_y + work_height / 2.0 {
        above
    } else {
        below
    };
    let min_y = work_y + PANEL_EDGE_INSET;
    let max_y = (work_y + work_height - panel_height - PANEL_EDGE_INSET).max(min_y);
    let y = preferred_y.clamp(min_y, max_y);

    if let Err(error) = window.set_position(Position::Logical(LogicalPosition::new(x, y))) {
        log::warn!("Failed to position tray panel: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::{
        MIN_PANEL_HEIGHT, PREFERRED_PANEL_HEIGHT, clamp_panel_height, should_hide_for_foreground,
        should_hide_on_focus_loss,
    };

    #[test]
    fn clamps_panel_height_to_supported_bounds() {
        assert_eq!(clamp_panel_height(1_080.0), PREFERRED_PANEL_HEIGHT);
        assert_eq!(clamp_panel_height(760.0), 760.0);
        assert_eq!(clamp_panel_height(320.0), MIN_PANEL_HEIGHT);
    }

    #[test]
    fn pinned_windows_ignore_focus_loss() {
        assert!(!should_hide_on_focus_loss(true, false));
        assert!(should_hide_on_focus_loss(false, false));
        assert!(!should_hide_on_focus_loss(false, true));
    }

    #[test]
    fn foreground_focus_distinguishes_webview_children_from_other_apps() {
        assert!(!should_hide_for_foreground(true, false, 10, 20, 20));
        assert!(!should_hide_for_foreground(false, false, 10, 10, 10));
        assert!(!should_hide_for_foreground(false, false, 10, 11, 10));
        assert!(!should_hide_for_foreground(false, false, 10, 0, 0));
        assert!(should_hide_for_foreground(false, false, 10, 20, 20));
        assert!(!should_hide_for_foreground(false, true, 10, 20, 20));
    }
}
