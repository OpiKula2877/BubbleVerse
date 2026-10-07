//! What scripts need from the rest of the app: events for windows, the debug console,
//! persistence of variables and dialogs. The app implements it; tests use `TestHost`.

use std::future::Future;
use std::pin::Pin;

use serde::Serialize;
use serde_json::Value;

pub type BoxFut<T> = Pin<Box<dyn Future<Output = T> + Send>>;

/// Visual effects from scripts; they apply only while the app runs (spec §5.4).
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ScriptFx {
    /// Neuron pulse from the main bubble to this bubble (spec §3.8).
    #[serde(rename_all = "camelCase")]
    Activated { bubble: String },
    /// Soft glow while a script of the bubble runs.
    #[serde(rename_all = "camelCase")]
    Running { bubble: String, on: bool },
    /// Red flash after an error.
    #[serde(rename_all = "camelCase")]
    Error { bubble: String },
    #[serde(rename_all = "camelCase")]
    Glow { bubble: String },
    #[serde(rename_all = "camelCase")]
    Say {
        bubble: String,
        text: String,
        seconds: f64,
    },
    /// `prop`: "color" | "skin" | "size"
    #[serde(rename_all = "camelCase")]
    Change {
        bubble: String,
        prop: String,
        value: Value,
    },
    #[serde(rename_all = "camelCase")]
    Visibility { bubble: String, visible: bool },
    #[serde(rename_all = "camelCase")]
    Move { bubble: String, x: f64, y: f64 },
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    /// Unix ms.
    pub at: i64,
    /// "info" | "error"
    pub level: String,
    pub bubble: String,
    /// `Apps | Work | Claude Code`
    pub path: String,
    pub slot: usize,
    /// Block id from the catalog, e.g. `sys_run_file`.
    pub block: Option<String>,
    /// Node number inside the script (for highlighting in the editor).
    pub node: Option<u32>,
    pub text: String,
    /// Error code for a translated message (`error.<code>` in the UI dictionaries).
    pub code: Option<String>,
    /// Detail for the message, e.g. the missing path.
    pub detail: Option<String>,
}

pub trait Host: Send + Sync + 'static {
    fn fx(&self, fx: ScriptFx);
    fn log(&self, entry: LogEntry);
    /// The block `node` of a traced script is about to run (editor highlighting, spec §5.5).
    fn trace(&self, _bubble: &str, _slot: usize, _node: u32) {}
    fn save_global(&self, name: &str, value: &Value);
    fn save_bubble_var(&self, bubble: &str, name: &str, value: &Value);
    /// Text answer; `None` when cancelled.
    fn ask(&self, _question: String) -> BoxFut<Option<String>> {
        Box::pin(async { None })
    }
    fn confirm(&self, _question: String) -> BoxFut<bool> {
        Box::pin(async { false })
    }
    /// `kind`: "file" | "folder"
    fn pick(&self, _kind: String) -> BoxFut<Option<String>> {
        Box::pin(async { None })
    }
    /// Countdown with a cancel button before sleep/restart/shutdown; true = go on.
    fn countdown(&self, _action: String, _seconds: f64) -> BoxFut<bool> {
        Box::pin(async { true })
    }
    fn notify(&self, _title: &str, _text: &str) {}
    /// Whether the BubbleVerse window is in the foreground (scope of in-app shortcuts).
    fn app_focused(&self) -> bool {
        false
    }
}

#[cfg(test)]
pub mod test_host {
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    pub struct TestHost {
        pub fx: Mutex<Vec<ScriptFx>>,
        pub logs: Mutex<Vec<LogEntry>>,
        pub saved: Mutex<Vec<(String, Value)>>,
    }

    impl Host for TestHost {
        fn fx(&self, fx: ScriptFx) {
            self.fx.lock().unwrap().push(fx);
        }
        fn log(&self, entry: LogEntry) {
            self.logs.lock().unwrap().push(entry);
        }
        fn save_global(&self, name: &str, value: &Value) {
            self.saved
                .lock()
                .unwrap()
                .push((format!("g:{name}"), value.clone()));
        }
        fn save_bubble_var(&self, bubble: &str, name: &str, value: &Value) {
            self.saved
                .lock()
                .unwrap()
                .push((format!("b:{bubble}:{name}"), value.clone()));
        }
        fn ask(&self, question: String) -> BoxFut<Option<String>> {
            Box::pin(async move { Some(format!("answer to {question}")) })
        }
        fn confirm(&self, _question: String) -> BoxFut<bool> {
            Box::pin(async { true })
        }
    }
}
