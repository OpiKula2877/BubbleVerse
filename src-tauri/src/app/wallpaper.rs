//! The wallpaper window: shown under the desktop icons while the setting is on (spec §2.2),
//! asleep while the app window covers it, with a static Windows wallpaper as fallback (§11).

use std::sync::Mutex;

use ::windows::Win32::Foundation::HWND;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::state::AppState;
use crate::error::{AppError, AppResult};
use crate::os::wallpaper::{self, DesktopLayer};
use crate::os::window_span;
use crate::storage::kv;

pub const WALLPAPER: &str = "wallpaper";
const META_ORIGINAL: &str = "wallpaper.original";

pub mod events {
    pub const SLEEP: &str = "bv://wallpaper-sleep";
    pub const SNAPSHOT: &str = "bv://wallpaper-snapshot";
    pub const STATUS: &str = "bv://wallpaper-status";
}

/// How the wallpaper is shown right now.
#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    #[default]
    Off,
    /// Live under the desktop icons.
    Live,
    /// Attaching failed; a snapshot is set as the normal Windows wallpaper.
    Fallback,
}

static LAYER: Mutex<Option<DesktopLayer>> = Mutex::new(None);
static STATUS: Mutex<Status> = Mutex::new(Status::Off);

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn status() -> Status {
    *lock(&STATUS)
}

fn set_status(app: &AppHandle, s: Status) {
    *lock(&STATUS) = s;
    let _ = app.emit(events::STATUS, s);
}

fn create(app: &AppHandle) -> AppResult<WebviewWindow> {
    Ok(WebviewWindowBuilder::new(
        app,
        WALLPAPER,
        WebviewUrl::App("wallpaper/index.html".into()),
    )
    .title("BubbleVerse wallpaper")
    .visible(false)
    .focused(false)
    .decorations(false)
    .shadow(false)
    .skip_taskbar(true)
    .resizable(false)
    .build()?)
}

fn hwnd(w: &WebviewWindow) -> AppResult<HWND> {
    Ok(HWND(w.hwnd()?.0))
}

/// Attaches the window under the icons; returns false when the desktop structure is unknown.
fn attach(app: &AppHandle, w: &WebviewWindow) -> AppResult<bool> {
    let state = app.state::<AppState>();
    let layout = state.layout();
    let Some(layer) = wallpaper::find_layer() else {
        return Ok(false);
    };
    wallpaper::attach(hwnd(w)?, &layer, layout.origin)?;
    window_span::set_rasterization_scale(w, layout.css_scale)?;
    wallpaper::set_icons_visible(&layer, !state.settings().general.hide_desktop_icons);
    *lock(&LAYER) = Some(layer);
    Ok(true)
}

/// Starts or stops the wallpaper to match the settings.
pub fn apply(app: &AppHandle) {
    let state = app.state::<AppState>();
    let s = state.settings();
    if s.general.wallpaper {
        let w = match app.get_webview_window(WALLPAPER) {
            Some(w) => w,
            None => match create(app) {
                Ok(w) => w,
                Err(e) => {
                    log::warn!("wallpaper window: {e}");
                    return;
                }
            },
        };
        match attach(app, &w) {
            Ok(true) => set_status(app, Status::Live),
            Ok(false) | Err(_) => {
                // Spec §11: use a still picture of the world as the normal wallpaper.
                set_status(app, Status::Fallback);
                let _ = w.emit(events::SNAPSHOT, ());
            }
        }
        if let Some(layer) = lock(&LAYER).as_ref() {
            wallpaper::set_icons_visible(layer, !s.general.hide_desktop_icons);
        }
        sync_sleep(app);
    } else {
        stop(app);
    }
}

/// Removes the wallpaper and gives the desktop back as it was.
pub fn stop(app: &AppHandle) {
    let layer = lock(&LAYER).take();
    if let Some(w) = app.get_webview_window(WALLPAPER) {
        if let (Some(layer), Ok(h)) = (layer.as_ref(), hwnd(&w)) {
            wallpaper::detach(h, layer);
        }
        let _ = w.destroy();
    }
    if let Some(layer) = layer.as_ref() {
        wallpaper::set_icons_visible(layer, true);
    }
    restore_original(app);
    set_status(app, Status::Off);
}

/// Follows monitor changes (spec §8.5) and Explorer restarts.
pub fn refresh(app: &AppHandle) {
    if status() == Status::Off {
        return;
    }
    let alive = lock(&LAYER).as_ref().is_some_and(wallpaper::layer_alive);
    if let (Some(w), true) = (
        app.get_webview_window(WALLPAPER),
        alive || status() == Status::Live,
    ) {
        let _ = attach(app, &w);
    }
}

/// The wallpaper sleeps while the app window covers the desktop (spec §8.2).
pub fn sync_sleep(app: &AppHandle) {
    let main_visible = app
        .get_webview_window(super::windows::MAIN)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let _ = app.emit_to(WALLPAPER, events::SLEEP, main_visible);
}

/// Stores the snapshot from the wallpaper window and sets it as the Windows wallpaper.
pub fn set_snapshot(app: &AppHandle, png: &[u8]) -> AppResult<()> {
    let state = app.state::<AppState>();
    let path = state.paths.root.join("wallpaper-fallback.png");
    std::fs::write(&path, png)?;
    {
        let db = state.db();
        if kv::meta(&db, META_ORIGINAL)?.is_none() {
            if let Some(orig) = wallpaper::current_wallpaper() {
                kv::set_meta(&db, META_ORIGINAL, &orig)?;
            }
        }
    }
    wallpaper::set_wallpaper_file(&path.to_string_lossy())
}

fn restore_original(app: &AppHandle) {
    let state = app.state::<AppState>();
    let db = state.db();
    if let Ok(Some(orig)) = kv::meta(&db, META_ORIGINAL) {
        let _ = wallpaper::set_wallpaper_file(&orig);
        let _ = kv::delete_meta(&db, META_ORIGINAL);
    }
}

#[tauri::command]
pub fn wallpaper_snapshot(png_base64: String, app: AppHandle) -> AppResult<()> {
    use base64_light::decode;
    let bytes = decode(&png_base64).ok_or_else(|| AppError::msg("invalid snapshot"))?;
    set_snapshot(&app, &bytes)
}

#[tauri::command]
pub fn wallpaper_status() -> Status {
    status()
}

/// Tiny base64 decoder (snapshots only), to avoid another dependency.
mod base64_light {
    pub fn decode(s: &str) -> Option<Vec<u8>> {
        let s = s.split(',').next_back()?.trim();
        let val = |c: u8| -> Option<u32> {
            Some(match c {
                b'A'..=b'Z' => (c - b'A') as u32,
                b'a'..=b'z' => (c - b'a' + 26) as u32,
                b'0'..=b'9' => (c - b'0' + 52) as u32,
                b'+' => 62,
                b'/' => 63,
                _ => return None,
            })
        };
        let bytes: Vec<u8> = s
            .bytes()
            .filter(|&c| c != b'=' && !c.is_ascii_whitespace())
            .collect();
        let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
        for chunk in bytes.chunks(4) {
            let mut n = 0u32;
            for (i, &c) in chunk.iter().enumerate() {
                n |= val(c)? << (18 - 6 * i);
            }
            out.push((n >> 16) as u8);
            if chunk.len() > 2 {
                out.push((n >> 8) as u8);
            }
            if chunk.len() > 3 {
                out.push(n as u8);
            }
        }
        Some(out)
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn decodes_base64_and_data_urls() {
            assert_eq!(super::decode("aGVsbG8=").unwrap(), b"hello");
            assert_eq!(super::decode("data:image/png;base64,aGk=").unwrap(), b"hi");
            assert!(super::decode("@@@").is_none());
        }
    }
}

/// The user's own Windows wallpaper as an asset, for "Windows wallpaper" as the world
/// background (spec §7.6). While the static fallback is active, the original one is used.
#[tauri::command]
pub async fn windows_wallpaper_asset(
    app: AppHandle,
) -> AppResult<Option<crate::storage::assets::AssetInfo>> {
    super::generator::blocking(move || {
        let state = app.state::<AppState>();
        let original = kv::meta(&state.db(), META_ORIGINAL)?;
        let Some(path) = original.or_else(wallpaper::current_wallpaper) else {
            return Ok(None);
        };
        match state.assets.import_file(std::path::Path::new(&path)) {
            Ok(info) => Ok(Some(info)),
            Err(e) => {
                log::info!("windows wallpaper {path}: {e}");
                Ok(None)
            }
        }
    })
    .await
}
