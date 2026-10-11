//! The wallpaper: shown under the desktop icons while the setting is on (spec §2.2), asleep
//! while the app window covers it, with a static Windows wallpaper as fallback (§11).
//!
//! It runs in its own process (`wallpaper_proc`): a window under the icons shares its thread's
//! input with the desktop, and here that would be the thread of every app window.

use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Listener, Manager};

use super::state::{events as app_events, AppState};
use super::wallpaper_ipc::{decode, encode, ToApp, ToWallpaper, ARG};
use crate::error::{AppError, AppResult};
use crate::os::wallpaper::{self, DesktopLayer};
use crate::storage::assets::AssetInfo;
use crate::storage::kv;

pub const WALLPAPER: &str = "wallpaper";
const META_ORIGINAL: &str = "wallpaper.original";
/// The wallpaper process is started again this often when it ends by itself.
const MAX_RESTARTS: u32 = 3;
/// `CREATE_NO_WINDOW`: no console window for the wallpaper process.
const NO_WINDOW: u32 = 0x0800_0000;

pub mod events {
    pub const SLEEP: &str = "bv://wallpaper-sleep";
    pub const SNAPSHOT: &str = "bv://wallpaper-snapshot";
    pub const STATUS: &str = "bv://wallpaper-status";
    pub const DESKTOP_SEARCH: &str = "bv://desktop-search";
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

/// The running wallpaper process and the queue of lines for its stdin.
struct Process {
    child: Child,
    lines: Sender<String>,
}

static PROCESS: Mutex<Option<Process>> = Mutex::new(None);
/// The desktop layer, for showing and hiding the icons.
static LAYER: Mutex<Option<DesktopLayer>> = Mutex::new(None);
static STATUS: Mutex<Status> = Mutex::new(Status::Off);
static STOPPING: AtomicBool = AtomicBool::new(false);
static RESTARTS: AtomicU32 = AtomicU32::new(0);

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

fn send(msg: &ToWallpaper) {
    if let Some(p) = lock(&PROCESS).as_ref() {
        let _ = p.lines.send(encode(msg));
    }
}

fn send_event(name: &str, payload: Value) {
    send(&ToWallpaper::Event {
        name: name.into(),
        payload,
    });
}

/// The events the wallpaper page listens to go on to the wallpaper process.
pub fn forward_events(app: &AppHandle) {
    for name in [
        app_events::WORLD_PUBLISHED,
        app_events::SETTINGS,
        app_events::LAYOUT,
        app_events::PAUSE,
        app_events::FX,
        super::autopause::EVENT,
        events::DESKTOP_SEARCH,
    ] {
        app.listen_any(name, move |e| {
            if let Ok(payload) = serde_json::from_str(e.payload()) {
                send_event(name, payload);
            }
        });
    }
}

fn running() -> bool {
    lock(&PROCESS)
        .as_mut()
        .is_some_and(|p| matches!(p.child.try_wait(), Ok(None)))
}

fn spawn(app: &AppHandle) -> AppResult<()> {
    let assets = app.state::<AppState>().assets.dir().to_path_buf();
    let mut command = Command::new(std::env::current_exe()?);
    command
        .arg(ARG)
        .arg(assets)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(if cfg!(debug_assertions) {
            Stdio::inherit()
        } else {
            Stdio::null()
        })
        .creation_flags(NO_WINDOW);
    // Development builds: DevTools of the wallpaper on its own port (BV_WALLPAPER_CDP=9223).
    if cfg!(debug_assertions) {
        if let Ok(port) = std::env::var("BV_WALLPAPER_CDP") {
            command.env(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                format!("--remote-debugging-port={port}"),
            );
        }
    }
    let mut child = command.spawn()?;
    let (Some(mut stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        let _ = child.kill();
        return Err(AppError::msg("wallpaper process without pipes"));
    };
    let (lines, queue) = mpsc::channel::<String>();
    // Writing never blocks the caller (events are emitted from the UI thread too).
    std::thread::spawn(move || {
        for line in queue {
            if writeln!(stdin, "{line}")
                .and_then(|_| stdin.flush())
                .is_err()
            {
                break;
            }
        }
    });
    let id = child.id();
    let a = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else {
                break;
            };
            if let Some(msg) = decode::<ToApp>(&line) {
                received(&a, msg);
            }
        }
        ended(&a, id);
    });
    *lock(&PROCESS) = Some(Process { child, lines });
    Ok(())
}

fn received(app: &AppHandle, msg: ToApp) {
    match msg {
        ToApp::Call { id, cmd, args } => {
            let app = app.clone();
            std::thread::spawn(move || {
                let reply = match answer(&app, &cmd, &args) {
                    Ok(v) => ToWallpaper::Reply {
                        id,
                        ok: Some(v),
                        err: None,
                    },
                    Err(e) => ToWallpaper::Reply {
                        id,
                        ok: None,
                        err: Some(e.to_string()),
                    },
                };
                send(&reply);
            });
        }
        ToApp::Attached { ok: true } => set_status(app, Status::Live),
        ToApp::Attached { ok: false } => {
            // Spec §11: use a still picture of the world as the normal wallpaper.
            set_status(app, Status::Fallback);
            send_event(events::SNAPSHOT, Value::Null);
        }
    }
}

/// The commands of the wallpaper page.
fn answer(app: &AppHandle, cmd: &str, args: &Value) -> AppResult<Value> {
    fn json(v: impl Serialize) -> AppResult<Value> {
        serde_json::to_value(v).map_err(|e| AppError::Format(e.to_string()))
    }
    match cmd {
        "bootstrap" => {
            let state = app.state::<AppState>();
            json(super::commands::bootstrap_for(WALLPAPER, &state)?)
        }
        "wallpaper_status" => json(status()),
        "wallpaper_snapshot" => {
            let png = args.get("pngBase64").and_then(Value::as_str).unwrap_or("");
            snapshot_from_base64(app, png)?;
            Ok(Value::Null)
        }
        "windows_wallpaper_asset" => json(windows_wallpaper_info(app)?),
        other => Err(AppError::msg(format!("unknown wallpaper command {other}"))),
    }
}

/// The wallpaper process ended: on its own it is started again (a few times).
fn ended(app: &AppHandle, id: u32) {
    {
        let mut p = lock(&PROCESS);
        if !p.as_ref().is_some_and(|p| p.child.id() == id) {
            return;
        }
        *p = None;
    }
    if STOPPING.load(Ordering::Relaxed) || status() == Status::Off {
        return;
    }
    if RESTARTS.fetch_add(1, Ordering::Relaxed) >= MAX_RESTARTS {
        log::warn!("the wallpaper process keeps ending; wallpaper off until restart");
        set_status(app, Status::Off);
        return;
    }
    std::thread::sleep(Duration::from_secs(1));
    let a = app.clone();
    let _ = app.run_on_main_thread(move || apply(&a));
}

/// Asks the wallpaper process to go under the icons on the current monitors.
fn attach(app: &AppHandle) {
    let state = app.state::<AppState>();
    let layout = state.layout();
    send(&ToWallpaper::Attach {
        origin: layout.origin,
        css_scale: layout.css_scale,
    });
    let hide = state.settings().general.hide_desktop_icons;
    if let Some(layer) = wallpaper::find_layer() {
        wallpaper::set_icons_visible(&layer, !hide);
        *lock(&LAYER) = Some(layer);
    }
}

/// Starts or stops the wallpaper to match the settings.
pub fn apply(app: &AppHandle) {
    if !app.state::<AppState>().settings().general.wallpaper {
        stop(app);
        return;
    }
    STOPPING.store(false, Ordering::Relaxed);
    if !running() {
        if let Err(e) = spawn(app) {
            log::warn!("wallpaper process: {e}");
            set_status(app, Status::Off);
            return;
        }
    }
    attach(app);
    sync_sleep(app);
}

/// Removes the wallpaper and gives the desktop back as it was.
pub fn stop(app: &AppHandle) {
    STOPPING.store(true, Ordering::Relaxed);
    let process = lock(&PROCESS).take();
    if let Some(Process { mut child, lines }) = process {
        let _ = lines.send(encode(&ToWallpaper::Quit));
        drop(lines);
        // The wallpaper process takes its window from the desktop itself; wait for that.
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match child.try_wait() {
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(30));
                }
                Ok(None) | Err(_) => {
                    let _ = child.kill();
                    break;
                }
                Ok(Some(_)) => break,
            }
        }
    }
    if let Some(layer) = lock(&LAYER).take().or_else(wallpaper::find_layer) {
        wallpaper::set_icons_visible(&layer, true);
    }
    restore_original(app);
    set_status(app, Status::Off);
}

/// Follows monitor changes (spec §8.5) and Explorer restarts.
pub fn refresh(app: &AppHandle) {
    if status() != Status::Off && running() {
        attach(app);
    }
}

/// The wallpaper sleeps while the app window covers the desktop (spec §8.2).
pub fn sync_sleep(app: &AppHandle) {
    let main_visible = app
        .get_webview_window(super::windows::MAIN)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    send_event(events::SLEEP, Value::Bool(main_visible));
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

fn snapshot_from_base64(app: &AppHandle, png_base64: &str) -> AppResult<()> {
    let bytes =
        base64_light::decode(png_base64).ok_or_else(|| AppError::msg("invalid snapshot"))?;
    set_snapshot(app, &bytes)
}

#[tauri::command]
pub fn wallpaper_snapshot(png_base64: String, app: AppHandle) -> AppResult<()> {
    snapshot_from_base64(&app, &png_base64)
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
pub async fn windows_wallpaper_asset(app: AppHandle) -> AppResult<Option<AssetInfo>> {
    super::generator::blocking(move || windows_wallpaper_info(&app)).await
}

fn windows_wallpaper_info(app: &AppHandle) -> AppResult<Option<AssetInfo>> {
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
}
