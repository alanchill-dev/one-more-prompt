use std::path::{Path, PathBuf};

use tauri::Manager;

pub const FILE_NAME: &str = "one-more-prompt";

pub fn for_app(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_log_dir()
        .map(|dir| log_file_path(&dir))
        .map_err(|error| error.to_string())
}

fn log_file_path(log_dir: &Path) -> PathBuf {
    log_dir.join(FILE_NAME).with_extension("log")
}

#[cfg(test)]
mod tests {
    use super::log_file_path;
    use std::path::PathBuf;

    #[test]
    fn builds_log_file_path_from_log_dir() {
        let path = log_file_path(&PathBuf::from("/logs/one-more-prompt"));

        assert_eq!(
            path,
            PathBuf::from("/logs/one-more-prompt/one-more-prompt.log")
        );
    }
}
