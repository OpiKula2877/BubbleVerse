//! The compact search bar (spec §2.3): created hidden at start so it appears at once, shown
//! above everything by the global shortcut. The desktop search (spec §2.2) uses it too.

use ::windows::Win32::Foundation::HWND;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use super::state::{events, AppState};
use super::windows;
use crate::error::AppResult;
use crate::os::focus::force_foreground;
use crate::os::monitors::ui_monitor;

pub const SEARCHBAR: &str = "searchbar";
/// Logical size of the bar window (room for the red path and the three lines).
const WIDTH: f64 = 720.0;
const HEIGHT: f64 = 210.0;

pub fn create_searchbar(app: &AppHandle) -> AppResult<WebviewWindow> {
    let w = WebviewWindowBuilder::new(
        app,
        SEARCHBAR,
        WebviewUrl::App("searchbar/index.html".into()),
    )
    .title("BubbleVerse search")
    .visible(false)
    .focused(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .inner_size(WIDTH, HEIGHT)
    .build()?;
    Ok(w)
}

/// Bottom center of the UI monitor, like the search field in the app window.
fn place(app: &AppHandle, w: &WebviewWindow) {
    let state = app.state::<AppState>();
    let layout = state.layout();
    let Some(m) = ui_monitor(&layout.monitors, Some(&layout.ui_monitor)) else {
        return;
    };
    let width = (WIDTH * m.scale) as i32;
    let height = (HEIGHT * m.scale) as i32;
    let x = m.rect.x + (m.rect.w - width) / 2;
    let y = m.rect.y + (m.rect.h as f64 * 0.92) as i32 - height;
    let _ = w.set_size(PhysicalSize::new(width as u32, height as u32));
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

fn show(app: &AppHandle, mode: &str) {
    let Some(w) = app.get_webview_window(SEARCHBAR) else {
        return;
    };
    place(app, &w);
    let _ = w.emit(events::SEARCH, mode);
    let _ = w.show();
    let _ = w.set_always_on_top(true);
    if let Ok(h) = w.hwnd() {
        force_foreground(HWND(h.0));
    }
    let _ = w.set_focus();
}

/// Global search from anywhere. With the "universe" look the app window comes up with its
/// bubbles and background (its page plays the chosen entrance and then shows itself, so
/// nothing flashes); with the "bar" look only the compact field appears.
pub fn open_global(app: &AppHandle) {
    let universe = app.state::<AppState>().settings().search.global_look == "universe";
    if let Some(main) = app.get_webview_window(windows::MAIN) {
        let visible = main.is_visible().unwrap_or(false) && !main.is_minimized().unwrap_or(false);
        // When the app window is in front, search in it instead (spec §6.1).
        if visible && (universe || main.is_focused().unwrap_or(false)) {
            windows::present_main(app);
            let _ = app.emit_to(windows::MAIN, events::SEARCH, "app");
            return;
        }
        if universe && !visible {
            let _ = app.emit_to(windows::MAIN, events::SEARCH, "global");
            // If the page does not answer (still loading), show the window anyway.
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(800));
                if let Some(w) = app.get_webview_window(windows::MAIN) {
                    if !w.is_visible().unwrap_or(true) {
                        windows::present_main(&app);
                    }
                }
            });
            return;
        }
    }
    show(app, "global");
}

/// `Ctrl+F` on the desktop: the bar over the icons, the wallpaper follows (spec §2.2).
pub fn open_desktop(app: &AppHandle) {
    show(app, "desktop");
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SEARCHBAR) {
        let _ = w.hide();
    }
}
