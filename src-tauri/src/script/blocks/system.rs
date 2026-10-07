use super::unsupported;
use crate::os::launch::{self, LaunchOptions};
use crate::script::exec::{Ctx, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};
use crate::script::value::truthy;

/// Runs blocking OS work off the async threads.
pub(crate) async fn blocking<T: Send + 'static>(
    ctx: &Ctx,
    node: &Node,
    f: impl FnOnce() -> Result<T, crate::error::AppError> + Send + 'static,
) -> R<T> {
    match tokio::task::spawn_blocking(f).await {
        Ok(r) => ctx.check(node, r),
        Err(e) => Err(ctx.err(node, e.to_string())),
    }
}

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    match node.op {
        Op::SysRunFile => {
            use arg::sys_run_file::*;
            let path = ctx.text(node, PATH).await?;
            let args = ctx.text(node, ARGS).await?;
            let opts = LaunchOptions {
                admin: truthy(node.lit(ADMIN)),
                wait: truthy(node.lit(WAIT)),
                hidden: truthy(node.lit(HIDDEN)),
            };
            if opts.wait {
                let cancel = ctx.cancel.clone();
                let run = blocking(ctx, node, move || launch::run_file(&path, &args, opts));
                tokio::select! {
                    r = run => { r?; }
                    _ = cancel.cancelled() => return Err(crate::script::exec::Exit::Cancelled),
                }
            } else {
                blocking(ctx, node, move || launch::run_file(&path, &args, opts)).await?;
            }
            Ok(Flow::Next)
        }
        Op::SysOpenUrl => {
            use arg::sys_open_url::*;
            let url = ctx.text(node, URL).await?;
            let browser = ctx.text(node, BROWSER).await?;
            blocking(ctx, node, move || launch::open_url(&url, &browser)).await?;
            Ok(Flow::Next)
        }
        Op::SysOpenFolder => {
            let path = ctx.text(node, arg::sys_open_folder::PATH).await?;
            blocking(ctx, node, move || launch::open_folder(&path)).await?;
            Ok(Flow::Next)
        }
        _ => Err(unsupported(ctx, node)),
    }
}
