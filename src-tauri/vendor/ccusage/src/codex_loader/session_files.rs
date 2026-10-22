use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{cli_error, Result};

pub(crate) fn collect_codex_files(dir: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(cli_error(format!(
                "Failed to list Codex sessions {}: {error}",
                dir.display()
            )))
        }
    };
    for entry in entries {
        let entry = entry.map_err(|error| {
            cli_error(format!(
                "Failed to list Codex sessions {}: {error}",
                dir.display()
            ))
        })?;
        let path = entry.path();
        let kind = entry.file_type().map_err(|error| {
            cli_error(format!(
                "Failed to inspect Codex session {}: {error}",
                path.display()
            ))
        })?;
        if kind.is_dir() {
            collect_codex_files(&path, files)?;
        } else if kind.is_file()
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with(".jsonl") || name.ends_with(".jsonl.zst"))
        {
            files.push(path);
        }
    }
    Ok(())
}
