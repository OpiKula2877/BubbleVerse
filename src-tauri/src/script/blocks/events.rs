use super::unsupported;
use crate::script::exec::{Ctx, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::Op;

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    match node.op {
        Op::EvBroadcast => {
            let msg = ctx.text(node, 0).await?;
            ctx.rt.broadcast(&msg);
            Ok(Flow::Next)
        }
        Op::EvBroadcastWait => {
            let msg = ctx.text(node, 0).await?;
            let ids = ctx.rt.broadcast(&msg);
            tokio::select! {
                _ = ctx.rt.wait_for(&ids) => Ok(Flow::Next),
                _ = ctx.cancel.cancelled() => Err(crate::script::exec::Exit::Cancelled),
            }
        }
        // Hat blocks only start scripts; inside a body they do nothing.
        op if op.is_trigger() => Ok(Flow::Next),
        _ => Err(unsupported(ctx, node)),
    }
}
