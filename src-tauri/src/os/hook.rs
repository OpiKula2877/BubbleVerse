//! Low-level keyboard hook for shortcuts (spec §8.6). It runs in its own thread with a message
//! loop and only hands events over, so Windows never drops it for being slow. It is re-installed
//! every minute in case Windows removed it anyway.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Mutex, OnceLock, RwLock};

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetClassNameW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId,
    SetTimer, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG,
    WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN, WM_TIMER,
};

use super::keys::{format_combo, is_modifier, Combo};
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

/// A key of a chord counts as held for this long without news (a missed key-up never
/// blocks chords for good).
const HELD_MS: u32 = 5000;

/// Modifiers pressed and released with nothing in between fire combos like `Ctrl` alone.
#[derive(Default)]
struct Tap {
    active: bool,
    clean: bool,
    peak: Combo,
}

/// Typing a new shortcut: every key goes here and nowhere else (no Windows menus, no Start,
/// no other app), until all keys are up again.
struct Capture {
    id: u64,
    tx: Sender<Option<String>>,
    combo: Combo,
    order: Vec<u32>,
    held: HashSet<u32>,
}

struct Shared {
    bindings: RwLock<Vec<Binding>>,
    /// Non-modifier keys held now, in press order, with the time of their last key-down.
    down: Mutex<Vec<(u32, u32)>>,
    tap: Mutex<Tap>,
    capture: Mutex<Option<Capture>>,
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
        down: Mutex::new(Vec::new()),
        tap: Mutex::new(Tap::default()),
        capture: Mutex::new(None),
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

static CAPTURE_ID: AtomicU64 = AtomicU64::new(0);

/// Starts typing a new shortcut; the receiver gets its text, or `None` (Esc alone, cancelled).
pub fn begin_capture() -> (u64, Receiver<Option<String>>) {
    let (tx, rx) = std::sync::mpsc::channel();
    let id = CAPTURE_ID.fetch_add(1, Ordering::Relaxed) + 1;
    let old = lock(&shared().capture).replace(Capture {
        id,
        tx,
        combo: Combo::default(),
        order: Vec::new(),
        held: HashSet::new(),
    });
    if let Some(old) = old {
        let _ = old.tx.send(None);
    }
    (id, rx)
}

/// Cancels the capture `id` (a newer one keeps running).
pub fn end_capture(id: u64) {
    let mut g = lock(&shared().capture);
    if g.as_ref().is_some_and(|c| c.id == id) {
        if let Some(c) = g.take() {
            let _ = c.tx.send(None);
        }
    }
}

/// Cancels whatever capture runs.
pub fn cancel_capture() {
    if let Some(c) = lock(&shared().capture).take() {
        let _ = c.tx.send(None);
    }
}

/// A key while capturing; true while a capture swallows it.
fn capture_key(vk: u32, down: bool) -> bool {
    let mut g = lock(&shared().capture);
    let Some(c) = g.as_mut() else {
        return false;
    };
    if down {
        if c.held.insert(vk) && !c.combo.add_modifier(vk) && !c.order.contains(&vk) {
            c.order.push(vk);
        }
        return true;
    }
    // A key that was already down when the capture started only goes away.
    if !c.held.remove(&vk) || !c.held.is_empty() {
        return true;
    }
    let lone_esc = !c.combo.has_modifier() && c.order == [0x1B];
    let text = (!lone_esc).then(|| format_combo(&c.combo, &c.order));
    if let Some(c) = g.take() {
        let _ = c.tx.send(text);
    }
    true
}

fn modifier_down(vk: u32) {
    let mut t = lock(&shared().tap);
    if !t.active {
        *t = Tap {
            active: true,
            clean: lock(&shared().down).is_empty(),
            peak: Combo::default(),
        };
    }
    t.peak.add_modifier(vk);
}

/// Fires a modifier-only combo on the release of a clean tap; true when the release must be
/// swallowed (it was replaced by one that opens no Windows menu).
fn modifier_up(vk: u32) -> bool {
    let s = shared();
    let mut t = lock(&s.tap);
    let mut swallow = false;
    if t.active && t.clean {
        t.clean = false;
        let peak = t.peak.clone();
        let found = s.bindings.read().ok().and_then(|bindings| {
            bindings
                .iter()
                .find(|b| b.combo == peak && (b.scope == Scope::Global || app_in_front()))
                .map(|b| (b.id.clone(), b.swallow))
        });
        if let Some((id, sw)) = found {
            send(HookEvent::Shortcut(id));
            if sw && (peak.alt || peak.win) && matches!(vk, 0x12 | 0xA4 | 0xA5 | 0x5B | 0x5C) {
                super::input::release_without_menu(vk);
                swallow = true;
            }
        }
    }
    // The tap ends once every modifier is up (this one is still reported as down).
    let family: &[i32] = match vk {
        0x11 | 0xA2 | 0xA3 => &[0x11],
        0x12 | 0xA4 | 0xA5 => &[0x12],
        0x10 | 0xA0 | 0xA1 => &[0x10],
        _ => &[0x5B, 0x5C],
    };
    let others = [0x11, 0x12, 0x10, 0x5B, 0x5C]
        .iter()
        .filter(|k| !family.contains(k))
        .any(|&k| pressed(k));
    if !others {
        t.active = false;
    }
    swallow
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
    if capture_key(vk, down) {
        return true;
    }
    if !down {
        lock(&s.held).remove(&vk);
        lock(&s.down).retain(|(k, _)| *k != vk);
        let tap_swallowed = is_modifier(vk) && modifier_up(vk);
        return lock(&s.swallowed).remove(&vk) || tap_swallowed;
    }
    if lock(&s.swallowed).contains(&vk) {
        // Auto-repeat of a swallowed key.
        return true;
    }
    if is_modifier(vk) {
        modifier_down(vk);
        return false;
    }
    lock(&s.tap).clean = false;
    let keys = {
        let mut held = lock(&s.down);
        held.retain(|(k, t)| *k == vk || time.wrapping_sub(*t) < HELD_MS);
        match held.iter_mut().find(|(k, _)| *k == vk) {
            Some(entry) => entry.1 = time,
            None => held.push((vk, time)),
        }
        let mut keys: Vec<u32> = held.iter().map(|(k, _)| *k).collect();
        keys.sort_unstable();
        keys
    };
    if s.paused.load(Ordering::Relaxed) {
        return false;
    }
    let combo = Combo {
        ctrl: pressed(0x11),
        alt: pressed(0x12),
        shift: pressed(0x10),
        win: pressed(0x5B) || pressed(0x5C),
        keys,
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
                        keys: vec![0x46],
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

    // One test for everything that touches the shared hook state, so tests never interleave.
    #[test]
    fn bindings_chords_taps_and_capture() {
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

        let bind = |text: &str, id: &str| Binding {
            combo: parse_combo(text).unwrap(),
            id: id.into(),
            scope: Scope::Global,
            swallow: false,
        };
        set_bindings(vec![bind("F20+F21+F22", "chord"), bind("Shift", "tap")]);
        // F20, F21, F22 held together fire the chord on the last key.
        handle(WM_KEYDOWN, 0x83, 100);
        handle(WM_KEYDOWN, 0x84, 120);
        assert!(rx.try_recv().is_err());
        handle(WM_KEYDOWN, 0x85, 140);
        assert_eq!(rx.try_recv(), Ok(HookEvent::Shortcut("chord".into())));
        for vk in [0x83, 0x84, 0x85] {
            handle(0x0101, vk, 200);
        }
        // A key held long ago without news does not count any more.
        handle(WM_KEYDOWN, 0x83, 1000);
        handle(WM_KEYDOWN, 0x84, 1010);
        handle(WM_KEYDOWN, 0x85, 1000 + HELD_MS + 10);
        assert!(rx.try_recv().is_err());
        for vk in [0x83, 0x84, 0x85] {
            handle(0x0101, vk, 9000);
        }
        // Shift pressed and released alone fires; with a key in between it does not.
        handle(WM_KEYDOWN, 0xA0, 0);
        handle(0x0101, 0xA0, 0);
        assert_eq!(rx.try_recv(), Ok(HookEvent::Shortcut("tap".into())));
        handle(WM_KEYDOWN, 0xA0, 0);
        handle(WM_KEYDOWN, 0x83, 0);
        handle(0x0101, 0x83, 0);
        handle(0x0101, 0xA0, 0);
        assert!(rx.try_recv().is_err());

        // Capturing swallows everything and reports the combo once all keys are up.
        let (_, cap) = begin_capture();
        assert!(handle(WM_KEYDOWN, 0xA2, 0));
        assert!(handle(WM_KEYDOWN, 0x20, 0));
        assert!(handle(0x0101, 0x20, 0));
        assert!(cap.try_recv().is_err());
        assert!(handle(0x0101, 0xA2, 0));
        assert_eq!(cap.try_recv(), Ok(Some("Ctrl+Space".into())));
        let (_, cap) = begin_capture();
        for vk in [0x54, 0x4C, 0x50] {
            handle(WM_KEYDOWN, vk, 0);
        }
        for vk in [0x50, 0x4C, 0x54] {
            handle(0x0101, vk, 0);
        }
        assert_eq!(cap.try_recv(), Ok(Some("T+L+P".into())));
        let (_, cap) = begin_capture();
        handle(WM_KEYDOWN, 0xA0, 0);
        handle(0x0101, 0xA0, 0);
        assert_eq!(cap.try_recv(), Ok(Some("Shift".into())));
        // Esc alone cancels; so does end_capture.
        let (_, cap) = begin_capture();
        handle(WM_KEYDOWN, 0x1B, 0);
        handle(0x0101, 0x1B, 0);
        assert_eq!(cap.try_recv(), Ok(None));
        let (id, cap) = begin_capture();
        end_capture(id);
        assert_eq!(cap.try_recv(), Ok(None));
        // Nothing fired while capturing, and keys pass again afterwards.
        assert!(rx.try_recv().is_err());
        assert!(!handle(WM_KEYDOWN, 0x41, 0));
        assert!(!handle(0x0101, 0x41, 0));
        set_bindings(Vec::new());
    }
}
