//! Automatic pause (spec §7.4): checks once a second and tells the windows.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::state::AppState;
use crate::os::power::{self, Signals};

pub const EVENT: &str = "bv://autopause";

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoPause {
    pub paused: bool,
    pub signals: Signals,
}

pub fn decide(signals: Signals, s: &crate::storage::settings::Performance) -> bool {
    (signals.fullscreen && s.pause_fullscreen)
        || (signals.maximized && s.pause_maximized)
        || (signals.battery_saver && s.pause_battery_saver)
        || (signals.locked && s.pause_locked)
}

pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("bv-autopause".into())
        .spawn(move || {
            let mut last: Option<AutoPause> = None;
            loop {
                std::thread::sleep(Duration::from_secs(1));
                let Some(state) = app.try_state::<AppState>() else {
                    continue;
                };
                let signals = power::read();
                let now = AutoPause {
                    paused: decide(signals, &state.settings().performance),
                    signals,
                };
                if last != Some(now) {
                    let _ = app.emit(EVENT, now);
                    last = Some(now);
                }
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::settings::Performance;

    #[test]
    fn pauses_only_for_enabled_reasons() {
        let mut p = Performance::default();
        let s = Signals {
            fullscreen: true,
            ..Signals::default()
        };
        assert!(decide(s, &p));
        p.pause_fullscreen = false;
        assert!(!decide(s, &p));
        assert!(!decide(Signals::default(), &Performance::default()));
    }
}
