//! The app window over the whole virtual desktop (spec §2.1, §8.5).

use tauri::WebviewWindow;
use windows::core::Interface;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, HWND_NOTOPMOST, HWND_TOPMOST,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WS_SYSMENU,
};

use super::monitors::Rect;
use crate::error::AppResult;

fn hwnd(window: &WebviewWindow) -> AppResult<HWND> {
    Ok(HWND(window.hwnd()?.0))
}

/// Places the window exactly over `rect` (physical pixels).
pub fn span(window: &WebviewWindow, rect: Rect) -> AppResult<()> {
    unsafe {
        SetWindowPos(
            hwnd(window)?,
            None,
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            SWP_NOACTIVATE | SWP_FRAMECHANGED,
        )?;
    }
    Ok(())
}

/// Topmost while active, so the window covers the Windows taskbar (setting "over the taskbar").
pub fn set_topmost(window: &WebviewWindow, topmost: bool) -> AppResult<()> {
    unsafe {
        SetWindowPos(
            hwnd(window)?,
            Some(if topmost {
                HWND_TOPMOST
            } else {
                HWND_NOTOPMOST
            }),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )?;
    }
    Ok(())
}

/// Fixes WebView2's scale to the primary monitor's so the UI there is always sharp, even when
/// the window spans monitors with different DPI (spec §8.5).
pub fn set_rasterization_scale(window: &WebviewWindow, scale: f64) -> AppResult<()> {
    window.with_webview(move |wv| {
        let controller = wv.controller();
        if let Ok(c3) = controller
            .cast::<webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller3>(
        ) {
            unsafe {
                let _ = c3.SetShouldDetectMonitorScaleChanges(false);
                let _ = c3.SetRasterizationScale(scale);
            }
        }
    })?;
    Ok(())
}

/// The window menu never opens: Alt (alone or with Space) would otherwise put the window into
/// menu mode, which blocks the WebView until Windows gives up.
unsafe extern "system" fn no_menu_proc(
    hwnd: HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _id: usize,
    _data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{SC_KEYMENU, SC_MOUSEMENU, WM_SYSCOMMAND};
    if msg == WM_SYSCOMMAND {
        let cmd = (wparam.0 & 0xFFF0) as u32;
        if cmd == SC_KEYMENU || cmd == SC_MOUSEMENU {
            return windows::Win32::Foundation::LRESULT(0);
        }
    }
    windows::Win32::UI::Shell::DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Takes the window menu (Restore, Move, Size, Close) away from a frameless window: Alt+Space
/// would open it, and a lone Alt release would put the window into menu mode, which can lock
/// up the WebView while the focus moves (global search opened with Alt held).
pub fn remove_system_menu(window: &WebviewWindow) -> AppResult<()> {
    let h = hwnd(window)?;
    unsafe {
        let style = GetWindowLongPtrW(h, GWL_STYLE);
        SetWindowLongPtrW(h, GWL_STYLE, style & !(WS_SYSMENU.0 as isize));
        // Called on the window's own thread (window creation), as subclassing requires.
        let _ = windows::Win32::UI::Shell::SetWindowSubclass(h, Some(no_menu_proc), 1, 0);
    }
    Ok(())
}
