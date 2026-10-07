//! The app window over the whole virtual desktop (spec §2.1, §8.5).

use tauri::WebviewWindow;
use windows::core::Interface;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE,
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
