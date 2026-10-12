//! Variables, objects and lists.

use serde_json::{Map, Value};

use super::unsupported;
use crate::script::exec::{Ctx, Flow, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};
use crate::script::value::{equals, from_num, list_index, num};

fn as_list(v: Value) -> Vec<Value> {
    match v {
        Value::Array(a) => a,
        Value::Null => Vec::new(),
        Value::String(s) if s.is_empty() => Vec::new(),
        Value::String(s) => match serde_json::from_str::<Value>(&s) {
            Ok(Value::Array(a)) => a,
            _ => s.lines().map(|l| Value::String(l.to_string())).collect(),
        },
        other => vec![other],
    }
}

fn as_object(v: Value) -> Map<String, Value> {
    match v {
        Value::Object(o) => o,
        Value::String(s) => match serde_json::from_str::<Value>(&s) {
            Ok(Value::Object(o)) => o,
            _ => Map::new(),
        },
        _ => Map::new(),
    }
}

pub async fn exec(ctx: &mut Ctx, node: &Node) -> R<Flow> {
    match node.op {
        Op::VarSet => {
            use arg::var_set::*;
            let v = ctx.eval(node, VALUE).await?;
            ctx.set_var(&node.lit_str(VAR), v);
        }
        Op::VarChange => {
            use arg::var_change::*;
            let by = ctx.num(node, N).await?;
            let var = node.lit_str(VAR);
            let cur = num(&ctx.get_var(&var));
            ctx.set_var(&var, from_num(cur + by));
        }
        Op::ObjSet => {
            use arg::obj_set::*;
            let key = ctx.text(node, KEY).await?;
            let v = ctx.eval(node, VALUE).await?;
            let var = node.lit_str(VAR);
            let mut obj = as_object(ctx.get_var(&var));
            obj.insert(key, v);
            ctx.set_var(&var, Value::Object(obj));
        }
        Op::ListAdd => {
            use arg::list_add::*;
            let item = ctx.eval(node, ITEM).await?;
            let var = node.lit_str(LIST);
            let mut list = as_list(ctx.get_var(&var));
            list.push(item);
            ctx.set_var(&var, Value::Array(list));
        }
        Op::ListInsert => {
            use arg::list_insert::*;
            let item = ctx.eval(node, ITEM).await?;
            let at = ctx.eval(node, N).await?;
            let var = node.lit_str(LIST);
            let mut list = as_list(ctx.get_var(&var));
            let idx = list_index(&at, list.len() + 1).unwrap_or(list.len());
            list.insert(idx.min(list.len()), item);
            ctx.set_var(&var, Value::Array(list));
        }
        Op::ListDelete => {
            use arg::list_delete::*;
            let at = ctx.eval(node, N).await?;
            let var = node.lit_str(LIST);
            let mut list = as_list(ctx.get_var(&var));
            if let Some(i) = list_index(&at, list.len()) {
                list.remove(i);
                ctx.set_var(&var, Value::Array(list));
            }
        }
        Op::ListClear => {
            ctx.set_var(
                &node.lit_str(arg::list_clear::LIST),
                Value::Array(Vec::new()),
            );
        }
        _ => return Err(unsupported(ctx, node)),
    }
    Ok(Flow::Next)
}

pub async fn eval(ctx: &mut Ctx, node: &Node) -> R<Value> {
    match node.op {
        Op::VarGet => Ok(ctx.get_var(&node.lit_str(arg::var_get::VAR))),
        Op::ObjGet => {
            use arg::obj_get::*;
            let key = ctx.text(node, KEY).await?;
            let obj = ctx.eval(node, OBJ).await?;
            Ok(match obj {
                Value::Array(a) => list_index(&Value::String(key), a.len())
                    .and_then(|i| a.get(i).cloned())
                    .unwrap_or(Value::Null),
                other => as_object(other).remove(&key).unwrap_or(Value::Null),
            })
        }
        Op::ListItem => {
            use arg::list_item::*;
            let at = ctx.eval(node, N).await?;
            let list = as_list(ctx.eval(node, LIST).await?);
            Ok(list_index(&at, list.len())
                .and_then(|i| list.get(i).cloned())
                .unwrap_or(Value::String(String::new())))
        }
        Op::ListLength => {
            let list = as_list(ctx.eval(node, arg::list_length::LIST).await?);
            Ok(from_num(list.len() as f64))
        }
        Op::ListContains => {
            use arg::list_contains::*;
            let list = as_list(ctx.eval(node, LIST).await?);
            let item = ctx.eval(node, ITEM).await?;
            Ok(Value::Bool(list.iter().any(|x| equals(x, &item))))
        }
        Op::ListIndex => {
            use arg::list_index::*;
            let item = ctx.eval(node, ITEM).await?;
            let list = as_list(ctx.eval(node, LIST).await?);
            let pos = list.iter().position(|x| equals(x, &item));
            Ok(from_num(pos.map_or(0.0, |p| (p + 1) as f64)))
        }
        _ => Err(unsupported(ctx, node)),
    }
}
