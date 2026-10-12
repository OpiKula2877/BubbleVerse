//! Block implementations, one module per category (spec §8.3).

mod bubbles;
mod control;
mod custom;
mod data;
mod events;
mod files;
mod input;
mod operators;
mod sensing;
mod system;
mod windows;

use serde_json::Value;

use super::exec::{BoxFuture, Ctx, Flow, R};
use super::format::Node;

/// Category of a block from its opcode range (see catalog.yaml).
fn category(op: u16) -> u16 {
    match op {
        0..=49 => 0,
        50..=99 => 1,
        100..=149 => 2,
        150..=219 => 3,
        220..=299 => 4,
        300..=349 => 5,
        350..=399 => 6,
        400..=449 => 7,
        450..=509 => 8,
        510..=559 => 9,
        _ => 10,
    }
}

/// Runs a statement block.
pub fn exec<'a>(ctx: &'a mut Ctx, node: &'a Node) -> BoxFuture<'a, R<Flow>> {
    Box::pin(async move {
        match category(node.op as u16) {
            0 => events::exec(ctx, node).await,
            1 => control::exec(ctx, node).await,
            2 => sensing::exec(ctx, node).await,
            4 => data::exec(ctx, node).await,
            5 => system::exec(ctx, node).await,
            6 => windows::exec(ctx, node).await,
            7 => input::exec(ctx, node).await,
            8 => files::exec(ctx, node).await,
            9 => bubbles::exec(ctx, node).await,
            10 => custom::exec(ctx, node).await,
            _ => {
                // A reporter used as a statement: evaluate and ignore the value.
                eval(ctx, node).await?;
                Ok(Flow::Next)
            }
        }
    })
}

/// Evaluates a reporter block.
pub fn eval<'a>(ctx: &'a mut Ctx, node: &'a Node) -> BoxFuture<'a, R<Value>> {
    Box::pin(async move {
        match category(node.op as u16) {
            2 => sensing::eval(ctx, node).await,
            3 => operators::eval(ctx, node).await,
            4 => data::eval(ctx, node).await,
            6 => windows::eval(ctx, node).await,
            8 => files::eval(ctx, node).await,
            9 => bubbles::eval(ctx, node).await,
            10 => custom::eval(ctx, node).await,
            _ => Err(ctx.err(node, format!("{} is not a reporter", node.op.id()))),
        }
    })
}

pub(crate) fn unsupported(ctx: &Ctx, node: &Node) -> super::exec::Exit {
    ctx.err(node, format!("block {} cannot be used here", node.op.id()))
}

#[cfg(test)]
mod tests;
