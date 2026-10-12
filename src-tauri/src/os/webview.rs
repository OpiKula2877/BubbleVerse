//! WebView2 settings shared by every window: BubbleVerse is an app, not a browser page, so the
//! browser's own context menu (back, reload, save as, print) and browser shortcuts (Ctrl+P,
//! F5, Alt+Left, Ctrl+F find, ...) are off. Keys still reach the page for the app's shortcuts.

use tauri::{Runtime, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
use windows::core::Interface;

pub fn lock_browser<R: Runtime>(webview: &Webview<R>) {
    let result = webview.with_webview(|wv| unsafe {
        let Ok(core) = wv.controller().CoreWebView2() else {
            return;
        };
        let Ok(settings) = core.Settings() else {
            return;
        };
        let _ = settings.SetAreDefaultContextMenusEnabled(false);
        let _ = settings.SetIsStatusBarEnabled(false);
        if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
    if let Err(e) = result {
        log::warn!("webview settings failed: {e}");
    }
}
