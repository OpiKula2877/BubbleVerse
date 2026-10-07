//! Script runtime in the core (spec §5.4): every running script is a lightweight async task.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

use serde::Serialize;
use serde_json::Value;
use tokio::sync::{watch, Notify};
use tokio_util::sync::CancellationToken;

use super::exec::{Ctx, Exit, ScriptError};
use super::format::RunMode;
use super::generated::opcodes::Op;
use super::host::{Host, LogEntry, ScriptFx};
use super::world::{BubbleScripts, CompiledWorld, CustomBlock, Slot};
use crate::error::{AppError, AppResult};

/// Slot index of test runs from the editor; real slots are small numbers.
pub const TEST_SLOT: usize = usize::MAX;

struct Task {
    id: u64,
    bubble: String,
    slot: usize,
    cancel: CancellationToken,
    started: i64,
    done: watch::Receiver<bool>,
    step: Option<Arc<Notify>>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunningScript {
    pub id: u64,
    pub bubble: String,
    pub path: String,
    /// `None` for a test run from the editor.
    pub slot: Option<usize>,
    pub started: i64,
}

/// Options of a run started from the script editor.
#[derive(Clone, Default)]
pub struct RunOpts {
    /// Custom blocks that are not saved yet; they win over the saved ones.
    pub custom: Option<Arc<HashMap<String, Arc<CustomBlock>>>>,
    /// Every block waits for `Runtime::step` (spec §5.5).
    pub step: bool,
}

pub(crate) struct Inner {
    pub host: Arc<dyn Host>,
    world: RwLock<Arc<CompiledWorld>>,
    tasks: Mutex<Vec<Task>>,
    next_id: AtomicU64,
    pub globals: Mutex<HashMap<String, Value>>,
    pub bubble_vars: Mutex<HashMap<String, HashMap<String, Value>>>,
    pub answer: Mutex<Value>,
    pub stopwatch: Mutex<Instant>,
    traced: Mutex<HashSet<String>>,
}

/// Cheap to clone; all clones share the same runtime.
#[derive(Clone)]
pub struct Runtime {
    pub(crate) inner: Arc<Inner>,
}

impl Runtime {
    pub fn new(host: Arc<dyn Host>) -> Self {
        Runtime {
            inner: Arc::new(Inner {
                host,
                world: RwLock::new(Arc::new(CompiledWorld::default())),
                tasks: Mutex::new(Vec::new()),
                next_id: AtomicU64::new(1),
                globals: Mutex::new(HashMap::new()),
                bubble_vars: Mutex::new(HashMap::new()),
                answer: Mutex::new(Value::String(String::new())),
                stopwatch: Mutex::new(Instant::now()),
                traced: Mutex::new(HashSet::new()),
            }),
        }
    }

    pub fn host(&self) -> &Arc<dyn Host> {
        &self.inner.host
    }

    /// Installs a new published world. Declared globals without a stored value get their
    /// initial value.
    pub fn set_world(&self, world: &Value) -> Arc<CompiledWorld> {
        let compiled = Arc::new(CompiledWorld::compile(world));
        {
            let mut globals = lock(&self.inner.globals);
            for (name, value) in &compiled.globals {
                if !globals.contains_key(name) {
                    globals.insert(name.clone(), value.clone());
                    self.inner.host.save_global(name, value);
                }
            }
        }
        if let Ok(mut w) = self.inner.world.write() {
            *w = compiled.clone();
        }
        compiled
    }

    pub fn world(&self) -> Arc<CompiledWorld> {
        self.inner
            .world
            .read()
            .map(|w| w.clone())
            .unwrap_or_default()
    }

    pub fn load_variables(
        &self,
        globals: HashMap<String, Value>,
        bubble_vars: HashMap<String, HashMap<String, Value>>,
    ) {
        *lock(&self.inner.globals) = globals;
        *lock(&self.inner.bubble_vars) = bubble_vars;
    }

    pub fn globals(&self) -> HashMap<String, Value> {
        lock(&self.inner.globals).clone()
    }

    pub fn set_global(&self, name: &str, value: Value) {
        self.inner.host.save_global(name, &value);
        lock(&self.inner.globals).insert(name.to_string(), value);
    }

    /// Removes a global variable; the caller deletes it from storage.
    pub fn remove_global(&self, name: &str) {
        lock(&self.inner.globals).remove(name);
    }

    pub fn bubble_vars(&self, bubble: &str) -> HashMap<String, Value> {
        lock(&self.inner.bubble_vars)
            .get(bubble)
            .cloned()
            .unwrap_or_default()
    }

    pub fn set_bubble_var(&self, bubble: &str, name: &str, value: Value) {
        self.inner.host.save_bubble_var(bubble, name, &value);
        lock(&self.inner.bubble_vars)
            .entry(bubble.to_string())
            .or_default()
            .insert(name.to_string(), value);
    }

    /// Runs the "when activated" scripts of a bubble (click in the app or Enter in search).
    pub fn activate(&self, bubble: &str) -> AppResult<usize> {
        let world = self.world();
        let b = world
            .find(bubble)
            .cloned()
            .ok_or_else(|| AppError::msg("bubble not found"))?;
        let slots: Vec<(usize, Arc<Slot>)> = b
            .slots
            .iter()
            .enumerate()
            .filter_map(|(i, s)| s.as_ref().map(|s| (i, s.clone())))
            .filter(|(_, s)| s.script.trigger.op == Op::EvActivate)
            .collect();
        if slots.is_empty() {
            return Err(AppError::Message("noAction".into()));
        }
        self.inner.host.fx(ScriptFx::Activated {
            bubble: b.id.clone(),
        });
        Ok(slots
            .into_iter()
            .filter_map(|(i, s)| self.start(b.clone(), i, s, Value::Null))
            .count())
    }

    /// Starts one script slot respecting its run mode (spec §5.4). Returns the task id.
    pub fn start(
        &self,
        bubble: Arc<BubbleScripts>,
        slot_index: usize,
        slot: Arc<Slot>,
        event: Value,
    ) -> Option<u64> {
        match slot.script.run_mode {
            RunMode::Ignore if self.is_running(&bubble.id, slot_index) => return None,
            RunMode::Restart => self.stop_slot(&bubble.id, slot_index),
            _ => {}
        }
        Some(self.spawn(bubble, slot_index, slot, event, RunOpts::default()))
    }

    /// Test run from the editor (spec §5.5): runs the script now whatever its trigger is.
    /// The previous test run of the bubble stops first.
    pub fn start_test(&self, bubble: Arc<BubbleScripts>, slot: Arc<Slot>, opts: RunOpts) -> u64 {
        self.stop_slot(&bubble.id, TEST_SLOT);
        self.spawn(bubble, TEST_SLOT, slot, Value::Null, opts)
    }

    /// Lets a task in step mode run its next block.
    pub fn step(&self, task: u64) {
        let step = lock(&self.inner.tasks)
            .iter()
            .find(|t| t.id == task)
            .and_then(|t| t.step.clone());
        if let Some(s) = step {
            s.notify_one();
        }
    }

    fn spawn(
        &self,
        bubble: Arc<BubbleScripts>,
        slot_index: usize,
        slot: Arc<Slot>,
        event: Value,
        opts: RunOpts,
    ) -> u64 {
        let id = self.inner.next_id.fetch_add(1, Ordering::Relaxed);
        let stepper = opts.step.then(|| Arc::new(Notify::new()));
        let cancel = CancellationToken::new();
        let (done_tx, done_rx) = watch::channel(false);
        let first_of_bubble = !self.bubble_running(&bubble.id);
        lock(&self.inner.tasks).push(Task {
            id,
            bubble: bubble.id.clone(),
            slot: slot_index,
            cancel: cancel.clone(),
            started: chrono::Utc::now().timestamp_millis(),
            done: done_rx,
            step: stepper.clone(),
        });
        if first_of_bubble {
            self.inner.host.fx(ScriptFx::Running {
                bubble: bubble.id.clone(),
                on: true,
            });
        }
        let rt = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut ctx = Ctx::new(
                rt.clone(),
                bubble.clone(),
                slot_index,
                id,
                cancel,
                &slot,
                event,
            );
            if slot_index == TEST_SLOT {
                ctx.test = true;
                ctx.traced = true;
            }
            ctx.custom = opts.custom;
            ctx.stepper = stepper;
            let result = ctx.exec_stack(&slot.script.body).await;
            if let Err(Exit::Error(e)) = result {
                rt.report_error(&bubble, ctx.log_slot(), id, &e);
            }
            ctx.end_trace();
            rt.finish(id, &bubble.id);
            let _ = done_tx.send(true);
        });
        id
    }

    fn finish(&self, id: u64, bubble: &str) {
        lock(&self.inner.tasks).retain(|t| t.id != id);
        if !self.bubble_running(bubble) {
            self.inner.host.fx(ScriptFx::Running {
                bubble: bubble.to_string(),
                on: false,
            });
        }
    }

    pub(crate) fn report_error(
        &self,
        bubble: &BubbleScripts,
        slot: Option<usize>,
        task: u64,
        e: &ScriptError,
    ) {
        self.inner.host.fx(ScriptFx::Error {
            bubble: bubble.id.clone(),
        });
        self.inner.host.log(LogEntry {
            at: chrono::Utc::now().timestamp_millis(),
            level: "error".into(),
            bubble: bubble.id.clone(),
            path: bubble.path.clone(),
            slot,
            task: Some(task),
            block: e.op.map(|o| o.id().to_string()),
            node: e.node,
            text: e.message.clone(),
            code: e.code.map(str::to_string),
            detail: e.detail.clone(),
        });
    }

    pub fn is_running(&self, bubble: &str, slot: usize) -> bool {
        lock(&self.inner.tasks)
            .iter()
            .any(|t| t.bubble == bubble && t.slot == slot)
    }

    fn bubble_running(&self, bubble: &str) -> bool {
        lock(&self.inner.tasks).iter().any(|t| t.bubble == bubble)
    }

    fn cancel_where(&self, pred: impl Fn(&Task) -> bool) {
        for t in lock(&self.inner.tasks).iter().filter(|t| pred(t)) {
            t.cancel.cancel();
        }
    }

    pub fn stop_slot(&self, bubble: &str, slot: usize) {
        self.cancel_where(|t| t.bubble == bubble && t.slot == slot);
    }

    /// "Stop other scripts of this bubble".
    pub fn stop_bubble(&self, bubble: &str, except: Option<u64>) {
        self.cancel_where(|t| t.bubble == bubble && Some(t.id) != except);
    }

    pub fn stop_task(&self, id: u64) {
        self.cancel_where(|t| t.id == id);
    }

    /// Global shortcut "Stop all scripts" (spec §5.4).
    pub fn stop_all(&self) {
        self.cancel_where(|_| true);
    }

    pub fn running(&self) -> Vec<RunningScript> {
        let world = self.world();
        lock(&self.inner.tasks)
            .iter()
            .map(|t| RunningScript {
                id: t.id,
                bubble: t.bubble.clone(),
                path: world
                    .bubbles
                    .get(&t.bubble)
                    .map(|b| b.path.clone())
                    .unwrap_or_default(),
                slot: (t.slot != TEST_SLOT).then_some(t.slot),
                started: t.started,
            })
            .collect()
    }

    /// Waits until all given tasks have finished.
    pub async fn wait_for(&self, ids: &[u64]) {
        let receivers: Vec<watch::Receiver<bool>> = lock(&self.inner.tasks)
            .iter()
            .filter(|t| ids.contains(&t.id))
            .map(|t| t.done.clone())
            .collect();
        for mut rx in receivers {
            let _ = rx.wait_for(|done| *done).await;
        }
    }

    /// Starts every script triggered by `msg` ("when I receive").
    pub fn broadcast(&self, msg: &str) -> Vec<u64> {
        let world = self.world();
        world
            .slots_with_trigger(Op::EvMessage)
            .into_iter()
            .filter(|(_, _, s)| s.script.trigger.lit_str(0).eq_ignore_ascii_case(msg.trim()))
            .filter_map(|(b, i, s)| self.start(b, i, s, Value::String(msg.to_string())))
            .collect()
    }

    /// Scripts of this bubble report their running block to the editor (`None` = no bubble).
    pub fn trace_only(&self, bubble: Option<&str>) {
        let mut t = lock(&self.inner.traced);
        t.clear();
        if let Some(b) = bubble {
            t.insert(b.to_string());
        }
    }

    pub(crate) fn is_traced(&self, bubble: &str) -> bool {
        lock(&self.inner.traced).contains(bubble)
    }
}

/// Locks a mutex, recovering the data if another thread panicked while holding it.
pub(crate) fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}
