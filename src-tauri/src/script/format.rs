//! Compact script format (spec §9.3): `{ v, trigger: Node, body: Node[], runMode }`,
//! Node = `[opcode, …args]`, an argument is a literal, a Node or a list of Nodes.

use serde_json::Value;

use super::generated::opcodes::Op;
use crate::error::{AppError, AppResult};
use crate::storage::migrate::check_script_version;

#[derive(Clone, Debug, PartialEq)]
pub enum Arg {
    Lit(Value),
    Node(Box<Node>),
    Stack(Vec<Node>),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Node {
    pub op: Op,
    pub args: Vec<Arg>,
    /// Pre-order number inside the script (trigger = 0). The editor uses the same numbering
    /// to highlight the running block.
    pub id: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum RunMode {
    #[default]
    Ignore,
    Restart,
    Parallel,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Script {
    pub trigger: Node,
    pub body: Vec<Node>,
    pub run_mode: RunMode,
}

impl Node {
    pub fn arg(&self, i: usize) -> Option<&Arg> {
        self.args.get(i)
    }

    /// A literal argument (fields are always literals).
    pub fn lit(&self, i: usize) -> &Value {
        match self.args.get(i) {
            Some(Arg::Lit(v)) => v,
            _ => &Value::Null,
        }
    }

    pub fn lit_str(&self, i: usize) -> String {
        super::value::text(self.lit(i))
    }

    pub fn stack(&self, i: usize) -> &[Node] {
        match self.args.get(i) {
            Some(Arg::Stack(s)) => s,
            _ => &[],
        }
    }
}

pub fn parse_script(v: &Value) -> AppResult<Script> {
    check_script_version(v)?;
    let mut counter = 0u32;
    let trigger = parse_node(
        v.get("trigger")
            .ok_or_else(|| AppError::format("script has no trigger"))?,
        &mut counter,
    )?;
    let body = match v.get("body") {
        Some(Value::Array(items)) => items
            .iter()
            .map(|n| parse_node(n, &mut counter))
            .collect::<AppResult<Vec<_>>>()?,
        _ => Vec::new(),
    };
    let run_mode = match v.get("runMode").and_then(Value::as_str) {
        Some("restart") => RunMode::Restart,
        Some("parallel") => RunMode::Parallel,
        _ => RunMode::Ignore,
    };
    Ok(Script {
        trigger,
        body,
        run_mode,
    })
}

pub fn parse_nodes(v: &Value) -> AppResult<Vec<Node>> {
    let mut counter = 0;
    match v {
        Value::Array(items) => items.iter().map(|n| parse_node(n, &mut counter)).collect(),
        _ => Ok(Vec::new()),
    }
}

fn is_node(v: &Value) -> bool {
    matches!(v, Value::Array(a) if a.first().is_some_and(Value::is_number))
}

fn parse_node(v: &Value, counter: &mut u32) -> AppResult<Node> {
    let items = match v {
        Value::Array(a) if is_node(v) => a,
        _ => return Err(AppError::format("expected a block")),
    };
    let code = items[0].as_u64().unwrap_or(0);
    let op = u16::try_from(code)
        .ok()
        .and_then(Op::from_u16)
        .ok_or_else(|| AppError::format(format!("unknown block {code}")))?;
    let id = *counter;
    *counter += 1;
    let mut args = Vec::with_capacity(items.len() - 1);
    for a in &items[1..] {
        args.push(match a {
            Value::Array(list) if is_node(a) => {
                let _ = list;
                Arg::Node(Box::new(parse_node(a, counter)?))
            }
            Value::Array(list) => Arg::Stack(
                list.iter()
                    .map(|n| parse_node(n, counter))
                    .collect::<AppResult<Vec<_>>>()?,
            ),
            lit => Arg::Lit(lit.clone()),
        });
    }
    Ok(Node { op, args, id })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_nodes_substacks_and_numbering() {
        let s = parse_script(&json!({
            "v": 1,
            "trigger": [1],
            "body": [[55, [160, [109], 20], [[60, "hi"], [305]]], [50, 1, "s"]],
            "runMode": "restart"
        }))
        .unwrap();
        assert_eq!(s.trigger.op, Op::EvActivate);
        assert_eq!(s.run_mode, RunMode::Restart);
        let iff = &s.body[0];
        assert_eq!(iff.op, Op::CtlIf);
        assert_eq!(iff.id, 1);
        match &iff.args[0] {
            Arg::Node(n) => {
                assert_eq!(n.op, Op::OpGt);
                assert_eq!(n.id, 2);
            }
            other => panic!("{other:?}"),
        }
        assert_eq!(iff.stack(1).len(), 2);
        assert_eq!(iff.stack(1)[1].id, 5);
        assert_eq!(s.body[1].id, 6);
        assert_eq!(s.body[1].lit_str(1), "s");
    }

    #[test]
    fn rejects_unknown_blocks_and_newer_versions() {
        assert!(parse_script(&json!({ "v": 1, "trigger": [9999], "body": [] })).is_err());
        assert!(parse_script(&json!({ "v": 2, "trigger": [1], "body": [] })).is_err());
        assert!(parse_script(&json!({ "v": 1, "body": [] })).is_err());
    }

    #[test]
    fn empty_list_is_an_empty_substack() {
        let s = parse_script(&json!({ "v": 1, "trigger": [1], "body": [[51, 3, []]] })).unwrap();
        assert_eq!(s.body[0].args[1], Arg::Stack(vec![]));
    }
}
