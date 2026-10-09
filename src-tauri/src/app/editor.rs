//! The script editor window (spec §5.1) and what it needs from the core: test runs, steps,
//! block layouts, variables and macro recording.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use super::state::AppState;
use super::windows::MAIN;
use crate::error::AppResult;
use crate::os::recorder::{self, MacroEvent};
use crate::script::format::parse_script;
use crate::script::runtime::RunOpts;
use crate::script::world::{BubbleScripts, CompiledWorld, Slot, PATH_SEPARATOR};
use crate::storage::kv;

pub const EDITOR: &str = "script-editor";
/// Core → editor: edit another bubble (the window was already open).
pub const OPEN_EVENT: &str = "bv://editor-open";

/// What the editor should show: a bubble of the world the main window is editing.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorRequest {
    pub bubble: String,
    /// The main window's draft, so the editor also sees bubbles that are not saved yet.
    pub world: Value,
}

static REQUEST: Mutex<Option<EditorRequest>> = Mutex::new(None);

fn request() -> std::sync::MutexGuard<'static, Option<EditorRequest>> {
    REQUEST.lock().unwrap_or_else(|e| e.into_inner())
}

/// Opens the editor for a bubble, or switches the open editor to it. Async: creating a window
/// from a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn open_script_editor(bubble: String, world: Value, app: AppHandle) -> AppResult<()> {
    let req = EditorRequest { bubble, world };
    *request() = Some(req.clone());
    if let Some(w) = app.get_webview_window(EDITOR) {
        app.emit_to(EDITOR, OPEN_EVENT, req)?;
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Ok(());
    }
    let mut b = WebviewWindowBuilder::new(
        &app,
        EDITOR,
        WebviewUrl::App("script-editor/index.html".into()),
    )
    .title("BubbleVerse")
    .inner_size(1280.0, 820.0)
    .min_inner_size(860.0, 560.0)
    .center()
    // It shows itself once Blockly is ready, so there is no white flash.
    .visible(false)
    .disable_drag_drop_handler();
    // Owned by the app window, which covers all monitors: the editor stays above it.
    if let Some(main) = app.get_webview_window(MAIN) {
        b = b.parent(&main)?;
    }
    let window = b.build()?;
    let app2 = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            app2.state::<AppState>().runtime.trace_only(None);
            recorder::stop();
        }
    });
    Ok(())
}

/// The bubble a freshly created editor window should show.
#[tauri::command]
pub fn editor_request() -> Option<EditorRequest> {
    request().clone()
}

/// Scripts of this bubble report their running block to the editor.
#[tauri::command]
pub fn editor_trace(bubble: Option<String>, state: State<'_, AppState>) {
    state.runtime.trace_only(bubble.as_deref());
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRequest {
    pub bubble: String,
    /// `Apps | Work | X`, for bubbles that are not saved yet.
    pub path: String,
    pub script: Value,
    #[serde(default)]
    pub params: HashMap<String, Value>,
    /// Custom blocks as the editor has them (maybe not saved yet).
    #[serde(default)]
    pub custom_blocks: Value,
    #[serde(default)]
    pub step: bool,
}

/// Test run of a script from the editor (spec §5.5); returns the task id.
#[tauri::command]
pub fn test_script(req: TestRequest, state: State<'_, AppState>) -> AppResult<u64> {
    let script = parse_script(&req.script)?;
    let world = state.runtime.world();
    let bubble = world.bubbles.get(&req.bubble).cloned().unwrap_or_else(|| {
        Arc::new(BubbleScripts {
            id: req.bubble.clone(),
            name: req
                .path
                .rsplit(PATH_SEPARATOR)
                .next()
                .unwrap_or_default()
                .to_string(),
            parent: None,
            path: req.path.clone(),
            is_action: true,
            slots: Vec::new(),
        })
    });
    let custom = req.custom_blocks.is_array().then(|| {
        Arc::new(CompiledWorld::compile(&json!({ "customBlocks": req.custom_blocks })).custom)
    });
    let slot = Arc::new(Slot {
        script: Arc::new(script),
        params: req.params,
        shared: None,
    });
    Ok(state.runtime.start_test(
        bubble,
        slot,
        RunOpts {
            custom,
            step: req.step,
        },
    ))
}

/// ⏭ in the editor: the task in step mode runs its next block.
#[tauri::command]
pub fn step_script(task: u64, state: State<'_, AppState>) {
    state.runtime.step(task);
}

/// ■ in the editor: stops every script of the bubble, test runs included.
#[tauri::command]
pub fn stop_bubble_scripts(bubble: String, state: State<'_, AppState>) {
    state.runtime.stop_bubble(&bubble, None);
}

/// Block positions in the editor (spec §9.3); `owner` is a bubble id, `shared:<id>` or
/// `custom:<id>`.
#[tauri::command]
pub fn get_script_layout(
    owner: String,
    slot: String,
    state: State<'_, AppState>,
) -> AppResult<Option<String>> {
    kv::layout(&state.db(), &owner, &slot)
}

#[tauri::command]
pub fn set_script_layout(
    owner: String,
    slot: String,
    data: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    kv::set_layout(&state.db(), &owner, &slot, &data)
}

#[tauri::command]
pub fn bubble_variables(bubble: String, state: State<'_, AppState>) -> HashMap<String, Value> {
    state.runtime.bubble_vars(&bubble)
}

#[tauri::command]
pub fn set_bubble_variable(bubble: String, name: String, value: Value, state: State<'_, AppState>) {
    state.runtime.set_bubble_var(&bubble, &name, value);
}

#[tauri::command]
pub fn delete_global(name: String, state: State<'_, AppState>) -> AppResult<()> {
    state.runtime.remove_global(&name);
    kv::delete_global(&state.db(), &name)
}

/// Opens the settings of the app window on a tab ("All global variables…" in the editor).
#[tauri::command]
pub fn open_settings(tab: String, app: AppHandle) {
    super::windows::show_main(&app);
    let _ = app.emit_to(MAIN, super::state::events::OPEN_SETTINGS, tab);
}

/// ⏺ in the editor: records keys and mouse clicks until `macro_stop`.
#[tauri::command]
pub fn macro_start() {
    recorder::start();
}

#[tauri::command]
pub fn macro_stop() -> Vec<MacroEvent> {
    recorder::stop()
}
