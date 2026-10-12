use std::collections::HashMap;

use rusqlite::{params, OptionalExtension};
use serde_json::Value;

use super::db::Db;
use super::world_store::now_ms;
use crate::error::AppResult;

/// Search history keeps the newest 50 commands (spec §6.6).
pub const HISTORY_LIMIT: usize = 50;

pub fn push_history(db: &Db, text: &str) -> AppResult<()> {
    let text = text.trim();
    if text.is_empty() {
        return Ok(());
    }
    db.conn
        .execute("DELETE FROM search_history WHERE text = ?1", params![text])?;
    db.conn.execute(
        "INSERT INTO search_history (text, at) VALUES (?1, ?2)",
        params![text, now_ms()],
    )?;
    db.conn.execute(
        "DELETE FROM search_history WHERE id NOT IN
           (SELECT id FROM search_history ORDER BY id DESC LIMIT ?1)",
        params![HISTORY_LIMIT as i64],
    )?;
    Ok(())
}

/// Newest first.
pub fn history(db: &Db) -> AppResult<Vec<String>> {
    let mut st = db
        .conn
        .prepare("SELECT text FROM search_history ORDER BY id DESC LIMIT ?1")?;
    let rows = st.query_map(params![HISTORY_LIMIT as i64], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn bump_usage(db: &Db, bubble_id: &str) -> AppResult<()> {
    db.conn.execute(
        "INSERT INTO usage (bubble_id, count) VALUES (?1, 1)
         ON CONFLICT(bubble_id) DO UPDATE SET count = count + 1",
        params![bubble_id],
    )?;
    Ok(())
}

pub fn usage(db: &Db) -> AppResult<HashMap<String, i64>> {
    let mut st = db.conn.prepare("SELECT bubble_id, count FROM usage")?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

// ---------- Variables ----------

pub fn globals(db: &Db) -> AppResult<HashMap<String, Value>> {
    let mut st = db.conn.prepare("SELECT name, value FROM globals")?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut out = HashMap::new();
    for row in rows {
        let (name, text) = row?;
        out.insert(name, serde_json::from_str(&text).unwrap_or(Value::Null));
    }
    Ok(out)
}

pub fn set_global(db: &Db, name: &str, value: &Value) -> AppResult<()> {
    db.conn.execute(
        "INSERT INTO globals (name, value) VALUES (?1, ?2)
         ON CONFLICT(name) DO UPDATE SET value = excluded.value",
        params![name, value.to_string()],
    )?;
    Ok(())
}

pub fn delete_global(db: &Db, name: &str) -> AppResult<()> {
    db.conn
        .execute("DELETE FROM globals WHERE name = ?1", params![name])?;
    Ok(())
}

pub fn bubble_vars(db: &Db, bubble_id: &str) -> AppResult<HashMap<String, Value>> {
    let mut st = db
        .conn
        .prepare("SELECT name, value FROM bubble_vars WHERE bubble_id = ?1")?;
    let rows = st.query_map(params![bubble_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut out = HashMap::new();
    for row in rows {
        let (name, text) = row?;
        out.insert(name, serde_json::from_str(&text).unwrap_or(Value::Null));
    }
    Ok(out)
}

pub fn set_bubble_var(db: &Db, bubble_id: &str, name: &str, value: &Value) -> AppResult<()> {
    db.conn.execute(
        "INSERT INTO bubble_vars (bubble_id, name, value) VALUES (?1, ?2, ?3)
         ON CONFLICT(bubble_id, name) DO UPDATE SET value = excluded.value",
        params![bubble_id, name, value.to_string()],
    )?;
    Ok(())
}

// ---------- Small internal values (stored in the settings table under "meta:") ----------

pub fn meta(db: &Db, name: &str) -> AppResult<Option<String>> {
    Ok(db
        .conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![format!("meta:{name}")],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn set_meta(db: &Db, name: &str, value: &str) -> AppResult<()> {
    db.conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![format!("meta:{name}"), value],
    )?;
    Ok(())
}

pub fn delete_meta(db: &Db, name: &str) -> AppResult<()> {
    db.conn.execute(
        "DELETE FROM settings WHERE key = ?1",
        params![format!("meta:{name}")],
    )?;
    Ok(())
}

// ---------- Script layouts (block positions in the editor, spec §9.3) ----------

pub fn layout(db: &Db, bubble_id: &str, slot: &str) -> AppResult<Option<String>> {
    Ok(db
        .conn
        .query_row(
            "SELECT data FROM script_layouts WHERE bubble_id = ?1 AND slot = ?2",
            params![bubble_id, slot],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn set_layout(db: &Db, bubble_id: &str, slot: &str, data: &str) -> AppResult<()> {
    db.conn.execute(
        "INSERT INTO script_layouts (bubble_id, slot, data) VALUES (?1, ?2, ?3)
         ON CONFLICT(bubble_id, slot) DO UPDATE SET data = excluded.data",
        params![bubble_id, slot, data],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn history_keeps_50_unique_newest_first() {
        let db = Db::open_in_memory().unwrap();
        for i in 0..60 {
            push_history(&db, &format!("cmd {i}")).unwrap();
        }
        push_history(&db, "cmd 30").unwrap();
        push_history(&db, "   ").unwrap();
        let h = history(&db).unwrap();
        assert_eq!(h.len(), 50);
        assert_eq!(h[0], "cmd 30");
        assert_eq!(h[1], "cmd 59");
        assert_eq!(h.iter().filter(|x| *x == "cmd 30").count(), 1);
    }

    #[test]
    fn usage_counts() {
        let db = Db::open_in_memory().unwrap();
        bump_usage(&db, "a").unwrap();
        bump_usage(&db, "a").unwrap();
        bump_usage(&db, "b").unwrap();
        let u = usage(&db).unwrap();
        assert_eq!(u["a"], 2);
        assert_eq!(u["b"], 1);
    }

    #[test]
    fn variables_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        set_global(&db, "count", &json!(3)).unwrap();
        set_global(&db, "list", &json!(["a", 1])).unwrap();
        assert_eq!(globals(&db).unwrap()["list"], json!(["a", 1]));
        delete_global(&db, "count").unwrap();
        assert!(!globals(&db).unwrap().contains_key("count"));
        set_bubble_var(&db, "b1", "x", &json!("hi")).unwrap();
        assert_eq!(bubble_vars(&db, "b1").unwrap()["x"], json!("hi"));
        assert!(bubble_vars(&db, "b2").unwrap().is_empty());
        set_layout(&db, "b1", "0", "{}").unwrap();
        assert_eq!(layout(&db, "b1", "0").unwrap().as_deref(), Some("{}"));
    }
}
