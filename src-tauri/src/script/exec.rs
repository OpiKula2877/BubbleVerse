//! The interpreter: walks compact script nodes asynchronously.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use super::blocks;
use super::format::{Arg, Node};
use super::generated::opcodes::Op;
use super::host::TraceEvent;
use super::runtime::{lock, Runtime};
use super::value;
use super::world::{BubbleScripts, CustomBlock, Slot};
use crate::error::AppError;

/// A loop without waiting yields every this many steps so the app never freezes (spec §5.4).
pub const YIELD_EVERY: u64 = 10_000;

/// The editor highlights the running block at most this often (a fast loop would flood it).
const TRACE_EVERY: Duration = Duration::from_millis(25);

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
    /// Error code for translated messages in the UI (`error.<code>`).
    pub code: Option<&'static str>,
    pub detail: Option<String>,
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
    /// Custom blocks from the editor that are not saved yet (test runs).
    pub custom: Option<Arc<HashMap<String, Arc<CustomBlock>>>>,
    /// Step mode: every block waits until the editor says "next step".
    pub stepper: Option<Arc<Notify>>,
    /// A test run from the editor (it has no slot of its own).
    pub test: bool,
    steps: u64,
    pub(crate) traced: bool,
    trace_at: Option<Instant>,
    trace_pending: Option<u32>,
    trace_sent: Option<u32>,
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
            custom: None,
            stepper: None,
            test: false,
            steps: 0,
            traced,
            trace_at: None,
            trace_pending: None,
            trace_sent: None,
        }
    }

    /// The slot shown in logs and traces; a test run has none.
    pub fn log_slot(&self) -> Option<usize> {
        (!self.test).then_some(self.slot)
    }

    /// A custom block by id: unsaved ones from the editor win over the saved ones.
    pub fn custom_block(&self, id: &str) -> Option<Arc<CustomBlock>> {
        self.custom
            .as_ref()
            .and_then(|m| m.get(id).cloned())
            .or_else(|| self.rt.world().custom.get(id).cloned())
    }

    fn send_trace(&self, node: Option<u32>, paused: bool) {
        self.rt.host().trace(TraceEvent {
            bubble: self.bubble.id.clone(),
            slot: self.log_slot(),
            task: self.task,
            node,
            paused,
        });
    }

    /// Tells the editor which stack block runs; in step mode waits for the next step.
    async fn trace(&mut self, node: &Node) -> R<()> {
        // Blocks inside a custom block belong to its definition, not to this script.
        if !self.traced || !self.frames.is_empty() {
            return Ok(());
        }
        if let Some(step) = self.stepper.clone() {
            self.send_trace(Some(node.id), true);
            self.trace_sent = Some(node.id);
            return tokio::select! {
                _ = step.notified() => Ok(()),
                _ = self.cancel.cancelled() => Err(Exit::Cancelled),
            };
        }
        self.trace_pending = Some(node.id);
        if self.trace_at.is_none_or(|t| t.elapsed() >= TRACE_EVERY) {
            self.flush_trace();
        }
        Ok(())
    }

    /// Sends the newest traced block if the editor has not seen it yet (before waiting).
    pub fn flush_trace(&mut self) {
        if let Some(node) = self.trace_pending.take() {
            if self.trace_sent != Some(node) {
                self.send_trace(Some(node), false);
                self.trace_sent = Some(node);
            }
            self.trace_at = Some(Instant::now());
        }
    }

    /// The script ended: the editor removes the highlight.
    pub fn end_trace(&self) {
        if self.traced {
            self.send_trace(None, false);
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
            self.loop_tick().await?;
            self.trace(node).await?;
            blocks::exec(self, node).await
        })
    }

    /// Value of argument `i`: a literal or the result of a reporter block.
    pub fn eval<'a>(&'a mut self, node: &'a Node, i: usize) -> BoxFuture<'a, R<Value>> {
        Box::pin(async move {
            match node.args.get(i) {
                Some(Arg::Lit(v)) => Ok(v.clone()),
                Some(Arg::Node(n)) => {
                    self.loop_tick().await?;
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
    pub async fn sleep(&mut self, seconds: f64) -> R<()> {
        if seconds.is_nan() || seconds <= 0.0 {
            return Ok(());
        }
        self.flush_trace();
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
            code: None,
            detail: None,
        })
    }

    /// Turns a core error into a script error at `node`.
    pub fn check<T>(&self, node: &Node, r: Result<T, AppError>) -> R<T> {
        r.map_err(|e| {
            let detail = match &e {
                AppError::FileNotFound(p) => Some(p.clone()),
                _ => None,
            };
            Exit::Error(ScriptError {
                message: e.to_string(),
                node: Some(node.id),
                op: Some(node.op),
                code: Some(e.code()),
                detail,
            })
        })
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
