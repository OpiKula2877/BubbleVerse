//! IPC commands the windows call (spec §8.4).

use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

use super::state::{events, AppState, Layout};
use super::{autostart, tray, windows};
use crate::error::{AppError, AppResult};
use crate::os::launch;
use crate::script::runtime::RunningScript;
use crate::storage::assets::AssetInfo;
use crate::storage::settings::{self, Settings};
use crate::storage::world_store::{self, BackupInfo, WorldDoc};
use crate::storage::{kv, migrate};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub window: String,
    pub version: String,
    pub settings: Settings,
    pub layout: Layout,
    pub published: Value,
    pub draft: Option<WorldDoc>,
    pub paused: bool,
    pub db_damaged: bool,
}

#[tauri::command]
pub fn bootstrap(window: WebviewWindow, state: State<'_, AppState>) -> AppResult<Bootstrap> {
    Ok(Bootstrap {
        window: window.label().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        settings: state.settings(),
        layout: state.layout(),
        published: (*state.published()).clone(),
        draft: world_store::load(&state.db(), world_store::DRAFT)?,
        paused: state.paused(),
        db_damaged: state.db_damaged,
    })
}

/// Autosave of the draft (spec §4.7).
#[tauri::command]
pub fn save_draft(world: Value, state: State<'_, AppState>) -> AppResult<i64> {
    world_store::save_draft(&state.db(), &world)
}

#[tauri::command]
pub fn discard_draft(state: State<'_, AppState>) -> AppResult<()> {
    world_store::discard_draft(&state.db())
}

/// Save: the draft becomes the published version, triggers re-register, a backup is made.
#[tauri::command]
pub fn publish(world: Value, state: State<'_, AppState>) -> AppResult<i64> {
    let world = migrate::migrate_world(world)?;
    let bytes = world_store::publish(&mut state.db(), &world)?;
    let keep = state.settings().data.backups as usize;
    world_store::write_backup(&state.paths.backups(), &bytes, keep)?;
    state.install_published(world);
    if let Err(e) = state.collect_garbage() {
        log::warn!("asset cleanup failed: {e}");
    }
    Ok(world_store::now_ms())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn set_settings(settings: Settings, app: AppHandle) -> AppResult<Settings> {
    apply_settings(&app, settings)
}

/// Stores settings and applies their side effects (autostart, tray language, window placement).
pub fn apply_settings(app: &AppHandle, next: Settings) -> AppResult<Settings> {
    let state = app.state::<AppState>();
    let next = next.normalized();
    let prev = state.settings();
    settings::save(&state.db(), &next)?;
    if let Ok(mut s) = state.settings.write() {
        *s = next.clone();
    }
    if prev.general.autostart != next.general.autostart {
        autostart::sync(next.general.autostart)?;
    }
    if prev.general.language != next.general.language
        || prev.general.wallpaper != next.general.wallpaper
    {
        tray::refresh(app);
    }
    if prev.general.primary_monitor != next.general.primary_monitor {
        windows::refresh_layout(app);
    }
    if prev.general.cover_taskbar != next.general.cover_taskbar && !state.windowed {
        if let Some(w) = app.get_webview_window(windows::MAIN) {
            let focused = w.is_focused().unwrap_or(false);
            let _ = crate::os::window_span::set_topmost(&w, next.general.cover_taskbar && focused);
        }
    }
    let _ = app.emit(events::SETTINGS, &next);
    Ok(next)
}

#[tauri::command]
pub fn get_layout(state: State<'_, AppState>) -> Layout {
    state.layout()
}

/// "Bubble activated": click in the app or Enter in search.
#[tauri::command]
pub fn activate(id: String, state: State<'_, AppState>) -> AppResult<usize> {
    let started = state.runtime.activate(&id)?;
    let _ = kv::bump_usage(&state.db(), &id);
    Ok(started)
}

#[tauri::command]
pub async fn import_asset(path: String, app: AppHandle) -> AppResult<AssetInfo> {
    let store = app.state::<AppState>().assets.clone();
    tauri::async_runtime::spawn_blocking(move || store.import_file(&PathBuf::from(path)))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Path check: which action targets exist (spec §4.5).
#[tauri::command]
pub async fn check_targets(targets: Vec<String>) -> Vec<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        targets.iter().map(|t| launch::target_exists(t)).collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub fn hide_main(app: AppHandle) {
    windows::hide_main(&app);
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn set_paused(paused: bool, app: AppHandle) {
    app.state::<AppState>().set_paused(paused);
    tray::refresh(&app);
}

#[tauri::command]
pub fn running_scripts(state: State<'_, AppState>) -> Vec<RunningScript> {
    state.runtime.running()
}

#[tauri::command]
pub fn stop_script(id: u64, state: State<'_, AppState>) {
    state.runtime.stop_task(id);
}

#[tauri::command]
pub fn stop_all_scripts(state: State<'_, AppState>) {
    state.runtime.stop_all();
}

#[tauri::command]
pub fn search_history(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    kv::history(&state.db())
}

#[tauri::command]
pub fn push_history(text: String, state: State<'_, AppState>) -> AppResult<()> {
    kv::push_history(&state.db(), &text)
}

#[tauri::command]
pub fn usage_counts(
    state: State<'_, AppState>,
) -> AppResult<std::collections::HashMap<String, i64>> {
    kv::usage(&state.db())
}

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> AppResult<Vec<BackupInfo>> {
    world_store::list_backups(&state.paths.backups())
}

/// Restores a backup as the published version (and drops the draft).
#[tauri::command]
pub fn restore_backup(file: String, state: State<'_, AppState>) -> AppResult<()> {
    let world = world_store::read_backup(&state.paths.backups(), &file)?;
    world_store::publish(&mut state.db(), &world)?;
    state.install_published(world);
    Ok(())
}

#[tauri::command]
pub fn run_action(action: String, app: AppHandle) {
    super::shortcuts::run_action(&app, &action);
}
