//! Signals for the automatic pause (spec §7.4, §8.6): a full-screen app or game, a maximized
//! window over the desktop, battery saver and a locked session.

use serde::Serialize;
use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::System::StationsAndDesktops::{
    CloseDesktop, GetUserObjectInformationW, OpenInputDesktop, DESKTOP_CONTROL_FLAGS,
    DESKTOP_READOBJECTS, UOI_NAME,
};
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible, IsZoomed,
};

use super::com::from_wide;
use super::hook::desktop_in_front;

#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Signals {
    pub fullscreen: bool,
    pub maximized: bool,
    pub battery_saver: bool,
    pub locked: bool,
    /// Running on battery (for the battery saver hint).
    pub on_battery: bool,
}

pub fn fullscreen_app() -> bool {
    match unsafe { SHQueryUserNotificationState() } {
        Ok(s) => s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

/// A maximized (or full-monitor) window of another app is in front, so the desktop is hidden.
pub fn maximized_over_desktop() -> bool {
    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() || desktop_in_front() || !IsWindowVisible(fg).as_bool() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, Some(&mut pid));
        if pid == std::process::id() {
            return false;
        }
        if IsZoomed(fg).as_bool() {
            return true;
        }
        let mut r = RECT::default();
        if GetWindowRect(fg, &mut r).is_err() {
            return false;
        }
        let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(mon, &mut info).as_bool() {
            return false;
        }
        let m = info.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}

pub fn power() -> (bool, bool) {
    let mut s = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() {
        return (false, false);
    }
    // ACLineStatus 0 = on battery; SystemStatusFlag 1 = battery saver on.
    (s.SystemStatusFlag == 1, s.ACLineStatus == 0)
}

/// The input desktop is not "Default" while the session is locked (or UAC is shown).
pub fn session_locked() -> bool {
    unsafe {
        let Ok(desk) = OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS)
        else {
            return true;
        };
        let mut buf = [0u16; 64];
        let ok = GetUserObjectInformationW(
            windows::Win32::Foundation::HANDLE(desk.0),
            UOI_NAME,
            Some(buf.as_mut_ptr().cast()),
            (buf.len() * 2) as u32,
            None,
        )
        .is_ok();
        let _ = CloseDesktop(desk);
        ok && !from_wide(&buf).eq_ignore_ascii_case("Default")
    }
}

pub fn read() -> Signals {
    let (battery_saver, on_battery) = power();
    Signals {
        fullscreen: fullscreen_app(),
        maximized: maximized_over_desktop(),
        battery_saver,
        locked: session_locked(),
        on_battery,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_signals_without_failing() {
        let s = read();
        // The test runs in an unlocked interactive session.
        assert!(!s.locked);
    }
}
