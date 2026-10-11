//! `bvasset://` – serves stored assets to the windows (`http://bvasset.localhost/<hash>`).

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Manager, UriSchemeContext, UriSchemeResponder, Wry};

use crate::storage::assets::AssetStore;

pub const SCHEME: &str = "bvasset";

fn content_type(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "webp" => "image/webp",
        "png" => "image/png",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    let mut r = Response::new(Vec::new());
    *r.status_mut() = code;
    r
}

pub fn handle(
    ctx: UriSchemeContext<'_, Wry>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    // Managed by the app and by the wallpaper process alike.
    let store = ctx.app_handle().state::<AssetStore>().inner().clone();
    std::thread::spawn(move || {
        let hash = request.uri().path().trim_start_matches('/').to_string();
        let Some(path) = store.path_of(&hash) else {
            responder.respond(status(StatusCode::NOT_FOUND));
            return;
        };
        let Ok(bytes) = std::fs::read(&path) else {
            responder.respond(status(StatusCode::NOT_FOUND));
            return;
        };
        let total = bytes.len();
        let mime = content_type(&path);
        // Byte ranges let videos seek and loop.
        let range = request
            .headers()
            .get(header::RANGE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("bytes="))
            .and_then(|v| v.split_once('-'))
            .and_then(|(a, b)| {
                let start: usize = a.parse().ok()?;
                let end: usize = if b.is_empty() {
                    total.saturating_sub(1)
                } else {
                    b.parse().ok()?
                };
                (start <= end && end < total).then_some((start, end))
            });
        let builder = Response::builder()
            .header(header::CONTENT_TYPE, mime)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CACHE_CONTROL, "max-age=31536000, immutable")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        let response = match range {
            Some((start, end)) => builder
                .status(StatusCode::PARTIAL_CONTENT)
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {start}-{end}/{total}"),
                )
                .body(bytes[start..=end].to_vec()),
            None => builder.status(StatusCode::OK).body(bytes),
        };
        responder.respond(response.unwrap_or_else(|_| status(StatusCode::INTERNAL_SERVER_ERROR)));
    });
}
