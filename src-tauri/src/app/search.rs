//! Opening search from the core (shortcut, tray).

use tauri::{AppHandle, Emitter};

use super::state::events;
use super::windows;

/// Global search. Until the compact bar exists it opens search in the app window.
pub fn open_global(app: &AppHandle) {
    windows::show_main(app);
    let _ = app.emit_to(windows::MAIN, events::SEARCH, "app");
}
