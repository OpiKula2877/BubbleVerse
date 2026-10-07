//! Script triggers that come from the Windows layer (spec §5.2 "Events"): hotkeys now,
//! the rest with the full trigger set.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use super::state::AppState;
use crate::os::hook::{Binding, HookEvent, Scope};
use crate::os::keys::parse_combo;
use crate::script::generated::opcodes::{arg, Op};

/// Hotkeys of "when … is pressed" scripts. They always take the combo away from other apps.
pub fn hotkey_bindings(state: &AppState) -> Vec<Binding> {
    state
        .runtime
        .world()
        .slots_with_trigger(Op::EvHotkey)
        .into_iter()
        .filter_map(|(b, i, s)| {
            let t = &s.script.trigger;
            Some(Binding {
                combo: parse_combo(&t.lit_str(arg::ev_hotkey::COMBO))?,
                id: format!("script:{}:{}", b.id, i),
                scope: if t.lit_str(arg::ev_hotkey::SCOPE) == "app" {
                    Scope::App
                } else {
                    Scope::Global
                },
                swallow: true,
            })
        })
        .collect()
}

/// A script hotkey was pressed: `script:<bubble>:<slot>`.
pub fn fire_hotkey(app: &AppHandle, id: &str) {
    let Some(rest) = id.strip_prefix("script:") else {
        return;
    };
    let Some((bubble, slot)) = rest.rsplit_once(':') else {
        return;
    };
    let Ok(slot) = slot.parse::<usize>() else {
        return;
    };
    let state = app.state::<AppState>();
    let world = state.runtime.world();
    if let Some(b) = world.bubbles.get(bubble).cloned() {
        if let Some(Some(s)) = b.slots.get(slot).cloned() {
            state.runtime.start(b, slot, s, Value::Null);
        }
    }
}

/// A key while recording a macro goes to the script editor (spec §5.1).
pub fn recorded_key(app: &AppHandle, ev: HookEvent) {
    if let HookEvent::Key { vk, down, time } = ev {
        let _ = app.emit(
            "bv://macro-key",
            json!({ "vk": vk, "down": down, "time": time }),
        );
    }
}
