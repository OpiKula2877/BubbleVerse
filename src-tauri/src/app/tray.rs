//! Tray icon and its menu (spec §2.4).

use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use super::i18n::tr;
use super::state::{events, AppState};
use super::windows;
use crate::error::AppResult;

const TRAY_ID: &str = "bubbleverse";
/// The tray lists at most this many running scripts.
const MAX_LISTED: usize = 15;

fn build_menu(app: &AppHandle) -> AppResult<Menu<Wry>> {
    let state = app.state::<AppState>();
    let s = state.settings();
    let lang = s.general.language.as_str();
    let item = |id: &str, key: &str| MenuItem::with_id(app, id, tr(lang, key), true, None::<&str>);
    // Running scripts, each with Stop (spec §5.5).
    let running = state.runtime.running();
    let mut stops: Vec<MenuItem<Wry>> = Vec::new();
    for r in running.iter().take(MAX_LISTED) {
        let name = if r.path.is_empty() {
            &r.bubble
        } else {
            &r.path
        };
        stops.push(MenuItem::with_id(
            app,
            format!("stop-task:{}", r.id),
            format!("{} {name}", tr(lang, "tray.stopScript")),
            true,
            None::<&str>,
        )?);
    }
    if stops.is_empty() {
        stops.push(MenuItem::with_id(
            app,
            "none-running",
            tr(lang, "scripts.noneRunning"),
            false,
            None::<&str>,
        )?);
    }
    let refs: Vec<&dyn IsMenuItem<Wry>> = stops.iter().map(|m| m as &dyn IsMenuItem<Wry>).collect();
    let running_menu = Submenu::with_items(app, tr(lang, "tray.running"), true, &refs)?;
    let menu = Menu::with_items(
        app,
        &[
            &item("open", "tray.open")?,
            &item("search", "tray.search")?,
            &CheckMenuItem::with_id(
                app,
                "wallpaper",
                tr(lang, "tray.wallpaper"),
                true,
                s.general.wallpaper,
                None::<&str>,
            )?,
            &CheckMenuItem::with_id(
                app,
                "pause",
                tr(lang, "tray.pause"),
                true,
                state.paused(),
                None::<&str>,
            )?,
            &running_menu,
            &item("stop-scripts", "tray.stopScripts")?,
            &PredefinedMenuItem::separator(app)?,
            &item("settings", "tray.settings")?,
            &item("quit", "tray.quit")?,
        ],
    )?;
    Ok(menu)
}

pub fn create(app: &AppHandle) -> AppResult<TrayIcon> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("BubbleVerse")
        .menu(&build_menu(app)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                windows::toggle_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    Ok(builder.build(app)?)
}

/// Rebuilds the menu (language changed, wallpaper or pause toggled elsewhere).
pub fn refresh(app: &AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    match id {
        "open" => windows::show_main(app),
        "search" => super::shortcuts::run_action(app, "globalSearch"),
        "wallpaper" => {
            let mut s = state.settings();
            s.general.wallpaper = !s.general.wallpaper;
            let _ = super::commands::apply_settings(app, s);
        }
        "pause" => {
            state.set_paused(!state.paused());
            refresh(app);
        }
        "stop-scripts" => state.runtime.stop_all(),
        "settings" => {
            windows::show_main(app);
            let _ = app.emit(events::OPEN_SETTINGS, ());
        }
        "quit" => app.exit(0),
        other => {
            if let Some(task) = other
                .strip_prefix("stop-task:")
                .and_then(|t| t.parse::<u64>().ok())
            {
                state.runtime.stop_task(task);
            }
        }
    }
}
