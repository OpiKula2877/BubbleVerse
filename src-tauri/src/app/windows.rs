//! Creating, showing and placing windows.

use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use super::state::{events, AppState};
use crate::error::AppResult;
use crate::os::window_span;

pub const MAIN: &str = "main";

pub fn create_main(app: &AppHandle) -> AppResult<WebviewWindow> {
    let state = app.state::<AppState>();
    let windowed = state.windowed;
    let mut b = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("main/index.html".into()))
        .title("BubbleVerse")
        .visible(false)
        .focused(true)
        .shadow(false)
        .resizable(windowed)
        // Files dropped from Explorer open the bulk generator (spec §4.6).
        .decorations(windowed);
    if windowed {
        b = b.inner_size(1280.0, 800.0).center();
    }
    let window = b.build()?;
    if !windowed {
        place_main(&window, &state)?;
    }
    let app2 = app.clone();
    window.on_window_event(move |event| on_main_event(&app2, event));
    if !state.autostarted {
        show_main(app);
    }
    Ok(window)
}

/// Spans the window over all monitors and fixes the WebView scale (spec §8.5).
pub fn place_main(window: &WebviewWindow, state: &AppState) -> AppResult<()> {
    let layout = state.layout();
    window_span::span(window, layout.origin)?;
    window_span::set_rasterization_scale(window, layout.css_scale)?;
    Ok(())
}

fn on_main_event(app: &AppHandle, event: &WindowEvent) {
    let state = app.state::<AppState>();
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if state.settings().general.close_behavior == "tray" {
                api.prevent_close();
                hide_main(app);
            } else {
                app.exit(0);
            }
        }
        WindowEvent::Focused(focused)
            if !state.windowed && state.settings().general.cover_taskbar =>
        {
            if let Some(w) = app.get_webview_window(MAIN) {
                let _ = window_span::set_topmost(&w, *focused);
            }
        }
        _ => {}
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    super::wallpaper::sync_sleep(app);
}

pub fn hide_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.hide();
    }
    super::wallpaper::sync_sleep(app);
}

/// Open/hide shortcut and tray click (spec §2.1).
pub fn toggle_main(app: &AppHandle) {
    let Some(w) = app.get_webview_window(MAIN) else {
        return;
    };
    let visible = w.is_visible().unwrap_or(false);
    let focused = w.is_focused().unwrap_or(false);
    if visible && focused {
        hide_main(app);
    } else {
        show_main(app);
    }
}

/// Re-reads monitors and moves windows when monitors or DPI changed.
pub fn refresh_layout(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.refresh_layout() {
        if let Some(w) = app.get_webview_window(MAIN) {
            if !state.windowed {
                let _ = place_main(&w, &state);
            }
        }
        let _ = app.emit(events::LAYOUT, state.layout());
        super::wallpaper::refresh(app);
    }
}

/// Polls monitors every two seconds (connect, disconnect, DPI change, spec §8.5).
pub fn watch_monitors(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        refresh_layout(&app);
    });
}
