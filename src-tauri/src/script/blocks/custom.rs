//! Custom blocks (spec §5.3) and shared script parameters.

use std::collections::HashMap;

use serde_json::Value;

use super::unsupported;
use crate::script::exec::{Ctx, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};

/// Custom blocks may call each other; this limits runaway recursion.
const MAX_DEPTH: usize = 200;

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    match node.op {
        Op::CbCall => {
            let id = node.lit_str(arg::cb_call::ID);
            let block = ctx
                .custom_block(&id)
                .ok_or_else(|| ctx.err(node, format!("custom block {id} not found")))?;
            if ctx.frames.len() >= MAX_DEPTH {
                return Err(ctx.err(node, "custom blocks call each other too deeply"));
            }
            let mut frame = HashMap::new();
            for (i, name) in block.params.iter().enumerate() {
                let v = ctx.eval(node, 1 + i).await?;
                frame.insert(name.clone(), v);
            }
            ctx.frames.push(frame);
            let result = ctx.exec_stack(&block.body).await;
            ctx.frames.pop();
            // "stop this script" inside a custom block ends only the block.
            result.map(|_| Flow::Next)
        }
        Op::CbDefine => Ok(Flow::Next),
        _ => Err(unsupported(ctx, node)),
    }
}

pub async fn eval(ctx: &mut Ctx, node: &Node) -> R<Value> {
    match node.op {
        Op::CbArg => {
            let name = node.lit_str(arg::cb_arg::NAME);
            Ok(ctx
                .frames
                .last()
                .and_then(|f| f.get(&name))
                .cloned()
                .unwrap_or(Value::Null))
        }
        Op::CbParam => {
            let name = node.lit_str(arg::cb_param::NAME);
            Ok(ctx.params.get(&name).cloned().unwrap_or(Value::Null))
        }
        _ => Err(unsupported(ctx, node)),
    }
}
