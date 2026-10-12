//! Auto icons (spec §3.2): the icon of a file, shortcut or Store app, of a Steam or Epic game,
//! and the favicon of a web site.

use std::path::{Path, PathBuf};

use windows::core::HSTRING;
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
};
use windows::Win32::UI::Shell::{
    IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
};

use super::com::ComGuard;
use super::registry::{self, HKEY_LOCAL_MACHINE};
use crate::error::{AppError, AppResult};

/// Icons are taken at this size (the asset store keeps them as WebP).
pub const ICON_SIZE: i32 = 256;

pub struct Rgba {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

/// The icon the shell shows for a path, a shortcut (its target's icon) or
/// `shell:AppsFolder\<AUMID>`.
pub fn shell_icon(target: &str) -> AppResult<Rgba> {
    let _com = ComGuard::new();
    unsafe {
        let factory: IShellItemImageFactory =
            SHCreateItemFromParsingName(&HSTRING::from(target), None)?;
        let bmp = factory.GetImage(
            SIZE {
                cx: ICON_SIZE,
                cy: ICON_SIZE,
            },
            SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
        )?;
        let out = bitmap_rgba(bmp);
        let _ = DeleteObject(HGDIOBJ(bmp.0));
        out
    }
}

/// 32-bit bitmap (premultiplied BGRA) to straight RGBA.
unsafe fn bitmap_rgba(bmp: HBITMAP) -> AppResult<Rgba> {
    let mut bm = BITMAP::default();
    let got = GetObjectW(
        HGDIOBJ(bmp.0),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bm as *mut BITMAP as *mut core::ffi::c_void),
    );
    if got == 0 || bm.bmWidth <= 0 || bm.bmHeight == 0 {
        return Err(AppError::format("icon bitmap"));
    }
    let (w, h) = (bm.bmWidth, bm.bmHeight.abs());
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            // Negative height = rows from the top.
            biHeight: -h,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    let dc = GetDC(None);
    let lines = GetDIBits(
        dc,
        bmp,
        0,
        h as u32,
        Some(pixels.as_mut_ptr() as *mut core::ffi::c_void),
        &mut info,
        DIB_RGB_COLORS,
    );
    ReleaseDC(None, dc);
    if lines == 0 {
        return Err(AppError::format("icon pixels"));
    }
    straighten(&mut pixels);
    Ok(Rgba {
        width: w as u32,
        height: h as u32,
        pixels,
    })
}

/// Premultiplied BGRA to straight RGBA; bitmaps without alpha become opaque.
pub fn straighten(px: &mut [u8]) {
    let has_alpha = px.chunks(4).any(|p| p[3] != 0);
    for p in px.chunks_mut(4) {
        p.swap(0, 2);
        if !has_alpha {
            p[3] = 255;
        } else if p[3] > 0 && p[3] < 255 {
            let a = p[3] as u32;
            for c in p.iter_mut().take(3) {
                *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
}

// ---------------------------------------------------------------- Steam

/// Where a Steam game's icon is: an icon/exe file, or an image in Steam's library cache.
pub enum IconFile {
    Shell(String),
    Image(PathBuf),
}

pub fn steam_icon(app_id: &str) -> Option<IconFile> {
    for key in [
        format!(
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Steam App {app_id}"
        ),
        format!(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App {app_id}"),
    ] {
        if let Some(icon) = registry::string(HKEY_LOCAL_MACHINE, &key, "DisplayIcon") {
            // "C:\…\game.ico" or "C:\…\game.exe,0"
            let path = icon
                .trim_matches('"')
                .split(',')
                .next()
                .unwrap_or("")
                .to_string();
            if Path::new(&path).is_file() {
                return Some(IconFile::Shell(path));
            }
        }
    }
    let cache = super::apps::steam_root()?.join(r"appcache\librarycache");
    let old = cache.join(format!("{app_id}_icon.jpg"));
    if old.is_file() {
        return Some(IconFile::Image(old));
    }
    // Newer Steam: a folder per game; the icon is its smallest JPEG.
    std::fs::read_dir(cache.join(app_id))
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("jpg")))
        .min_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(u64::MAX))
        .map(IconFile::Image)
}

// ---------------------------------------------------------------- favicon

/// Icon links of a page, best first: `apple-touch-icon` (large), then icons by declared size.
pub fn icon_links(html: &str) -> Vec<String> {
    let lower = html.to_lowercase();
    let mut found: Vec<(i32, String)> = Vec::new();
    let mut from = 0;
    while let Some(start) = lower[from..].find("<link") {
        let start = from + start;
        let end = lower[start..]
            .find('>')
            .map(|e| start + e)
            .unwrap_or(lower.len());
        let tag = &html[start..end];
        let tag_l = &lower[start..end];
        from = end;
        let Some(rel) = attr(tag, tag_l, "rel") else {
            continue;
        };
        let rel = rel.to_lowercase();
        if !rel
            .split_whitespace()
            .any(|r| r == "icon" || r == "apple-touch-icon")
        {
            continue;
        }
        let Some(href) = attr(tag, tag_l, "href").filter(|h| !h.is_empty()) else {
            continue;
        };
        let size = attr(tag, tag_l, "sizes")
            .and_then(|s| {
                s.split(['x', 'X'])
                    .next()
                    .and_then(|n| n.trim().parse::<i32>().ok())
            })
            .unwrap_or(16);
        let svg = href.to_lowercase().ends_with(".svg")
            || attr(tag, tag_l, "type").is_some_and(|t| t.contains("svg"));
        // SVG cannot be decoded; touch icons are large.
        let score = if svg {
            -1
        } else if rel.contains("apple-touch-icon") {
            1000 + size
        } else {
            size
        };
        if score >= 0 {
            found.push((score, href));
        }
    }
    found.sort_by_key(|(s, _)| -s);
    found.into_iter().map(|(_, h)| h).collect()
}

/// An attribute value of a tag (quoted or not); `tag_l` is the lower-case copy of `tag`.
fn attr(tag: &str, tag_l: &str, name: &str) -> Option<String> {
    let mut from = 0;
    while let Some(i) = tag_l[from..].find(name) {
        let i = from + i;
        from = i + name.len();
        let before_ok = i == 0 || tag_l.as_bytes()[i - 1].is_ascii_whitespace();
        let rest = tag_l[from..].trim_start();
        if !before_ok || !rest.starts_with('=') {
            continue;
        }
        let offset = tag_l.len() - rest.len() + 1;
        let value = tag[offset..].trim_start();
        let v = if let Some(q) = value.strip_prefix('"') {
            q.split('"').next()
        } else if let Some(q) = value.strip_prefix('\'') {
            q.split('\'').next()
        } else {
            value.split(|c: char| c.is_whitespace() || c == '/').next()
        };
        return v.map(|s| s.trim().to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_icon_links_best_first() {
        let html = r#"<html><head>
            <link rel="stylesheet" href="/a.css">
            <link rel="icon" type="image/svg+xml" href="/icon.svg">
            <LINK REL="shortcut icon" href="/favicon.ico">
            <link rel=icon sizes="32x32" href='/i32.png'>
            <link rel="apple-touch-icon" sizes="180x180" href="/touch.png"/>
        </head></html>"#;
        assert_eq!(
            icon_links(html),
            vec!["/touch.png", "/i32.png", "/favicon.ico"]
        );
        assert!(icon_links("<html></html>").is_empty());
    }

    #[test]
    fn premultiplied_bgra_to_rgba() {
        let mut px = vec![10, 20, 30, 255, 0, 0, 64, 128];
        straighten(&mut px);
        assert_eq!(px, vec![30, 20, 10, 255, 128, 0, 0, 128]);
        let mut opaque = vec![1, 2, 3, 0];
        straighten(&mut opaque);
        assert_eq!(opaque, vec![3, 2, 1, 255]);
    }
}
