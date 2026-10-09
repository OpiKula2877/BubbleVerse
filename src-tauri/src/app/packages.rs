//! Export and import of `.bubble` packages (spec §9.4). The windows build the branch and
//! merge it into the draft; the core writes and reads the ZIP and keeps the assets.

use std::path::Path;

use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::generator::blocking;
use super::state::AppState;
use crate::error::AppResult;
use crate::storage::package::{self, ReadPackage};

/// Writes a package; returns how many assets went into it.
#[tauri::command]
pub async fn export_package(
    path: String,
    manifest: Value,
    branch: Value,
    app: AppHandle,
) -> AppResult<usize> {
    blocking(move || {
        package::write(
            Path::new(&path),
            &manifest,
            &branch,
            &app.state::<AppState>().assets,
        )
    })
    .await
}

/// Reads a package for the import preview; its assets go into the store right away.
#[tauri::command]
pub async fn import_package(path: String, app: AppHandle) -> AppResult<ReadPackage> {
    blocking(move || package::read(Path::new(&path), &app.state::<AppState>().assets)).await
}
