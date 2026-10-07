use serde::Serialize;
use windows::core::BOOL;
use windows::Win32::Foundation::{LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::MONITORINFOF_PRIMARY;

use super::com::from_wide;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq, Default)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    fn from_win(r: &RECT) -> Self {
        Rect {
            x: r.left,
            y: r.top,
            w: r.right - r.left,
            h: r.bottom - r.top,
        }
    }

    pub fn union(&self, o: &Rect) -> Rect {
        let x = self.x.min(o.x);
        let y = self.y.min(o.y);
        let r = (self.x + self.w).max(o.x + o.w);
        let b = (self.y + self.h).max(o.y + o.h);
        Rect {
            x,
            y,
            w: r - x,
            h: b - y,
        }
    }
}

/// A monitor in physical pixels of the virtual desktop (spec §8.5).
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    /// Device name, e.g. `\\.\DISPLAY1`.
    pub id: String,
    pub rect: Rect,
    pub work: Rect,
    /// DPI scale, 1.0 = 100 %.
    pub scale: f64,
    /// Windows primary monitor.
    pub primary: bool,
}

pub fn list_monitors() -> Vec<MonitorInfo> {
    unsafe extern "system" fn enum_proc(
        hmon: HMONITOR,
        _hdc: HDC,
        _rect: *mut RECT,
        data: LPARAM,
    ) -> BOOL {
        let out = &mut *(data.0 as *mut Vec<MonitorInfo>);
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(hmon, &mut info as *mut MONITORINFOEXW as *mut MONITORINFO).as_bool() {
            let (mut dx, mut dy) = (96u32, 96u32);
            let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
            out.push(MonitorInfo {
                id: from_wide(&info.szDevice),
                rect: Rect::from_win(&info.monitorInfo.rcMonitor),
                work: Rect::from_win(&info.monitorInfo.rcWork),
                scale: f64::from(dx) / 96.0,
                primary: info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
            });
        }
        BOOL(1)
    }
    let mut out: Vec<MonitorInfo> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(enum_proc),
            LPARAM(&mut out as *mut Vec<MonitorInfo> as isize),
        );
    }
    out.sort_by_key(|m| (m.rect.x, m.rect.y));
    out
}

/// The monitor that shows the UI: the one chosen in settings, else the Windows primary one.
pub fn ui_monitor<'a>(
    monitors: &'a [MonitorInfo],
    chosen: Option<&str>,
) -> Option<&'a MonitorInfo> {
    chosen
        .and_then(|id| monitors.iter().find(|m| m.id == id))
        .or_else(|| monitors.iter().find(|m| m.primary))
        .or_else(|| monitors.first())
}

/// Bounding box of all monitors.
pub fn virtual_desktop(monitors: &[MonitorInfo]) -> Rect {
    monitors
        .iter()
        .map(|m| m.rect)
        .reduce(|a, b| a.union(&b))
        .unwrap_or(Rect {
            x: 0,
            y: 0,
            w: 1920,
            h: 1080,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(id: &str, x: i32, w: i32, scale: f64, primary: bool) -> MonitorInfo {
        let rect = Rect {
            x,
            y: 0,
            w,
            h: 1080,
        };
        MonitorInfo {
            id: id.into(),
            rect,
            work: rect,
            scale,
            primary,
        }
    }

    #[test]
    fn picks_ui_monitor_and_virtual_desktop() {
        let ms = vec![
            mon("A", -1920, 1920, 1.0, false),
            mon("B", 0, 2560, 1.5, true),
        ];
        assert_eq!(ui_monitor(&ms, None).unwrap().id, "B");
        assert_eq!(ui_monitor(&ms, Some("A")).unwrap().id, "A");
        assert_eq!(ui_monitor(&ms, Some("gone")).unwrap().id, "B");
        assert_eq!(
            virtual_desktop(&ms),
            Rect {
                x: -1920,
                y: 0,
                w: 4480,
                h: 1080
            }
        );
    }

    #[test]
    fn lists_at_least_one_real_monitor() {
        let ms = list_monitors();
        assert!(!ms.is_empty());
        assert!(ms.iter().all(|m| m.scale >= 1.0 && m.rect.w > 0));
    }
}
