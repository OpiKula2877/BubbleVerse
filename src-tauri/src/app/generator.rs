//! What the bulk generator (spec §4.6) needs from the core: installed apps and games,
//! files of a folder and auto icons (spec §3.2).

use std::path::Path;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use super::state::AppState;
use crate::error::{AppError, AppResult};
use crate::os::apps::{self, AppEntry};
use crate::os::icons::{self, IconFile};
use crate::os::{files, launch};
use crate::storage::assets::AssetInfo;

/// Biggest page or icon downloaded for a favicon.
const MAX_DOWNLOAD: usize = 2 * 1024 * 1024;

pub(crate) async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// `source`: "start" | "store" | "steam" | "epic"
#[tauri::command]
pub async fn list_apps(source: String) -> AppResult<Vec<AppEntry>> {
    blocking(move || match source.as_str() {
        "start" => Ok(apps::start_menu()),
        "store" => apps::store_apps(),
        "steam" => Ok(apps::steam_games()),
        "epic" => Ok(apps::epic_entries()),
        other => Err(AppError::msg(format!("unknown app source {other}"))),
    })
    .await
}

/// Files of a folder with one of the extensions (`.exe`, `lnk`…); empty list = all files.
#[tauri::command]
pub async fn scan_folder(
    path: String,
    exts: Vec<String>,
    recursive: bool,
) -> AppResult<Vec<String>> {
    let filter = exts
        .iter()
        .map(|e| format!("*.{}", e.trim().trim_start_matches(['*', '.'])))
        .collect::<Vec<_>>()
        .join(";");
    blocking(move || {
        let mut out = files::list(Path::new(&launch::expand_env(&path)), &filter, recursive)?;
        out.sort_by_key(|p| p.to_lowercase());
        Ok(out)
    })
    .await
}

/// The auto icon of a target as an asset; `None` when there is none.
/// `source`: "exe" (file, shortcut, Store app) | "steam" | "epic" | "favicon"
#[tauri::command]
pub async fn auto_icon(
    source: String,
    target: String,
    app: AppHandle,
) -> AppResult<Option<AssetInfo>> {
    let target = target.trim().to_string();
    if target.is_empty() {
        return Ok(None);
    }
    if source == "favicon" {
        return favicon(&app, &target).await;
    }
    blocking(move || {
        let store = &app.state::<AppState>().assets;
        let file = match source.as_str() {
            "steam" => apps::steam_app_id(&target).and_then(icons::steam_icon),
            "epic" => apps::epic_games()
                .into_iter()
                .find(|g| g.target == target)
                .and_then(|g| g.exe)
                .map(|p| IconFile::Shell(p.display().to_string())),
            // The shell parses only backslashes in paths.
            _ if target.starts_with("shell:") => Some(IconFile::Shell(target.clone())),
            _ => Some(IconFile::Shell(
                launch::expand_env(&target).replace('/', "\\"),
            )),
        };
        match file {
            Some(IconFile::Shell(path)) => match icons::shell_icon(&path) {
                Ok(img) => Ok(Some(store.import_rgba(img.width, img.height, img.pixels)?)),
                Err(e) => {
                    log::info!("no icon for {path}: {e}");
                    Ok(None)
                }
            },
            Some(IconFile::Image(p)) => Ok(Some(store.import_file(&p)?)),
            None => Ok(None),
        }
    })
    .await
}

async fn download(client: &reqwest::Client, url: &str) -> Option<(String, Vec<u8>)> {
    let res = client.get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let final_url = res.url().to_string();
    if res
        .content_length()
        .is_some_and(|n| n as usize > MAX_DOWNLOAD)
    {
        return None;
    }
    let bytes = res.bytes().await.ok()?;
    (bytes.len() <= MAX_DOWNLOAD).then(|| (final_url, bytes.to_vec()))
}

/// The site's icon: the best `<link rel=icon>` of the page, else `/favicon.ico`.
async fn favicon(app: &AppHandle, url: &str) -> AppResult<Option<AssetInfo>> {
    let client = reqwest::Client::builder()
        .user_agent("BubbleVerse")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::msg(e.to_string()))?;
    let mut candidates: Vec<String> = Vec::new();
    let base = match download(&client, url).await {
        Some((final_url, page)) => {
            let html = String::from_utf8_lossy(&page);
            let base = reqwest::Url::parse(&final_url).ok();
            for href in icons::icon_links(&html) {
                if let Some(u) = base.as_ref().and_then(|b| b.join(&href).ok()) {
                    candidates.push(u.to_string());
                }
            }
            base
        }
        None => reqwest::Url::parse(url).ok(),
    };
    if let Some(u) = base.and_then(|b| b.join("/favicon.ico").ok()) {
        candidates.push(u.to_string());
    }
    for c in candidates {
        let Some((_, bytes)) = download(&client, &c).await else {
            continue;
        };
        let name = if bytes.starts_with(b"GIF8") {
            "favicon.gif"
        } else {
            "favicon.png"
        };
        let app = app.clone();
        let imported =
            blocking(move || app.state::<AppState>().assets.import_bytes(name, &bytes)).await;
        if let Ok(info) = imported {
            return Ok(Some(info));
        }
    }
    Ok(None)
}
