use std::os::windows::process::CommandExt;
use std::process::Command;

use serde_json::Value;

use super::unsupported;
use crate::error::AppError;
use crate::os::input;
use crate::os::launch::{self, LaunchOptions};
use crate::os::media;
use crate::script::exec::{Ctx, Exit, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};
use crate::script::value::truthy;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// Runs blocking OS work off the async threads.
pub(crate) async fn blocking<T: Send + 'static>(
    ctx: &Ctx,
    node: &Node,
    f: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> R<T> {
    match tokio::task::spawn_blocking(f).await {
        Ok(r) => ctx.check(node, r),
        Err(e) => Err(ctx.err(node, e.to_string())),
    }
}

/// Runs a command line; hidden runs capture the output, visible ones get their own console.
fn run_shell(program: &str, args: &[String], hidden: bool) -> Result<String, AppError> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if hidden {
        cmd.creation_flags(CREATE_NO_WINDOW);
        let out = cmd.output()?;
        let mut text = String::from_utf8_lossy(&out.stdout).to_string();
        if !out.stderr.is_empty() {
            text.push_str(&String::from_utf8_lossy(&out.stderr));
        }
        Ok(text.trim_end().to_string())
    } else {
        cmd.creation_flags(CREATE_NEW_CONSOLE);
        let status = cmd.status()?;
        Ok(status.code().map(|c| c.to_string()).unwrap_or_default())
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
            let cancel = ctx.cancel.clone();
            let run = blocking(ctx, node, move || launch::run_file(&path, &args, opts));
            tokio::select! {
                r = run => { r?; }
                _ = cancel.cancelled() => return Err(Exit::Cancelled),
            }
        }
        Op::SysOpenUrl => {
            use arg::sys_open_url::*;
            let url = ctx.text(node, URL).await?;
            let browser = ctx.text(node, BROWSER).await?;
            blocking(ctx, node, move || launch::open_url(&url, &browser)).await?;
        }
        Op::SysOpenFolder => {
            let path = ctx.text(node, arg::sys_open_folder::PATH).await?;
            blocking(ctx, node, move || launch::open_folder(&path)).await?;
        }
        Op::SysCmd | Op::SysPowershell => {
            // Same argument positions for both blocks.
            use arg::sys_cmd::*;
            let line = ctx.text(node, CMD).await?;
            let hidden = node.lit_str(WIN) != "visible";
            let var = node.lit_str(VAR);
            let (program, args) = if node.op == Op::SysCmd {
                // UTF-8 output whatever the console code page is.
                (
                    "cmd.exe",
                    vec!["/C".to_string(), format!("chcp 65001>nul & {line}")],
                )
            } else {
                (
                    "powershell.exe",
                    vec![
                        "-NoProfile".into(),
                        "-NonInteractive".into(),
                        "-ExecutionPolicy".into(),
                        "Bypass".into(),
                        "-Command".into(),
                        format!("[Console]::OutputEncoding=[Text.Encoding]::UTF8; {line}"),
                    ],
                )
            };
            let cancel = ctx.cancel.clone();
            let run = blocking(ctx, node, move || run_shell(program, &args, hidden));
            let out = tokio::select! {
                r = run => r?,
                _ = cancel.cancelled() => return Err(Exit::Cancelled),
            };
            if !var.ends_with(':') && !var.is_empty() {
                ctx.set_var(&var, Value::String(out));
            }
        }
        Op::SysLock => {
            blocking(ctx, node, || {
                unsafe { windows::Win32::System::Shutdown::LockWorkStation()? };
                Ok(())
            })
            .await?;
        }
        Op::SysPower => {
            use arg::sys_power::*;
            let action = node.lit_str(ACTION);
            let secs = ctx.num(node, N).await?.max(0.0);
            // The user can cancel during the countdown (spec §5.2).
            if !ctx.rt.host().countdown(action.clone(), secs).await {
                return Ok(Flow::Next);
            }
            blocking(ctx, node, move || {
                match action.as_str() {
                    "sleep" => {
                        unsafe {
                            windows::Win32::System::Power::SetSuspendState(false, false, false)
                        };
                    }
                    "restart" => {
                        run_shell(
                            "shutdown.exe",
                            &["/r".into(), "/t".into(), "0".into()],
                            true,
                        )?;
                    }
                    _ => {
                        run_shell(
                            "shutdown.exe",
                            &["/s".into(), "/t".into(), "0".into()],
                            true,
                        )?;
                    }
                }
                Ok(())
            })
            .await?;
        }
        Op::SysVolumeSet => {
            let n = ctx.num(node, arg::sys_volume_set::N).await?;
            blocking(ctx, node, move || media::set_volume(n)).await?;
        }
        Op::SysVolumeMute => {
            let how = node.lit_str(arg::sys_volume_mute::MUTE);
            blocking(ctx, node, move || media::set_mute(&how)).await?;
        }
        Op::SysMedia => {
            let vk: u16 = match node.lit_str(arg::sys_media::KEY).as_str() {
                "next" => 0xB0,
                "prev" => 0xB1,
                _ => 0xB3,
            };
            input::send(&[input::key_input(vk, false), input::key_input(vk, true)]);
        }
        _ => return Err(unsupported(ctx, node)),
    }
    Ok(Flow::Next)
}
