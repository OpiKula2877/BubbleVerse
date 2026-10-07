//! Key combos like `Ctrl+Alt+B` (same names as `packages/ui/src/shortcuts.ts`) and their
//! Windows virtual-key codes.

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
pub struct Combo {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
    pub vk: u32,
}

const NAMED: &[(&str, u32)] = &[
    ("space", 0x20),
    ("enter", 0x0D),
    ("return", 0x0D),
    ("tab", 0x09),
    ("esc", 0x1B),
    ("escape", 0x1B),
    ("backspace", 0x08),
    ("delete", 0x2E),
    ("del", 0x2E),
    ("insert", 0x2D),
    ("ins", 0x2D),
    ("home", 0x24),
    ("end", 0x23),
    ("pageup", 0x21),
    ("pgup", 0x21),
    ("pagedown", 0x22),
    ("pgdn", 0x22),
    ("left", 0x25),
    ("up", 0x26),
    ("right", 0x27),
    ("down", 0x28),
    ("printscreen", 0x2C),
    ("pause", 0x13),
    ("comma", 0xBC),
    ("period", 0xBE),
    ("minus", 0xBD),
    ("plus", 0xBB),
    ("capslock", 0x14),
    ("numlock", 0x90),
    ("scrolllock", 0x91),
    ("apps", 0x5D),
    ("ctrl", 0x11),
    ("control", 0x11),
    ("alt", 0x12),
    ("shift", 0x10),
    ("win", 0x5B),
    ("volumemute", 0xAD),
    ("volumedown", 0xAE),
    ("volumeup", 0xAF),
    ("medianext", 0xB0),
    ("mediaprev", 0xB1),
    ("mediastop", 0xB2),
    ("mediaplaypause", 0xB3),
    ("nummultiply", 0x6A),
    ("numadd", 0x6B),
    ("numsubtract", 0x6D),
    ("numdecimal", 0x6E),
    ("numdivide", 0x6F),
    ("oem1", 0xBA),
    ("oem2", 0xBF),
    ("oem3", 0xC0),
    ("oem4", 0xDB),
    ("oem5", 0xDC),
    ("oem6", 0xDD),
    ("oem7", 0xDE),
    ("oem8", 0xDF),
    ("oem102", 0xE2),
];

/// Names for `key_name`, as people write them (the first spelling of each key in `NAMED`).
const DISPLAY: &[(u32, &str)] = &[
    (0x20, "Space"),
    (0x0D, "Enter"),
    (0x09, "Tab"),
    (0x1B, "Esc"),
    (0x08, "Backspace"),
    (0x2E, "Delete"),
    (0x2D, "Insert"),
    (0x24, "Home"),
    (0x23, "End"),
    (0x21, "PageUp"),
    (0x22, "PageDown"),
    (0x25, "Left"),
    (0x26, "Up"),
    (0x27, "Right"),
    (0x28, "Down"),
    (0x2C, "PrintScreen"),
    (0x13, "Pause"),
    (0xBC, "Comma"),
    (0xBE, "Period"),
    (0xBD, "Minus"),
    (0xBB, "Plus"),
    (0x14, "CapsLock"),
    (0x90, "NumLock"),
    (0x91, "ScrollLock"),
    (0x5D, "Apps"),
    (0x10, "Shift"),
    (0xA0, "Shift"),
    (0xA1, "Shift"),
    (0x11, "Ctrl"),
    (0xA2, "Ctrl"),
    (0xA3, "Ctrl"),
    (0x12, "Alt"),
    (0xA4, "Alt"),
    (0xA5, "Alt"),
    (0x5B, "Win"),
    (0x5C, "Win"),
    (0xAD, "VolumeMute"),
    (0xAE, "VolumeDown"),
    (0xAF, "VolumeUp"),
    (0xB0, "MediaNext"),
    (0xB1, "MediaPrev"),
    (0xB2, "MediaStop"),
    (0xB3, "MediaPlayPause"),
    (0x6A, "NumMultiply"),
    (0x6B, "NumAdd"),
    (0x6D, "NumSubtract"),
    (0x6E, "NumDecimal"),
    (0x6F, "NumDivide"),
    (0xBA, "Oem1"),
    (0xBF, "Oem2"),
    (0xC0, "Oem3"),
    (0xDB, "Oem4"),
    (0xDC, "Oem5"),
    (0xDD, "Oem6"),
    (0xDE, "Oem7"),
    (0xDF, "Oem8"),
    (0xE2, "Oem102"),
];

/// Name of a virtual-key code that `vk_of` reads back (`None` for keys without a name).
pub fn key_name(vk: u32) -> Option<String> {
    match vk {
        0x30..=0x39 | 0x41..=0x5A => char::from_u32(vk).map(String::from),
        0x60..=0x69 => Some(format!("Num{}", vk - 0x60)),
        0x70..=0x87 => Some(format!("F{}", vk - 0x70 + 1)),
        _ => DISPLAY
            .iter()
            .find(|(v, _)| *v == vk)
            .map(|(_, n)| n.to_string()),
    }
}

/// Virtual-key code of a key name (`A`, `7`, `F5`, `Num3`, `Space`, `PageUp`…).
pub fn vk_of(name: &str) -> Option<u32> {
    let n = name.trim();
    if n.chars().count() == 1 {
        let c = n.chars().next()?.to_ascii_uppercase();
        if c.is_ascii_uppercase() || c.is_ascii_digit() {
            return Some(c as u32);
        }
        return match c {
            ' ' => Some(0x20),
            ',' => Some(0xBC),
            '.' => Some(0xBE),
            '-' => Some(0xBD),
            '+' | '=' => Some(0xBB),
            _ => None,
        };
    }
    let lower = n.to_ascii_lowercase();
    if let Some(num) = lower.strip_prefix('f').and_then(|d| d.parse::<u32>().ok()) {
        return (1..=24).contains(&num).then_some(0x70 + num - 1);
    }
    if let Some(num) = lower
        .strip_prefix("num")
        .and_then(|d| d.parse::<u32>().ok())
    {
        return (num <= 9).then_some(0x60 + num);
    }
    NAMED.iter().find(|(k, _)| *k == lower).map(|(_, v)| *v)
}

/// Whether a virtual-key code is a modifier (they never trigger a shortcut on their own).
pub fn is_modifier(vk: u32) -> bool {
    matches!(vk, 0x10 | 0x11 | 0x12 | 0x5B | 0x5C | 0xA0..=0xA5)
}

pub fn parse_combo(text: &str) -> Option<Combo> {
    let mut c = Combo::default();
    let mut parts: Vec<String> = text
        .split('+')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    if text.trim_end().ends_with("++") {
        parts.push("Plus".into());
    }
    let mut key = None;
    for p in parts {
        match p.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => c.ctrl = true,
            "alt" => c.alt = true,
            "shift" => c.shift = true,
            "win" | "meta" | "super" => c.win = true,
            _ => {
                if key.is_some() {
                    return None;
                }
                key = Some(vk_of(&p)?);
            }
        }
    }
    c.vk = key?;
    Some(c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_names_read_back() {
        for vk in (0x08..=0xFE).filter(|v| !is_modifier(*v)) {
            if let Some(name) = key_name(vk) {
                assert_eq!(vk_of(&name), Some(vk), "{name}");
            }
        }
        assert_eq!(key_name(0x41).as_deref(), Some("A"));
        assert_eq!(key_name(0x74).as_deref(), Some("F5"));
        assert_eq!(key_name(0xBF).as_deref(), Some("Oem2"));
    }

    #[test]
    fn parses_combos() {
        assert_eq!(
            parse_combo("Ctrl+Alt+B"),
            Some(Combo {
                ctrl: true,
                alt: true,
                shift: false,
                win: false,
                vk: 0x42
            })
        );
        assert_eq!(parse_combo("alt+space").map(|c| c.vk), Some(0x20));
        assert_eq!(parse_combo("Ctrl+Alt+Shift+S").map(|c| c.shift), Some(true));
        assert_eq!(parse_combo("Home").map(|c| c.vk), Some(0x24));
        assert_eq!(
            parse_combo("Win+F12").map(|c| (c.win, c.vk)),
            Some((true, 0x7B))
        );
        assert_eq!(parse_combo("Ctrl++").map(|c| c.vk), Some(0xBB));
        assert_eq!(parse_combo("Num5").map(|c| c.vk), Some(0x65));
        assert_eq!(parse_combo("Ctrl+Alt"), None);
        assert_eq!(parse_combo("Ctrl+A+B"), None);
        assert_eq!(parse_combo("Ctrl+Bogus"), None);
    }

    #[test]
    fn knows_modifiers() {
        assert!(is_modifier(0xA2));
        assert!(is_modifier(0x5B));
        assert!(!is_modifier(0x41));
    }
}
