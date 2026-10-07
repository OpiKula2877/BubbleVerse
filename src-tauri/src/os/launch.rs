use std::path::Path;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject, INFINITE};
use windows::Win32::UI::Shell::{
    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
};
use windows::Win32::UI::WindowsAndMessaging::{SW_HIDE, SW_SHOWNORMAL};

use super::com::{wide, ComGuard};
use crate::error::{AppError, AppResult};

#[derive(Clone, Copy, Debug, Default)]
pub struct LaunchOptions {
    /// Ask for administrator rights (UAC prompt on every launch, spec §5.4).
    pub admin: bool,
    /// Block until the program ends (call from a blocking thread).
    pub wait: bool,
    pub hidden: bool,
}

/// `steam://…`, `com.epicgames.launcher://…`, `https://…` and similar.
pub fn is_uri(target: &str) -> bool {
    match target.split_once(':') {
        Some((scheme, rest)) => {
            scheme.len() > 1
                && rest.starts_with("//")
                && scheme
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
        }
        None => false,
    }
}

/// Expands `%VAR%` environment variables in a path.
pub fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => {
                let name = &after[..end];
                match std::env::var(name) {
                    Ok(v) if !name.is_empty() => out.push_str(&v),
                    _ => {
                        out.push('%');
                        out.push_str(name);
                        out.push('%');
                    }
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// Does the target of a "run file" action exist? URIs are always considered present.
pub fn target_exists(target: &str) -> bool {
    let t = target.trim();
    !t.is_empty() && (is_uri(t) || Path::new(&expand_env(t)).exists())
}

/// Runs a file (exe, lnk, document, URI) through the shell. Returns the exit code when waiting.
pub fn run_file(target: &str, args: &str, opts: LaunchOptions) -> AppResult<Option<u32>> {
    let target = expand_env(target.trim());
    if target.is_empty() {
        return Err(AppError::FileNotFound(String::new()));
    }
    if !is_uri(&target) && !Path::new(&target).exists() {
        return Err(AppError::FileNotFound(target));
    }
    let dir = if is_uri(&target) {
        None
    } else {
        Path::new(&target)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
    };
    shell_execute(
        if opts.admin { "runas" } else { "open" },
        &target,
        args,
        dir.as_deref(),
        opts,
    )
}

/// Opens a URL in the default browser, or in `browser` (path to its exe) when given.
pub fn open_url(url: &str, browser: &str) -> AppResult<()> {
    let url = url.trim();
    if url.is_empty() {
        return Err(AppError::msg("empty URL"));
    }
    let browser = browser.trim();
    if browser.is_empty() {
        shell_execute("open", url, "", None, LaunchOptions::default())?;
    } else {
        run_file(browser, &format!("\"{url}\""), LaunchOptions::default())?;
    }
    Ok(())
}

pub fn open_folder(path: &str) -> AppResult<()> {
    let path = expand_env(path.trim());
    if !Path::new(&path).is_dir() {
        return Err(AppError::FileNotFound(path));
    }
    shell_execute("open", &path, "", None, LaunchOptions::default())?;
    Ok(())
}

fn shell_execute(
    verb: &str,
    file: &str,
    args: &str,
    dir: Option<&str>,
    opts: LaunchOptions,
) -> AppResult<Option<u32>> {
    let _com = ComGuard::new();
    let verb_w = wide(verb);
    let file_w = wide(file);
    let args_w = wide(args);
    let dir_w = dir.map(wide);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI,
        lpVerb: PCWSTR(verb_w.as_ptr()),
        lpFile: PCWSTR(file_w.as_ptr()),
        lpParameters: if args.is_empty() {
            PCWSTR::null()
        } else {
            PCWSTR(args_w.as_ptr())
        },
        lpDirectory: dir_w
            .as_ref()
            .map_or(PCWSTR::null(), |d| PCWSTR(d.as_ptr())),
        nShow: if opts.hidden {
            SW_HIDE.0
        } else {
            SW_SHOWNORMAL.0
        },
        ..Default::default()
    };
    unsafe { ShellExecuteExW(&mut info) }?;
    let process: HANDLE = info.hProcess;
    if process.is_invalid() || process.0.is_null() {
        return Ok(None);
    }
    let mut code = None;
    if opts.wait {
        unsafe {
            WaitForSingleObject(process, INFINITE);
            let mut c = 0u32;
            if GetExitCodeProcess(process, &mut c).is_ok() {
                code = Some(c);
            }
        }
    }
    unsafe {
        let _ = CloseHandle(process);
    }
    Ok(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_uris() {
        assert!(is_uri("steam://rungameid/730"));
        assert!(is_uri("com.epicgames.launcher://apps/fn?action=launch"));
        assert!(is_uri("https://example.com"));
        assert!(!is_uri("C:\\Windows\\notepad.exe"));
        assert!(!is_uri("notes.txt"));
    }

    #[test]
    fn expands_environment_variables() {
        std::env::set_var("BV_TEST_DIR", "C:\\Data");
        assert_eq!(expand_env("%BV_TEST_DIR%\\a.exe"), "C:\\Data\\a.exe");
        assert_eq!(expand_env("100% sure"), "100% sure");
        assert_eq!(expand_env("%NOPE_NOT_SET%"), "%NOPE_NOT_SET%");
    }

    #[test]
    fn checks_targets_and_reports_missing_files() {
        assert!(target_exists("C:\\Windows"));
        assert!(target_exists("steam://rungameid/1"));
        assert!(!target_exists("C:\\definitely\\missing.exe"));
        assert!(!target_exists("  "));
        match run_file("C:\\definitely\\missing.exe", "", LaunchOptions::default()) {
            Err(AppError::FileNotFound(p)) => assert!(p.contains("missing.exe")),
            other => panic!("unexpected {other:?}"),
        }
    }
}
