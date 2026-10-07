//! The published world as the interpreter needs it: bubbles with parsed scripts.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{Map, Value};

use super::format::{parse_nodes, parse_script, Node, Script};
use super::generated::opcodes::Op;

pub const PATH_SEPARATOR: &str = " | ";

#[derive(Debug)]
pub struct Slot {
    pub script: Arc<Script>,
    /// Shared script parameters (defaults merged with the bubble's values).
    pub params: HashMap<String, Value>,
    pub shared: Option<String>,
}

#[derive(Debug)]
pub struct BubbleScripts {
    pub id: String,
    pub name: String,
    pub parent: Option<String>,
    pub path: String,
    pub is_action: bool,
    /// `None` = the script could not be parsed (`errors` says why).
    pub slots: Vec<Option<Arc<Slot>>>,
}

#[derive(Debug)]
pub struct CustomBlock {
    pub id: String,
    pub name: String,
    pub params: Vec<String>,
    pub body: Vec<Node>,
}

#[derive(Debug, Default)]
pub struct CompiledWorld {
    pub bubbles: HashMap<String, Arc<BubbleScripts>>,
    /// Normalized path (`apps | work | claude code`) → bubble id.
    pub by_path: HashMap<String, String>,
    pub custom: HashMap<String, Arc<CustomBlock>>,
    /// Declared global variables with initial values.
    pub globals: Vec<(String, Value)>,
    /// (bubble, slot, message) of scripts that failed to parse.
    pub errors: Vec<(String, usize, String)>,
}

pub fn normalize_path(path: &str) -> String {
    path.split('|')
        .map(|s| s.trim().to_lowercase())
        .collect::<Vec<_>>()
        .join(PATH_SEPARATOR)
}

fn str_of<'a>(o: &'a Map<String, Value>, key: &str) -> &'a str {
    o.get(key).and_then(Value::as_str).unwrap_or("")
}

impl CompiledWorld {
    pub fn compile(world: &Value) -> CompiledWorld {
        let mut out = CompiledWorld::default();
        let empty = Vec::new();
        let bubbles = world
            .get("bubbles")
            .and_then(Value::as_array)
            .unwrap_or(&empty);
        let shared: HashMap<&str, &Value> = world
            .get("sharedScripts")
            .and_then(Value::as_array)
            .unwrap_or(&empty)
            .iter()
            .filter_map(|s| s.get("id").and_then(Value::as_str).map(|id| (id, s)))
            .collect();

        let raw: HashMap<&str, &Map<String, Value>> = bubbles
            .iter()
            .filter_map(Value::as_object)
            .map(|o| (str_of(o, "id"), o))
            .collect();
        let path_of = |id: &str| -> String {
            let mut names = Vec::new();
            let mut cur = raw.get(id).copied();
            let mut guard = 0;
            while let Some(o) = cur {
                names.push(str_of(o, "name").to_string());
                guard += 1;
                if guard > 256 {
                    break;
                }
                cur = o
                    .get("parentId")
                    .and_then(Value::as_str)
                    .and_then(|p| raw.get(p).copied());
            }
            names.reverse();
            names.join(PATH_SEPARATOR)
        };

        for (id, o) in &raw {
            let path = path_of(id);
            let mut slots = Vec::new();
            for (i, slot) in o
                .get("scripts")
                .and_then(Value::as_array)
                .unwrap_or(&empty)
                .iter()
                .enumerate()
            {
                match compile_slot(slot, &shared) {
                    Ok(s) => slots.push(Some(Arc::new(s))),
                    Err(e) => {
                        out.errors.push((id.to_string(), i, e));
                        slots.push(None);
                    }
                }
            }
            out.by_path.insert(normalize_path(&path), id.to_string());
            out.bubbles.insert(
                id.to_string(),
                Arc::new(BubbleScripts {
                    id: id.to_string(),
                    name: str_of(o, "name").to_string(),
                    parent: o
                        .get("parentId")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    path,
                    is_action: str_of(o, "kind") == "action",
                    slots,
                }),
            );
        }

        for cb in world
            .get("customBlocks")
            .and_then(Value::as_array)
            .unwrap_or(&empty)
        {
            let Some(id) = cb.get("id").and_then(Value::as_str) else {
                continue;
            };
            let params = cb
                .get("params")
                .and_then(Value::as_array)
                .unwrap_or(&empty)
                .iter()
                .filter_map(|p| p.get("name").and_then(Value::as_str).map(str::to_string))
                .collect();
            match parse_nodes(cb.get("body").unwrap_or(&Value::Null)) {
                Ok(body) => {
                    out.custom.insert(
                        id.to_string(),
                        Arc::new(CustomBlock {
                            id: id.to_string(),
                            name: cb
                                .get("name")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_string(),
                            params,
                            body,
                        }),
                    );
                }
                Err(e) => out.errors.push((format!("custom:{id}"), 0, e.to_string())),
            }
        }

        for g in world
            .get("globals")
            .and_then(Value::as_array)
            .unwrap_or(&empty)
        {
            if let Some(name) = g.get("name").and_then(Value::as_str) {
                out.globals.push((
                    name.to_string(),
                    g.get("value").cloned().unwrap_or(Value::Null),
                ));
            }
        }
        out
    }

    /// Finds a bubble by path (`Apps | Work | X`, case-insensitive) or by id.
    pub fn find(&self, target: &str) -> Option<&Arc<BubbleScripts>> {
        let t = target.trim();
        self.by_path
            .get(&normalize_path(t))
            .and_then(|id| self.bubbles.get(id))
            .or_else(|| self.bubbles.get(t))
    }

    /// Every (bubble, slot index, slot) whose trigger is `op`.
    pub fn slots_with_trigger(&self, op: Op) -> Vec<(Arc<BubbleScripts>, usize, Arc<Slot>)> {
        let mut out = Vec::new();
        for b in self.bubbles.values() {
            for (i, s) in b.slots.iter().enumerate() {
                if let Some(s) = s {
                    if s.script.trigger.op == op {
                        out.push((b.clone(), i, s.clone()));
                    }
                }
            }
        }
        out.sort_by(|a, b| (a.0.id.as_str(), a.1).cmp(&(b.0.id.as_str(), b.1)));
        out
    }

    /// Ids from the main bubble down to this bubble.
    pub fn chain(&self, id: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut cur = self.bubbles.get(id);
        while let Some(b) = cur {
            if out.contains(&b.id) || out.len() > 256 {
                break;
            }
            out.push(b.id.clone());
            cur = b.parent.as_ref().and_then(|p| self.bubbles.get(p));
        }
        out.reverse();
        out
    }
}

fn compile_slot(slot: &Value, shared: &HashMap<&str, &Value>) -> Result<Slot, String> {
    match slot.get("kind").and_then(Value::as_str) {
        Some("inline") => {
            let script = parse_script(slot.get("script").unwrap_or(&Value::Null))
                .map_err(|e| e.to_string())?;
            Ok(Slot {
                script: Arc::new(script),
                params: HashMap::new(),
                shared: None,
            })
        }
        Some("shared") => {
            let r = slot.get("ref").and_then(Value::as_str).unwrap_or("");
            let def = shared
                .get(r)
                .ok_or_else(|| format!("shared script {r} not found"))?;
            let script = parse_script(def.get("script").unwrap_or(&Value::Null))
                .map_err(|e| e.to_string())?;
            let mut params = HashMap::new();
            for p in def
                .get("params")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if let Some(name) = p.get("name").and_then(Value::as_str) {
                    params.insert(
                        name.to_string(),
                        p.get("default").cloned().unwrap_or(Value::Null),
                    );
                }
            }
            if let Some(Value::Object(values)) = slot.get("params") {
                for (k, v) in values {
                    params.insert(k.clone(), v.clone());
                }
            }
            Ok(Slot {
                script: Arc::new(script),
                params,
                shared: Some(r.to_string()),
            })
        }
        _ => Err("unknown script slot".into()),
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use serde_json::json;

    pub fn sample() -> Value {
        json!({
            "version": 1,
            "bubbles": [
                { "id": "apps", "parentId": null, "kind": "folder", "name": "Apps", "scripts": [] },
                { "id": "work", "parentId": "apps", "kind": "folder", "name": "Work", "scripts": [] },
                { "id": "cc", "parentId": "work", "kind": "action", "name": "Claude Code", "scripts": [
                    { "kind": "shared", "ref": "builtin.runFile", "params": { "path": "C:\\cc.exe" } },
                    { "kind": "inline", "script": { "v": 1, "trigger": [6, "go"], "body": [[60, "got it"]] } },
                    { "kind": "inline", "script": { "v": 1, "trigger": [9999], "body": [] } }
                ] }
            ],
            "sharedScripts": [{
                "id": "builtin.runFile", "name": "Run file", "params": [
                    { "name": "path", "type": "text", "default": "" },
                    { "name": "args", "type": "text", "default": "" }
                ],
                "script": { "v": 1, "trigger": [1], "body": [[300, [563, "path"], [563, "args"], false, false, false]], "runMode": "ignore" }
            }],
            "customBlocks": [{ "id": "cb1", "name": "hello", "params": [{ "name": "who", "type": "text", "default": "" }], "body": [[60, [562, "who"]]] }],
            "templates": [],
            "globals": [{ "name": "count", "value": 0 }],
            "homeView": { "x": 0, "y": 0, "zoom": 1 }
        })
    }

    #[test]
    fn compiles_paths_shared_params_and_errors() {
        let w = CompiledWorld::compile(&sample());
        let cc = w.find("apps | WORK | claude code").unwrap();
        assert_eq!(cc.path, "Apps | Work | Claude Code");
        let slot = cc.slots[0].as_ref().unwrap();
        assert_eq!(slot.params["path"], json!("C:\\cc.exe"));
        assert_eq!(slot.params["args"], json!(""));
        assert!(cc.slots[2].is_none());
        assert_eq!(w.errors.len(), 1);
        assert_eq!(w.slots_with_trigger(Op::EvActivate).len(), 1);
        assert_eq!(w.slots_with_trigger(Op::EvMessage).len(), 1);
        assert_eq!(w.chain("cc"), vec!["apps", "work", "cc"]);
        assert_eq!(w.custom["cb1"].params, vec!["who"]);
        assert_eq!(w.globals, vec![("count".to_string(), json!(0))]);
        assert!(w.find("cc").is_some());
    }
}
