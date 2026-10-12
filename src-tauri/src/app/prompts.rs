//! Questions from scripts to the user (spec §5.2 "Bubbles & UI"): text questions and the
//! countdown before sleep/restart/shutdown are shown in the search bar window; yes/no and file
//! pickers use native dialogs.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::oneshot;

use super::search::SEARCHBAR;
use crate::os::focus::force_foreground;

pub const EVENT: &str = "bv://prompt";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: u64,
    /// "ask" | "countdown"
    pub kind: String,
    pub text: String,
    /// Countdown action ("sleep" | "restart" | "shutdown").
    pub action: Option<String>,
    pub seconds: f64,
}

static NEXT: AtomicU64 = AtomicU64::new(1);
static PENDING: Mutex<Option<HashMap<u64, oneshot::Sender<Option<String>>>>> = Mutex::new(None);

fn pending() -> std::sync::MutexGuard<'static, Option<HashMap<u64, oneshot::Sender<Option<String>>>>>
{
    PENDING.lock().unwrap_or_else(|e| e.into_inner())
}

/// Shows a prompt in the search bar window and waits for the answer (`None` = cancelled).
pub async fn ask(
    app: &AppHandle,
    kind: &str,
    text: String,
    action: Option<String>,
    seconds: f64,
) -> Option<String> {
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();
    pending().get_or_insert_with(HashMap::new).insert(id, tx);
    if let Some(w) = app.get_webview_window(SEARCHBAR) {
        let _ = w.emit(
            EVENT,
            Prompt {
                id,
                kind: kind.into(),
                text,
                action,
                seconds,
            },
        );
        let _ = w.show();
        if let Ok(h) = w.hwnd() {
            force_foreground(::windows::Win32::Foundation::HWND(h.0));
        }
        let _ = w.set_focus();
    }
    rx.await.ok().flatten()
}

#[tauri::command]
pub fn prompt_answer(id: u64, value: Option<String>) {
    if let Some(tx) = pending().as_mut().and_then(|m| m.remove(&id)) {
        let _ = tx.send(value);
    }
}

pub fn confirm_blocking(app: &AppHandle, question: &str) -> bool {
    app.dialog()
        .message(question)
        .title("BubbleVerse")
        .buttons(MessageDialogButtons::YesNo)
        .blocking_show()
}

pub fn pick_blocking(app: &AppHandle, kind: &str) -> Option<String> {
    let d = app.dialog().file();
    let picked = if kind == "folder" {
        d.blocking_pick_folder()
    } else {
        d.blocking_pick_file()
    };
    picked.map(|p| p.to_string())
}

pub fn notify(app: &AppHandle, title: &str, text: &str) {
    if let Err(e) = app.notification().builder().title(title).body(text).show() {
        log::warn!("notification failed: {e}");
    }
}
