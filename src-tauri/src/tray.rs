use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::path::BaseDirectory;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::panel::toggle_panel_at_tray_rect;
use crate::prompt_activity::PromptActivityState;

const MENU_OPEN: &str = "tray_open";
const MENU_QUIT: &str = "tray_quit";
const ACTIVITY_FRAME_COUNT: f64 = 36.0;

#[cfg(any(target_os = "windows", test))]
fn system_theme_is_dark(uses_light_theme: u32) -> Result<bool, String> {
    match uses_light_theme {
        0 => Ok(true),
        1 => Ok(false),
        _ => Err("Windows system appearance has an unsupported value".to_string()),
    }
}

pub fn windows_tray_is_dark() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let result = windows_registry::CURRENT_USER
            .open(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
            .and_then(|key| key.get_u32("SystemUsesLightTheme"))
            .map_err(|error| format!("Couldn't read Windows system appearance: {error}"))
            .and_then(system_theme_is_dark);
        if let Err(error) = &result {
            log::error!("Windows tray appearance check failed: {error}");
        }
        result
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

fn activity_frame_ms(rotation_period_ms: u64) -> u64 {
    ((rotation_period_ms as f64 / ACTIVITY_FRAME_COUNT).round() as u64).max(1)
}

fn should_animate_activity(active: bool, has_icon: bool) -> bool {
    active && has_icon
}

struct ActivityIcon {
    rgba: Vec<u8>,
    width: u32,
    height: u32,
    glyph_x: u32,
    glyph_y: u32,
    glyph_size: u32,
    generation: u64,
}

struct ActivityConfig {
    icon: Option<ActivityIcon>,
    rotation_period_ms: u64,
}

struct ActivityAnimationState {
    config: Mutex<ActivityConfig>,
}

impl Default for ActivityAnimationState {
    fn default() -> Self {
        Self {
            config: Mutex::new(ActivityConfig {
                icon: None,
                rotation_period_ms: 1_200,
            }),
        }
    }
}

fn activity_animation_state() -> &'static Arc<ActivityAnimationState> {
    static STATE: OnceLock<Arc<ActivityAnimationState>> = OnceLock::new();
    STATE.get_or_init(|| Arc::new(ActivityAnimationState::default()))
}

fn rotate_glyph(icon: &ActivityIcon, angle: f64) -> Vec<u8> {
    let mut output = icon.rgba.clone();
    let size = icon
        .glyph_size
        .min(icon.width.saturating_sub(icon.glyph_x))
        .min(icon.height.saturating_sub(icon.glyph_y));
    if size == 0 {
        return output;
    }
    let center_x = f64::from(icon.glyph_x) + (f64::from(size) - 1.0) / 2.0;
    let center_y = f64::from(icon.glyph_y) + (f64::from(size) - 1.0) / 2.0;
    let cos = angle.cos();
    let sin = angle.sin();
    for y in icon.glyph_y..icon.glyph_y + size {
        for x in icon.glyph_x..icon.glyph_x + size {
            let destination = ((y * icon.width + x) * 4) as usize;
            let dx = f64::from(x) - center_x;
            let dy = f64::from(y) - center_y;
            let source_x = (center_x + dx * cos + dy * sin).round() as i32;
            let source_y = (center_y - dx * sin + dy * cos).round() as i32;
            output[destination..destination + 4].fill(0);
            if source_x < i32::try_from(icon.glyph_x).unwrap_or(i32::MAX)
                || source_y < i32::try_from(icon.glyph_y).unwrap_or(i32::MAX)
                || source_x >= i32::try_from(icon.glyph_x + size).unwrap_or(i32::MAX)
                || source_y >= i32::try_from(icon.glyph_y + size).unwrap_or(i32::MAX)
            {
                continue;
            }
            let source = ((source_y as u32 * icon.width + source_x as u32) * 4) as usize;
            output[destination..destination + 4].copy_from_slice(&icon.rgba[source..source + 4]);
        }
    }
    output
}

fn set_native_activity_icon(app_handle: &AppHandle, rgba: Vec<u8>, width: u32, height: u32) {
    let Some(tray) = app_handle.tray_by_id("tray") else {
        return;
    };
    if let Err(error) = tray.set_icon_with_as_template(
        Some(Image::new_owned(rgba, width, height)),
        cfg!(target_os = "macos"),
    ) {
        log::warn!("failed to update animated tray icon: {error}");
    }
}

pub fn set_activity_icon(
    rgba: Vec<u8>,
    width: f64,
    height: f64,
    glyph_x: f64,
    glyph_y: f64,
    glyph_size: f64,
) -> Result<(), String> {
    let width = checked_dimension(width, "width")?;
    let height = checked_dimension(height, "height")?;
    let glyph_x = checked_offset(glyph_x, "glyphX")?;
    let glyph_y = checked_offset(glyph_y, "glyphY")?;
    let glyph_size = checked_dimension(glyph_size, "glyphSize")?;
    if glyph_x >= width || glyph_y >= height {
        return Err("tray activity icon glyph origin is outside the image".to_string());
    }
    let expected_len = usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .map(|height| width * height * 4)
        })
        .ok_or_else(|| "tray activity icon dimensions are too large".to_string())?;
    if rgba.len() != expected_len {
        return Err("tray activity icon RGBA data has the wrong length".to_string());
    }
    let state = activity_animation_state();
    let mut config = state
        .config
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let generation = config
        .icon
        .as_ref()
        .map_or(1, |icon| icon.generation.wrapping_add(1));
    config.icon = Some(ActivityIcon {
        rgba,
        width,
        height,
        glyph_x,
        glyph_y,
        glyph_size,
        generation,
    });
    Ok(())
}

pub fn clear_activity_icon() {
    let state = activity_animation_state();
    let mut config = state
        .config
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    config.icon = None;
}

pub fn set_activity_preferences(rotation_period_ms: f64) -> Result<(), String> {
    if !rotation_period_ms.is_finite() {
        return Err("unsupported tray activity rotation speed".to_string());
    }
    let period = rotation_period_ms.round() as u64;
    if !matches!(period, 800 | 1_200 | 2_000) {
        return Err("unsupported tray activity rotation speed".to_string());
    }
    let state = activity_animation_state();
    let mut config = state
        .config
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    config.rotation_period_ms = period;
    Ok(())
}

fn checked_dimension(value: f64, name: &str) -> Result<u32, String> {
    if !value.is_finite() || value <= 0.0 || value > f64::from(u32::MAX) || value.fract() != 0.0 {
        return Err(format!("tray activity icon {name} is invalid"));
    }
    Ok(value as u32)
}

fn checked_offset(value: f64, name: &str) -> Result<u32, String> {
    if !value.is_finite() || value < 0.0 || value > f64::from(u32::MAX) || value.fract() != 0.0 {
        return Err(format!("tray activity icon {name} is invalid"));
    }
    Ok(value as u32)
}

pub fn start_activity_animation(app_handle: AppHandle, prompt_activity: Arc<PromptActivityState>) {
    let state = Arc::clone(activity_animation_state());
    std::thread::spawn(move || {
        let mut angle = 0.0;
        let mut last_generation = 0;
        let mut was_animating = false;
        loop {
            let activity = prompt_activity.snapshot();
            let (icon, period) = {
                let config = state
                    .config
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                (
                    config.icon.as_ref().map(|icon| ActivityIcon {
                        rgba: icon.rgba.clone(),
                        width: icon.width,
                        height: icon.height,
                        glyph_x: icon.glyph_x,
                        glyph_y: icon.glyph_y,
                        glyph_size: icon.glyph_size,
                        generation: icon.generation,
                    }),
                    config.rotation_period_ms,
                )
            };

            let should_animate = should_animate_activity(activity.active, icon.is_some());
            if !should_animate {
                if was_animating {
                    if let Some(icon) = icon {
                        set_native_activity_icon(&app_handle, icon.rgba, icon.width, icon.height);
                    }
                    was_animating = false;
                    angle = 0.0;
                }
                std::thread::sleep(Duration::from_millis(80));
                continue;
            }

            let icon = icon.expect("animated tray icon is present");
            if icon.generation != last_generation {
                angle = 0.0;
                last_generation = icon.generation;
            }
            set_native_activity_icon(
                &app_handle,
                rotate_glyph(&icon, angle),
                icon.width,
                icon.height,
            );
            was_animating = true;
            angle = (angle + std::f64::consts::TAU / ACTIVITY_FRAME_COUNT) % std::f64::consts::TAU;
            std::thread::sleep(Duration::from_millis(activity_frame_ms(period)));
        }
    });
}

#[derive(Debug, PartialEq, Eq)]
enum TrayMenuAction {
    Show,
    Quit,
}

fn tray_menu_action(id: &str) -> Option<TrayMenuAction> {
    match id {
        MENU_OPEN => Some(TrayMenuAction::Show),
        MENU_QUIT => Some(TrayMenuAction::Quit),
        _ => None,
    }
}

#[cfg(test)]
#[test]
fn open_menu_is_an_idempotent_show_action() {
    assert_eq!(tray_menu_action(MENU_OPEN), Some(TrayMenuAction::Show));
    assert_eq!(tray_menu_action(MENU_QUIT), Some(TrayMenuAction::Quit));
    assert_eq!(tray_menu_action("unrelated"), None);
}

fn build_tray_menu(app_handle: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open_item = MenuItem::with_id(
        app_handle,
        MENU_OPEN,
        "Open One More Prompt",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app_handle)?;
    let quit_item = MenuItem::with_id(
        app_handle,
        MENU_QUIT,
        "Quit One More Prompt",
        true,
        None::<&str>,
    )?;

    Menu::with_items(app_handle, &[&open_item, &separator, &quit_item])
}

fn show_tray_context_menu(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        return;
    };
    let menu = match build_tray_menu(app_handle) {
        Ok(menu) => menu,
        Err(error) => {
            log::warn!("failed to build tray context menu: {error}");
            return;
        }
    };
    if let Err(error) = window.popup_menu(&menu) {
        log::warn!("failed to show tray context menu: {error}");
    }
}

pub fn create(app_handle: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "windows")]
    let tray_icon_resource = "icons/icon.png";
    #[cfg(not(target_os = "windows"))]
    let tray_icon_resource = "icons/tray-icon.png";
    let tray_icon_path = app_handle
        .path()
        .resolve(tray_icon_resource, BaseDirectory::Resource)?;
    let icon = Image::from_path(tray_icon_path)?;

    app_handle.on_menu_event(|app_handle, event| match tray_menu_action(event.id.as_ref()) {
        Some(TrayMenuAction::Show) => crate::panel::show_panel(app_handle),
        Some(TrayMenuAction::Quit) => app_handle.exit(0),
        None => {}
    });

    TrayIconBuilder::with_id("tray")
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("One More Prompt")
        .on_tray_icon_event(|tray, event| {
            let app_handle = tray.app_handle();

            if let TrayIconEvent::Click {
                button,
                button_state,
                rect,
                ..
            } = event
            {
                if button_state != MouseButtonState::Up {
                    return;
                }

                match button {
                    MouseButton::Left => {
                        log::info!("tray click: button=Left");
                        toggle_panel_at_tray_rect(app_handle, rect.position, rect.size);
                    }
                    MouseButton::Right => {
                        log::info!("tray click: button=Right");
                        show_tray_context_menu(app_handle);
                    }
                    _ => {}
                }
            }
        })
        .build(app_handle)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        ActivityIcon, activity_frame_ms, rotate_glyph, set_activity_preferences,
        should_animate_activity, system_theme_is_dark,
    };

    #[test]
    fn windows_tray_appearance_accepts_only_defined_system_values() {
        assert_eq!(system_theme_is_dark(0), Ok(true));
        assert_eq!(system_theme_is_dark(1), Ok(false));
        assert!(system_theme_is_dark(2).is_err());
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn windows_tray_appearance_is_inactive_on_other_platforms() {
        assert_eq!(super::windows_tray_is_dark(), Ok(false));
    }

    #[test]
    fn activity_animation_uses_the_requested_speed() {
        assert_eq!(activity_frame_ms(800), 22);
        assert_eq!(activity_frame_ms(1_200), 33);
        assert_eq!(activity_frame_ms(2_000), 56);
    }

    #[test]
    fn activity_animation_requires_an_active_prompt_and_an_icon() {
        assert!(should_animate_activity(true, true));
        assert!(!should_animate_activity(false, true));
        assert!(!should_animate_activity(true, false));
        assert!(!should_animate_activity(false, false));
    }

    #[test]
    fn activity_preferences_accept_only_supported_rotation_periods() {
        for period in [800.0, 1_200.0, 2_000.0] {
            assert!(set_activity_preferences(period).is_ok());
        }
        for period in [0.0, 799.0, 1_201.0, f64::INFINITY, f64::NAN] {
            assert!(set_activity_preferences(period).is_err());
        }
    }

    #[test]
    fn rotating_the_glyph_keeps_the_numeric_title_pixels_stationary() {
        let width = 8;
        let height = 4;
        let glyph_size = 4;
        let rgba: Vec<u8> = (0..(width * height))
            .flat_map(|pixel| [pixel as u8, 0, 0, 255])
            .collect();
        let icon = ActivityIcon {
            rgba: rgba.clone(),
            width,
            height,
            glyph_x: 2,
            glyph_y: 0,
            glyph_size,
            generation: 1,
        };

        let rotated = rotate_glyph(&icon, std::f64::consts::FRAC_PI_2);
        for y in 0..height {
            for x in 0..width {
                let offset = ((y * width + x) * 4) as usize;
                if x < 2 || x >= 2 + glyph_size {
                    assert_eq!(&rotated[offset..offset + 4], &rgba[offset..offset + 4]);
                }
            }
        }
        assert_ne!(
            rotated[2 * 4..(2 + glyph_size) as usize * 4],
            rgba[2 * 4..(2 + glyph_size) as usize * 4]
        );
    }
}
