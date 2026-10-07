use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

/// Locations of BubbleVerse data (spec §9.2): `%APPDATA%\BubbleVerse\`.
#[derive(Clone, Debug)]
pub struct Paths {
    pub root: PathBuf,
}

impl Paths {
    pub fn new(root: PathBuf) -> AppResult<Self> {
        let p = Paths { root };
        std::fs::create_dir_all(p.assets())?;
        std::fs::create_dir_all(p.backups())?;
        Ok(p)
    }

    /// Default data folder, or the one in `BUBBLEVERSE_DATA` (used by tests and portable setups).
    pub fn default_root() -> AppResult<PathBuf> {
        if let Ok(dir) = std::env::var("BUBBLEVERSE_DATA") {
            return Ok(PathBuf::from(dir));
        }
        let appdata = std::env::var("APPDATA").map_err(|_| AppError::msg("APPDATA is not set"))?;
        // Development builds keep their data apart from an installed BubbleVerse.
        let name = if cfg!(debug_assertions) {
            "BubbleVerse-dev"
        } else {
            "BubbleVerse"
        };
        Ok(Path::new(&appdata).join(name))
    }

    pub fn db(&self) -> PathBuf {
        self.root.join("data.db")
    }

    pub fn assets(&self) -> PathBuf {
        self.root.join("assets")
    }

    pub fn backups(&self) -> PathBuf {
        self.root.join("backups")
    }
}
