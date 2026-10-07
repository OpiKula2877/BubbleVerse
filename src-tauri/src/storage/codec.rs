use serde_json::Value;

use crate::error::{AppError, AppResult};

const ZSTD_LEVEL: i32 = 3;

/// A world (or any document) as MessagePack compressed with zstd (spec §9.2).
pub fn encode(value: &Value) -> AppResult<Vec<u8>> {
    let packed = rmp_serde::to_vec_named(value)?;
    zstd::encode_all(&packed[..], ZSTD_LEVEL).map_err(AppError::from)
}

pub fn decode(bytes: &[u8]) -> AppResult<Value> {
    let packed = zstd::decode_all(bytes)?;
    Ok(rmp_serde::from_slice(&packed)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn roundtrips_documents() {
        let v = json!({
            "version": 1,
            "bubbles": [{ "id": "A", "name": "Aplikace ✓", "position": { "x": 1.5, "y": -2 } }],
            "homeView": { "x": 0, "y": 0, "zoom": 1 },
            "flags": [true, false, null]
        });
        assert_eq!(decode(&encode(&v).unwrap()).unwrap(), v);
    }

    #[test]
    fn simple_script_is_compact() {
        // "when activated → run file {path}" (spec §9.3: roughly 20–40 B)
        let script = json!({ "v": 1, "trigger": [1], "body": [[300, [563, "path"], "", false, false, false]], "runMode": "ignore" });
        let packed = rmp_serde::to_vec_named(&script).unwrap();
        assert!(packed.len() <= 64, "{} bytes", packed.len());
    }

    #[test]
    fn rejects_garbage() {
        assert!(decode(b"not zstd").is_err());
    }
}
