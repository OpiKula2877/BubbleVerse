use super::unsupported;
use crate::os::{input, sysinfo};
use crate::script::exec::{Ctx, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    match node.op {
        Op::InPress => {
            let combo = ctx.text(node, arg::in_press::COMBO).await?;
            ctx.check(node, input::press_combo(&combo))?;
        }
        Op::InHold => {
            use arg::in_hold::*;
            let key = ctx.text(node, KEY).await?;
            ctx.check(node, input::key(&key, node.lit_str(ACTION) == "hold"))?;
        }
        Op::InType => {
            use arg::in_type::*;
            let text = ctx.text(node, TEXT).await?;
            let cps = ctx.num(node, CPS).await?;
            let delay = if cps > 0.0 { 1.0 / cps } else { 0.0 };
            for c in text.chars() {
                ctx.loop_tick().await?;
                ctx.check(node, input::type_char(c))?;
                ctx.sleep(delay).await?;
            }
        }
        Op::InClick => {
            use arg::in_click::*;
            let x = ctx.num(node, X).await? as i32;
            let y = ctx.num(node, Y).await? as i32;
            ctx.check(node, input::click(&node.lit_str(BUTTON), x, y, false))?;
        }
        Op::InDblclick => {
            use arg::in_dblclick::*;
            let x = ctx.num(node, X).await? as i32;
            let y = ctx.num(node, Y).await? as i32;
            ctx.check(node, input::click("left", x, y, true))?;
        }
        Op::InMove => {
            use arg::in_move::*;
            let x = ctx.num(node, X).await?;
            let y = ctx.num(node, Y).await?;
            let ms = ctx.num(node, MS).await?.max(0.0);
            let (sx, sy) = sysinfo::cursor();
            // Smooth movement in ~60 steps per second.
            let steps = ((ms / 16.0).ceil() as usize).max(1);
            for i in 1..=steps {
                ctx.loop_tick().await?;
                let t = i as f64 / steps as f64;
                let px = sx as f64 + (x - sx as f64) * t;
                let py = sy as f64 + (y - sy as f64) * t;
                ctx.check(
                    node,
                    input::move_cursor(px.round() as i32, py.round() as i32),
                )?;
                if steps > 1 {
                    ctx.sleep(ms / 1000.0 / steps as f64).await?;
                }
            }
        }
        Op::InWheel => {
            let n = ctx.num(node, arg::in_wheel::N).await?;
            ctx.check(node, input::wheel(n))?;
        }
        _ => return Err(unsupported(ctx, node)),
    }
    Ok(Flow::Next)
}
