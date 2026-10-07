//! Small system facts for sensing blocks: clipboard, idle time, battery, pixel color, internet.

use windows::Win32::Foundation::{HANDLE, HGLOBAL, POINT};
use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
use windows::Win32::Networking::WinInet::{InternetGetConnectedState, INTERNET_CONNECTION};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber, OpenClipboard,
    SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

use crate::error::{AppError, AppResult};

const CF_UNICODETEXT: u32 = 13;

pub fn clipboard_text() -> String {
    unsafe {
        if OpenClipboard(None).is_err() {
            return String::new();
        }
        let mut out = String::new();
        if let Ok(h) = GetClipboardData(CF_UNICODETEXT) {
            let g = HGLOBAL(h.0);
            let p = GlobalLock(g) as *const u16;
            if !p.is_null() {
                let mut len = 0;
                while *p.add(len) != 0 {
                    len += 1;
                }
                out = String::from_utf16_lossy(std::slice::from_raw_parts(p, len));
                let _ = GlobalUnlock(g);
            }
        }
        let _ = CloseClipboard();
        out
    }
}

pub fn set_clipboard_text(text: &str) -> AppResult<()> {
    let wide: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
    unsafe {
        OpenClipboard(None)?;
        let result = (|| -> AppResult<()> {
            EmptyClipboard()?;
            let g = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2)?;
            let p = GlobalLock(g) as *mut u16;
            if p.is_null() {
                return Err(AppError::msg("clipboard memory"));
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), p, wide.len());
            let _ = GlobalUnlock(g);
            SetClipboardData(CF_UNICODETEXT, Some(HANDLE(g.0)))?;
            Ok(())
        })();
        let _ = CloseClipboard();
        result
    }
}

/// Changes whenever the clipboard content changes.
pub fn clipboard_sequence() -> u32 {
    unsafe { GetClipboardSequenceNumber() }
}

pub fn idle_seconds() -> f64 {
    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    unsafe {
        if !GetLastInputInfo(&mut info).as_bool() {
            return 0.0;
        }
        f64::from(GetTickCount().wrapping_sub(info.dwTime)) / 1000.0
    }
}

/// (percent 0–100, charging)
pub fn battery() -> (f64, bool) {
    let mut s = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() {
        return (100.0, false);
    }
    let pct = if s.BatteryLifePercent == 255 {
        100.0
    } else {
        f64::from(s.BatteryLifePercent)
    };
    (pct, s.ACLineStatus == 1)
}

pub fn cursor() -> (i32, i32) {
    let mut p = POINT::default();
    unsafe {
        let _ = GetCursorPos(&mut p);
    }
    (p.x, p.y)
}

/// `#RRGGBB` of the screen pixel.
pub fn pixel(x: i32, y: i32) -> String {
    unsafe {
        let dc = GetDC(None);
        let c = GetPixel(dc, x, y).0;
        ReleaseDC(None, dc);
        format!(
            "#{:02X}{:02X}{:02X}",
            c & 0xFF,
            (c >> 8) & 0xFF,
            (c >> 16) & 0xFF
        )
    }
}

pub fn internet() -> bool {
    let mut flags = INTERNET_CONNECTION(0);
    unsafe { InternetGetConnectedState(&mut flags, None).is_ok() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_basic_facts() {
        let (pct, _) = battery();
        assert!((0.0..=100.0).contains(&pct));
        assert!(idle_seconds() >= 0.0);
        assert_eq!(pixel(0, 0).len(), 7);
    }
}
