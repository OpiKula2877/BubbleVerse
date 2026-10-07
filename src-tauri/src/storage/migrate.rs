use serde_json::{json, Map, Value};

use crate::error::{AppError, AppResult};

/// Current world format version (spec §9.1 `World.version`).
pub const WORLD_VERSION: u64 = 1;
/// Current script format version (spec §9.3 `Script.v`).
pub const SCRIPT_VERSION: u64 = 1;

/// Brings a stored world to the current format.
pub fn migrate_world(mut world: Value) -> AppResult<Value> {
    let obj = world
        .as_object_mut()
        .ok_or_else(|| AppError::format("world is not an object"))?;
    let version = obj.get("version").and_then(Value::as_u64).unwrap_or(0);
    if version > WORLD_VERSION {
        return Err(AppError::format(format!(
            "the world was saved by a newer BubbleVerse (format {version})"
        )));
    }
    if version < 1 {
        upgrade_0_to_1(obj);
    }
    Ok(world)
}

/// Version 0 = early documents without a version; fill in every top-level field.
fn upgrade_0_to_1(obj: &mut Map<String, Value>) {
    for (key, default) in [
        ("bubbles", json!([])),
        ("sharedScripts", json!([])),
        ("customBlocks", json!([])),
        ("templates", json!([])),
        ("globals", json!([])),
        ("homeView", json!({ "x": 0, "y": 0, "zoom": 1 })),
    ] {
        obj.entry(key).or_insert(default);
    }
    obj.insert("version".into(), json!(1));
}

/// Checks a script's format version; newer scripts cannot run on this version.
pub fn check_script_version(script: &Value) -> AppResult<()> {
    let v = script.get("v").and_then(Value::as_u64).unwrap_or(1);
    if v > SCRIPT_VERSION {
        return Err(AppError::format(format!(
            "script format {v} is newer than supported"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upgrades_unversioned_world() {
        let w = migrate_world(json!({ "bubbles": [{ "id": "a" }] })).unwrap();
        assert_eq!(w["version"], 1);
        assert_eq!(w["bubbles"][0]["id"], "a");
        assert_eq!(w["homeView"]["zoom"], 1);
        assert_eq!(w["sharedScripts"], json!([]));
    }

    #[test]
    fn keeps_current_world() {
        let w = json!({ "version": 1, "bubbles": [], "sharedScripts": [], "customBlocks": [],
                        "templates": [], "globals": [], "homeView": { "x": 1, "y": 2, "zoom": 3 } });
        assert_eq!(migrate_world(w.clone()).unwrap(), w);
    }

    #[test]
    fn rejects_newer_world_and_scripts() {
        assert!(migrate_world(json!({ "version": 99 })).is_err());
        assert!(migrate_world(json!([1, 2])).is_err());
        assert!(check_script_version(&json!({ "v": 2 })).is_err());
        assert!(check_script_version(&json!({ "v": 1 })).is_ok());
    }
}
