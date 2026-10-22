use std::io::Read;
use std::time::Duration;

use semver::Version;
use serde::{Deserialize, Serialize};
use specta::Type;

const RELEASE_ENDPOINT: &str =
    "https://api.github.com/repos/alanchill-dev/one-more-prompt/releases/latest";
const RELEASE_BASE: &str = "https://github.com/alanchill-dev/one-more-prompt/releases";
const MAX_RESPONSE_BYTES: u64 = 1_048_576;

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AppUpdateStatus {
    UpToDate,
    Available,
    NotPublished,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateCheck {
    pub status: AppUpdateStatus,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub release_url: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
    published_at: Option<String>,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: f64,
    state: String,
}

#[tauri::command]
#[specta::specta]
pub async fn check_app_update(app: tauri::AppHandle) -> Result<AppUpdateCheck, String> {
    let current_version = app.package_info().version.to_string();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fetch_release(RELEASE_ENDPOINT, &current_version, std::env::consts::OS)
    })
    .await
    .map_err(|_| "The update check could not finish. Try again.".to_string())?;
    if let Err(error) = &result {
        log::warn!("[app-update] {error}");
    }
    result
}

fn fetch_release(endpoint: &str, current: &str, platform: &str) -> Result<AppUpdateCheck, String> {
    let mut builder = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(format!("One-More-Prompt/{current}"));
    if let Some(proxy) = crate::config::get_resolved_proxy() {
        builder = builder.proxy(proxy.proxy.clone());
    }
    let response = builder
        .build()
        .map_err(|_| "Could not prepare the update check.".to_string())?
        .get(endpoint)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2026-03-10")
        .send()
        .map_err(|_| "Could not reach GitHub. Check your connection and try again.".to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(AppUpdateCheck {
            status: AppUpdateStatus::NotPublished,
            current_version: current.to_string(),
            latest_version: None,
            download_url: None,
            release_url: None,
            published_at: None,
        });
    }
    if !response.status().is_success() {
        return Err(format!(
            "GitHub returned HTTP {}. Try checking for updates later.",
            response.status().as_u16()
        ));
    }
    let mut body = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut body)
        .map_err(|_| "Could not read GitHub's update response.".to_string())?;
    if body.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("GitHub's update response was too large.".to_string());
    }
    let release: Release = serde_json::from_slice(&body)
        .map_err(|_| "GitHub returned an invalid update response.".to_string())?;
    evaluate_release(release, current, platform)
}

fn evaluate_release(
    release: Release,
    current: &str,
    platform: &str,
) -> Result<AppUpdateCheck, String> {
    let latest = Version::parse(
        release
            .tag_name
            .strip_prefix('v')
            .unwrap_or(&release.tag_name),
    )
    .map_err(|_| "The release has an invalid version number.".to_string())?;
    let installed = Version::parse(current)
        .map_err(|_| "The installed app has an invalid version number.".to_string())?;
    if release.draft
        || release.prerelease
        || !latest.pre.is_empty()
        || release.published_at.is_none()
    {
        return Err("The update response is not a published stable release.".to_string());
    }
    let release_url = format!("{RELEASE_BASE}/tag/{}", release.tag_name);
    if release.html_url != release_url {
        return Err("The release link does not belong to One More Prompt.".to_string());
    }
    let is_newer = latest.cmp_precedence(&installed).is_gt();
    let download_url = if is_newer {
        let package_name = match platform {
            "macos" => format!("One-More-Prompt-{latest}.dmg"),
            "windows" => format!("One-More-Prompt-{latest}-windows-x64-portable.zip"),
            _ => return Err("No update package is available for this platform.".to_string()),
        };
        let asset = release
            .assets
            .iter()
            .find(|asset| {
                asset.name == package_name && asset.state == "uploaded" && asset.size > 0.0
            })
            .ok_or_else(|| {
                "The release package is not ready for this platform. Try again later.".to_string()
            })?;
        let expected_url = format!(
            "{RELEASE_BASE}/download/{}/{package_name}",
            release.tag_name
        );
        if asset.browser_download_url != expected_url {
            return Err("The download link does not belong to One More Prompt.".to_string());
        }
        Some(asset.browser_download_url.clone())
    } else {
        None
    };
    Ok(AppUpdateCheck {
        status: if is_newer {
            AppUpdateStatus::Available
        } else {
            AppUpdateStatus::UpToDate
        },
        current_version: current.to_string(),
        latest_version: Some(latest.to_string()),
        download_url,
        release_url: Some(release_url),
        published_at: release.published_at,
    })
}

#[cfg(test)]
#[path = "app_update_tests.rs"]
mod tests;
