//! Installed apps and games for the bulk generator (spec §4.6): Start menu shortcuts,
//! Microsoft Store apps, Steam and Epic games.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;
use windows::core::PWSTR;
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::UI::Shell::{
    BHID_EnumItems, FOLDERID_AppsFolder, IEnumShellItems, IShellItem, SHGetKnownFolderItem,
    KF_FLAG_DEFAULT, SIGDN, SIGDN_NORMALDISPLAY, SIGDN_PARENTRELATIVEPARSING,
};

use super::com::ComGuard;
use super::registry::{self, HKEY_CURRENT_USER};
use crate::error::AppResult;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    pub name: String,
    /// A shortcut path, `shell:AppsFolder\…`, `steam://rungameid/…` or an Epic launcher URL.
    pub target: String,
    /// "file" (run file) | "url" (open)
    pub kind: String,
    /// Where the auto icon comes from: "exe" | "steam" | "epic".
    pub icon: String,
}

fn entry(name: &str, target: String, kind: &str, icon: &str) -> AppEntry {
    AppEntry {
        name: name.trim().to_string(),
        target,
        kind: kind.into(),
        icon: icon.into(),
    }
}

// ---------------------------------------------------------------- Start menu

fn start_menu_dirs() -> Vec<PathBuf> {
    ["ProgramData", "APPDATA"]
        .iter()
        .filter_map(|v| std::env::var(v).ok())
        .map(|base| PathBuf::from(base).join(r"Microsoft\Windows\Start Menu\Programs"))
        .collect()
}

/// Shortcuts that are not apps (uninstallers, help files, web links of installers).
fn is_noise(name: &str) -> bool {
    let n = name.to_lowercase();
    [
        "uninstall",
        "odinstal",
        "readme",
        "help",
        "nápověda",
        "license",
    ]
    .iter()
    .any(|w| n.contains(w))
}

/// `.lnk` shortcuts of the Start menu, one per name.
pub fn start_menu() -> Vec<AppEntry> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for dir in start_menu_dirs() {
        let Ok(files) = super::files::list(&dir, "*.lnk", true) else {
            continue;
        };
        for f in files {
            let name = Path::new(&f)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            if name.is_empty() || is_noise(&name) || !seen.insert(name.to_lowercase()) {
                continue;
            }
            out.push(entry(&name, f, "file", "exe"));
        }
    }
    out.sort_by_key(|e| e.name.to_lowercase());
    out
}

// ---------------------------------------------------------------- Microsoft Store

fn display_name(item: &IShellItem, kind: SIGDN) -> Option<String> {
    unsafe {
        let p: PWSTR = item.GetDisplayName(kind).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s
    }
}

/// Packaged (Store) apps from the Applications folder; they start through `shell:AppsFolder`.
pub fn store_apps() -> AppResult<Vec<AppEntry>> {
    let _com = ComGuard::new();
    let mut out = Vec::new();
    unsafe {
        let folder: IShellItem = SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)?;
        let items: IEnumShellItems = folder.BindToHandler(None, &BHID_EnumItems)?;
        loop {
            let mut batch = [None];
            let mut fetched = 0u32;
            if items.Next(&mut batch, Some(&mut fetched)).is_err() || fetched == 0 {
                break;
            }
            let Some(item) = batch[0].take() else { break };
            let (Some(name), Some(id)) = (
                display_name(&item, SIGDN_NORMALDISPLAY),
                display_name(&item, SIGDN_PARENTRELATIVEPARSING),
            ) else {
                continue;
            };
            // Packaged apps have an AUMID `Family!App`; desktop apps come from the Start menu.
            if id.contains('!') && !is_noise(&name) {
                out.push(entry(
                    &name,
                    format!(r"shell:AppsFolder\{id}"),
                    "url",
                    "exe",
                ));
            }
        }
    }
    out.sort_by_key(|e| e.name.to_lowercase());
    Ok(out)
}

// ---------------------------------------------------------------- Steam

/// Every `"key" "value"` pair of a Valve KeyValues (VDF/ACF) text, in order.
pub fn vdf_pairs(text: &str) -> Vec<(String, String)> {
    let mut tokens = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                let mut s = String::new();
                while let Some(c) = chars.next() {
                    match c {
                        '\\' => {
                            if let Some(n) = chars.next() {
                                s.push(n);
                            }
                        }
                        '"' => break,
                        _ => s.push(c),
                    }
                }
                tokens.push(Some(s));
            }
            '{' | '}' => tokens.push(None),
            _ => {}
        }
    }
    let mut out = Vec::new();
    let mut i = 0;
    while i + 1 < tokens.len() {
        if let (Some(k), Some(v)) = (&tokens[i], &tokens[i + 1]) {
            out.push((k.clone(), v.clone()));
            i += 2;
        } else {
            i += 1;
        }
    }
    out
}

pub fn steam_root() -> Option<PathBuf> {
    registry::string(HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath").map(PathBuf::from)
}

/// Steam apps that are tools rather than games.
const STEAM_TOOLS: &[&str] = &["228980"];

/// Installed Steam games of all libraries; they start through `steam://rungameid/<id>`.
pub fn steam_games() -> Vec<AppEntry> {
    let Some(root) = steam_root() else {
        return Vec::new();
    };
    let mut libraries = vec![root.clone()];
    if let Ok(text) = std::fs::read_to_string(root.join(r"steamapps\libraryfolders.vdf")) {
        for (k, v) in vdf_pairs(&text) {
            if k == "path" {
                libraries.push(PathBuf::from(v));
            }
        }
    }
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for lib in libraries {
        let Ok(files) = super::files::list(&lib.join("steamapps"), "appmanifest_*.acf", false)
        else {
            continue;
        };
        for f in files {
            let Ok(text) = std::fs::read_to_string(&f) else {
                continue;
            };
            let pairs = vdf_pairs(&text);
            let get = |key: &str| pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone());
            if let (Some(id), Some(name)) = (get("appid"), get("name")) {
                if STEAM_TOOLS.contains(&id.as_str()) || !seen.insert(id.clone()) {
                    continue;
                }
                out.push(entry(
                    &name,
                    format!("steam://rungameid/{id}"),
                    "url",
                    "steam",
                ));
            }
        }
    }
    out.sort_by_key(|e| e.name.to_lowercase());
    out
}

/// The app id of a `steam://rungameid/<id>` target.
pub fn steam_app_id(target: &str) -> Option<&str> {
    target
        .strip_prefix("steam://rungameid/")
        .map(|s| s.trim_end_matches('/'))
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
}

// ---------------------------------------------------------------- Epic

fn epic_manifest_dir() -> Option<PathBuf> {
    std::env::var("ProgramData")
        .ok()
        .map(|p| PathBuf::from(p).join(r"Epic\EpicGamesLauncher\Data\Manifests"))
}

/// One installed Epic game from its launcher manifest (`*.item`, JSON).
#[derive(Clone, Debug, PartialEq)]
pub struct EpicGame {
    pub name: String,
    pub app_name: String,
    pub target: String,
    /// The game's executable (for its icon).
    pub exe: Option<PathBuf>,
}

pub fn parse_epic_manifest(v: &Value) -> Option<EpicGame> {
    let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    if v.get("bIsIncompleteInstall").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    let (ns, item, app) = (s("CatalogNamespace"), s("CatalogItemId"), s("AppName"));
    let name = s("DisplayName");
    if ns.is_empty() || item.is_empty() || app.is_empty() || name.is_empty() {
        return None;
    }
    let exe = {
        let (dir, file) = (s("InstallLocation"), s("LaunchExecutable"));
        (!dir.is_empty() && !file.is_empty()).then(|| PathBuf::from(dir).join(file))
    };
    Some(EpicGame {
        name,
        target: format!(
            "com.epicgames.launcher://apps/{ns}%3A{item}%3A{app}?action=launch&silent=true"
        ),
        app_name: app,
        exe,
    })
}

pub fn epic_games() -> Vec<EpicGame> {
    let Some(dir) = epic_manifest_dir() else {
        return Vec::new();
    };
    let Ok(files) = super::files::list(&dir, "*.item", false) else {
        return Vec::new();
    };
    let mut out: Vec<EpicGame> = files
        .iter()
        .filter_map(|f| std::fs::read_to_string(f).ok())
        .filter_map(|t| serde_json::from_str::<Value>(&t).ok())
        .filter_map(|v| parse_epic_manifest(&v))
        .collect();
    out.sort_by_key(|g| g.name.to_lowercase());
    out
}

pub fn epic_entries() -> Vec<AppEntry> {
    epic_games()
        .into_iter()
        .map(|g| entry(&g.name, g.target, "url", "epic"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_vdf_pairs() {
        let text = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"apps" { "228980" "1" }
	}
	"1" { "path" "D:\\SteamLibrary" }
}"#;
        let paths: Vec<String> = vdf_pairs(text)
            .into_iter()
            .filter(|(k, _)| k == "path")
            .map(|(_, v)| v)
            .collect();
        assert_eq!(
            paths,
            vec![r"C:\Program Files (x86)\Steam", r"D:\SteamLibrary"]
        );
        let acf = r#""AppState" { "appid" "570" "name" "Dota 2" "StateFlags" "4" }"#;
        let pairs = vdf_pairs(acf);
        assert!(pairs.contains(&("appid".into(), "570".into())));
        assert!(pairs.contains(&("name".into(), "Dota 2".into())));
    }

    #[test]
    fn steam_ids_from_targets() {
        assert_eq!(steam_app_id("steam://rungameid/570"), Some("570"));
        assert_eq!(steam_app_id("steam://rungameid/"), None);
        assert_eq!(steam_app_id("https://x"), None);
    }

    #[test]
    fn epic_manifest_to_launcher_url() {
        let g = parse_epic_manifest(&json!({
            "DisplayName": "Fortnite", "CatalogNamespace": "fn", "CatalogItemId": "4fe7",
            "AppName": "Fortnite", "InstallLocation": "C:\\Epic\\Fortnite",
            "LaunchExecutable": "FortniteGame\\Binaries\\Win64\\FortniteLauncher.exe"
        }))
        .unwrap();
        assert_eq!(
            g.target,
            "com.epicgames.launcher://apps/fn%3A4fe7%3AFortnite?action=launch&silent=true"
        );
        assert!(g.exe.unwrap().ends_with("FortniteLauncher.exe"));
        assert!(
            parse_epic_manifest(&json!({ "DisplayName": "x", "bIsIncompleteInstall": true }))
                .is_none()
        );
    }

    #[test]
    fn skips_uninstallers() {
        assert!(is_noise("Uninstall Foo"));
        assert!(is_noise("Odinstalovat Foo"));
        assert!(!is_noise("Visual Studio Code"));
    }
}
