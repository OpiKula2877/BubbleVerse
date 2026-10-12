use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppResult;
use crate::os::monitors::{list_monitors, ui_monitor, virtual_desktop, MonitorInfo, Rect};
use crate::paths::Paths;
use crate::script::host::{BoxFut, Host, LogEntry, ScriptFx, TraceEvent};
use crate::script::runtime::Runtime;
use crate::storage::assets::{referenced_assets, AssetStore};
use crate::storage::db::Db;
use crate::storage::settings::{self, Settings};
use crate::storage::{kv, world_store};

/// Event names (core → windows, spec §8.4).
pub mod events {
    pub const WORLD_PUBLISHED: &str = "bv://world-published";
    pub const SETTINGS: &str = "bv://settings";
    pub const LAYOUT: &str = "bv://layout";
    pub const PAUSE: &str = "bv://pause";
    pub const FX: &str = "bv://fx";
    pub const LOG: &str = "bv://log";
    pub const TRACE: &str = "bv://trace";
    pub const OPEN_SETTINGS: &str = "bv://open-settings";
    pub const SHORTCUT: &str = "bv://shortcut";
    pub const SEARCH: &str = "bv://search";
}

/// Where the windows are: monitors in physical pixels and how CSS pixels map to them.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub monitors: Vec<MonitorInfo>,
    /// Monitor with the UI (spec §2.1).
    pub ui_monitor: String,
    /// Top-left of the app window = top-left of the virtual desktop (physical px).
    pub origin: Rect,
    /// Rasterization scale of the app window = scale of the UI monitor.
    pub css_scale: f64,
    /// Developer mode `BV_WINDOWED=1`: a normal window instead of spanning all monitors.
    pub windowed: bool,
}

pub struct AppState {
    pub app: AppHandle,
    pub paths: Paths,
    db: Mutex<Db>,
    pub assets: AssetStore,
    pub settings: RwLock<Settings>,
    pub published: RwLock<Arc<Value>>,
    pub runtime: Runtime,
    pub layout: RwLock<Layout>,
    pub animations_paused: AtomicBool,
    pub windowed: bool,
    pub autostarted: bool,
    /// Integrity problem found at startup (spec §11); the UI offers restoring a backup.
    pub db_damaged: bool,
}

impl AppState {
    pub fn new(app: AppHandle, paths: Paths, windowed: bool, autostarted: bool) -> AppResult<Self> {
        let db = Db::open(&paths.db())?;
        let db_damaged = !db.integrity_ok().unwrap_or(false);
        let settings = settings::load(&db)?;
        let published = world_store::load(&db, world_store::PUBLISHED)?
            .map(|d| d.world)
            .unwrap_or_else(empty_world);
        let runtime = Runtime::new(Arc::new(AppHost { app: app.clone() }));
        let bubble_vars = {
            let mut all = std::collections::HashMap::new();
            if let Some(list) = published.get("bubbles").and_then(Value::as_array) {
                for b in list {
                    if let Some(id) = b.get("id").and_then(Value::as_str) {
                        let vars = kv::bubble_vars(&db, id)?;
                        if !vars.is_empty() {
                            all.insert(id.to_string(), vars);
                        }
                    }
                }
            }
            all
        };
        runtime.load_variables(kv::globals(&db)?, bubble_vars);
        runtime.set_world(&published);
        let layout = compute_layout(&settings, windowed);
        Ok(AppState {
            assets: AssetStore::new(paths.assets()),
            app,
            paths,
            db: Mutex::new(db),
            settings: RwLock::new(settings),
            published: RwLock::new(Arc::new(published)),
            runtime,
            layout: RwLock::new(layout),
            animations_paused: AtomicBool::new(false),
            windowed,
            autostarted,
            db_damaged,
        })
    }

    pub fn db(&self) -> MutexGuard<'_, Db> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn settings(&self) -> Settings {
        self.settings.read().map(|s| s.clone()).unwrap_or_default()
    }

    pub fn published(&self) -> Arc<Value> {
        self.published
            .read()
            .map(|p| p.clone())
            .unwrap_or_else(|_| Arc::new(empty_world()))
    }

    pub fn layout(&self) -> Layout {
        self.layout
            .read()
            .map(|l| l.clone())
            .unwrap_or_else(|_| compute_layout(&Settings::default(), self.windowed))
    }

    /// Re-reads monitors; returns true when anything changed.
    pub fn refresh_layout(&self) -> bool {
        let next = compute_layout(&self.settings(), self.windowed);
        let mut cur = match self.layout.write() {
            Ok(l) => l,
            Err(_) => return false,
        };
        let changed = cur.monitors != next.monitors || cur.ui_monitor != next.ui_monitor;
        *cur = next;
        changed
    }

    /// Installs a newly saved world: scripts, triggers and windows (spec §4.7).
    pub fn install_published(&self, world: Value) {
        self.runtime.set_world(&world);
        if let Ok(mut p) = self.published.write() {
            *p = Arc::new(world.clone());
        }
        let _ = self.app.emit(events::WORLD_PUBLISHED, world);
    }

    pub fn set_paused(&self, paused: bool) {
        self.animations_paused.store(paused, Ordering::Relaxed);
        let _ = self.app.emit(events::PAUSE, paused);
    }

    pub fn paused(&self) -> bool {
        self.animations_paused.load(Ordering::Relaxed)
    }

    /// Deletes assets that neither the published world, the draft, backups nor settings use.
    pub fn collect_garbage(&self) -> AppResult<usize> {
        let mut keep = HashSet::new();
        referenced_assets(&self.published(), &mut keep);
        if let Some(draft) = world_store::load(&self.db(), world_store::DRAFT)? {
            referenced_assets(&draft.world, &mut keep);
        }
        for backup in world_store::read_all_backups(&self.paths.backups()) {
            referenced_assets(&backup, &mut keep);
        }
        referenced_assets(&serde_json::to_value(self.settings())?, &mut keep);
        self.assets.collect_garbage(&keep)
    }
}

pub fn empty_world() -> Value {
    serde_json::json!({
        "version": crate::storage::migrate::WORLD_VERSION,
        "bubbles": [], "sharedScripts": [], "customBlocks": [], "templates": [], "globals": [],
        "homeView": { "x": 0, "y": 0, "zoom": 1 }
    })
}

pub fn compute_layout(settings: &Settings, windowed: bool) -> Layout {
    let monitors = list_monitors();
    let ui = ui_monitor(&monitors, settings.general.primary_monitor.as_deref());
    Layout {
        ui_monitor: ui.map(|m| m.id.clone()).unwrap_or_default(),
        css_scale: ui.map(|m| m.scale).unwrap_or(1.0),
        origin: virtual_desktop(&monitors),
        monitors,
        windowed,
    }
}

/// Connects scripts to the app: events for windows, persistence of variables, dialogs.
pub struct AppHost {
    pub app: AppHandle,
}

impl AppHost {
    fn state(&self) -> Option<tauri::State<'_, AppState>> {
        self.app.try_state::<AppState>()
    }
}

impl Host for AppHost {
    fn fx(&self, fx: ScriptFx) {
        // The tray lists running scripts: rebuild it when a bubble starts or stops running.
        let running_changed = matches!(fx, ScriptFx::Running { .. });
        let _ = self.app.emit(events::FX, fx);
        if running_changed {
            super::tray::refresh(&self.app);
        }
    }

    fn log(&self, entry: LogEntry) {
        if entry.level == "error" {
            log::warn!("script error in {}: {}", entry.path, entry.text);
        }
        let _ = self.app.emit(events::LOG, entry);
    }

    fn trace(&self, event: TraceEvent) {
        let _ = self
            .app
            .emit_to(super::editor::EDITOR, events::TRACE, event);
    }

    fn save_global(&self, name: &str, value: &Value) {
        if let Some(s) = self.state() {
            let _ = kv::set_global(&s.db(), name, value);
        }
    }

    fn save_bubble_var(&self, bubble: &str, name: &str, value: &Value) {
        if let Some(s) = self.state() {
            let _ = kv::set_bubble_var(&s.db(), bubble, name, value);
        }
    }

    fn ask(&self, question: String) -> BoxFut<Option<String>> {
        let app = self.app.clone();
        Box::pin(async move { super::prompts::ask(&app, "ask", question, None, 0.0).await })
    }

    fn confirm(&self, question: String) -> BoxFut<bool> {
        let app = self.app.clone();
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || {
                super::prompts::confirm_blocking(&app, &question)
            })
            .await
            .unwrap_or(false)
        })
    }

    fn pick(&self, kind: String) -> BoxFut<Option<String>> {
        let app = self.app.clone();
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || super::prompts::pick_blocking(&app, &kind))
                .await
                .ok()
                .flatten()
        })
    }

    fn countdown(&self, action: String, seconds: f64) -> BoxFut<bool> {
        let app = self.app.clone();
        Box::pin(async move {
            super::prompts::ask(&app, "countdown", String::new(), Some(action), seconds)
                .await
                .is_some()
        })
    }

    fn notify(&self, title: &str, text: &str) {
        super::prompts::notify(&self.app, title, text);
    }

    fn app_focused(&self) -> bool {
        self.app
            .get_webview_window("main")
            .and_then(|w| w.is_focused().ok())
            .unwrap_or(false)
    }
}
