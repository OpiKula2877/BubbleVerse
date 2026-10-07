use std::collections::BTreeMap;

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::db::Db;
use crate::error::AppResult;

/// All settings (spec §7) with the defaults from §14. Missing fields fall back to defaults,
/// so older settings documents keep loading. Mirrored in `packages/ui/src/settings.ts`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub general: General,
    pub appearance: Appearance,
    pub shortcuts: Vec<Shortcut>,
    pub performance: Performance,
    pub data: DataSettings,
    pub background: Backgrounds,
    pub sounds: Sounds,
    pub search: SearchSettings,
    pub view: ViewSettings,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct General {
    pub autostart: bool,
    pub wallpaper: bool,
    pub hide_desktop_icons: bool,
    pub language: String,
    /// Device name of the monitor with the UI; `None` = Windows primary monitor.
    pub primary_monitor: Option<String>,
    pub cover_taskbar: bool,
    /// "tray" | "quit"
    pub close_behavior: String,
    pub check_updates: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Appearance {
    /// "light" | "dark" | "opikula" | "custom"
    pub theme: String,
    pub custom: BTreeMap<String, String>,
    /// Percent, 50–200.
    pub ui_scale: u32,
    pub font: String,
    pub radius: u32,
    pub panel_opacity: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Shortcut {
    pub action: String,
    pub combo: String,
    /// "app" | "global"
    pub scope: String,
    pub override_windows: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Performance {
    /// 30 | 60 | 120 | 0 (= monitor refresh rate)
    pub app_fps: u32,
    /// 15 | 30 | 60
    pub wallpaper_fps: u32,
    /// "low" | "medium" | "high"
    pub quality: String,
    pub max_videos: u32,
    pub pause_fullscreen: bool,
    pub pause_maximized: bool,
    pub pause_battery_saver: bool,
    pub pause_locked: bool,
    /// Below this zoom bubbles are drawn simplified (spec §10).
    pub lod_zoom: f64,
    /// "auto" | "webgpu" | "webgl"
    pub graphics_api: String,
    pub show_fps: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct DataSettings {
    pub data_dir: Option<String>,
    pub backups: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Background {
    /// "color" | "gradient" | "image" | "video" | "windows"
    pub kind: String,
    pub color: String,
    pub color2: String,
    pub angle: f64,
    pub asset: Option<String>,
    pub stars: bool,
    pub parallax: bool,
    pub grid: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Backgrounds {
    /// Same background for the app window and the wallpaper.
    pub same: bool,
    pub app: Background,
    pub wallpaper: Background,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Sounds {
    pub ui: bool,
    pub activation: bool,
    pub volume: f64,
    pub activation_sound: Option<String>,
    pub click_sound: Option<String>,
    pub mute_in_fullscreen: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct SearchSettings {
    pub sort_by_usage: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct ViewSettings {
    /// "always" | "hover" | "never"
    pub names: String,
    pub skins: bool,
    pub motion_paused: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 1,
            general: General::default(),
            appearance: Appearance::default(),
            shortcuts: default_shortcuts(),
            performance: Performance::default(),
            data: DataSettings::default(),
            background: Backgrounds::default(),
            sounds: Sounds::default(),
            search: SearchSettings::default(),
            view: ViewSettings::default(),
        }
    }
}

impl Default for General {
    fn default() -> Self {
        General {
            autostart: true,
            wallpaper: true,
            hide_desktop_icons: false,
            language: "en".into(),
            primary_monitor: None,
            cover_taskbar: true,
            close_behavior: "tray".into(),
            check_updates: true,
        }
    }
}

impl Default for Appearance {
    fn default() -> Self {
        Appearance {
            theme: "dark".into(),
            custom: BTreeMap::new(),
            ui_scale: 100,
            font: "Segoe UI Variable Text, Segoe UI, sans-serif".into(),
            radius: 8,
            panel_opacity: 0.94,
        }
    }
}

impl Default for Shortcut {
    fn default() -> Self {
        Shortcut {
            action: String::new(),
            combo: String::new(),
            scope: "app".into(),
            override_windows: false,
        }
    }
}

/// Spec §14.
pub fn default_shortcuts() -> Vec<Shortcut> {
    let s = |action: &str, combo: &str, scope: &str, override_windows: bool| Shortcut {
        action: action.into(),
        combo: combo.into(),
        scope: scope.into(),
        override_windows,
    };
    vec![
        s("toggleApp", "Ctrl+Alt+B", "global", false),
        s("search", "Ctrl+F", "app", false),
        s("globalSearch", "Alt+Space", "global", true),
        s("editMode", "Ctrl+E", "app", false),
        s("save", "Ctrl+S", "app", false),
        s("stopScripts", "Ctrl+Alt+Shift+S", "global", false),
        s("homeView", "Home", "app", false),
    ]
}

impl Default for Performance {
    fn default() -> Self {
        Performance {
            app_fps: 60,
            wallpaper_fps: 30,
            quality: "high".into(),
            max_videos: 8,
            pause_fullscreen: true,
            pause_maximized: true,
            pause_battery_saver: true,
            pause_locked: true,
            lod_zoom: 0.35,
            graphics_api: "auto".into(),
            show_fps: false,
        }
    }
}

impl Default for DataSettings {
    fn default() -> Self {
        DataSettings {
            data_dir: None,
            backups: 10,
        }
    }
}

impl Default for Background {
    fn default() -> Self {
        Background {
            kind: "gradient".into(),
            color: "#0E1220".into(),
            color2: "#1B1030".into(),
            angle: 135.0,
            asset: None,
            stars: true,
            parallax: true,
            grid: false,
        }
    }
}

impl Default for Backgrounds {
    fn default() -> Self {
        Backgrounds {
            same: true,
            app: Background::default(),
            wallpaper: Background::default(),
        }
    }
}

impl Default for Sounds {
    fn default() -> Self {
        Sounds {
            ui: false,
            activation: false,
            volume: 0.6,
            activation_sound: None,
            click_sound: None,
            mute_in_fullscreen: true,
        }
    }
}

impl Default for ViewSettings {
    fn default() -> Self {
        ViewSettings {
            names: "always".into(),
            skins: true,
            motion_paused: false,
        }
    }
}

impl Settings {
    /// Fills in shortcuts added in newer versions and clamps values to valid ranges.
    pub fn normalized(mut self) -> Self {
        for d in default_shortcuts() {
            if !self.shortcuts.iter().any(|s| s.action == d.action) {
                self.shortcuts.push(d);
            }
        }
        self.appearance.ui_scale = self.appearance.ui_scale.clamp(50, 200);
        self.data.backups = self.data.backups.clamp(1, 100);
        self.performance.max_videos = self.performance.max_videos.clamp(0, 64);
        if !["en", "cs"].contains(&self.general.language.as_str()) {
            self.general.language = "en".into();
        }
        self
    }
}

const KEY: &str = "app";

pub fn load(db: &Db) -> AppResult<Settings> {
    let raw: Option<String> = db
        .conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![KEY],
            |r| r.get(0),
        )
        .optional()?;
    let settings = match raw {
        Some(text) => serde_json::from_str::<Settings>(&text).unwrap_or_default(),
        None => Settings::default(),
    };
    Ok(settings.normalized())
}

pub fn save(db: &Db, settings: &Settings) -> AppResult<()> {
    db.conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![KEY, serde_json::to_string(settings)?],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_follow_the_spec() {
        let s = Settings::default();
        assert_eq!(s.performance.app_fps, 60);
        assert_eq!(s.performance.wallpaper_fps, 30);
        assert_eq!(s.performance.max_videos, 8);
        assert_eq!(s.data.backups, 10);
        assert!(s.general.cover_taskbar);
        assert!(!s.general.hide_desktop_icons);
        assert!(!s.search.sort_by_usage);
        let combo = |a: &str| {
            s.shortcuts
                .iter()
                .find(|x| x.action == a)
                .unwrap()
                .combo
                .clone()
        };
        assert_eq!(combo("toggleApp"), "Ctrl+Alt+B");
        assert_eq!(combo("globalSearch"), "Alt+Space");
        assert_eq!(combo("stopScripts"), "Ctrl+Alt+Shift+S");
    }

    #[test]
    fn partial_documents_fill_defaults() {
        let s: Settings =
            serde_json::from_str(r#"{ "general": { "language": "cs" }, "shortcuts": [] }"#)
                .unwrap();
        let s = s.normalized();
        assert_eq!(s.general.language, "cs");
        assert!(s.general.autostart);
        assert_eq!(s.shortcuts.len(), default_shortcuts().len());
    }

    #[test]
    fn saves_and_loads() {
        let db = Db::open_in_memory().unwrap();
        let mut s = load(&db).unwrap();
        s.appearance.theme = "opikula".into();
        s.appearance.ui_scale = 999;
        save(&db, &s).unwrap();
        let back = load(&db).unwrap();
        assert_eq!(back.appearance.theme, "opikula");
        assert_eq!(back.appearance.ui_scale, 200);
    }
}
