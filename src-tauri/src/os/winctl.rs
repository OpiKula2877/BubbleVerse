//! Controlling other apps' windows: find by title, focus, minimize, move, resize, topmost.

use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, PostMessageW, SetWindowPos, ShowWindow,
    HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, WM_CLOSE,
};

use super::focus::force_foreground;
use super::monitors::list_monitors;
use super::process::name_of;
use crate::error::{AppError, AppResult};

fn h(v: isize) -> HWND {
    HWND(v as *mut core::ffi::c_void)
}

pub fn title_of(hwnd: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; len as usize + 1];
        let n = GetWindowTextW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }
}

pub fn foreground() -> HWND {
    unsafe { GetForegroundWindow() }
}

pub fn foreground_title() -> String {
    title_of(foreground())
}

pub fn foreground_process() -> String {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(foreground(), Some(&mut pid)) };
    name_of(pid).unwrap_or_default()
}

/// A visible top-level window whose title contains `title` (case-insensitive).
/// An empty title means the active window.
pub fn find(title: &str) -> Option<isize> {
    let t = title.trim().to_lowercase();
    if t.is_empty() {
        let fg = foreground();
        return (!fg.0.is_null()).then_some(fg.0 as isize);
    }
    struct Search {
        needle: String,
        found: isize,
    }
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let s = &mut *(data.0 as *mut Search);
        if IsWindowVisible(hwnd).as_bool() && title_of(hwnd).to_lowercase().contains(&s.needle) {
            s.found = hwnd.0 as isize;
            return BOOL(0);
        }
        BOOL(1)
    }
    let mut s = Search {
        needle: t,
        found: 0,
    };
    unsafe {
        let _ = EnumWindows(Some(each), LPARAM(&mut s as *mut Search as isize));
    }
    (s.found != 0).then_some(s.found)
}

pub fn require(title: &str) -> AppResult<isize> {
    find(title).ok_or_else(|| AppError::msg(format!("window \"{title}\" not found")))
}

pub fn focus(hwnd: isize) {
    unsafe {
        if IsIconic(h(hwnd)).as_bool() {
            let _ = ShowWindow(h(hwnd), SW_RESTORE);
        }
    }
    force_foreground(h(hwnd));
}

/// "minimize" | "maximize" | "restore" | "close"
pub fn set_state(hwnd: isize, action: &str) {
    unsafe {
        match action {
            "minimize" => {
                let _ = ShowWindow(h(hwnd), SW_MINIMIZE);
            }
            "maximize" => {
                let _ = ShowWindow(h(hwnd), SW_MAXIMIZE);
            }
            "close" => {
                let _ = PostMessageW(Some(h(hwnd)), WM_CLOSE, WPARAM(0), LPARAM(0));
            }
            _ => {
                let _ = ShowWindow(h(hwnd), SW_RESTORE);
            }
        }
    }
}

pub fn rect(hwnd: isize) -> RECT {
    let mut r = RECT::default();
    unsafe {
        let _ = GetWindowRect(h(hwnd), &mut r);
    }
    r
}

pub fn move_to(hwnd: isize, x: i32, y: i32) -> AppResult<()> {
    unsafe {
        let _ = ShowWindow(h(hwnd), SW_RESTORE);
        SetWindowPos(
            h(hwnd),
            None,
            x,
            y,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        )?;
    }
    Ok(())
}

pub fn resize(hwnd: isize, w: i32, hgt: i32) -> AppResult<()> {
    unsafe {
        let _ = ShowWindow(h(hwnd), SW_RESTORE);
        SetWindowPos(
            h(hwnd),
            None,
            0,
            0,
            w,
            hgt,
            SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE,
        )?;
    }
    Ok(())
}

pub fn topmost(hwnd: isize, on: bool) -> AppResult<()> {
    unsafe {
        SetWindowPos(
            h(hwnd),
            Some(if on { HWND_TOPMOST } else { HWND_NOTOPMOST }),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )?;
    }
    Ok(())
}

/// Moves a window to monitor `n` (1-based, left to right), keeping its offset in the work area.
pub fn move_to_monitor(hwnd: isize, n: usize) -> AppResult<()> {
    let monitors = list_monitors();
    let target = monitors
        .get(n.saturating_sub(1))
        .ok_or_else(|| AppError::msg(format!("monitor {n} does not exist")))?;
    let r = rect(hwnd);
    let current = monitors
        .iter()
        .find(|m| {
            let cx = (r.left + r.right) / 2;
            let cy = (r.top + r.bottom) / 2;
            cx >= m.rect.x && cx < m.rect.x + m.rect.w && cy >= m.rect.y && cy < m.rect.y + m.rect.h
        })
        .unwrap_or(target);
    let dx = r.left - current.work.x;
    let dy = r.top - current.work.y;
    let w = r.right - r.left;
    let hh = r.bottom - r.top;
    let x = target.work.x + dx.clamp(0, (target.work.w - w).max(0));
    let y = target.work.y + dy.clamp(0, (target.work.h - hh).max(0));
    move_to(hwnd, x, y)
}
