//! Settings → Data (spec §7.5): where the data is, its size, unused assets, moving the data.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::state::AppState;
use crate::error::{AppError, AppResult};
use crate::os::launch;
use crate::paths::{Paths, LOCATION_FILE};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataInfo {
    pub dir: String,
    pub db_bytes: u64,
    pub assets_bytes: u64,
    pub backups_bytes: u64,
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .map(|e| {
            let p = e.path();
            if p.is_dir() {
                dir_size(&p)
            } else {
                e.metadata().map(|m| m.len()).unwrap_or(0)
            }
        })
        .sum()
}

#[tauri::command]
pub fn data_info(state: State<'_, AppState>) -> DataInfo {
    let p = &state.paths;
    let db = ["data.db", "data.db-wal", "data.db-shm"]
        .iter()
        .filter_map(|f| std::fs::metadata(p.root.join(f)).ok())
        .map(|m| m.len())
        .sum();
    DataInfo {
        dir: p.root.display().to_string(),
        db_bytes: db,
        assets_bytes: state.assets.total_size(),
        backups_bytes: dir_size(&p.backups()),
    }
}

#[tauri::command]
pub fn open_data_folder(state: State<'_, AppState>) -> AppResult<()> {
    launch::open_folder(&state.paths.root.display().to_string())
}

/// Deletes assets nothing uses any more (backups keep theirs); returns how many went.
#[tauri::command]
pub fn clean_assets(state: State<'_, AppState>) -> AppResult<usize> {
    state.collect_garbage()
}

fn copy_dir(from: &Path, to: &Path) -> AppResult<()> {
    std::fs::create_dir_all(to)?;
    for e in std::fs::read_dir(from)?.flatten() {
        let src = e.path();
        let dst = to.join(e.file_name());
        if src.is_dir() {
            copy_dir(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst)?;
        }
    }
    Ok(())
}

/// Copies the data into another (empty) folder, points the app to it and restarts.
/// The old folder stays as it is: nothing of the user's is deleted.
#[tauri::command]
pub fn move_data(dir: String, app: AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let target = PathBuf::from(launch::expand_env(dir.trim()));
    if target == state.paths.root {
        return Ok(());
    }
    if target.exists()
        && std::fs::read_dir(&target)
            .map(|mut d| d.next().is_some())
            .unwrap_or(true)
    {
        return Err(AppError::msg("dataFolderNotEmpty"));
    }
    let target_paths = Paths::new(target.clone())?;
    // A consistent copy of the database even while it is open.
    state
        .db()
        .conn
        .execute("VACUUM INTO ?1", [target_paths.db().display().to_string()])?;
    copy_dir(&state.paths.assets(), &target_paths.assets())?;
    copy_dir(&state.paths.backups(), &target_paths.backups())?;
    let standard = Paths::standard_root()?;
    std::fs::create_dir_all(&standard)?;
    std::fs::write(standard.join(LOCATION_FILE), target.display().to_string())?;
    app.restart();
}

/// Theme files (`.bvtheme`, spec §7.2) are small JSON files; nothing else is written or read.
fn theme_path(path: &str) -> AppResult<PathBuf> {
    let p = PathBuf::from(path.trim());
    let ok = p
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("bvtheme"));
    if ok {
        Ok(p)
    } else {
        Err(AppError::msg("themeFile"))
    }
}

#[tauri::command]
pub fn write_theme_file(path: String, text: String) -> AppResult<()> {
    Ok(std::fs::write(theme_path(&path)?, text)?)
}

#[tauri::command]
pub fn read_theme_file(path: String) -> AppResult<String> {
    let p = theme_path(&path)?;
    if std::fs::metadata(&p)?.len() > 1 << 20 {
        return Err(AppError::msg("themeFile"));
    }
    Ok(std::fs::read_to_string(p)?)
}
