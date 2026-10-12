//! Script triggers that come from the system (spec §5.2 "Events"). One engine thread watches
//! time, processes, the active window, the clipboard, devices, the session and the network,
//! and starts the matching scripts in the core runtime.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use chrono::{Datelike, Local, Timelike};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::state::AppState;
use crate::os::hook::{Binding, Scope};
use crate::os::keys::parse_combo;
use crate::os::{devices, power, process, sysinfo, winctl};
use crate::script::generated::opcodes::{arg, Op};
use crate::script::runtime::Runtime;
use crate::script::world::CompiledWorld;

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
    let Some((bubble, slot)) = id
        .strip_prefix("script:")
        .and_then(|r| r.rsplit_once(':'))
        .and_then(|(b, s)| Some((b.to_string(), s.parse::<usize>().ok()?)))
    else {
        return;
    };
    let state = app.state::<AppState>();
    let world = state.runtime.world();
    if let Some(b) = world.bubbles.get(&bubble).cloned() {
        if let Some(Some(s)) = b.slots.get(slot).cloned() {
            state.runtime.start(b, slot, s, Value::Null);
        }
    }
}

/// Starts every script with trigger `op` whose trigger passes `matches`.
fn fire(
    rt: &Runtime,
    world: &CompiledWorld,
    op: Op,
    event: Value,
    matches: impl Fn(&crate::script::format::Node) -> bool,
) {
    for (b, i, s) in world.slots_with_trigger(op) {
        if matches(&s.script.trigger) {
            rt.start(b, i, s, event.clone());
        }
    }
}

fn unit_seconds(unit: &str) -> f64 {
    match unit {
        "min" => 60.0,
        "h" => 3600.0,
        _ => 1.0,
    }
}

/// Whether "at HH:MM on days" matches a local time (days mask Monday..Sunday).
pub fn time_matches(
    time: &str,
    days: &str,
    hour: u32,
    minute: u32,
    weekday_from_monday: u32,
) -> bool {
    let Some((h, m)) = time.trim().split_once(':') else {
        return false;
    };
    let (Ok(h), Ok(m)) = (h.trim().parse::<u32>(), m.trim().parse::<u32>()) else {
        return false;
    };
    let day_on = days
        .chars()
        .nth(weekday_from_monday.saturating_sub(1) as usize)
        .is_some_and(|c| c != '0');
    h == hour && m == minute && day_on
}

struct Watch {
    procs: HashSet<String>,
    window: isize,
    clipboard: u32,
    usb: u32,
    drives: u32,
    locked: bool,
    internet: bool,
    wall: SystemTime,
}

pub fn start(app: AppHandle, autostarted: bool) {
    std::thread::Builder::new()
        .name("bv-triggers".into())
        .spawn(move || {
            // Wait until the state exists, then start "when … starts" scripts once.
            let rt = loop {
                if let Some(s) = app.try_state::<AppState>() {
                    break s.runtime.clone();
                }
                std::thread::sleep(Duration::from_millis(100));
            };
            let world = rt.world();
            fire(&rt, &world, Op::EvStartup, Value::Null, |t| {
                t.lit_str(arg::ev_startup::WHAT) == "app" || autostarted
            });
            let mut w = Watch {
                procs: process::processes()
                    .into_iter()
                    .map(|p| p.name.to_lowercase())
                    .collect(),
                window: winctl::foreground().0 as isize,
                clipboard: sysinfo::clipboard_sequence(),
                usb: devices::usb_count(),
                drives: devices::drives(),
                locked: power::session_locked(),
                internet: sysinfo::internet(),
                wall: SystemTime::now(),
            };
            let mut timers: HashMap<(String, usize), Instant> = HashMap::new();
            let mut last_world: Option<Arc<CompiledWorld>> = None;
            let mut last_minute = String::new();
            let mut tick: u64 = 0;
            loop {
                std::thread::sleep(Duration::from_millis(250));
                tick += 1;
                let world = rt.world();
                if !last_world.as_ref().is_some_and(|l| Arc::ptr_eq(l, &world)) {
                    timers.clear();
                    last_world = Some(world.clone());
                }
                check_every(&rt, &world, &mut timers);
                if tick.is_multiple_of(4) {
                    check_time(&rt, &world, &mut last_minute);
                }
                check_window(&rt, &world, &mut w);
                if tick.is_multiple_of(2) {
                    check_clipboard(&rt, &world, &mut w);
                }
                if tick.is_multiple_of(6) {
                    check_processes(&rt, &world, &mut w);
                }
                if tick.is_multiple_of(8) {
                    check_devices(&rt, &world, &mut w);
                    check_session(&rt, &world, &mut w);
                }
                if tick.is_multiple_of(20) {
                    check_internet(&rt, &world, &mut w);
                }
            }
        })
        .ok();
}

fn check_every(
    rt: &Runtime,
    world: &CompiledWorld,
    timers: &mut HashMap<(String, usize), Instant>,
) {
    let now = Instant::now();
    for (b, i, s) in world.slots_with_trigger(Op::EvEvery) {
        let t = &s.script.trigger;
        let n = crate::script::value::num(t.lit(arg::ev_every::N)).max(0.0);
        let secs = (n * unit_seconds(&t.lit_str(arg::ev_every::UNIT))).max(0.5);
        let key = (b.id.clone(), i);
        let due = *timers
            .entry(key.clone())
            .or_insert(now + Duration::from_secs_f64(secs));
        if now >= due {
            timers.insert(key, now + Duration::from_secs_f64(secs));
            rt.start(b, i, s, Value::Null);
        }
    }
}

fn check_time(rt: &Runtime, world: &CompiledWorld, last_minute: &mut String) {
    let now = Local::now();
    let key = now.format("%Y-%m-%d %H:%M").to_string();
    if *last_minute == key {
        return;
    }
    *last_minute = key;
    let wd = now.weekday().number_from_monday();
    fire(rt, world, Op::EvAtTime, Value::Null, |t| {
        time_matches(
            &t.lit_str(arg::ev_at_time::TIME),
            &t.lit_str(arg::ev_at_time::DAYS),
            now.hour(),
            now.minute(),
            wd,
        )
    });
}

fn check_window(rt: &Runtime, world: &CompiledWorld, w: &mut Watch) {
    let fg = winctl::foreground().0 as isize;
    if fg != w.window {
        w.window = fg;
        fire(
            rt,
            world,
            Op::EvWindowChange,
            Value::String(winctl::foreground_title()),
            |_| true,
        );
    }
}

fn check_clipboard(rt: &Runtime, world: &CompiledWorld, w: &mut Watch) {
    let seq = sysinfo::clipboard_sequence();
    if seq != w.clipboard {
        w.clipboard = seq;
        fire(rt, world, Op::EvClipboard, Value::Null, |_| true);
    }
}

fn check_processes(rt: &Runtime, world: &CompiledWorld, w: &mut Watch) {
    let now: HashSet<String> = process::processes()
        .into_iter()
        .map(|p| p.name.to_lowercase())
        .collect();
    let started: Vec<&String> = now.difference(&w.procs).collect();
    let ended: Vec<&String> = w.procs.difference(&now).collect();
    for name in started {
        fire(
            rt,
            world,
            Op::EvProcStart,
            Value::String(name.clone()),
            |t| process::same_name(&t.lit_str(arg::ev_proc_start::NAME), name),
        );
    }
    for name in ended {
        fire(
            rt,
            world,
            Op::EvProcStop,
            Value::String(name.clone()),
            |t| process::same_name(&t.lit_str(arg::ev_proc_stop::NAME), name),
        );
    }
    w.procs = now;
}

fn check_devices(rt: &Runtime, world: &CompiledWorld, w: &mut Watch) {
    let usb = devices::usb_count();
    let drives = devices::drives();
    let mut changes: Vec<(&str, &str)> = Vec::new();
    if usb != w.usb {
        changes.push(("usb", if usb > w.usb { "on" } else { "off" }));
    }
    if drives != w.drives {
        if drives & !w.drives != 0 {
            changes.push(("disk", "on"));
        }
        if w.drives & !drives != 0 {
            changes.push(("disk", "off"));
        }
    }
    w.usb = usb;
    w.drives = drives;
    for (kind, state) in changes {
        fire(rt, world, Op::EvDevice, Value::String(kind.into()), |t| {
            t.lit_str(arg::ev_device::KIND) == kind && t.lit_str(arg::ev_device::STATE) == state
        });
    }
}

fn check_session(rt: &Runtime, world: &CompiledWorld, w: &mut Watch) {
    let locked = power::session_locked();
    if w.locked && !locked {
        fire(rt, world, Op::EvUnlock, Value::Null, |_| true);
    }
    w.locked = locked;
    // The thread does not run during sleep: a big jump of the clock means the PC woke up.
    let now = SystemTime::now();
    if now
        .duration_since(w.wall)
        .is_ok_and(|d| d > Duration::from_secs(30))
    {
        fire(rt, world, Op::EvWake, Value::Null, |_| true);
    }
    w.wall = now;
}

fn check_internet(rt: &Runtime, world: &CompiledWorld, w: &mut Watch) {
    let on = sysinfo::internet();
    if on != w.internet {
        w.internet = on;
        let state = if on { "on" } else { "off" };
        fire(rt, world, Op::EvInternet, Value::Null, |t| {
            t.lit_str(arg::ev_internet::STATE) == state
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_times_and_days() {
        // Monday = 1
        assert!(time_matches("08:00", "1111100", 8, 0, 1));
        assert!(!time_matches("08:00", "1111100", 8, 0, 6));
        assert!(!time_matches("08:00", "1111111", 8, 1, 3));
        assert!(time_matches(" 7:05 ", "0000001", 7, 5, 7));
        assert!(!time_matches("bad", "1111111", 0, 0, 1));
    }
}
