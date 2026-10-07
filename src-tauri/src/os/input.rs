//! Simulated keyboard and mouse input (`SendInput`).

use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    VIRTUAL_KEY,
};

/// An unassigned virtual key: pressing it changes nothing but cancels Alt/Win menus.
const VK_DUMMY: u16 = 0xE8;

pub fn key_input(vk: u16, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: if up {
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

pub fn send(inputs: &[INPUT]) -> u32 {
    unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) }
}

pub fn tap_dummy_key() {
    send(&[key_input(VK_DUMMY, false), key_input(VK_DUMMY, true)]);
}
