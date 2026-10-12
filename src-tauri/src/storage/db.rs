use std::path::Path;

use rusqlite::Connection;

use crate::error::AppResult;

/// Schema migrations; index + 1 = `PRAGMA user_version` after applying.
const MIGRATIONS: &[&str] = &[
    // 1: initial schema (spec §9.2)
    "CREATE TABLE world (
         slot TEXT PRIMARY KEY,
         data BLOB NOT NULL,
         updated_at INTEGER NOT NULL
     );
     CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
     CREATE TABLE globals (name TEXT PRIMARY KEY, value TEXT NOT NULL);
     CREATE TABLE bubble_vars (
         bubble_id TEXT NOT NULL,
         name TEXT NOT NULL,
         value TEXT NOT NULL,
         PRIMARY KEY (bubble_id, name)
     );
     CREATE TABLE search_history (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         text TEXT NOT NULL,
         at INTEGER NOT NULL
     );
     CREATE TABLE usage (bubble_id TEXT PRIMARY KEY, count INTEGER NOT NULL);
     CREATE TABLE script_layouts (
         bubble_id TEXT NOT NULL,
         slot TEXT NOT NULL,
         data TEXT NOT NULL,
         PRIMARY KEY (bubble_id, slot)
     );",
];

pub struct Db {
    pub conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Db> {
        let conn = Connection::open(path)?;
        conn.pragma_update_and_check(None, "journal_mode", "WAL", |r| r.get::<_, String>(0))?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        let mut db = Db { conn };
        db.migrate()?;
        Ok(db)
    }

    pub fn open_in_memory() -> AppResult<Db> {
        let mut db = Db {
            conn: Connection::open_in_memory()?,
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&mut self) -> AppResult<()> {
        let current: i64 = self
            .conn
            .pragma_query_value(None, "user_version", |r| r.get(0))?;
        for (i, sql) in MIGRATIONS.iter().enumerate() {
            let version = i as i64 + 1;
            if version <= current {
                continue;
            }
            let tx = self.conn.transaction()?;
            tx.execute_batch(sql)?;
            tx.pragma_update(None, "user_version", version)?;
            tx.commit()?;
        }
        Ok(())
    }

    /// Integrity check at startup (spec §11).
    pub fn integrity_ok(&self) -> AppResult<bool> {
        let res: String = self
            .conn
            .query_row("PRAGMA quick_check", [], |r| r.get(0))?;
        Ok(res == "ok")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_schema_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("data.db");
        {
            let db = Db::open(&path).unwrap();
            assert!(db.integrity_ok().unwrap());
        }
        let db = Db::open(&path).unwrap();
        let v: i64 = db
            .conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, MIGRATIONS.len() as i64);
    }
}
