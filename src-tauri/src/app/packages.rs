//! Export and import of `.bubble` packages (spec §9.4). The windows build the branch and
//! merge it into the draft; the core writes and reads the ZIP and keeps the assets.

use std::path::Path;
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

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

/// Core → app window: a `.bubble` file was opened (double click in Explorer).
pub const OPEN_EVENT: &str = "bv://open-package";

/// The `.bubble` file BubbleVerse was started with, until the app window asks for it.
static STARTUP: Mutex<Option<String>> = Mutex::new(None);

/// The first `.bubble` file in command line arguments.
pub fn package_arg(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".bubble"))
        .cloned()
}

/// Remembers the file of this start; the app window picks it up after it loaded.
pub fn remember_startup(args: &[String]) {
    if let Some(p) = package_arg(args) {
        *STARTUP.lock().unwrap_or_else(|e| e.into_inner()) = Some(p);
    }
}

pub fn open_package(app: &AppHandle, path: String) {
    let _ = app.emit_to(super::windows::MAIN, OPEN_EVENT, path);
}

#[tauri::command]
pub fn startup_package() -> Option<String> {
    STARTUP.lock().unwrap_or_else(|e| e.into_inner()).take()
}
