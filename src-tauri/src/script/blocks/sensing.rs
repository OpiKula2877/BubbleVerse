use chrono::{Datelike, Local, Timelike};
use serde_json::Value;

use super::system::blocking;
use super::unsupported;
use crate::os::keys::vk_of;
use crate::os::launch::expand_env;
use crate::os::{monitors, process, sysinfo, winctl};
use crate::script::exec::{Ctx, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};
use crate::script::runtime::lock;
use crate::script::value::from_num;

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    match node.op {
        Op::SenTimerReset => {
            *lock(&ctx.rt.inner.stopwatch) = std::time::Instant::now();
            Ok(Flow::Next)
        }
        _ => Err(unsupported(ctx, node)),
    }
}

fn key_down(name: &str) -> bool {
    let vk = match name.trim().to_lowercase().as_str() {
        "ctrl" | "control" => Some(0x11),
        "alt" => Some(0x12),
        "shift" => Some(0x10),
        "win" => Some(0x5B),
        _ => vk_of(name),
    };
    vk.is_some_and(|vk| unsafe {
        (windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState(vk as i32) as u16 & 0x8000)
            != 0
    })
}

pub async fn eval(ctx: &mut Ctx, node: &Node) -> R<Value> {
    match node.op {
        Op::SenCurrent => {
            let now = Local::now();
            let v = match node.lit_str(arg::sen_current::PART).as_str() {
                "year" => now.year() as f64,
                "month" => now.month() as f64,
                "date" => now.day() as f64,
                // ISO: Monday = 1 … Sunday = 7
                "weekday" => now.weekday().number_from_monday() as f64,
                "hour" => now.hour() as f64,
                "minute" => now.minute() as f64,
                _ => now.second() as f64,
            };
            Ok(from_num(v))
        }
        Op::SenTimestamp => Ok(from_num(
            chrono::Utc::now().timestamp_millis() as f64 / 1000.0,
        )),
        Op::SenUsername => Ok(Value::String(std::env::var("USERNAME").unwrap_or_default())),
        Op::SenPcname => Ok(Value::String(
            std::env::var("COMPUTERNAME").unwrap_or_default(),
        )),
        Op::SenAnswer => Ok(lock(&ctx.rt.inner.answer).clone()),
        Op::SenTimer => {
            let start = *lock(&ctx.rt.inner.stopwatch);
            Ok(from_num(
                (start.elapsed().as_secs_f64() * 1000.0).round() / 1000.0,
            ))
        }
        Op::SenKeyPressed => {
            let k = ctx.text(node, arg::sen_key_pressed::KEY).await?;
            Ok(Value::Bool(key_down(&k)))
        }
        Op::SenMouseX => Ok(from_num(sysinfo::cursor().0 as f64)),
        Op::SenMouseY => Ok(from_num(sysinfo::cursor().1 as f64)),
        Op::SenProcRunning => {
            let name = ctx.text(node, arg::sen_proc_running::NAME).await?;
            Ok(Value::Bool(
                blocking(ctx, node, move || Ok(process::running(&name))).await?,
            ))
        }
        Op::SenActiveWindow => Ok(Value::String(
            if node.lit_str(arg::sen_active_window::WHAT) == "process" {
                winctl::foreground_process()
            } else {
                winctl::foreground_title()
            },
        )),
        Op::SenExists => {
            use arg::sen_exists::*;
            let p = std::path::PathBuf::from(expand_env(ctx.text(node, PATH).await?.trim()));
            Ok(Value::Bool(if node.lit_str(KIND) == "folder" {
                p.is_dir()
            } else {
                p.is_file()
            }))
        }
        Op::SenInternet => Ok(Value::Bool(
            blocking(ctx, node, || Ok(sysinfo::internet())).await?,
        )),
        Op::SenBattery => Ok(from_num(sysinfo::battery().0)),
        Op::SenCharging => Ok(Value::Bool(sysinfo::battery().1)),
        Op::SenIdle => Ok(from_num((sysinfo::idle_seconds() * 10.0).round() / 10.0)),
        Op::SenPixel => {
            use arg::sen_pixel::*;
            let x = ctx.num(node, X).await? as i32;
            let y = ctx.num(node, Y).await? as i32;
            Ok(Value::String(sysinfo::pixel(x, y)))
        }
        Op::SenMonitors => Ok(from_num(monitors::list_monitors().len() as f64)),
        _ => Err(unsupported(ctx, node)),
    }
}
