//! "Start with Windows": a value in HKCU\…\Run that starts BubbleVerse hidden in the tray.

use windows::core::HSTRING;
use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
use windows::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ,
};

use crate::error::{AppError, AppResult};

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE: &str = "BubbleVerse";
pub const AUTOSTART_ARG: &str = "--autostart";

fn command() -> AppResult<String> {
    let exe = std::env::current_exe()?;
    Ok(format!("\"{}\" {AUTOSTART_ARG}", exe.display()))
}

pub fn set(enabled: bool) -> AppResult<()> {
    unsafe {
        if enabled {
            let cmd: Vec<u16> = command()?.encode_utf16().chain(Some(0)).collect();
            let err = RegSetKeyValueW(
                HKEY_CURRENT_USER,
                &HSTRING::from(RUN_KEY),
                &HSTRING::from(VALUE),
                REG_SZ.0,
                Some(cmd.as_ptr().cast()),
                (cmd.len() * 2) as u32,
            );
            if err != ERROR_SUCCESS {
                return Err(AppError::Win(format!("autostart: {err:?}")));
            }
        } else {
            let err = RegDeleteKeyValueW(
                HKEY_CURRENT_USER,
                &HSTRING::from(RUN_KEY),
                &HSTRING::from(VALUE),
            );
            if err != ERROR_SUCCESS && err != ERROR_FILE_NOT_FOUND {
                return Err(AppError::Win(format!("autostart: {err:?}")));
            }
        }
    }
    Ok(())
}

/// The command currently registered, if any.
pub fn current() -> Option<String> {
    let mut buf = vec![0u16; 1024];
    let mut size = (buf.len() * 2) as u32;
    let err = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            &HSTRING::from(RUN_KEY),
            &HSTRING::from(VALUE),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    (err == ERROR_SUCCESS).then(|| crate::os::com::from_wide(&buf))
}

/// Registers or removes the Run value so it matches the setting (and the current exe path).
pub fn sync(enabled: bool) -> AppResult<()> {
    let wanted = if enabled { Some(command()?) } else { None };
    if current() != wanted {
        set(enabled)?;
    }
    Ok(())
}
