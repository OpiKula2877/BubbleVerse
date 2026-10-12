//! Reading string values from the registry.

use windows::core::HSTRING;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{RegGetValueW, HKEY, RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ};

pub use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

/// A REG_SZ (or expanded REG_EXPAND_SZ) value, `None` when it does not exist.
pub fn string(root: HKEY, key: &str, value: &str) -> Option<String> {
    let mut buf = vec![0u16; 2048];
    let mut size = (buf.len() * 2) as u32;
    let err = unsafe {
        RegGetValueW(
            root,
            &HSTRING::from(key),
            &HSTRING::from(value),
            RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    (err == ERROR_SUCCESS).then(|| super::com::from_wide(&buf))
}
