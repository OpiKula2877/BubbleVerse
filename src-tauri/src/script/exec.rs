//! The interpreter: walks compact script nodes asynchronously.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::blocks;
use super::format::{Arg, Node};
use super::generated::opcodes::Op;
use super::runtime::{lock, Runtime};
use super::value;
use super::world::{BubbleScripts, Slot};
use crate::error::AppError;

/// A loop without waiting yields every this many steps so the app never freezes (spec §5.4).
pub const YIELD_EVERY: u64 = 10_000;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

#[derive(Debug, PartialEq)]
pub enum Flow {
    Next,
    /// "stop this script"
    Stop,
}

#[derive(Debug)]
pub struct ScriptError {
    pub message: String,
    pub node: Option<u32>,
    pub op: Option<Op>,
}

#[derive(Debug)]
pub enum Exit {
    Cancelled,
    Error(ScriptError),
}

pub type R<T> = Result<T, Exit>;

pub struct Ctx {
    pub rt: Runtime,
    pub bubble: Arc<BubbleScripts>,
    pub slot: usize,
    pub task: u64,
    pub cancel: CancellationToken,
    /// Script-scope variables.
    pub vars: HashMap<String, Value>,
    /// Shared script parameters.
    pub params: HashMap<String, Value>,
    /// Custom block arguments (one frame per call).
    pub frames: Vec<HashMap<String, Value>>,
    /// Data of the event that started the script (message, process name…).
    pub event: Value,
    steps: u64,
    traced: bool,
}

impl Ctx {
    pub fn new(
        rt: Runtime,
        bubble: Arc<BubbleScripts>,
        slot: usize,
        task: u64,
        cancel: CancellationToken,
        script_slot: &Slot,
        event: Value,
    ) -> Self {
        let traced = rt.is_traced(&bubble.id);
        Ctx {
            rt,
            bubble,
            slot,
            task,
            cancel,
            vars: HashMap::new(),
            params: script_slot.params.clone(),
            frames: Vec::new(),
            event,
            steps: 0,
            traced,
        }
    }

    pub fn exec_stack<'a>(&'a mut self, nodes: &'a [Node]) -> BoxFuture<'a, R<Flow>> {
        Box::pin(async move {
            for n in nodes {
                if self.exec(n).await? == Flow::Stop {
                    return Ok(Flow::Stop);
                }
            }
            Ok(Flow::Next)
        })
    }

    pub fn exec<'a>(&'a mut self, node: &'a Node) -> BoxFuture<'a, R<Flow>> {
        Box::pin(async move {
            self.tick(node).await?;
            blocks::exec(self, node).await
        })
    }

    /// Value of argument `i`: a literal or the result of a reporter block.
    pub fn eval<'a>(&'a mut self, node: &'a Node, i: usize) -> BoxFuture<'a, R<Value>> {
        Box::pin(async move {
            match node.args.get(i) {
                Some(Arg::Lit(v)) => Ok(v.clone()),
                Some(Arg::Node(n)) => {
                    self.tick(n).await?;
                    blocks::eval(self, n).await
                }
                _ => Ok(Value::Null),
            }
        })
    }

    pub async fn num(&mut self, node: &Node, i: usize) -> R<f64> {
        Ok(value::num(&self.eval(node, i).await?))
    }

    pub async fn text(&mut self, node: &Node, i: usize) -> R<String> {
        Ok(value::text(&self.eval(node, i).await?))
    }

    pub async fn truthy(&mut self, node: &Node, i: usize) -> R<bool> {
        Ok(value::truthy(&self.eval(node, i).await?))
    }

    async fn tick(&mut self, node: &Node) -> R<()> {
        self.loop_tick().await?;
        if self.traced {
            self.rt.host().trace(&self.bubble.id, self.slot, node.id);
        }
        Ok(())
    }

    /// Called by every block and every loop iteration: cancellation check + periodic yield.
    pub async fn loop_tick(&mut self) -> R<()> {
        if self.cancel.is_cancelled() {
            return Err(Exit::Cancelled);
        }
        self.steps += 1;
        if self.steps.is_multiple_of(YIELD_EVERY) {
            tokio::task::yield_now().await;
        }
        Ok(())
    }

    /// Waits without blocking anything; ends early when the script is stopped.
    pub async fn sleep(&self, seconds: f64) -> R<()> {
        if seconds.is_nan() || seconds <= 0.0 {
            return Ok(());
        }
        let d = Duration::from_secs_f64(seconds.min(1e7));
        tokio::select! {
            _ = tokio::time::sleep(d) => Ok(()),
            _ = self.cancel.cancelled() => Err(Exit::Cancelled),
        }
    }

    pub fn err(&self, node: &Node, message: impl Into<String>) -> Exit {
        Exit::Error(ScriptError {
            message: message.into(),
            node: Some(node.id),
            op: Some(node.op),
        })
    }

    /// Turns a core error into a script error at `node`.
    pub fn check<T>(&self, node: &Node, r: Result<T, AppError>) -> R<T> {
        r.map_err(|e| self.err(node, e.to_string()))
    }

    // ---------- Variables: "s:name" (script), "b:name" (bubble), "g:name" (global) ----------

    pub fn get_var(&self, reference: &str) -> Value {
        let (scope, name) = split_var(reference);
        match scope {
            'g' => lock(&self.rt.inner.globals)
                .get(name)
                .cloned()
                .unwrap_or(Value::Null),
            'b' => lock(&self.rt.inner.bubble_vars)
                .get(&self.bubble.id)
                .and_then(|m| m.get(name))
                .cloned()
                .unwrap_or(Value::Null),
            _ => self.vars.get(name).cloned().unwrap_or(Value::Null),
        }
    }

    pub fn set_var(&mut self, reference: &str, v: Value) {
        let (scope, name) = split_var(reference);
        if name.is_empty() {
            return;
        }
        match scope {
            'g' => {
                self.rt.host().save_global(name, &v);
                lock(&self.rt.inner.globals).insert(name.to_string(), v);
            }
            'b' => {
                self.rt.host().save_bubble_var(&self.bubble.id, name, &v);
                lock(&self.rt.inner.bubble_vars)
                    .entry(self.bubble.id.clone())
                    .or_default()
                    .insert(name.to_string(), v);
            }
            _ => {
                self.vars.insert(name.to_string(), v);
            }
        }
    }
}

/// `"g:count"` → ('g', "count"); a reference without scope is a script variable.
pub fn split_var(reference: &str) -> (char, &str) {
    match reference.split_once(':') {
        Some((s, name)) if s.len() == 1 && matches!(s, "s" | "b" | "g") => {
            (s.chars().next().unwrap_or('s'), name)
        }
        _ => ('s', reference),
    }
}
