//! UI texts the core shows itself (tray menu, notifications), from the same dictionaries
//! as the windows (`packages/ui/src/i18n/*.json`).

use std::collections::HashMap;
use std::sync::OnceLock;

static EN: OnceLock<HashMap<String, String>> = OnceLock::new();
static CS: OnceLock<HashMap<String, String>> = OnceLock::new();

fn dict(lang: &str) -> &'static HashMap<String, String> {
    let load = |src: &str| serde_json::from_str(src).unwrap_or_default();
    if lang == "cs" {
        CS.get_or_init(|| load(include_str!("../../../packages/ui/src/i18n/cs.json")))
    } else {
        EN.get_or_init(|| load(include_str!("../../../packages/ui/src/i18n/en.json")))
    }
}

pub fn tr(lang: &str, key: &str) -> String {
    dict(lang)
        .get(key)
        .or_else(|| dict("en").get(key))
        .cloned()
        .unwrap_or_else(|| key.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translates_with_fallback() {
        assert_eq!(tr("cs", "tray.quit"), "Ukončit");
        assert_eq!(tr("en", "tray.quit"), "Quit");
        assert_eq!(tr("xx", "tray.quit"), "Quit");
        assert_eq!(tr("cs", "missing.key"), "missing.key");
    }
}
