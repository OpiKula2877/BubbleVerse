//! BubbleVerse core: storage, scripts, Windows integration and windows (spec §8.2).

pub mod app;
pub mod error;
pub mod os;
pub mod paths;
pub mod script;
pub mod storage;

use tauri::Manager;

use app::state::AppState;

pub fn run() {
    let windowed = std::env::var("BV_WINDOWED").is_ok_and(|v| v == "1");
    let autostarted = std::env::args().any(|a| a == app::autostart::AUTOSTART_ARG);

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            app::windows::show_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .register_asynchronous_uri_scheme_protocol(app::protocol::SCHEME, app::protocol::handle)
        .invoke_handler(tauri::generate_handler![
            app::commands::bootstrap,
            app::commands::save_draft,
            app::commands::discard_draft,
            app::commands::publish,
            app::commands::get_settings,
            app::commands::set_settings,
            app::commands::get_layout,
            app::commands::activate,
            app::commands::import_asset,
            app::commands::check_targets,
            app::commands::hide_main,
            app::commands::quit,
            app::commands::set_paused,
            app::commands::running_scripts,
            app::commands::stop_script,
            app::commands::stop_all_scripts,
            app::commands::search_history,
            app::commands::push_history,
            app::commands::usage_counts,
            app::commands::list_backups,
            app::commands::restore_backup,
            app::commands::run_action,
            app::commands::get_globals,
            app::commands::set_global,
            app::commands::hide_searchbar,
            app::commands::pause_shortcuts,
            app::wallpaper::wallpaper_snapshot,
            app::wallpaper::wallpaper_status,
            app::prompts::prompt_answer,
            app::editor::open_script_editor,
            app::editor::editor_request,
            app::editor::editor_trace,
            app::editor::test_script,
            app::editor::step_script,
            app::editor::stop_bubble_scripts,
            app::editor::get_script_layout,
            app::editor::set_script_layout,
            app::editor::bubble_variables,
            app::editor::set_bubble_variable,
            app::editor::delete_global,
            app::editor::macro_start,
            app::editor::macro_stop,
        ])
        .setup(move |tauri_app| {
            let handle = tauri_app.handle().clone();
            let paths = paths::Paths::new(paths::Paths::default_root()?)?;
            let state = AppState::new(handle.clone(), paths, windowed, autostarted)?;
            let autostart = state.settings().general.autostart;
            tauri_app.manage(state);
            if let Err(e) = app::autostart::sync(autostart) {
                log::warn!("autostart registration failed: {e}");
            }
            app::tray::create(&handle)?;
            app::windows::create_main(&handle)?;
            app::search::create_searchbar(&handle)?;
            app::shortcuts::start(&handle);
            app::wallpaper::apply(&handle);
            app::autopause::start(handle.clone());
            app::triggers::start(handle.clone(), autostarted);
            app::windows::watch_monitors(handle);
            Ok(())
        })
        .build(tauri::generate_context!());
    match result {
        Ok(app) => app.run(|handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Give the desktop back: no live wallpaper, icons visible, original wallpaper.
                app::wallpaper::stop(handle);
            }
        }),
        Err(e) => eprintln!("BubbleVerse failed to start: {e}"),
    }
}
