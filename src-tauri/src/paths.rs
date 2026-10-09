use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

/// Name of the file in the standard folder that points to a moved data folder (spec §7.5).
pub const LOCATION_FILE: &str = "location.txt";

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

    /// The data folder: `BUBBLEVERSE_DATA` (tests, portable setups), else the folder the user
    /// moved the data to (`location.txt` in the standard folder), else the standard folder.
    pub fn default_root() -> AppResult<PathBuf> {
        if let Ok(dir) = std::env::var("BUBBLEVERSE_DATA") {
            return Ok(PathBuf::from(dir));
        }
        let standard = Self::standard_root()?;
        if let Ok(text) = std::fs::read_to_string(standard.join(LOCATION_FILE)) {
            let moved = PathBuf::from(text.trim());
            if moved.join("data.db").is_file() {
                return Ok(moved);
            }
        }
        Ok(standard)
    }

    /// `%APPDATA%\BubbleVerse` (`BubbleVerse-dev` for development builds).
    pub fn standard_root() -> AppResult<PathBuf> {
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
