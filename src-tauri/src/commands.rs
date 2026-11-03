use serde::Serialize;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

// ─── Read File ──────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ReadFileResult {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub lines: usize,
}

#[tauri::command]
pub async fn tool_read_file(path: String) -> Result<ReadFileResult, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    if !p.is_file() {
        return Err(format!("Not a file: {}", path));
    }

    let content = fs::read_to_string(&p).map_err(|e| format!("Failed to read file: {}", e))?;
    let metadata = fs::metadata(&p).map_err(|e| format!("Failed to get metadata: {}", e))?;
    let lines = content.lines().count();

    Ok(ReadFileResult {
        path: path.clone(),
        content,
        size: metadata.len(),
        lines,
    })
}

// ─── List Files ─────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub depth: usize,
}

#[derive(Serialize)]
pub struct ListFilesResult {
    pub path: String,
    pub entries: Vec<FileEntry>,
    pub total: usize,
    pub truncated: bool,
}

#[tauri::command]
pub async fn tool_list_files(path: String, recursive: Option<bool>) -> Result<ListFilesResult, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Directory not found: {}", path));
    }
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let is_recursive = recursive.unwrap_or(false);
    let base_depth = p.components().count();
    let mut entries = Vec::new();

    if is_recursive {
        for entry in WalkDir::new(&p).max_depth(10).into_iter().filter_map(|e| e.ok()) {
            let depth = entry.depth();
            let entry_path = entry.path();
            let name = entry_path.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            // Skip hidden files/dirs
            if name.starts_with('.') { continue; }

            let meta = entry.metadata().ok();
            let is_dir = entry.file_type().is_dir();
            let size = meta.map(|m| m.len()).unwrap_or(0);

            entries.push(FileEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir,
                size,
                depth,
            });
        }
    } else {
        if let Ok(read_dir) = fs::read_dir(&p) {
            for entry in read_dir.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') { continue; }

                let meta = entry.metadata().ok();
                let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                let size = meta.map(|m| m.len()).unwrap_or(0);

                entries.push(FileEntry {
                    name,
                    path: entry.path().to_string_lossy().to_string(),
                    is_dir,
                    size,
                    depth: 1,
                });
            }
        }
    }

    // Sort: dirs first, then alphabetical
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    // Limit results to prevent context overflow
    let total_before = entries.len();
    entries.truncate(100);
    let truncated = total_before > 100;

    let total = entries.len();

    Ok(ListFilesResult {
        path: path.clone(),
        entries,
        total,
        truncated,
    })
}

// ─── Search Code ────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SearchMatch {
    pub file: String,
    pub line: usize,
    pub content: String,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub query: String,
    pub matches: Vec<SearchMatch>,
    pub total_files: usize,
    pub total_matches: usize,
}

#[tauri::command]
pub async fn tool_search_code(
    query: String,
    path: Option<String>,
    file_pattern: Option<String>,
) -> Result<SearchResult, String> {
    let search_path = path.unwrap_or_else(|| ".".to_string());
    let p = Path::new(&search_path);
    if !p.exists() {
        return Err(format!("Path not found: {}", search_path));
    }

    let pattern = file_pattern.unwrap_or_else(|| "*".to_string());
    let mut matches = Vec::new();
    let mut files_searched = 0;

    let walker = if p.is_dir() {
        WalkDir::new(&p).max_depth(20).into_iter()
    } else {
        WalkDir::new(&p).max_depth(1).into_iter()
    };

    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() { continue; }

        let name = entry.file_name().to_string_lossy();
        if name.starts_with('.') { continue; }

        // Simple glob matching for common patterns
        if pattern != "*" {
            let name_str = name.to_string();
            let ext = Path::new(&name_str)
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();
            let pattern_ext = pattern.trim_start_matches("*.");
            if ext != pattern_ext { continue; }
        }

        // Skip binary / large files
        let meta = entry.metadata().ok();
        if meta.as_ref().map(|m| m.len()).unwrap_or(0) > 1_000_000 { continue; }

        let content = match fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };

        files_searched += 1;

        for (i, line) in content.lines().enumerate() {
            if line.contains(&query) {
                matches.push(SearchMatch {
                    file: entry.path().to_string_lossy().to_string(),
                    line: i + 1,
                    content: line.trim().to_string(),
                });
                if matches.len() >= 50 { break; }
            }
        }
        if matches.len() >= 50 { break; }
    }

    let total_matches = matches.len();

    Ok(SearchResult {
        query,
        matches,
        total_files: files_searched,
        total_matches,
    })
}

// ─── Edit File ──────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct EditFileResult {
    pub path: String,
    pub old_text: String,
    pub new_text: String,
    pub replaced: bool,
}

#[tauri::command]
pub async fn tool_edit_file(
    path: String,
    old_text: String,
    new_text: String,
) -> Result<EditFileResult, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    if !p.is_file() {
        return Err(format!("Not a file: {}", path));
    }

    let content = fs::read_to_string(&p).map_err(|e| format!("Failed to read file: {}", e))?;

    if !content.contains(&old_text) {
        return Err(format!("old_text not found in file: {}", path));
    }

    let new_content = content.replacen(&old_text, &new_text, 1);

    fs::write(&p, &new_content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(EditFileResult {
        path: path.clone(),
        old_text,
        new_text,
        replaced: true,
    })
}

// ─── Write File ─────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct WriteFileResult {
    pub path: String,
    pub bytes_written: usize,
    pub is_new: bool,
}

#[tauri::command]
pub async fn tool_write_file(path: String, content: String) -> Result<WriteFileResult, String> {
    let p = Path::new(&path);

    // Create parent directories if needed
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
        }
    }

    let is_new = !p.exists();

    fs::write(&p, &content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(WriteFileResult {
        path: path.clone(),
        bytes_written: content.len(),
        is_new,
    })
}
