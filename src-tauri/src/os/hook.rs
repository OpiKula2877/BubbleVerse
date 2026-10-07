//! Low-level keyboard hook for shortcuts (spec §8.6). It runs in its own thread with a message
//! loop and only hands events over, so Windows never drops it for being slow. It is re-installed
//! every minute in case Windows removed it anyway.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Mutex, OnceLock, RwLock};

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetClassNameW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId,
    SetTimer, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG,
    WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN, WM_TIMER,
};

use super::keys::{is_modifier, Combo};
use super::{input, recorder};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
    /// Works everywhere ("venkovní").
    Global,
    /// Only while a BubbleVerse window is in front ("vnitřní").
    App,
}

#[derive(Clone, Debug)]
pub struct Binding {
    pub combo: Combo,
    /// What to do, e.g. `action:globalSearch` or `script:<bubble>:<slot>`.
    pub id: String,
    pub scope: Scope,
    /// Take the combo away from Windows and other apps ("override Windows").
    pub swallow: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum HookEvent {
    Shortcut(String),
    /// `Ctrl+F` while the desktop is active (spec §2.2).
    DesktopSearch,
}

struct Shared {
    bindings: RwLock<Vec<Binding>>,
    tx: Mutex<Option<Sender<HookEvent>>>,
    /// Keys whose key-down we swallowed: their key-up is swallowed too.
    swallowed: Mutex<HashSet<u32>>,
    /// Keys that already fired and are still held (no repeats while held).
    held: Mutex<HashSet<u32>>,
    desktop_search: AtomicBool,
    /// While a shortcut is being typed into the settings, nothing fires.
    paused: AtomicBool,
}

static SHARED: OnceLock<Shared> = OnceLock::new();

fn shared() -> &'static Shared {
    SHARED.get_or_init(|| Shared {
        bindings: RwLock::new(Vec::new()),
        tx: Mutex::new(None),
        swallowed: Mutex::new(HashSet::new()),
        held: Mutex::new(HashSet::new()),
        desktop_search: AtomicBool::new(false),
        paused: AtomicBool::new(false),
    })
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn set_bindings(bindings: Vec<Binding>) {
    if let Ok(mut b) = shared().bindings.write() {
        *b = bindings;
    }
}

/// `Ctrl+F` on the desktop opens search only while the wallpaper runs.
pub fn set_desktop_search(on: bool) {
    shared().desktop_search.store(on, Ordering::Relaxed);
}

pub fn set_paused(on: bool) {
    shared().paused.store(on, Ordering::Relaxed);
}

fn send(ev: HookEvent) {
    if let Some(tx) = lock(&shared().tx).as_ref() {
        let _ = tx.send(ev);
    }
}

fn pressed(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn foreground() -> HWND {
    unsafe { GetForegroundWindow() }
}

/// Whether a BubbleVerse window is in front.
pub fn app_in_front() -> bool {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(foreground(), Some(&mut pid)) };
    pid == std::process::id()
}

/// Whether the desktop (wallpaper and icons) is the active window.
pub fn desktop_in_front() -> bool {
    let mut buf = [0u16; 64];
    let n = unsafe { GetClassNameW(foreground(), &mut buf) };
    let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
    matches!(class.as_str(), "Progman" | "WorkerW" | "SHELLDLL_DefView")
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        if (kb.flags.0 & LLKHF_INJECTED.0) == 0 && handle(wparam.0 as u32, kb.vkCode, kb.time) {
            return LRESULT(1);
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// Returns true when the key event must be swallowed.
fn handle(msg: u32, vk: u32, time: u32) -> bool {
    let s = shared();
    let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    if recorder::is_recording() {
        recorder::key(vk, down, time);
    }
    if !down {
        lock(&s.held).remove(&vk);
        return lock(&s.swallowed).remove(&vk);
    }
    if lock(&s.swallowed).contains(&vk) {
        // Auto-repeat of a swallowed key.
        return true;
    }
    if is_modifier(vk) || s.paused.load(Ordering::Relaxed) {
        return false;
    }
    let combo = Combo {
        ctrl: pressed(0x11),
        alt: pressed(0x12),
        shift: pressed(0x10),
        win: pressed(0x5B) || pressed(0x5C),
        vk,
    };
    let repeat = !lock(&s.held).insert(vk);
    let found = s.bindings.read().ok().and_then(|bindings| {
        bindings
            .iter()
            .find(|b| b.combo == combo && (b.scope == Scope::Global || app_in_front()))
            .map(|b| (b.id.clone(), b.swallow))
    });
    let (id, swallow) = match found {
        Some(f) => f,
        None => {
            let desktop = s.desktop_search.load(Ordering::Relaxed)
                && combo
                    == Combo {
                        ctrl: true,
                        vk: 0x46,
                        ..Combo::default()
                    }
                && desktop_in_front();
            if !desktop {
                return false;
            }
            ("desktop".to_string(), true)
        }
    };
    if !repeat {
        if id == "desktop" {
            send(HookEvent::DesktopSearch);
        } else {
            send(HookEvent::Shortcut(id));
        }
    }
    if swallow {
        lock(&s.swallowed).insert(vk);
        if combo.alt || combo.win {
            // Releasing Alt or Win alone would open the window menu or Start: an unassigned
            // key in between cancels that.
            input::tap_dummy_key();
        }
    }
    swallow
}

fn install() -> Option<HHOOK> {
    unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0).ok() }
}

/// Starts the hook thread. Events go to `tx`.
pub fn start(tx: Sender<HookEvent>) {
    *lock(&shared().tx) = Some(tx);
    std::thread::Builder::new()
        .name("bv-keyboard-hook".into())
        .spawn(|| unsafe {
            let mut hook = install();
            SetTimer(None, 0, 60_000, None);
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                if msg.message == WM_TIMER {
                    // Windows silently drops hooks that were too slow; put it back.
                    if let Some(h) = hook.take() {
                        let _ = UnhookWindowsHookEx(h);
                    }
                    hook = install();
                }
            }
            if let Some(h) = hook {
                let _ = UnhookWindowsHookEx(h);
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::os::keys::parse_combo;

    #[test]
    fn fires_bindings_once_while_held_and_swallows_key_up() {
        let (tx, rx) = std::sync::mpsc::channel();
        *lock(&shared().tx) = Some(tx);
        // A binding without modifiers can be tested without pressing real keys.
        set_bindings(vec![Binding {
            combo: parse_combo("F24").unwrap(),
            id: "action:test".into(),
            scope: Scope::Global,
            swallow: true,
        }]);
        assert!(handle(WM_KEYDOWN, 0x87, 0));
        assert!(handle(WM_KEYDOWN, 0x87, 0));
        assert!(handle(0x0101, 0x87, 0));
        assert_eq!(rx.try_recv(), Ok(HookEvent::Shortcut("action:test".into())));
        assert!(rx.try_recv().is_err());
        assert!(!handle(WM_KEYDOWN, 0x86, 0));
        assert!(!handle(0x0101, 0x86, 0));
        set_bindings(Vec::new());
    }
}
