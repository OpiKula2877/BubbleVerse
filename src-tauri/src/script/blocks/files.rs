use std::io::Write;

use serde_json::Value;

use super::system::blocking;
use super::unsupported;
use crate::error::AppError;
use crate::os::files::{self, path};
use crate::os::sysinfo;
use crate::script::exec::{Ctx, Exit, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};
use crate::script::value::{text, truthy};

/// HTTP headers from an object or text lines `Name: value` (or JSON text).
fn headers_of(v: &Value) -> Vec<(String, String)> {
    match v {
        Value::Object(o) => o.iter().map(|(k, v)| (k.clone(), text(v))).collect(),
        Value::String(s) if s.trim_start().starts_with('{') => serde_json::from_str::<Value>(s)
            .map(|v| headers_of(&v))
            .unwrap_or_default(),
        Value::String(s) => s
            .lines()
            .filter_map(|l| l.split_once(':'))
            .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
            .collect(),
        _ => Vec::new(),
    }
}

fn client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .user_agent("BubbleVerse")
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::msg(e.to_string()))
}

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    match node.op {
        Op::FsWrite => {
            use arg::fs_write::*;
            let content = ctx.text(node, TEXT).await?;
            let p = path(&ctx.text(node, PATH).await?);
            let append = node.lit_str(MODE) == "append";
            blocking(ctx, node, move || {
                if let Some(parent) = p.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut f = std::fs::OpenOptions::new()
                    .create(true)
                    .write(true)
                    .append(append)
                    .truncate(!append)
                    .open(&p)?;
                f.write_all(content.as_bytes())?;
                Ok(())
            })
            .await?;
        }
        Op::FsCopy => {
            use arg::fs_copy::*;
            let from = path(&ctx.text(node, FROM).await?);
            let mut to = path(&ctx.text(node, TO).await?);
            let mv = node.lit_str(OP) == "move";
            blocking(ctx, node, move || {
                if !from.exists() {
                    return Err(AppError::FileNotFound(from.display().to_string()));
                }
                // Copying into an existing folder keeps the file name.
                if to.is_dir() {
                    if let Some(name) = from.file_name() {
                        to = to.join(name);
                    }
                }
                if mv {
                    std::fs::rename(&from, &to)?;
                } else {
                    std::fs::copy(&from, &to)?;
                }
                Ok(())
            })
            .await?;
        }
        Op::FsRename => {
            use arg::fs_rename::*;
            let p = path(&ctx.text(node, PATH).await?);
            let name = ctx.text(node, NAME).await?;
            blocking(ctx, node, move || {
                if !p.exists() {
                    return Err(AppError::FileNotFound(p.display().to_string()));
                }
                let target = p.with_file_name(name.trim());
                std::fs::rename(&p, target)?;
                Ok(())
            })
            .await?;
        }
        Op::FsDelete => {
            let p = path(&ctx.text(node, arg::fs_delete::PATH).await?);
            blocking(ctx, node, move || files::recycle(&p)).await?;
        }
        Op::FsMkdir => {
            let p = path(&ctx.text(node, arg::fs_mkdir::PATH).await?);
            blocking(ctx, node, move || Ok(std::fs::create_dir_all(p)?)).await?;
        }
        Op::FsUnzip => {
            use arg::fs_unzip::*;
            let z = path(&ctx.text(node, ZIP).await?);
            let d = path(&ctx.text(node, DEST).await?);
            blocking(ctx, node, move || files::unzip(&z, &d)).await?;
        }
        Op::FsZip => {
            use arg::fs_zip::*;
            let s = path(&ctx.text(node, SRC).await?);
            let z = path(&ctx.text(node, ZIP).await?);
            blocking(ctx, node, move || files::zip(&s, &z)).await?;
        }
        Op::ClipSet => {
            let t = ctx.text(node, arg::clip_set::TEXT).await?;
            blocking(ctx, node, move || sysinfo::set_clipboard_text(&t)).await?;
        }
        Op::HttpDownload => {
            use arg::http_download::*;
            let url = ctx.text(node, URL).await?;
            let p = path(&ctx.text(node, PATH).await?);
            let cancel = ctx.cancel.clone();
            let fetch = async move {
                let bytes = client()?
                    .get(url.trim())
                    .send()
                    .await
                    .and_then(|r| r.error_for_status())
                    .map_err(|e| AppError::msg(e.to_string()))?
                    .bytes()
                    .await
                    .map_err(|e| AppError::msg(e.to_string()))?;
                if let Some(parent) = p.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&p, &bytes)?;
                Ok::<(), AppError>(())
            };
            tokio::select! {
                r = fetch => ctx.check(node, r)?,
                _ = cancel.cancelled() => return Err(Exit::Cancelled),
            }
        }
        _ => return Err(unsupported(ctx, node)),
    }
    Ok(Flow::Next)
}

pub async fn eval(ctx: &mut Ctx, node: &Node) -> R<Value> {
    match node.op {
        Op::FsRead => {
            let p = path(&ctx.text(node, arg::fs_read::PATH).await?);
            let t = blocking(ctx, node, move || {
                let bytes = std::fs::read(&p)
                    .map_err(|_| AppError::FileNotFound(p.display().to_string()))?;
                Ok(String::from_utf8_lossy(&bytes).to_string())
            })
            .await?;
            Ok(Value::String(t))
        }
        Op::FsList => {
            use arg::fs_list::*;
            let p = path(&ctx.text(node, PATH).await?);
            let filter = ctx.text(node, FILTER).await?;
            let rec = truthy(node.lit(REC));
            let list = blocking(ctx, node, move || files::list(&p, &filter, rec)).await?;
            Ok(Value::Array(list.into_iter().map(Value::String).collect()))
        }
        Op::ClipGet => Ok(Value::String(sysinfo::clipboard_text())),
        Op::HttpRequest => {
            use arg::http_request::*;
            let method = node.lit_str(METHOD);
            let url = ctx.text(node, URL).await?;
            let body = ctx.text(node, BODY).await?;
            let headers = headers_of(&ctx.eval(node, HEADERS).await?);
            let cancel = ctx.cancel.clone();
            let req = async move {
                let c = client()?;
                let m =
                    reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET);
                let mut r = c.request(m, url.trim());
                for (k, v) in headers {
                    r = r.header(k, v);
                }
                if !body.is_empty() {
                    r = r.body(body);
                }
                let resp = r.send().await.map_err(|e| AppError::msg(e.to_string()))?;
                resp.text().await.map_err(|e| AppError::msg(e.to_string()))
            };
            let t = tokio::select! {
                r = req => ctx.check(node, r)?,
                _ = cancel.cancelled() => return Err(Exit::Cancelled),
            };
            Ok(Value::String(t))
        }
        Op::JsonParse => {
            let t = ctx.text(node, arg::json_parse::TEXT).await?;
            serde_json::from_str::<Value>(&t)
                .map_err(|e| ctx.err(node, format!("invalid JSON: {e}")))
        }
        Op::JsonStringify => {
            let v = ctx.eval(node, arg::json_stringify::OBJ).await?;
            Ok(Value::String(match v {
                Value::String(s) => serde_json::to_string(&Value::String(s)).unwrap_or_default(),
                other => serde_json::to_string(&other).unwrap_or_default(),
            }))
        }
        _ => Err(unsupported(ctx, node)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_headers_in_every_form() {
        assert_eq!(
            headers_of(&json!({ "A": "1" })),
            vec![("A".into(), "1".into())]
        );
        assert_eq!(
            headers_of(&json!("{\"B\": 2}")),
            vec![("B".into(), "2".into())]
        );
        assert_eq!(
            headers_of(&json!("X-Key: abc\nAccept: text/plain")),
            vec![
                ("X-Key".into(), "abc".into()),
                ("Accept".into(), "text/plain".into())
            ]
        );
    }
}
