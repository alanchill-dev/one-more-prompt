use std::fs;
use std::io;
use std::path::Path;

pub(super) fn list_directory(path: &Path) -> io::Result<Vec<String>> {
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
            ) =>
        {
            return Ok(Vec::new());
        }
        Err(error) => return Err(error),
    };
    sorted_names(
        entries.map(|entry| entry.map(|entry| entry.file_name().to_string_lossy().into_owned())),
    )
}

fn sorted_names(entries: impl Iterator<Item = io::Result<String>>) -> io::Result<Vec<String>> {
    // A partial listing must not be mistaken for a complete, smaller history.
    let mut names = entries.collect::<io::Result<Vec<_>>>()?;
    names.retain(|name| !name.is_empty());
    names.sort();
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorts_a_complete_listing_and_treats_missing_or_file_leaves_as_empty() {
        let root = std::env::temp_dir().join(format!("omp-list-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("z.jsonl"), "synthetic").unwrap();
        fs::create_dir(root.join("a")).unwrap();
        assert_eq!(list_directory(&root).unwrap(), ["a", "z.jsonl"]);
        assert!(list_directory(&root.join("missing")).unwrap().is_empty());
        assert!(list_directory(&root.join("z.jsonl")).unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn never_returns_a_partial_list_after_permission_or_io_entry_failures() {
        for kind in [io::ErrorKind::PermissionDenied, io::ErrorKind::Other] {
            let entries = vec![
                Ok("first.jsonl".into()),
                Err(io::Error::new(kind, "synthetic enumeration failure")),
                Ok("last.jsonl".into()),
            ];
            assert_eq!(sorted_names(entries.into_iter()).unwrap_err().kind(), kind);
        }
    }
}
