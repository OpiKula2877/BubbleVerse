//! App actions that shortcuts, the tray and other windows can trigger (spec §7.3).

use tauri::{AppHandle, Emitter, Manager};

use super::state::{events, AppState};
use super::windows;

pub fn run_action(app: &AppHandle, action: &str) {
    let state = app.state::<AppState>();
    match action {
        "toggleApp" => windows::toggle_main(app),
        "stopScripts" => state.runtime.stop_all(),
        "globalSearch" => super::search::open_global(app),
        // In-app actions are handled by the app window.
        other => {
            let _ = app.emit_to(windows::MAIN, events::SHORTCUT, other);
        }
    }
}
