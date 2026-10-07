//! App actions that shortcuts, the tray and other windows can trigger (spec §7.3), and the
//! bridge from the keyboard hook to them.

use std::sync::mpsc;

use tauri::{AppHandle, Emitter, Manager};

use super::state::{events, AppState};
use super::windows;
use crate::os::hook::{self, Binding, HookEvent, Scope};
use crate::os::keys::parse_combo;
use crate::storage::settings::Settings;

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

/// Shortcuts the hook must catch: global ones, and in-app ones that override Windows.
/// In-app shortcuts without override are handled by the app window itself.
pub fn bindings_from(settings: &Settings) -> Vec<Binding> {
    settings
        .shortcuts
        .iter()
        .filter(|s| s.scope == "global" || s.override_windows)
        .filter_map(|s| {
            Some(Binding {
                combo: parse_combo(&s.combo)?,
                id: format!("action:{}", s.action),
                scope: if s.scope == "global" {
                    Scope::Global
                } else {
                    Scope::App
                },
                swallow: s.override_windows,
            })
        })
        .collect()
}

/// Rebuilds the hook bindings from settings and script triggers.
pub fn refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut bindings = bindings_from(&state.settings());
    bindings.extend(crate::app::triggers::hotkey_bindings(&state));
    hook::set_bindings(bindings);
    hook::set_desktop_search(state.settings().general.wallpaper);
}

/// Starts the keyboard hook and the thread that turns its events into actions.
pub fn start(app: &AppHandle) {
    let (tx, rx) = mpsc::channel::<HookEvent>();
    hook::start(tx);
    refresh(app);
    let app = app.clone();
    std::thread::Builder::new()
        .name("bv-shortcuts".into())
        .spawn(move || {
            for ev in rx {
                match ev {
                    HookEvent::Shortcut(id) => {
                        if let Some(action) = id.strip_prefix("action:") {
                            run_action(&app, action);
                        } else {
                            crate::app::triggers::fire_hotkey(&app, &id);
                        }
                    }
                    HookEvent::DesktopSearch => super::search::open_desktop(&app),
                    HookEvent::Key { .. } => crate::app::triggers::recorded_key(&app, ev),
                }
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hooks_only_global_and_overriding_shortcuts() {
        let b = bindings_from(&Settings::default());
        let ids: Vec<&str> = b.iter().map(|x| x.id.as_str()).collect();
        assert!(ids.contains(&"action:toggleApp"));
        assert!(ids.contains(&"action:globalSearch"));
        assert!(ids.contains(&"action:stopScripts"));
        assert!(!ids.contains(&"action:search"));
        let gs = b.iter().find(|x| x.id == "action:globalSearch").unwrap();
        assert!(gs.swallow);
        assert_eq!(gs.scope, Scope::Global);
    }
}
