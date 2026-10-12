//! Processes: list, find by name, end (spec §5.2 "Windows & processes").

use windows::core::PWSTR;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, TerminateProcess, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
};

use super::com::from_wide;
use crate::error::{AppError, AppResult};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
}

pub fn processes() -> Vec<ProcInfo> {
    let mut out = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return out;
        };
        let mut e = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snap, &mut e).is_ok() {
            loop {
                out.push(ProcInfo {
                    pid: e.th32ProcessID,
                    name: from_wide(&e.szExeFile),
                });
                if Process32NextW(snap, &mut e).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
    }
    out
}

/// `notepad`, `Notepad.exe` and `notepad.exe` all mean the same process.
pub fn same_name(a: &str, b: &str) -> bool {
    let strip = |s: &str| {
        let s = s.trim().to_lowercase();
        s.strip_suffix(".exe").map(str::to_string).unwrap_or(s)
    };
    strip(a) == strip(b)
}

pub fn running(name: &str) -> bool {
    processes().iter().any(|p| same_name(&p.name, name))
}

/// Ends every process with the name; returns how many were ended.
pub fn kill(name: &str) -> AppResult<usize> {
    let mut n = 0;
    for p in processes().into_iter().filter(|p| same_name(&p.name, name)) {
        unsafe {
            if let Ok(h) = OpenProcess(PROCESS_TERMINATE, false, p.pid) {
                if TerminateProcess(h, 1).is_ok() {
                    n += 1;
                }
                let _ = CloseHandle(h);
            }
        }
    }
    if n == 0 && !running(name) {
        return Err(AppError::msg(format!("process {name} is not running")));
    }
    Ok(n)
}

/// File name of a process (`chrome.exe`).
pub fn name_of(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let ok =
            QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len)
                .is_ok();
        let _ = CloseHandle(h);
        if !ok {
            return None;
        }
        let full = String::from_utf16_lossy(&buf[..len as usize]);
        full.rsplit(['\\', '/']).next().map(str::to_string)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_processes_and_finds_itself() {
        let me = name_of(std::process::id()).unwrap();
        assert!(running(&me));
        assert!(same_name("Notepad", "notepad.EXE"));
        assert!(!running("definitely-not-running-bv.exe"));
    }
}
