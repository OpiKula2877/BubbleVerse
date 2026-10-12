use serde_json::Value;

use super::system::blocking;
use super::unsupported;
use crate::os::launch::expand_env;
use crate::os::media;
use crate::script::exec::{Ctx, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};
use crate::script::host::ScriptFx;
use crate::script::runtime::lock;

/// The bubble a block talks about: empty = this bubble, else a path like `Apps | Work | X`.
fn target(ctx: &Ctx, node: &Node, t: &str) -> R<String> {
    if t.trim().is_empty() {
        return Ok(ctx.bubble.id.clone());
    }
    ctx.rt
        .world()
        .find(t)
        .map(|b| b.id.clone())
        .ok_or_else(|| ctx.err(node, format!("bubble \"{t}\" not found")))
}

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    let host = ctx.rt.host().clone();
    match node.op {
        Op::BubGlow => {
            let t = ctx.text(node, arg::bub_glow::TARGET).await?;
            host.fx(ScriptFx::Glow {
                bubble: target(ctx, node, &t)?,
            });
        }
        Op::BubChange => {
            use arg::bub_change::*;
            let t = ctx.text(node, TARGET).await?;
            let mut value = ctx.eval(node, VALUE).await?;
            let prop = node.lit_str(PROP);
            if prop == "skin" {
                // "Same skin as bubble …": pass the id of that bubble.
                let src = crate::script::value::text(&value);
                value = Value::String(target(ctx, node, &src)?);
            }
            host.fx(ScriptFx::Change {
                bubble: target(ctx, node, &t)?,
                prop,
                value,
            });
        }
        Op::BubVisibility => {
            use arg::bub_visibility::*;
            let t = ctx.text(node, TARGET).await?;
            host.fx(ScriptFx::Visibility {
                bubble: target(ctx, node, &t)?,
                visible: node.lit_str(ACTION) == "show",
            });
        }
        Op::BubMove => {
            use arg::bub_move::*;
            let t = ctx.text(node, TARGET).await?;
            let x = ctx.num(node, X).await?;
            let y = ctx.num(node, Y).await?;
            host.fx(ScriptFx::Move {
                bubble: target(ctx, node, &t)?,
                x,
                y,
            });
        }
        Op::BubSay => {
            use arg::bub_say::*;
            let text = ctx.text(node, TEXT).await?;
            let secs = ctx.num(node, N).await?.max(0.0);
            host.fx(ScriptFx::Say {
                bubble: ctx.bubble.id.clone(),
                text,
                seconds: secs,
            });
            ctx.sleep(secs).await?;
        }
        Op::BubActivate => {
            let t = ctx.text(node, arg::bub_activate::TARGET).await?;
            let id = target(ctx, node, &t)?;
            let rt = ctx.rt.clone();
            ctx.check(node, rt.activate(&id))?;
        }
        Op::UiNotify => {
            use arg::ui_notify::*;
            let title = ctx.text(node, TITLE).await?;
            let text = ctx.text(node, TEXT).await?;
            host.notify(&title, &text);
        }
        Op::UiAsk => {
            let q = ctx.text(node, arg::ui_ask::QUESTION).await?;
            let answer = tokio::select! {
                a = host.ask(q) => a,
                _ = ctx.cancel.cancelled() => return Err(crate::script::exec::Exit::Cancelled),
            };
            *lock(&ctx.rt.inner.answer) = Value::String(answer.unwrap_or_default());
        }
        Op::UiSound => {
            let p = expand_env(ctx.text(node, arg::ui_sound::PATH).await?.trim());
            blocking(ctx, node, move || media::play(&p)).await?;
        }
        Op::UiSpeak => {
            let t = ctx.text(node, arg::ui_speak::TEXT).await?;
            blocking(ctx, node, move || media::speak(&t)).await?;
        }
        _ => return Err(unsupported(ctx, node)),
    }
    Ok(Flow::Next)
}

pub async fn eval(ctx: &mut Ctx, node: &Node) -> R<Value> {
    let host = ctx.rt.host().clone();
    match node.op {
        Op::UiConfirm => {
            let q = ctx.text(node, arg::ui_confirm::QUESTION).await?;
            Ok(Value::Bool(host.confirm(q).await))
        }
        Op::UiPick => {
            let kind = node.lit_str(arg::ui_pick::KIND);
            Ok(Value::String(host.pick(kind).await.unwrap_or_default()))
        }
        _ => Err(unsupported(ctx, node)),
    }
}
