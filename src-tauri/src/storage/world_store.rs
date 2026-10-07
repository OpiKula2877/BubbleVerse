use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::Value;

use super::codec::{decode, encode};
use super::db::Db;
use super::migrate::migrate_world;
use crate::error::{AppError, AppResult};

pub const DRAFT: &str = "draft";
pub const PUBLISHED: &str = "published";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldDoc {
    pub world: Value,
    /// Unix time in milliseconds.
    pub updated_at: i64,
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn load(db: &Db, slot: &str) -> AppResult<Option<WorldDoc>> {
    let row: Option<(Vec<u8>, i64)> = db
        .conn
        .query_row(
            "SELECT data, updated_at FROM world WHERE slot = ?1",
            params![slot],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    match row {
        None => Ok(None),
        Some((bytes, updated_at)) => Ok(Some(WorldDoc {
            world: migrate_world(decode(&bytes)?)?,
            updated_at,
        })),
    }
}

/// Every change goes to the draft (autosave, spec §4.7).
pub fn save_draft(db: &Db, world: &Value) -> AppResult<i64> {
    let at = now_ms();
    db.conn.execute(
        "INSERT INTO world (slot, data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(slot) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        params![DRAFT, encode(world)?, at],
    )?;
    Ok(at)
}

pub fn discard_draft(db: &Db) -> AppResult<()> {
    db.conn
        .execute("DELETE FROM world WHERE slot = ?1", params![DRAFT])?;
    Ok(())
}

/// Save: the draft becomes the published version in one transaction (spec §9.2).
/// Returns the encoded published document (used for the backup).
pub fn publish(db: &mut Db, world: &Value) -> AppResult<Vec<u8>> {
    let migrated = migrate_world(world.clone())?;
    let bytes = encode(&migrated)?;
    let tx = db.conn.transaction()?;
    tx.execute(
        "INSERT INTO world (slot, data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(slot) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        params![PUBLISHED, bytes, now_ms()],
    )?;
    tx.execute("DELETE FROM world WHERE slot = ?1", params![DRAFT])?;
    tx.commit()?;
    Ok(bytes)
}

// ---------- Backups ----------

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file: String,
    pub at: i64,
    pub size: u64,
}

/// Stores a published version in `backups\` and keeps only the newest `keep` files.
pub fn write_backup(dir: &Path, bytes: &[u8], keep: usize) -> AppResult<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let mut at = now_ms();
    let mut path = dir.join(format!("world-{at}.bvw"));
    while path.exists() {
        at += 1;
        path = dir.join(format!("world-{at}.bvw"));
    }
    std::fs::write(&path, bytes)?;
    prune_backups(dir, keep)?;
    Ok(path)
}

pub fn list_backups(dir: &Path) -> AppResult<Vec<BackupInfo>> {
    let mut out = Vec::new();
    if !dir.exists() {
        return Ok(out);
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(at) = name
            .strip_prefix("world-")
            .and_then(|s| s.strip_suffix(".bvw"))
            .and_then(|s| s.parse::<i64>().ok())
        else {
            continue;
        };
        out.push(BackupInfo {
            file: name,
            at,
            size: entry.metadata()?.len(),
        });
    }
    out.sort_by_key(|b| std::cmp::Reverse(b.at));
    Ok(out)
}

fn prune_backups(dir: &Path, keep: usize) -> AppResult<()> {
    for old in list_backups(dir)?.into_iter().skip(keep.max(1)) {
        std::fs::remove_file(dir.join(old.file))?;
    }
    Ok(())
}

pub fn read_backup(dir: &Path, file: &str) -> AppResult<Value> {
    if file.contains(['/', '\\']) || !file.ends_with(".bvw") {
        return Err(AppError::msg("invalid backup name"));
    }
    migrate_world(decode(&std::fs::read(dir.join(file))?)?)
}

/// Every world in backups (they keep their assets alive, spec §9.2).
pub fn read_all_backups(dir: &Path) -> Vec<Value> {
    list_backups(dir)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|b| read_backup(dir, &b.file).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn world(name: &str) -> Value {
        json!({ "version": 1, "bubbles": [{ "id": "a", "name": name }], "sharedScripts": [],
                "customBlocks": [], "templates": [], "globals": [], "homeView": { "x": 0, "y": 0, "zoom": 1 } })
    }

    #[test]
    fn draft_and_publish() {
        let mut db = Db::open_in_memory().unwrap();
        assert!(load(&db, DRAFT).unwrap().is_none());
        save_draft(&db, &world("draft")).unwrap();
        assert_eq!(
            load(&db, DRAFT).unwrap().unwrap().world["bubbles"][0]["name"],
            "draft"
        );
        publish(&mut db, &world("saved")).unwrap();
        assert!(load(&db, DRAFT).unwrap().is_none());
        assert_eq!(
            load(&db, PUBLISHED).unwrap().unwrap().world["bubbles"][0]["name"],
            "saved"
        );
    }

    #[test]
    fn publish_rejects_invalid_world_and_keeps_old_version() {
        let mut db = Db::open_in_memory().unwrap();
        publish(&mut db, &world("v1")).unwrap();
        save_draft(&db, &world("draft")).unwrap();
        assert!(publish(&mut db, &json!({ "version": 99 })).is_err());
        assert_eq!(
            load(&db, PUBLISHED).unwrap().unwrap().world["bubbles"][0]["name"],
            "v1"
        );
        assert!(load(&db, DRAFT).unwrap().is_some());
    }

    #[test]
    fn keeps_newest_backups() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..5 {
            write_backup(dir.path(), &encode(&world(&format!("b{i}"))).unwrap(), 3).unwrap();
        }
        let list = list_backups(dir.path()).unwrap();
        assert_eq!(list.len(), 3);
        let newest = read_backup(dir.path(), &list[0].file).unwrap();
        assert_eq!(newest["bubbles"][0]["name"], "b4");
        assert!(read_backup(dir.path(), "..\\evil.bvw").is_err());
        assert_eq!(read_all_backups(dir.path()).len(), 3);
    }
}
