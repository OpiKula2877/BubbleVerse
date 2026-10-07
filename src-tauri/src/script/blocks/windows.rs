use std::time::Instant;

use serde_json::Value;

use super::system::blocking;
use super::unsupported;
use crate::os::{process, winctl};
use crate::script::exec::{Ctx, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    match node.op {
        Op::WinKill => {
            let name = ctx.text(node, arg::win_kill::NAME).await?;
            blocking(ctx, node, move || process::kill(&name)).await?;
        }
        Op::WinFocus => {
            let t = ctx.text(node, arg::win_focus::TITLE).await?;
            let h = ctx.check(node, winctl::require(&t))?;
            winctl::focus(h);
        }
        Op::WinState => {
            use arg::win_state::*;
            let t = ctx.text(node, TITLE).await?;
            let h = ctx.check(node, winctl::require(&t))?;
            winctl::set_state(h, &node.lit_str(ACTION));
        }
        Op::WinMoveMonitor => {
            use arg::win_move_monitor::*;
            let t = ctx.text(node, TITLE).await?;
            let n = ctx.num(node, N).await?.max(1.0) as usize;
            let h = ctx.check(node, winctl::require(&t))?;
            ctx.check(node, winctl::move_to_monitor(h, n))?;
        }
        Op::WinMove => {
            use arg::win_move::*;
            let t = ctx.text(node, TITLE).await?;
            let x = ctx.num(node, X).await? as i32;
            let y = ctx.num(node, Y).await? as i32;
            let h = ctx.check(node, winctl::require(&t))?;
            ctx.check(node, winctl::move_to(h, x, y))?;
        }
        Op::WinResize => {
            use arg::win_resize::*;
            let t = ctx.text(node, TITLE).await?;
            let w = ctx.num(node, W).await?.max(1.0) as i32;
            let hh = ctx.num(node, H).await?.max(1.0) as i32;
            let h = ctx.check(node, winctl::require(&t))?;
            ctx.check(node, winctl::resize(h, w, hh))?;
        }
        Op::WinTopmost => {
            use arg::win_topmost::*;
            let t = ctx.text(node, TITLE).await?;
            let h = ctx.check(node, winctl::require(&t))?;
            ctx.check(node, winctl::topmost(h, node.lit_str(ON) == "on"))?;
        }
        Op::WinWait => {
            use arg::win_wait::*;
            let t = ctx.text(node, TITLE).await?;
            let limit = ctx.num(node, T).await?;
            let start = Instant::now();
            while winctl::find(&t).is_none() {
                if limit > 0.0 && start.elapsed().as_secs_f64() >= limit {
                    break;
                }
                ctx.sleep(0.2).await?;
            }
        }
        _ => return Err(unsupported(ctx, node)),
    }
    Ok(Flow::Next)
}

pub async fn eval(ctx: &mut Ctx, node: &Node) -> R<Value> {
    match node.op {
        Op::WinProcesses => {
            let mut names: Vec<String> = blocking(ctx, node, || Ok(process::processes()))
                .await?
                .into_iter()
                .map(|p| p.name)
                .collect();
            names.sort_by_key(|n| n.to_lowercase());
            names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
            Ok(Value::Array(names.into_iter().map(Value::String).collect()))
        }
        _ => Err(unsupported(ctx, node)),
    }
}
