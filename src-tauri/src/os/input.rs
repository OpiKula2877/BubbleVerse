//! Simulated keyboard and mouse input (`SendInput`) for macro blocks (spec §5.2).

use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEINPUT, MOUSE_EVENT_FLAGS, VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::SetCursorPos;

use super::keys::{parse_combo, vk_of};
use crate::error::{AppError, AppResult};

/// An unassigned virtual key: pressing it changes nothing but cancels Alt/Win menus.
const VK_DUMMY: u16 = 0xE8;

fn is_extended(vk: u16) -> bool {
    matches!(
        vk,
        0x21..=0x28 | 0x2D | 0x2E | 0x5B | 0x5C | 0x6F | 0x90 | 0xA3 | 0xA5
    )
}

pub fn key_input(vk: u16, up: bool) -> INPUT {
    let mut flags = if up {
        KEYEVENTF_KEYUP
    } else {
        KEYBD_EVENT_FLAGS(0)
    };
    if is_extended(vk) {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn unicode_input(unit: u16, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: unit,
                dwFlags: KEYEVENTF_UNICODE
                    | if up {
                        KEYEVENTF_KEYUP
                    } else {
                        KEYBD_EVENT_FLAGS(0)
                    },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn mouse_input(flags: MOUSE_EVENT_FLAGS, data: i32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: data as u32,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

pub fn send(inputs: &[INPUT]) -> u32 {
    unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) }
}

fn sent_all(inputs: &[INPUT]) -> AppResult<()> {
    if send(inputs) as usize == inputs.len() {
        Ok(())
    } else {
        // UIPI: a normal process cannot send input to a window running as administrator (§16).
        Err(AppError::msg(
            "input was blocked (the target window may run as administrator)",
        ))
    }
}

pub fn tap_dummy_key() {
    send(&[key_input(VK_DUMMY, false), key_input(VK_DUMMY, true)]);
}

/// Presses and releases a combo like `Ctrl+Shift+Esc`.
pub fn press_combo(text: &str) -> AppResult<()> {
    let c = parse_combo(text).ok_or_else(|| AppError::msg(format!("unknown keys \"{text}\"")))?;
    let mods: Vec<u16> = [
        (c.ctrl, 0x11),
        (c.alt, 0x12),
        (c.shift, 0x10),
        (c.win, 0x5B),
    ]
    .iter()
    .filter(|(on, _)| *on)
    .map(|(_, vk)| *vk)
    .collect();
    let mut inputs: Vec<INPUT> = mods.iter().map(|&vk| key_input(vk, false)).collect();
    inputs.push(key_input(c.vk as u16, false));
    inputs.push(key_input(c.vk as u16, true));
    inputs.extend(mods.iter().rev().map(|&vk| key_input(vk, true)));
    sent_all(&inputs)
}

/// Holds (`down`) or releases a single key.
pub fn key(name: &str, down: bool) -> AppResult<()> {
    let vk = vk_of(name).ok_or_else(|| AppError::msg(format!("unknown key \"{name}\"")))?;
    sent_all(&[key_input(vk as u16, !down)])
}

/// Types text character by character (any Unicode, independent of the keyboard layout).
pub fn type_char(c: char) -> AppResult<()> {
    let mut buf = [0u16; 2];
    let units = c.encode_utf16(&mut buf);
    let mut inputs = Vec::new();
    for &u in units.iter() {
        inputs.push(unicode_input(u, false));
        inputs.push(unicode_input(u, true));
    }
    sent_all(&inputs)
}

pub fn move_cursor(x: i32, y: i32) -> AppResult<()> {
    unsafe { SetCursorPos(x, y)? };
    Ok(())
}

/// "left" | "right" | "middle"
pub fn click(button: &str, x: i32, y: i32, double: bool) -> AppResult<()> {
    move_cursor(x, y)?;
    let (down, up) = match button {
        "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        _ => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
    };
    let mut inputs = vec![mouse_input(down, 0), mouse_input(up, 0)];
    if double {
        inputs.extend([mouse_input(down, 0), mouse_input(up, 0)]);
    }
    sent_all(&inputs)
}

/// Scroll wheel by `notches` (positive = away from the user).
pub fn wheel(notches: f64) -> AppResult<()> {
    sent_all(&[mouse_input(MOUSEEVENTF_WHEEL, (notches * 120.0) as i32)])
}
