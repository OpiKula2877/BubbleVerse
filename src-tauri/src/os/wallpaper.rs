//! The live wallpaper under the desktop icons (spec §2.2, §8.6), the technique Lively Wallpaper
//! uses. Two desktop structures exist:
//! - classic: a top-level `WorkerW` behind the window that holds `SHELLDLL_DefView`; the
//!   wallpaper becomes its child;
//! - "raised desktop" (Windows 11 24H2+, `Progman` has `WS_EX_NOREDIRECTIONBITMAP`): the
//!   wallpaper becomes a layered child of `Progman`, z-ordered under `SHELLDLL_DefView` and
//!   above the `WorkerW` that `Progman` creates.

use windows::core::{w, BOOL, PCWSTR};
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, GetWindow, GetWindowLongPtrW, IsWindow,
    SendMessageTimeoutW, SetLayeredWindowAttributes, SetParent, SetWindowLongPtrW, SetWindowPos,
    ShowWindow, SystemParametersInfoW, GWL_EXSTYLE, GWL_STYLE, GW_CHILD, GW_HWNDLAST, HWND_BOTTOM,
    LWA_ALPHA, SMTO_NORMAL, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_GETDESKWALLPAPER,
    SPI_SETDESKWALLPAPER, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE,
    SW_SHOWNA, WS_CAPTION, WS_CHILD, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_NOREDIRECTIONBITMAP,
    WS_EX_TOOLWINDOW, WS_POPUP, WS_THICKFRAME,
};

use super::com::{from_wide, wide};
use super::monitors::Rect;
use crate::error::{AppError, AppResult};

#[derive(Clone, Copy, Debug)]
pub struct DesktopLayer {
    pub progman: isize,
    pub workerw: isize,
    pub defview: isize,
    pub raised: bool,
}

fn h(v: isize) -> HWND {
    HWND(v as *mut core::ffi::c_void)
}

fn hv(hwnd: HWND) -> isize {
    hwnd.0 as isize
}

/// Finds (and, by sending 0x052C to Progman, creates) the window the wallpaper goes into.
pub fn find_layer() -> Option<DesktopLayer> {
    unsafe {
        let progman = FindWindowW(w!("Progman"), PCWSTR::null()).ok()?;
        let raised =
            (GetWindowLongPtrW(progman, GWL_EXSTYLE) as u32 & WS_EX_NOREDIRECTIONBITMAP.0) != 0;
        let _ = SendMessageTimeoutW(
            progman,
            0x052C,
            WPARAM(0xD),
            LPARAM(0x1),
            SMTO_NORMAL,
            1000,
            None,
        );

        struct Found {
            workerw: isize,
            defview: isize,
        }
        unsafe extern "system" fn each(top: HWND, data: LPARAM) -> BOOL {
            let found = &mut *(data.0 as *mut Found);
            if let Ok(dv) = FindWindowExW(Some(top), None, w!("SHELLDLL_DefView"), PCWSTR::null()) {
                if !dv.is_invalid() {
                    found.defview = hv(dv);
                    if let Ok(ww) = FindWindowExW(None, Some(top), w!("WorkerW"), PCWSTR::null()) {
                        found.workerw = hv(ww);
                    }
                }
            }
            BOOL(1)
        }
        let mut found = Found {
            workerw: 0,
            defview: 0,
        };
        let _ = EnumWindows(Some(each), LPARAM(&mut found as *mut Found as isize));
        if raised {
            found.workerw = FindWindowExW(Some(progman), None, w!("WorkerW"), PCWSTR::null())
                .map(hv)
                .unwrap_or(0);
            if found.defview == 0 {
                found.defview =
                    FindWindowExW(Some(progman), None, w!("SHELLDLL_DefView"), PCWSTR::null())
                        .map(hv)
                        .unwrap_or(0);
            }
        }
        if found.workerw == 0 && !raised {
            return None;
        }
        Some(DesktopLayer {
            progman: hv(progman),
            workerw: found.workerw,
            defview: found.defview,
            raised,
        })
    }
}

/// Puts `hwnd` under the desktop icons over the whole virtual desktop.
pub fn attach(hwnd: HWND, layer: &DesktopLayer, area: Rect) -> AppResult<()> {
    unsafe {
        // A plain child window: no caption, frame or taskbar entry.
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        let style = (style & !(WS_POPUP.0 | WS_CAPTION.0 | WS_THICKFRAME.0)) | WS_CHILD.0;
        SetWindowLongPtrW(hwnd, GWL_STYLE, style as isize);
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let ex = (ex & !WS_EX_APPWINDOW.0) | WS_EX_TOOLWINDOW.0;
        if layer.raised {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (ex | WS_EX_LAYERED.0) as isize);
            SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA)?;
            SetParent(hwnd, Some(h(layer.progman)))?;
            let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
            if layer.defview != 0 {
                SetWindowPos(hwnd, Some(h(layer.defview)), 0, 0, 0, 0, flags)?;
            }
            ensure_workerw_bottom(layer);
        } else {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex as isize);
            SetParent(hwnd, Some(h(layer.workerw)))?;
        }
        // Child coordinates are relative to the parent, which starts at the virtual desktop origin.
        let after = if layer.raised && layer.defview != 0 {
            Some(h(layer.defview))
        } else {
            None
        };
        SetWindowPos(
            hwnd,
            after,
            0,
            0,
            area.w,
            area.h,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        )?;
        let _ = ShowWindow(hwnd, SW_SHOWNA);
    }
    Ok(())
}

/// In the raised desktop the `WorkerW` must stay the bottom child of `Progman`.
pub fn ensure_workerw_bottom(layer: &DesktopLayer) {
    if !layer.raised || layer.workerw == 0 {
        return;
    }
    unsafe {
        let last = GetWindow(h(layer.progman), GW_CHILD)
            .and_then(|first| GetWindow(first, GW_HWNDLAST))
            .map(hv)
            .unwrap_or(0);
        if last != layer.workerw {
            let _ = SetWindowPos(
                h(layer.workerw),
                Some(HWND_BOTTOM),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
}

/// Whether the desktop windows we attached to still exist (Explorer restarts recreate them).
pub fn layer_alive(layer: &DesktopLayer) -> bool {
    unsafe {
        IsWindow(Some(h(layer.progman))).as_bool()
            && (layer.raised || IsWindow(Some(h(layer.workerw))).as_bool())
    }
}

/// Takes the wallpaper away from the desktop and repaints the normal Windows wallpaper.
pub fn detach(hwnd: HWND, layer: &DesktopLayer) {
    unsafe {
        let _ = ShowWindow(hwnd, SW_HIDE);
        let _ = SetParent(hwnd, None);
        if !layer.raised {
            refresh_desktop();
        }
    }
}

/// Repaints the Windows wallpaper (removes leftovers of a live wallpaper).
pub fn refresh_desktop() {
    if let Some(path) = current_wallpaper() {
        let _ = set_wallpaper_file(&path);
    }
}

/// Shows or hides the desktop icons (`FolderView` list in `SHELLDLL_DefView`).
pub fn set_icons_visible(layer: &DesktopLayer, visible: bool) {
    if layer.defview == 0 {
        return;
    }
    unsafe {
        if let Ok(list) = FindWindowExW(
            Some(h(layer.defview)),
            None,
            w!("SysListView32"),
            w!("FolderView"),
        ) {
            let _ = ShowWindow(list, if visible { SW_SHOWNA } else { SW_HIDE });
        }
    }
}

/// Path of the current Windows wallpaper image.
pub fn current_wallpaper() -> Option<String> {
    let mut buf = vec![0u16; 1024];
    unsafe {
        SystemParametersInfoW(
            SPI_GETDESKWALLPAPER,
            buf.len() as u32,
            Some(buf.as_mut_ptr().cast()),
            Default::default(),
        )
        .ok()?;
    }
    let p = from_wide(&buf);
    (!p.is_empty()).then_some(p)
}

/// Sets a plain Windows wallpaper (fallback when the live wallpaper cannot be attached).
pub fn set_wallpaper_file(path: &str) -> AppResult<()> {
    let mut w = wide(path);
    unsafe {
        SystemParametersInfoW(
            SPI_SETDESKWALLPAPER,
            0,
            Some(w.as_mut_ptr().cast()),
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        )
        .map_err(|e| AppError::Win(e.message()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_desktop_layer() {
        // Explorer runs on every desktop session this test runs in.
        let layer = find_layer().expect("desktop layer");
        assert!(layer.progman != 0);
        assert!(layer_alive(&layer));
    }
}
