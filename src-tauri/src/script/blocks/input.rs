use super::unsupported;
use crate::script::exec::{Ctx, Flow, R};
use crate::script::format::Node;

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    Err(unsupported(ctx, node))
}
