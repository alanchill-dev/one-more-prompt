use std::ffi::OsString;
use tauri::{AppHandle, Manager};

pub const BACKGROUND_ARG: &str = "--background";

#[derive(Debug, PartialEq, Eq)]
enum LaunchTarget {
    Background,
    Setup,
    ReleaseNotes,
    Workspace,
}

fn launch_target(
    background: bool,
    setup_required: bool,
    setup_open: bool,
    notes_open: bool,
) -> LaunchTarget {
    if setup_required {
        LaunchTarget::Setup
    } else if background {
        LaunchTarget::Background
    } else if setup_open {
        LaunchTarget::Setup
    } else if notes_open {
        LaunchTarget::ReleaseNotes
    } else {
        LaunchTarget::Workspace
    }
}

pub fn handle_launch(app_handle: &AppHandle, args: impl Iterator<Item = OsString>) {
    let target = launch_target(
        args.into_iter().any(|arg| arg == BACKGROUND_ARG),
        !crate::onboarding::is_onboarding_completed(app_handle),
        app_handle.get_webview_window("setup").is_some(),
        app_handle.get_webview_window("whats-new").is_some(),
    );
    match target {
        LaunchTarget::Background => {}
        LaunchTarget::Workspace => crate::panel::show_panel(app_handle),
        LaunchTarget::Setup | LaunchTarget::ReleaseNotes => {
            let label = if target == LaunchTarget::Setup {
                "setup"
            } else {
                "whats-new"
            };
            if let Some(window) = app_handle.get_webview_window(label) {
                if let Err(error) = window
                    .show()
                    .and_then(|_| window.unminimize())
                    .and_then(|_| window.set_focus())
                {
                    log::error!("Failed to reveal {label} window: {error}");
                }
            } else if target == LaunchTarget::Setup {
                crate::onboarding::show_required_setup(app_handle);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{LaunchTarget, launch_target};

    #[test]
    fn manual_launch_reveals_workspace_without_toggling() {
        assert_eq!(
            launch_target(false, false, false, false),
            LaunchTarget::Workspace
        );
    }

    #[test]
    fn first_setup_is_required_even_for_login_launches() {
        for background in [false, true] {
            assert_eq!(
                launch_target(background, true, false, false),
                LaunchTarget::Setup
            );
        }
    }

    #[test]
    fn completed_setup_allows_release_notes_without_finishing_the_optional_guide() {
        assert_eq!(
            launch_target(false, false, false, true),
            LaunchTarget::ReleaseNotes
        );
    }

    #[test]
    fn replay_and_release_notes_keep_manual_launch_focus() {
        assert_eq!(launch_target(false, false, true, true), LaunchTarget::Setup);
        assert_eq!(
            launch_target(false, false, false, true),
            LaunchTarget::ReleaseNotes
        );
    }

    #[test]
    fn completed_login_launch_keeps_existing_windows_untouched() {
        for (setup, notes) in [(false, false), (true, false), (false, true)] {
            assert_eq!(
                launch_target(true, false, setup, notes),
                LaunchTarget::Background
            );
        }
    }
}
