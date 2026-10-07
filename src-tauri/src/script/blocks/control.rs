use std::time::Instant;

use serde_json::Value;

use super::unsupported;
use crate::script::exec::{Ctx, Exit, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};
use crate::script::host::LogEntry;
use crate::script::value;

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    match node.op {
        Op::CtlWait => {
            use arg::ctl_wait::*;
            let n = ctx.num(node, N).await?;
            let unit = node.lit_str(UNIT);
            let secs = match unit.as_str() {
                "ms" => n / 1000.0,
                "min" => n * 60.0,
                "h" => n * 3600.0,
                _ => n,
            };
            ctx.sleep(secs).await?;
            Ok(Flow::Next)
        }
        Op::CtlRepeat => {
            use arg::ctl_repeat::*;
            let times = ctx.num(node, N).await?.round().max(0.0) as u64;
            for _ in 0..times {
                ctx.loop_tick().await?;
                if ctx.exec_stack(node.stack(DO)).await? == Flow::Stop {
                    return Ok(Flow::Stop);
                }
            }
            Ok(Flow::Next)
        }
        Op::CtlForever => loop {
            ctx.loop_tick().await?;
            if ctx.exec_stack(node.stack(arg::ctl_forever::DO)).await? == Flow::Stop {
                return Ok(Flow::Stop);
            }
        },
        Op::CtlRepeatUntil => {
            use arg::ctl_repeat_until::*;
            loop {
                ctx.loop_tick().await?;
                if ctx.truthy(node, COND).await? {
                    return Ok(Flow::Next);
                }
                if ctx.exec_stack(node.stack(DO)).await? == Flow::Stop {
                    return Ok(Flow::Stop);
                }
            }
        }
        Op::CtlForEach => {
            use arg::ctl_for_each::*;
            let var = node.lit_str(VAR);
            let items = match ctx.eval(node, LIST).await? {
                Value::Array(a) => a,
                Value::Null => Vec::new(),
                Value::String(s) if s.is_empty() => Vec::new(),
                Value::String(s) => s.lines().map(|l| Value::String(l.to_string())).collect(),
                other => vec![other],
            };
            for item in items {
                ctx.loop_tick().await?;
                ctx.set_var(&var, item);
                if ctx.exec_stack(node.stack(DO)).await? == Flow::Stop {
                    return Ok(Flow::Stop);
                }
            }
            Ok(Flow::Next)
        }
        Op::CtlIf => {
            use arg::ctl_if::*;
            if ctx.truthy(node, COND).await? {
                return ctx.exec_stack(node.stack(DO)).await;
            }
            Ok(Flow::Next)
        }
        Op::CtlIfElse => {
            use arg::ctl_if_else::*;
            if ctx.truthy(node, COND).await? {
                ctx.exec_stack(node.stack(DO)).await
            } else {
                ctx.exec_stack(node.stack(ELSE)).await
            }
        }
        Op::CtlWaitUntil => {
            use arg::ctl_wait_until::*;
            let limit = ctx.num(node, T).await?;
            let start = Instant::now();
            loop {
                if ctx.truthy(node, COND).await? {
                    break;
                }
                if limit > 0.0 && start.elapsed().as_secs_f64() >= limit {
                    break;
                }
                ctx.sleep(0.05).await?;
            }
            Ok(Flow::Next)
        }
        Op::CtlTry => {
            use arg::ctl_try::*;
            match ctx.exec_stack(node.stack(DO)).await {
                Ok(flow) => Ok(flow),
                Err(Exit::Cancelled) => Err(Exit::Cancelled),
                Err(Exit::Error(e)) => {
                    ctx.set_var(&node.lit_str(VAR), Value::String(e.message));
                    ctx.exec_stack(node.stack(CATCH)).await
                }
            }
        }
        Op::CtlStop => match node.lit_str(arg::ctl_stop::WHAT).as_str() {
            "bubble" => {
                ctx.rt.stop_bubble(&ctx.bubble.id, Some(ctx.task));
                Ok(Flow::Next)
            }
            "all" => {
                ctx.rt.stop_all();
                Ok(Flow::Stop)
            }
            _ => Ok(Flow::Stop),
        },
        Op::CtlLog => {
            let v = ctx.eval(node, arg::ctl_log::VALUE).await?;
            ctx.rt.host().log(LogEntry {
                at: chrono::Utc::now().timestamp_millis(),
                level: "info".into(),
                bubble: ctx.bubble.id.clone(),
                path: ctx.bubble.path.clone(),
                slot: ctx.slot,
                block: Some(node.op.id().to_string()),
                node: Some(node.id),
                text: value::text(&v),
            });
            Ok(Flow::Next)
        }
        _ => Err(unsupported(ctx, node)),
    }
}
