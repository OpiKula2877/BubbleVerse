//! Bringing a window to the front from the background. Windows normally refuses
//! `SetForegroundWindow` for processes that did not receive the last input, so an empty mouse
//! input (no move, no button) is sent first: it makes this process the one with the last input.
//!
//! Borrowing the input queue of the foreground window (`AttachThreadInput`) is not used: with
//! the desktop in front (Ctrl+F on the desktop), the desktop then shared the cursor state of
//! the search bar, and after typing there ("Hide pointer while typing") the pointer stayed
//! invisible over the desktop.

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_MOUSE, MOUSEINPUT, MOUSE_EVENT_FLAGS,
};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, SetForegroundWindow, ShowWindow, SW_SHOW,
};

/// A mouse input that does nothing: no movement, no buttons, no wheel.
fn empty_mouse_input() -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: MOUSE_EVENT_FLAGS(0),
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

pub fn force_foreground(hwnd: HWND) {
    super::input::send(&[empty_mouse_input()]);
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_input_that_unlocks_the_foreground_does_nothing() {
        let i = empty_mouse_input();
        assert_eq!(i.r#type, INPUT_MOUSE);
        let mi = unsafe { i.Anonymous.mi };
        assert_eq!((mi.dx, mi.dy, mi.mouseData), (0, 0, 0));
        assert_eq!(mi.dwFlags, MOUSE_EVENT_FLAGS(0));
    }
}
