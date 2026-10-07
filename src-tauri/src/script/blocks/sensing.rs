use chrono::{Datelike, Local, Timelike};
use serde_json::Value;

use super::unsupported;
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
        _ => Err(unsupported(ctx, node)),
    }
}
