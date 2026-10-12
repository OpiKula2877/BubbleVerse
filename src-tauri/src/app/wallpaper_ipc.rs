//! Messages between the app and its wallpaper process: one JSON object per line on the
//! wallpaper process's stdin (from the app) and stdout (to the app).
//!
//! The wallpaper runs in its own process because a window put under the desktop icons shares
//! its thread's input with the desktop. In the app process that thread is also the one of the
//! search bar and the app window, so typing there ("Hide pointer while typing") left the pointer
//! hidden over the desktop.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::os::monitors::Rect;

/// Command-line switch that starts the wallpaper process; the assets folder follows it.
pub const ARG: &str = "--bv-wallpaper";

/// App → wallpaper process.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum ToWallpaper {
    /// An event for the wallpaper page, as the app emitted it.
    Event { name: String, payload: Value },
    /// The answer to a [`ToApp::Call`].
    Reply {
        id: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        ok: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        err: Option<String>,
    },
    /// Put the window under the desktop icons, spanning `origin` (virtual desktop, physical px).
    #[serde(rename_all = "camelCase")]
    Attach { origin: Rect, css_scale: f64 },
    /// Give the desktop back and end.
    Quit,
}

/// Wallpaper process → app.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum ToApp {
    /// A command of the wallpaper page that only the app can answer.
    Call { id: u64, cmd: String, args: Value },
    /// Result of [`ToWallpaper::Attach`]; false = the desktop structure is unknown.
    Attached { ok: bool },
}

pub fn encode<T: Serialize>(msg: &T) -> String {
    // Compact JSON never contains a raw line break.
    serde_json::to_string(msg).unwrap_or_default()
}

pub fn decode<'a, T: Deserialize<'a>>(line: &'a str) -> Option<T> {
    serde_json::from_str(line.trim()).ok()
}

/// The assets folder when this process was started as the wallpaper process.
pub fn requested(args: &[String]) -> Option<PathBuf> {
    let at = args.iter().position(|a| a == ARG)?;
    args.get(at + 1).map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn messages_survive_a_line() {
        let to_wallpaper = [
            ToWallpaper::Event {
                name: "bv://world-published".into(),
                payload: json!({ "bubbles": [{ "name": "a\nb" }] }),
            },
            ToWallpaper::Reply {
                id: 7,
                ok: Some(json!({ "x": 1 })),
                err: None,
            },
            ToWallpaper::Reply {
                id: 8,
                ok: None,
                err: Some("no".into()),
            },
            ToWallpaper::Attach {
                origin: Rect {
                    x: -1920,
                    y: 0,
                    w: 3456,
                    h: 1080,
                },
                css_scale: 1.25,
            },
            ToWallpaper::Quit,
        ];
        for m in to_wallpaper {
            let line = encode(&m);
            assert!(!line.contains('\n'), "{line}");
            assert_eq!(decode::<ToWallpaper>(&line), Some(m));
        }
        let to_app = [
            ToApp::Call {
                id: 1,
                cmd: "bootstrap".into(),
                args: json!({}),
            },
            ToApp::Attached { ok: false },
        ];
        for m in to_app {
            assert_eq!(decode::<ToApp>(&encode(&m)), Some(m));
        }
    }

    #[test]
    fn a_reply_without_a_value_is_null() {
        assert_eq!(
            decode::<ToWallpaper>(r#"{"t":"reply","id":3,"ok":null}"#),
            Some(ToWallpaper::Reply {
                id: 3,
                ok: None,
                err: None
            })
        );
        assert_eq!(decode::<ToApp>("not json"), None);
    }

    #[test]
    fn finds_the_wallpaper_switch() {
        let args = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            requested(&args(&["bv.exe", ARG, r"C:\data\assets"])),
            Some(PathBuf::from(r"C:\data\assets"))
        );
        assert_eq!(requested(&args(&["bv.exe"])), None);
        assert_eq!(requested(&args(&["bv.exe", ARG])), None);
    }
}
