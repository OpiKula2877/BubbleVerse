use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};

use crate::script::host::test_host::TestHost;
use crate::script::host::ScriptFx;
use crate::script::runtime::Runtime;

fn world_with(scripts: Vec<Value>) -> Value {
    json!({
        "version": 1,
        "bubbles": [
            { "id": "main", "parentId": null, "kind": "folder", "name": "Main", "scripts": [] },
            { "id": "b", "parentId": "main", "kind": "action", "name": "Bub", "scripts": scripts },
            { "id": "empty", "parentId": "main", "kind": "action", "name": "Empty", "scripts": [] }
        ],
        "sharedScripts": [{
            "id": "sh", "name": "Shared", "params": [{ "name": "who", "type": "text", "default": "nobody" }],
            "script": { "v": 1, "trigger": [6, "shared"], "body": [[60, [167, "hi ", [563, "who"]]]] }
        }],
        "customBlocks": [{ "id": "twice", "name": "twice", "params": [{ "name": "x", "type": "number", "default": 0 }],
                           "body": [[60, [152, [562, "x"], 2]]] }],
        "templates": [], "globals": [{ "name": "count", "value": 0 }],
        "homeView": { "x": 0, "y": 0, "zoom": 1 }
    })
}

fn inline(trigger: Value, body: Value) -> Value {
    json!({ "kind": "inline", "script": { "v": 1, "trigger": trigger, "body": body } })
}

fn setup(scripts: Vec<Value>) -> (Runtime, Arc<TestHost>) {
    let host = Arc::new(TestHost::default());
    let rt = Runtime::new(host.clone());
    rt.set_world(&world_with(scripts));
    (rt, host)
}

async fn run_msg(rt: &Runtime, msg: &str) {
    let ids = rt.broadcast(msg);
    assert!(!ids.is_empty(), "no script for {msg}");
    tokio::time::timeout(Duration::from_secs(10), rt.wait_for(&ids))
        .await
        .expect("script did not finish");
}

fn logs(host: &TestHost) -> Vec<String> {
    host.logs
        .lock()
        .unwrap()
        .iter()
        .map(|l| l.text.clone())
        .collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn arithmetic_variables_and_log() {
    let (rt, host) = setup(vec![inline(
        json!([6, "go"]),
        json!([
            [220, "s:x", [150, 2, 3]],
            [221, "s:x", 1],
            [60, [167, "x=", [222, "s:x"]]],
            [60, [153, 1, 0]],
            [60, [156, "sqrt", 16]],
            [60, [154, -7, 3]]
        ]),
    )]);
    run_msg(&rt, "go").await;
    assert_eq!(logs(&host), vec!["x=6", "Infinity", "4", "2"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn loops_conditions_and_globals() {
    let (rt, host) = setup(vec![inline(
        json!([6, "go"]),
        json!([
            [51, 3, [[221, "g:count", 1]]],
            [
                56,
                [160, [222, "g:count"], 2],
                [[60, "big"]],
                [[60, "small"]]
            ],
            [220, "s:i", 0],
            [53, [159, [222, "s:i"], 4], [[221, "s:i", 1]]],
            [60, [222, "s:i"]],
            [54, "s:item", [172, "a,b", ","], [[60, [222, "s:item"]]]]
        ]),
    )]);
    run_msg(&rt, "go").await;
    assert_eq!(logs(&host), vec!["big", "4", "a", "b"]);
    assert_eq!(rt.globals()["count"], json!(3));
    assert!(host
        .saved
        .lock()
        .unwrap()
        .contains(&("g:count".to_string(), json!(3))));
}

#[tokio::test(flavor = "multi_thread")]
async fn lists_and_objects() {
    let (rt, host) = setup(vec![inline(
        json!([6, "go"]),
        json!([
            [260, "a", "s:l"],
            [260, "c", "s:l"],
            [261, "b", 2, "s:l"],
            [60, [265, [222, "s:l"]]],
            [60, [264, 2, [222, "s:l"]]],
            [60, [267, "c", [222, "s:l"]]],
            [262, 1, "s:l"],
            [60, [266, [222, "s:l"], "a"]],
            [224, "name", "s:o", "Ann"],
            [60, [223, "name", [222, "s:o"]]],
            [263, "s:l"],
            [60, [265, [222, "s:l"]]]
        ]),
    )]);
    run_msg(&rt, "go").await;
    assert_eq!(logs(&host), vec!["3", "b", "3", "false", "Ann", "0"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn try_catches_errors_and_uncaught_errors_flash_red() {
    let (rt, host) = setup(vec![
        inline(
            json!([6, "go"]),
            json!([
                [
                    58,
                    [[60, [175, "x", "("]]],
                    "s:e",
                    [[60, [167, "caught: ", [222, "s:e"]]]]
                ],
                [60, "after"]
            ]),
        ),
        inline(
            json!([6, "bad"]),
            json!([[60, [175, "x", "("]], [60, "never"]]),
        ),
    ]);
    run_msg(&rt, "go").await;
    let l = logs(&host);
    assert!(
        l[0].starts_with("caught: invalid regular expression"),
        "{l:?}"
    );
    assert_eq!(l[1], "after");
    run_msg(&rt, "bad").await;
    let entries = host.logs.lock().unwrap().clone();
    let err = entries.last().unwrap();
    assert_eq!(err.level, "error");
    assert_eq!(err.path, "Main | Bub");
    assert_eq!(err.block.as_deref(), Some("op_regex"));
    assert!(host
        .fx
        .lock()
        .unwrap()
        .contains(&ScriptFx::Error { bubble: "b".into() }));
}

#[tokio::test(flavor = "multi_thread")]
async fn run_modes_and_stopping() {
    let wait = json!([[50, 5, "s"]]);
    let mk = |mode: &str| json!({ "kind": "inline", "script": { "v": 1, "trigger": [6, mode], "body": wait, "runMode": mode } });
    let (rt, _host) = setup(vec![mk("ignore"), mk("restart"), mk("parallel")]);
    assert_eq!(rt.broadcast("ignore").len(), 1);
    assert_eq!(rt.broadcast("ignore").len(), 0);
    let first = rt.broadcast("restart");
    let second = rt.broadcast("restart");
    assert_ne!(first, second);
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(!rt.running().iter().any(|r| r.id == first[0]));
    rt.broadcast("parallel");
    rt.broadcast("parallel");
    assert_eq!(rt.running().iter().filter(|r| r.slot == 2).count(), 2);
    rt.stop_all();
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert!(rt.running().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn endless_loop_without_wait_can_be_stopped() {
    let (rt, _host) = setup(vec![inline(
        json!([6, "spin"]),
        json!([[52, [[221, "s:n", 1]]]]),
    )]);
    let ids = rt.broadcast("spin");
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(rt.running().len(), 1);
    rt.stop_all();
    tokio::time::timeout(Duration::from_secs(5), rt.wait_for(&ids))
        .await
        .expect("loop did not stop");
}

#[tokio::test(flavor = "multi_thread")]
async fn custom_blocks_shared_params_and_broadcast_wait() {
    let (rt, host) = setup(vec![
        inline(
            json!([6, "go"]),
            json!([[561, "twice", 21], [16, "child"], [60, "parent done"]]),
        ),
        inline(
            json!([6, "child"]),
            json!([[50, 50, "ms"], [60, "child done"]]),
        ),
        json!({ "kind": "shared", "ref": "sh", "params": { "who": "Ann" } }),
    ]);
    run_msg(&rt, "go").await;
    run_msg(&rt, "shared").await;
    assert_eq!(
        logs(&host),
        vec!["42", "child done", "parent done", "hi Ann"]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn activation_reports_missing_actions_and_runs_scripts() {
    let (rt, host) = setup(vec![inline(json!([1]), json!([[60, "clicked"]]))]);
    assert!(rt.activate("empty").is_err());
    assert_eq!(rt.activate("Main | Bub").unwrap(), 1);
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert_eq!(logs(&host), vec!["clicked"]);
    let fx = host.fx.lock().unwrap().clone();
    assert_eq!(fx[0], ScriptFx::Activated { bubble: "b".into() });
    assert!(fx.contains(&ScriptFx::Running {
        bubble: "b".into(),
        on: true
    }));
    assert!(fx.contains(&ScriptFx::Running {
        bubble: "b".into(),
        on: false
    }));
}

#[tokio::test(flavor = "multi_thread")]
async fn run_file_reports_missing_file() {
    let (rt, host) = setup(vec![inline(
        json!([6, "go"]),
        json!([[300, "C:\\missing\\nothing.exe", "", false, false, false]]),
    )]);
    run_msg(&rt, "go").await;
    let entries = host.logs.lock().unwrap().clone();
    assert!(entries[0].text.contains("file not found"), "{entries:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn file_blocks_work_in_a_temp_folder() {
    let dir = tempfile::tempdir().unwrap();
    let d = dir.path().display().to_string();
    let f = format!("{d}/notes.txt");
    let (rt, host) = setup(vec![inline(
        json!([6, "go"]),
        json!([
            [451, "write", "Hello", f],
            [451, "append", " world", f],
            [60, [450, f]],
            [452, "copy", f, format!("{d}/copy.txt")],
            [453, format!("{d}/copy.txt"), "renamed.txt"],
            [455, format!("{d}/sub")],
            [60, [265, [456, d.clone(), "*.txt", false]]],
            [458, format!("{d}/sub"), format!("{d}/a.zip")],
            [60, [107, "file", format!("{d}/a.zip")]],
            [60, [464, [463, "{\"a\": [1, 2]}"]]],
            [303, "echo bubble", "hidden", "s:out"],
            [60, [222, "s:out"]],
            [60, [105, "bubbleverse-not-running.exe"]]
        ]),
    )]);
    run_msg(&rt, "go").await;
    let l = logs(&host);
    assert_eq!(
        l,
        vec![
            "Hello world",
            "2",
            "true",
            "{\"a\":[1,2]}",
            "bubble",
            "false"
        ],
        "{l:?}"
    );
}
