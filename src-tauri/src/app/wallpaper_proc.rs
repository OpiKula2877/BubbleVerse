//! The wallpaper process (`bubbleverse.exe --bv-wallpaper <assets>`): only the wallpaper
//! window, put under the desktop icons. It has its own WebView2 folder, so it also gets its own
//! browser process, and nothing the user types into shares its input with the desktop. All
//! data comes from the app over stdin and stdout (see `wallpaper_ipc`).

use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use ::windows::Win32::Foundation::HWND;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use super::protocol;
use super::wallpaper::WALLPAPER;
use super::wallpaper_ipc::{decode, encode, ToApp, ToWallpaper};
use crate::error::{AppError, AppResult};
use crate::os::monitors::Rect;
use crate::os::wallpaper::{self, DesktopLayer};
use crate::os::{webview, window_span};
use crate::storage::assets::AssetStore;

/// Where the window went under the icons, to give the desktop back at the end.
static LAYER: Mutex<Option<DesktopLayer>> = Mutex::new(None);

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn send(msg: &ToApp) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{}", encode(msg));
    let _ = out.flush();
}

/// Commands of the page that wait for the app's reply.
#[derive(Default)]
struct Bridge {
    next: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
}

impl Bridge {
    async fn call(&self, cmd: &str, args: Value) -> Result<Value, AppError> {
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let (tx, rx) = oneshot::channel();
        lock(&self.pending).insert(id, tx);
        send(&ToApp::Call {
            id,
            cmd: cmd.into(),
            args,
        });
        match tokio::time::timeout(Duration::from_secs(30), rx).await {
            Ok(Ok(Ok(v))) => Ok(v),
            Ok(Ok(Err(e))) => Err(AppError::msg(e)),
            _ => {
                lock(&self.pending).remove(&id);
                Err(AppError::msg("BubbleVerse did not answer"))
            }
        }
    }

    fn answer(&self, id: u64, result: Result<Value, String>) {
        if let Some(tx) = lock(&self.pending).remove(&id) {
            let _ = tx.send(result);
        }
    }
}

#[tauri::command]
async fn bootstrap(bridge: State<'_, Bridge>) -> Result<Value, AppError> {
    bridge.call("bootstrap", Value::Null).await
}

#[tauri::command]
async fn wallpaper_status(bridge: State<'_, Bridge>) -> Result<Value, AppError> {
    bridge.call("wallpaper_status", Value::Null).await
}

#[tauri::command]
async fn wallpaper_snapshot(
    png_base64: String,
    bridge: State<'_, Bridge>,
) -> Result<Value, AppError> {
    bridge
        .call("wallpaper_snapshot", json!({ "pngBase64": png_base64 }))
        .await
}

#[tauri::command]
async fn windows_wallpaper_asset(bridge: State<'_, Bridge>) -> Result<Value, AppError> {
    bridge.call("windows_wallpaper_asset", Value::Null).await
}

pub fn run(assets: PathBuf, context: tauri::Context<tauri::Wry>) {
    let result = tauri::Builder::default()
        .manage(AssetStore::new(assets))
        .manage(Bridge::default())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            wallpaper_status,
            wallpaper_snapshot,
            windows_wallpaper_asset,
        ])
        .on_page_load(|webview, _| webview::lock_browser(webview))
        .setup(|tauri_app| {
            create(tauri_app.handle())?;
            listen(tauri_app.handle().clone());
            Ok(())
        })
        .build(context);
    match result {
        Ok(app) => app.run(|handle, event| {
            if let tauri::RunEvent::Exit = event {
                detach(handle);
            }
        }),
        Err(e) => eprintln!("BubbleVerse wallpaper failed to start: {e}"),
    }
}

fn create(app: &AppHandle) -> AppResult<()> {
    let folder = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::msg(e.to_string()))?
        .join("EBWebView-wallpaper");
    WebviewWindowBuilder::new(
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
    .data_directory(folder)
    .build()?;
    Ok(())
}

/// Messages from the app; when it ends (or quits), the desktop is given back.
fn listen(app: AppHandle) {
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let Ok(line) = line else {
                break;
            };
            match decode::<ToWallpaper>(&line) {
                Some(ToWallpaper::Event { name, payload }) => {
                    let _ = app.emit_to(WALLPAPER, &name, payload);
                }
                Some(ToWallpaper::Reply { id, ok, err }) => {
                    let result = match err {
                        Some(e) => Err(e),
                        None => Ok(ok.unwrap_or(Value::Null)),
                    };
                    app.state::<Bridge>().answer(id, result);
                }
                Some(ToWallpaper::Attach { origin, css_scale }) => {
                    let a = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        let ok = attach(&a, origin, css_scale);
                        send(&ToApp::Attached { ok });
                    });
                }
                Some(ToWallpaper::Quit) => break,
                None => {}
            }
        }
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            detach(&a);
            a.exit(0);
        });
    });
}

fn attach(app: &AppHandle, origin: Rect, css_scale: f64) -> bool {
    let (Some(w), Some(layer)) = (app.get_webview_window(WALLPAPER), wallpaper::find_layer())
    else {
        return false;
    };
    let Ok(h) = w.hwnd() else {
        return false;
    };
    if let Err(e) = wallpaper::attach(HWND(h.0), &layer, origin) {
        eprintln!("wallpaper attach: {e}");
        return false;
    }
    let _ = window_span::set_rasterization_scale(&w, css_scale);
    *lock(&LAYER) = Some(layer);
    true
}

fn detach(app: &AppHandle) {
    let layer = lock(&LAYER).take();
    if let (Some(layer), Some(w)) = (layer, app.get_webview_window(WALLPAPER)) {
        if let Ok(h) = w.hwnd() {
            wallpaper::detach(HWND(h.0), &layer);
        }
    }
}
