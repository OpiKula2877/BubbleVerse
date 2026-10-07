//! Recording a macro (spec §5.1): keys, mouse clicks and the wheel with their times. Input
//! into BubbleVerse's own windows is left out, so the stop button itself is not recorded.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, GetKeyState, GetKeyboardLayout, MapVirtualKeyExW, ToUnicodeEx,
    MAPVK_VK_TO_VSC,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId, PeekMessageW,
    PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx, WindowFromPoint, MSG,
    MSLLHOOKSTRUCT, PM_NOREMOVE, WH_MOUSE_LL, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN,
    WM_MBUTTONUP, WM_MOUSEWHEEL, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP,
};

use super::keys::{is_modifier, key_name};

/// `ToUnicodeEx` flag: do not change the keyboard state (dead keys keep working).
const KEEP_KEYBOARD_STATE: u32 = 0x4;
const LLMHF_INJECTED: u32 = 0x1;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MacroEvent {
    #[serde(rename_all = "camelCase")]
    Key {
        /// Milliseconds (system tick count).
        t: u32,
        /// Key name for `press` blocks (`A`, `Enter`, `Oem2`…).
        key: String,
        down: bool,
        ctrl: bool,
        alt: bool,
        shift: bool,
        win: bool,
        /// Shift, Ctrl, Alt or Win itself.
        modifier: bool,
        /// The text the key types, if it types any.
        text: Option<String>,
        /// A dead key (accent) that changes the next key.
        dead: bool,
    },
    #[serde(rename_all = "camelCase")]
    Button {
        t: u32,
        /// "left" | "right" | "middle"
        button: String,
        down: bool,
        x: i32,
        y: i32,
    },
    #[serde(rename_all = "camelCase")]
    Wheel { t: u32, notches: f64 },
}

static RECORDING: AtomicBool = AtomicBool::new(false);
static EVENTS: Mutex<Vec<MacroEvent>> = Mutex::new(Vec::new());
static MOUSE_THREAD: AtomicU32 = AtomicU32::new(0);

fn push(ev: MacroEvent) {
    EVENTS.lock().unwrap_or_else(|e| e.into_inner()).push(ev);
}

pub fn is_recording() -> bool {
    RECORDING.load(Ordering::Relaxed)
}

fn pressed(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn own_process(hwnd: windows::Win32::Foundation::HWND) -> bool {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    pid == std::process::id()
}

/// Starts recording; a recording that is still running is thrown away.
pub fn start() {
    stop();
    EVENTS.lock().unwrap_or_else(|e| e.into_inner()).clear();
    RECORDING.store(true, Ordering::Relaxed);
    let spawned = std::thread::Builder::new()
        .name("bv-macro-mouse".into())
        .spawn(|| unsafe {
            // Make sure the thread has a message queue before anyone posts to it.
            let mut msg = MSG::default();
            let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
            MOUSE_THREAD.store(GetCurrentThreadId(), Ordering::Relaxed);
            if !is_recording() {
                return;
            }
            let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0).ok();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
            if let Some(h) = hook {
                let _ = UnhookWindowsHookEx(h);
            }
        });
    if let Err(e) = spawned {
        log::warn!("macro recording: mouse hook thread failed: {e}");
    }
}

/// Stops recording and returns what was recorded.
pub fn stop() -> Vec<MacroEvent> {
    RECORDING.store(false, Ordering::Relaxed);
    let tid = MOUSE_THREAD.swap(0, Ordering::Relaxed);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
    std::mem::take(&mut *EVENTS.lock().unwrap_or_else(|e| e.into_inner()))
}

/// A key from the keyboard hook (simulated keys never get here).
pub fn key(vk: u32, down: bool, time: u32) {
    if !is_recording() || own_process(unsafe { GetForegroundWindow() }) {
        return;
    }
    let Some(name) = key_name(vk) else {
        return;
    };
    let ctrl = pressed(0x11);
    let alt = pressed(0x12);
    let shift = pressed(0x10);
    let win = pressed(0x5B) || pressed(0x5C);
    let modifier = is_modifier(vk);
    let (text, dead) = if down && !modifier && !win {
        text_of(vk, ctrl, alt, shift)
    } else {
        (None, false)
    };
    push(MacroEvent::Key {
        t: time,
        key: name,
        down,
        ctrl,
        alt,
        shift,
        win,
        modifier,
        text,
        dead,
    });
}

/// What the key types in the active window's keyboard layout; `dead` for accent keys.
fn text_of(vk: u32, ctrl: bool, alt: bool, shift: bool) -> (Option<String>, bool) {
    unsafe {
        let thread = GetWindowThreadProcessId(GetForegroundWindow(), None);
        let layout = GetKeyboardLayout(thread);
        let mut state = [0u8; 256];
        for (key, on) in [(0x10, shift), (0x11, ctrl), (0x12, alt)] {
            if on {
                state[key] = 0x80;
            }
        }
        if (GetKeyState(0x14) & 1) != 0 {
            state[0x14] = 0x01;
        }
        let scan = MapVirtualKeyExW(vk, MAPVK_VK_TO_VSC, Some(layout));
        let mut buf = [0u16; 8];
        let n = ToUnicodeEx(
            vk,
            scan,
            &state,
            &mut buf,
            KEEP_KEYBOARD_STATE,
            Some(layout),
        );
        if n < 0 {
            return (None, true);
        }
        let text = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
        if text.is_empty() || text.chars().any(char::is_control) {
            (None, false)
        } else {
            (Some(text), false)
        }
    }
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && is_recording() {
        let m = &*(lparam.0 as *const MSLLHOOKSTRUCT);
        if (m.flags & LLMHF_INJECTED) == 0 && !own_process(WindowFromPoint(m.pt)) {
            let (x, y, t) = (m.pt.x, m.pt.y, m.time);
            let button = |button: &str, down: bool| MacroEvent::Button {
                t,
                button: button.into(),
                down,
                x,
                y,
            };
            match wparam.0 as u32 {
                WM_LBUTTONDOWN => push(button("left", true)),
                WM_LBUTTONUP => push(button("left", false)),
                WM_RBUTTONDOWN => push(button("right", true)),
                WM_RBUTTONUP => push(button("right", false)),
                WM_MBUTTONDOWN => push(button("middle", true)),
                WM_MBUTTONUP => push(button("middle", false)),
                WM_MOUSEWHEEL => {
                    let delta = ((m.mouseData >> 16) as u16) as i16;
                    push(MacroEvent::Wheel {
                        t,
                        notches: delta as f64 / 120.0,
                    });
                }
                _ => {}
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}
