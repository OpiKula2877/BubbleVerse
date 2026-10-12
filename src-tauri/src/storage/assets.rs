use std::collections::HashSet;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::codecs::gif::GifDecoder;
use image::codecs::webp::WebPEncoder;
use image::{AnimationDecoder, DynamicImage, ExtendedColorType, GenericImageView};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

/// Largest side of stored still images; bigger pictures are scaled down to keep GPU memory low.
const MAX_IMAGE_SIDE: u32 = 2048;
/// Videos above this size get a warning (spec §9.2).
const VIDEO_WARN_BYTES: u64 = 50 * 1024 * 1024;
const KNOWN_EXTS: [&str; 7] = ["webp", "mp4", "webm", "png", "mp3", "wav", "ogg"];

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    pub hash: String,
    pub ext: String,
    pub width: u32,
    pub height: u32,
    pub animated: bool,
    pub bytes: u64,
    pub warning: Option<String>,
}

/// Content-addressed files: `assets\ab\abcd….webp` (spec §9.2). Same content = same file.
#[derive(Clone, Debug)]
pub struct AssetStore {
    dir: PathBuf,
}

pub fn is_hash(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

impl AssetStore {
    pub fn new(dir: PathBuf) -> Self {
        AssetStore { dir }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn import_file(&self, path: &Path) -> AppResult<AssetInfo> {
        if !path.is_file() {
            return Err(AppError::FileNotFound(path.display().to_string()));
        }
        let bytes = std::fs::read(path)?;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        self.import_bytes(&name, &bytes)
    }

    /// Converts PNG/JPG/BMP/ICO to WebP and GIF to animated WebP; videos and sounds are kept
    /// as they are.
    pub fn import_bytes(&self, name: &str, bytes: &[u8]) -> AppResult<AssetInfo> {
        let ext = Path::new(name)
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        match ext.as_str() {
            "mp4" | "webm" => {
                let mut info = self.store(bytes, &ext)?;
                if info.bytes > VIDEO_WARN_BYTES {
                    info.warning = Some("videoLarge".into());
                }
                Ok(info)
            }
            // Sounds (spec §7.7) are kept as they are.
            "mp3" | "wav" | "ogg" => self.store(bytes, &ext),
            "gif" => self.import_gif(bytes),
            "webp" => {
                let img = image::load_from_memory(bytes)?;
                let mut info = self.store(bytes, "webp")?;
                info.width = img.width();
                info.height = img.height();
                info.animated = is_animated_webp(bytes);
                Ok(info)
            }
            _ => {
                let img = image::load_from_memory(bytes)?;
                self.import_image(img)
            }
        }
    }

    /// Stores raw RGBA pixels (icons extracted from executables) as WebP.
    pub fn import_rgba(&self, width: u32, height: u32, rgba: Vec<u8>) -> AppResult<AssetInfo> {
        let img = image::RgbaImage::from_raw(width, height, rgba)
            .ok_or_else(|| AppError::format("invalid pixel buffer"))?;
        self.import_image(DynamicImage::ImageRgba8(img))
    }

    fn import_image(&self, img: DynamicImage) -> AppResult<AssetInfo> {
        let img = if img.width().max(img.height()) > MAX_IMAGE_SIDE {
            img.resize(
                MAX_IMAGE_SIDE,
                MAX_IMAGE_SIDE,
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            img
        };
        let rgba = img.to_rgba8();
        let (w, h) = img.dimensions();
        let mut out = Vec::new();
        WebPEncoder::new_lossless(&mut out).encode(&rgba, w, h, ExtendedColorType::Rgba8)?;
        let mut info = self.store(&out, "webp")?;
        info.width = w;
        info.height = h;
        Ok(info)
    }

    fn import_gif(&self, bytes: &[u8]) -> AppResult<AssetInfo> {
        let decoder = GifDecoder::new(Cursor::new(bytes))?;
        let frames = decoder.into_frames().collect_frames()?;
        let first = frames
            .first()
            .ok_or_else(|| AppError::format("GIF has no frames"))?;
        let (w, h) = first.buffer().dimensions();
        if frames.len() == 1 {
            return self.import_image(DynamicImage::ImageRgba8(first.buffer().clone()));
        }
        let mut encoder = webp_animation::Encoder::new_with_options(
            (w, h),
            webp_animation::EncoderOptions {
                encoding_config: Some(webp_animation::EncodingConfig {
                    encoding_type: webp_animation::EncodingType::Lossy(
                        webp_animation::LossyEncodingConfig::default(),
                    ),
                    quality: 85.0,
                    method: 4,
                }),
                ..Default::default()
            },
        )
        .map_err(|e| AppError::format(format!("{e:?}")))?;
        let mut ts: i32 = 0;
        for frame in &frames {
            let (num, den) = frame.delay().numer_denom_ms();
            let delay = num.checked_div(den).map_or(100, |d| d.max(20)) as i32;
            if frame.buffer().dimensions() != (w, h) {
                continue;
            }
            encoder
                .add_frame(frame.buffer().as_raw(), ts)
                .map_err(|e| AppError::format(format!("{e:?}")))?;
            ts += delay;
        }
        let data = encoder
            .finalize(ts)
            .map_err(|e| AppError::format(format!("{e:?}")))?;
        let mut info = self.store(&data, "webp")?;
        info.width = w;
        info.height = h;
        info.animated = true;
        Ok(info)
    }

    fn store(&self, bytes: &[u8], ext: &str) -> AppResult<AssetInfo> {
        let digest = Sha256::digest(bytes);
        let hash = hex::encode(&digest[..16]);
        let path = self.path_for(&hash, ext);
        if !path.exists() {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let tmp = path.with_extension("tmp");
            std::fs::write(&tmp, bytes)?;
            std::fs::rename(&tmp, &path)?;
        }
        Ok(AssetInfo {
            hash,
            ext: ext.into(),
            width: 0,
            height: 0,
            animated: false,
            bytes: bytes.len() as u64,
            warning: None,
        })
    }

    fn path_for(&self, hash: &str, ext: &str) -> PathBuf {
        self.dir.join(&hash[..2]).join(format!("{hash}.{ext}"))
    }

    /// The stored file of an asset, if it exists.
    pub fn path_of(&self, hash: &str) -> Option<PathBuf> {
        if !is_hash(hash) {
            return None;
        }
        KNOWN_EXTS
            .iter()
            .map(|ext| self.path_for(hash, ext))
            .find(|p| p.exists())
    }

    pub fn total_size(&self) -> u64 {
        self.files().iter().map(|(_, _, size)| size).sum()
    }

    fn files(&self) -> Vec<(String, PathBuf, u64)> {
        let mut out = Vec::new();
        let Ok(dirs) = std::fs::read_dir(&self.dir) else {
            return out;
        };
        for d in dirs.flatten() {
            let Ok(files) = std::fs::read_dir(d.path()) else {
                continue;
            };
            for f in files.flatten() {
                let path = f.path();
                let hash = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let size = f.metadata().map(|m| m.len()).unwrap_or(0);
                out.push((hash, path, size));
            }
        }
        out
    }

    /// Deletes assets nobody references (spec §9.2); returns how many files were removed.
    pub fn collect_garbage(&self, keep: &HashSet<String>) -> AppResult<usize> {
        let mut removed = 0;
        for (hash, path, _) in self.files() {
            if !keep.contains(&hash) {
                std::fs::remove_file(path)?;
                removed += 1;
            }
        }
        Ok(removed)
    }
}

fn is_animated_webp(bytes: &[u8]) -> bool {
    bytes.windows(4).take(64).any(|w| w == b"ANIM")
}

/// Every asset hash a document references (values of `asset` / `mask` keys and settings assets).
pub fn referenced_assets(value: &Value, out: &mut HashSet<String>) {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                if let Value::String(s) = v {
                    if is_hash(s)
                        && matches!(
                            k.as_str(),
                            "asset" | "mask" | "activationSound" | "clickSound"
                        )
                    {
                        out.insert(s.clone());
                    }
                } else {
                    referenced_assets(v, out);
                }
            }
        }
        Value::Array(items) => items.iter().for_each(|v| referenced_assets(v, out)),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn png(w: u32, h: u32) -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(w, h, image::Rgba([200, 30, 40, 255]));
        let mut out = Vec::new();
        DynamicImage::ImageRgba8(img)
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn converts_png_to_webp_and_dedupes() {
        let dir = tempfile::tempdir().unwrap();
        let store = AssetStore::new(dir.path().to_path_buf());
        let a = store.import_bytes("a.png", &png(16, 8)).unwrap();
        let b = store.import_bytes("copy.PNG", &png(16, 8)).unwrap();
        assert_eq!(a.hash, b.hash);
        assert_eq!(a.ext, "webp");
        assert_eq!((a.width, a.height), (16, 8));
        let path = store.path_of(&a.hash).unwrap();
        assert!(path.to_string_lossy().contains(&a.hash[..2]));
        assert_eq!(&std::fs::read(path).unwrap()[8..12], b"WEBP");
    }

    #[test]
    fn scales_down_huge_images() {
        let dir = tempfile::tempdir().unwrap();
        let store = AssetStore::new(dir.path().to_path_buf());
        let info = store.import_bytes("big.png", &png(4096, 100)).unwrap();
        assert_eq!(info.width, MAX_IMAGE_SIDE);
    }

    #[test]
    fn converts_animated_gif_to_animated_webp() {
        use image::codecs::gif::GifEncoder;
        use image::{Delay, Frame};
        let mut gif = Vec::new();
        {
            let mut enc = GifEncoder::new(&mut gif);
            for c in [0u8, 120, 240] {
                let img = image::RgbaImage::from_pixel(8, 8, image::Rgba([c, 0, 0, 255]));
                enc.encode_frame(Frame::from_parts(
                    img,
                    0,
                    0,
                    Delay::from_numer_denom_ms(100, 1),
                ))
                .unwrap();
            }
        }
        let dir = tempfile::tempdir().unwrap();
        let store = AssetStore::new(dir.path().to_path_buf());
        let info = store.import_bytes("anim.gif", &gif).unwrap();
        assert!(info.animated);
        assert_eq!(info.ext, "webp");
        let bytes = std::fs::read(store.path_of(&info.hash).unwrap()).unwrap();
        assert!(is_animated_webp(&bytes));
    }

    #[test]
    fn keeps_videos_and_collects_garbage() {
        let dir = tempfile::tempdir().unwrap();
        let store = AssetStore::new(dir.path().to_path_buf());
        let video = store.import_bytes("clip.mp4", b"fake mp4 data").unwrap();
        let image = store.import_bytes("a.png", &png(2, 2)).unwrap();
        assert_eq!(video.ext, "mp4");
        let mut keep = HashSet::new();
        referenced_assets(
            &json!({ "bubbles": [{ "skin": { "skin": { "media": { "type": "video", "asset": video.hash } } } }] }),
            &mut keep,
        );
        assert_eq!(store.collect_garbage(&keep).unwrap(), 1);
        assert!(store.path_of(&video.hash).is_some());
        assert!(store.path_of(&image.hash).is_none());
        assert!(store.path_of("../../etc").is_none());
    }
}
