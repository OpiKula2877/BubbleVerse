//! Files dropped from Explorer on the app window (spec §4.6 "Drag & drop"). The page cannot
//! see file paths; it posts the dropped `File` objects to WebView2, which knows them.
//! Tauri's own drop handler stays off because it would disable drag and drop inside the page.

use tauri::{Emitter, Manager, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2File, ICoreWebView2WebMessageReceivedEventArgs,
    ICoreWebView2WebMessageReceivedEventArgs2,
};
use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
use windows::core::{Interface, PWSTR};

use super::windows::MAIN;

/// Core → app window: paths of the dropped files.
pub const EVENT: &str = "bv://files-dropped";
/// The message the page posts together with the files.
const MESSAGE: &str = "bv-drop";

pub fn install(window: &WebviewWindow) {
    let app = window.app_handle().clone();
    let result = window.with_webview(move |wv| unsafe {
        let Ok(core) = wv.controller().CoreWebView2() else {
            return;
        };
        let handler = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut msg = PWSTR::null();
            if args.TryGetWebMessageAsString(&mut msg).is_err() || take_pwstr(msg) != MESSAGE {
                return Ok(());
            }
            match dropped_paths(&args) {
                Ok(paths) if !paths.is_empty() => {
                    let _ = app.emit_to(MAIN, EVENT, paths);
                }
                Ok(_) => {}
                Err(e) => log::warn!("dropped files: {e}"),
            }
            Ok(())
        }));
        let mut token = 0i64;
        if let Err(e) = core.add_WebMessageReceived(&handler, &mut token) {
            log::warn!("file drop handler: {e}");
        }
    });
    if let Err(e) = result {
        log::warn!("file drop handler: {e}");
    }
}

unsafe fn dropped_paths(
    args: &ICoreWebView2WebMessageReceivedEventArgs,
) -> windows::core::Result<Vec<String>> {
    let args2: ICoreWebView2WebMessageReceivedEventArgs2 = args.cast()?;
    let objects = args2.AdditionalObjects()?;
    let mut n = 0u32;
    objects.Count(&mut n)?;
    let mut out = Vec::new();
    for i in 0..n {
        if let Ok(file) = objects.GetValueAtIndex(i)?.cast::<ICoreWebView2File>() {
            let mut p = PWSTR::null();
            file.Path(&mut p)?;
            out.push(take_pwstr(p));
        }
    }
    Ok(out)
}
