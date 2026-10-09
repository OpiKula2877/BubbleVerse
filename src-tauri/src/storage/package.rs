//! `.bubble` packages (spec §9.4): a ZIP with `manifest.json`, `branch.bin` (the branch as
//! MessagePack + zstd, like the world) and the used assets. Reading never trusts the file:
//! sizes are limited and only the known entries are read.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

use serde::Serialize;
use serde_json::Value;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::assets::{is_hash, referenced_assets, AssetStore};
use crate::error::{AppError, AppResult};

pub const FORMAT: u64 = 1;
const MAX_MANIFEST: u64 = 1 << 20;
const MAX_BRANCH: u64 = 64 << 20;
const MAX_BRANCH_DECODED: u64 = 256 << 20;
const MAX_ASSET: u64 = 512 << 20;
const MAX_TOTAL: u64 = 4 << 30;

fn zip_err(e: zip::result::ZipError) -> AppError {
    AppError::format(e)
}

/// Writes a package; returns the number of assets in it.
pub fn write(
    path: &Path,
    manifest: &Value,
    branch: &Value,
    store: &AssetStore,
) -> AppResult<usize> {
    let mut used = HashSet::new();
    referenced_assets(branch, &mut used);
    let hashes: BTreeSet<String> = used.into_iter().collect();
    let tmp = path.with_extension("bubble.part");
    let mut names = Vec::new();
    {
        let mut zip = ZipWriter::new(File::create(&tmp)?);
        // Assets are WebP or video already: compressing them again gains nothing.
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for h in &hashes {
            let Some(p) = store.path_of(h) else {
                log::warn!("asset {h} is missing, the package is written without it");
                continue;
            };
            let Some(file) = p.file_name().map(|n| n.to_string_lossy().to_string()) else {
                continue;
            };
            let name = format!("assets/{file}");
            zip.start_file(name.as_str(), stored).map_err(zip_err)?;
            std::io::copy(&mut File::open(&p)?, &mut zip)?;
            names.push(name);
        }
        let mut manifest = manifest.clone();
        if let Some(m) = manifest.as_object_mut() {
            m.insert("format".into(), Value::from(FORMAT));
            m.insert("assets".into(), Value::from(names.clone()));
        }
        zip.start_file("manifest.json", deflated).map_err(zip_err)?;
        zip.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
        zip.start_file("branch.bin", stored).map_err(zip_err)?;
        zip.write_all(&super::codec::encode(branch)?)?;
        zip.finish().map_err(zip_err)?;
    }
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    std::fs::rename(&tmp, path)?;
    Ok(names.len())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadPackage {
    pub manifest: Value,
    pub branch: Value,
    pub assets: usize,
    /// Assets that got another hash in this store (old → new).
    pub renamed: HashMap<String, String>,
}

fn read_entry<R: Read + std::io::Seek>(
    zip: &mut ZipArchive<R>,
    name: &str,
    limit: u64,
) -> AppResult<Vec<u8>> {
    let f = zip
        .by_name(name)
        .map_err(|_| AppError::msg("packageInvalid"))?;
    if f.size() > limit {
        return Err(AppError::msg("packageInvalid"));
    }
    let mut out = Vec::new();
    f.take(limit + 1).read_to_end(&mut out)?;
    if out.len() as u64 > limit {
        return Err(AppError::msg("packageInvalid"));
    }
    Ok(out)
}

fn decode_branch(bytes: &[u8]) -> AppResult<Value> {
    let mut packed = Vec::new();
    zstd::stream::read::Decoder::new(bytes)?
        .take(MAX_BRANCH_DECODED + 1)
        .read_to_end(&mut packed)?;
    if packed.len() as u64 > MAX_BRANCH_DECODED {
        return Err(AppError::msg("packageInvalid"));
    }
    Ok(rmp_serde::from_slice(&packed)?)
}

/// Reads a package and puts its assets into the store (they are content-addressed, so equal
/// files are not duplicated).
pub fn read(path: &Path, store: &AssetStore) -> AppResult<ReadPackage> {
    if !path.is_file() {
        return Err(AppError::FileNotFound(path.display().to_string()));
    }
    let mut zip =
        ZipArchive::new(File::open(path)?).map_err(|_| AppError::msg("packageInvalid"))?;
    let manifest: Value =
        serde_json::from_slice(&read_entry(&mut zip, "manifest.json", MAX_MANIFEST)?)
            .map_err(|_| AppError::msg("packageInvalid"))?;
    let format = manifest.get("format").and_then(Value::as_u64).unwrap_or(0);
    if format == 0 {
        return Err(AppError::msg("packageInvalid"));
    }
    if format > FORMAT {
        return Err(AppError::msg("packageNewer"));
    }
    let branch = decode_branch(&read_entry(&mut zip, "branch.bin", MAX_BRANCH)?)?;
    let mut total = 0u64;
    let mut count = 0;
    let mut renamed = HashMap::new();
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(zip_err)?;
        let name = f.name().to_string();
        let Some(file) = name.strip_prefix("assets/") else {
            continue;
        };
        let Some((hash, ext)) = file.split_once('.') else {
            continue;
        };
        if !is_hash(hash) || !ext.chars().all(|c| c.is_ascii_alphanumeric()) || f.size() > MAX_ASSET
        {
            continue;
        }
        total += f.size();
        if total > MAX_TOTAL {
            return Err(AppError::msg("packageInvalid"));
        }
        let mut bytes = Vec::new();
        f.by_ref().take(MAX_ASSET + 1).read_to_end(&mut bytes)?;
        match store.import_bytes(file, &bytes) {
            Ok(info) => {
                count += 1;
                if info.hash != hash {
                    renamed.insert(hash.to_string(), info.hash);
                }
            }
            Err(e) => log::warn!("package asset {file}: {e}"),
        }
    }
    Ok(ReadPackage {
        manifest,
        branch,
        assets: count,
        renamed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn png() -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(4, 4, image::Rgba([10, 200, 30, 255]));
        let mut out = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut out, image::ImageFormat::Png)
            .unwrap();
        out.into_inner()
    }

    #[test]
    fn writes_and_reads_a_branch_with_its_assets() {
        let dir = tempfile::tempdir().unwrap();
        let store = AssetStore::new(dir.path().join("assets"));
        let icon = store.import_bytes("icon.png", &png()).unwrap();
        let branch = json!({
            "bubbles": [{ "id": "a", "name": "Žluťoučký", "skin": { "mode": "own", "skin": { "media": { "type": "icon", "asset": icon.hash } } } }],
            "sharedScripts": [], "customBlocks": [], "globals": [], "templates": []
        });
        let file = dir.path().join("x.bubble");
        let n = write(
            &file,
            &json!({ "name": "Apps", "root": "a" }),
            &branch,
            &store,
        )
        .unwrap();
        assert_eq!(n, 1);

        // Another PC: an empty asset store.
        let other = AssetStore::new(dir.path().join("other"));
        let p = read(&file, &other).unwrap();
        assert_eq!(p.manifest["format"], json!(FORMAT));
        assert_eq!(p.manifest["name"], json!("Apps"));
        assert_eq!(p.branch, branch);
        assert_eq!(p.assets, 1);
        assert!(p.renamed.is_empty());
        assert!(other.path_of(&icon.hash).is_some());
    }

    #[test]
    fn rejects_other_files_and_newer_formats() {
        let dir = tempfile::tempdir().unwrap();
        let store = AssetStore::new(dir.path().join("assets"));
        let junk = dir.path().join("junk.bubble");
        std::fs::write(&junk, b"not a zip").unwrap();
        assert_eq!(
            read(&junk, &store).unwrap_err().to_string(),
            "packageInvalid"
        );

        let newer = dir.path().join("newer.bubble");
        let mut zip = ZipWriter::new(File::create(&newer).unwrap());
        zip.start_file("manifest.json", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"{ "format": 99 }"#).unwrap();
        zip.finish().unwrap();
        assert_eq!(
            read(&newer, &store).unwrap_err().to_string(),
            "packageNewer"
        );
    }
}
