//! File helpers for blocks: recycle bin, listing with filters, ZIP.

use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use windows::core::PCWSTR;
use windows::Win32::UI::Shell::{
    SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE,
    SHFILEOPSTRUCTW,
};

use super::launch::expand_env;
use crate::error::{AppError, AppResult};

pub fn path(p: &str) -> PathBuf {
    PathBuf::from(expand_env(p.trim()))
}

/// Moves a file or folder to the recycle bin.
pub fn recycle(p: &Path) -> AppResult<()> {
    if !p.exists() {
        return Err(AppError::FileNotFound(p.display().to_string()));
    }
    // SHFileOperation wants a list of paths ending with two zeros.
    let mut from: Vec<u16> = p.display().to_string().encode_utf16().collect();
    from.extend([0, 0]);
    let mut op = SHFILEOPSTRUCTW {
        wFunc: FO_DELETE,
        pFrom: PCWSTR(from.as_ptr()),
        fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT).0 as u16,
        ..Default::default()
    };
    let r = unsafe { SHFileOperationW(&mut op) };
    if r != 0 || op.fAnyOperationsAborted.as_bool() {
        return Err(AppError::msg(format!("could not delete {}", p.display())));
    }
    Ok(())
}

/// `*.exe;*.lnk` style filter (case-insensitive, `*` and `?`).
pub fn matches_filter(name: &str, filter: &str) -> bool {
    let f = filter.trim();
    if f.is_empty() || f == "*" || f == "*.*" {
        return true;
    }
    f.split([';', ',', ' '])
        .filter(|p| !p.is_empty())
        .any(|pat| wildcard(&pat.to_lowercase(), &name.to_lowercase()))
}

fn wildcard(pat: &str, s: &str) -> bool {
    let p: Vec<char> = pat.chars().collect();
    let t: Vec<char> = s.chars().collect();
    let (mut pi, mut ti, mut star, mut mark) = (0usize, 0usize, None::<usize>, 0usize);
    while ti < t.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            mark = ti;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ti = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

/// Files in a folder matching a filter, optionally with subfolders. Full paths, sorted.
pub fn list(dir: &Path, filter: &str, recursive: bool) -> AppResult<Vec<String>> {
    if !dir.is_dir() {
        return Err(AppError::FileNotFound(dir.display().to_string()));
    }
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else {
            continue;
        };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                if recursive {
                    stack.push(p);
                }
            } else if matches_filter(&e.file_name().to_string_lossy(), filter) {
                out.push(p.display().to_string());
            }
        }
    }
    out.sort();
    Ok(out)
}

pub fn unzip(zip: &Path, dest: &Path) -> AppResult<usize> {
    let f = File::open(zip).map_err(|_| AppError::FileNotFound(zip.display().to_string()))?;
    let mut archive = zip::ZipArchive::new(f).map_err(AppError::format)?;
    std::fs::create_dir_all(dest)?;
    let mut n = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(AppError::format)?;
        // `enclosed_name` rejects entries escaping the destination (zip slip).
        let Some(rel) = entry.enclosed_name() else {
            continue;
        };
        let out = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf)?;
        std::fs::write(&out, buf)?;
        n += 1;
    }
    Ok(n)
}

pub fn zip(src: &Path, zip_path: &Path) -> AppResult<usize> {
    if !src.exists() {
        return Err(AppError::FileNotFound(src.display().to_string()));
    }
    let f = File::create(zip_path)?;
    let mut w = zip::ZipWriter::new(f);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let base = if src.is_dir() {
        src.to_path_buf()
    } else {
        src.parent().map(Path::to_path_buf).unwrap_or_default()
    };
    let files = if src.is_dir() {
        list(src, "*", true)?
    } else {
        vec![src.display().to_string()]
    };
    for file in &files {
        let p = Path::new(file);
        let rel = p
            .strip_prefix(&base)
            .unwrap_or(p)
            .to_string_lossy()
            .replace('\\', "/");
        w.start_file(rel, opts).map_err(AppError::format)?;
        w.write_all(&std::fs::read(p)?)?;
    }
    w.finish().map_err(AppError::format)?;
    Ok(files.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_names() {
        assert!(matches_filter("Game.EXE", "*.exe;*.lnk"));
        assert!(matches_filter("a.lnk", "*.exe, *.lnk"));
        assert!(!matches_filter("a.txt", "*.exe"));
        assert!(matches_filter("anything", ""));
        assert!(matches_filter("file1.txt", "file?.txt"));
    }

    #[test]
    fn lists_zips_and_unzips() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::write(src.join("a.txt"), "A").unwrap();
        std::fs::write(src.join("sub").join("b.exe"), "B").unwrap();
        assert_eq!(list(&src, "*.exe", false).unwrap().len(), 0);
        assert_eq!(list(&src, "*.exe", true).unwrap().len(), 1);
        let z = dir.path().join("x.zip");
        assert_eq!(zip(&src, &z).unwrap(), 2);
        let out = dir.path().join("out");
        assert_eq!(unzip(&z, &out).unwrap(), 2);
        assert_eq!(
            std::fs::read_to_string(out.join("sub").join("b.exe")).unwrap(),
            "B"
        );
    }
}
