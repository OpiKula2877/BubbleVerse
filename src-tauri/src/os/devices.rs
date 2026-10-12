//! Connected USB devices and disks, for the "when … is connected" trigger.

use windows::core::{GUID, PCWSTR};
use windows::Win32::Devices::DeviceAndDriverInstallation::{
    SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInterfaces, SetupDiGetClassDevsW,
    DIGCF_DEVICEINTERFACE, DIGCF_PRESENT, SP_DEVICE_INTERFACE_DATA,
};
use windows::Win32::Storage::FileSystem::GetLogicalDrives;

const GUID_DEVINTERFACE_USB_DEVICE: GUID = GUID::from_u128(0xa5dcbf10_6530_11d2_901f_00c04fb951ed);

/// Number of present USB devices.
pub fn usb_count() -> u32 {
    unsafe {
        let Ok(set) = SetupDiGetClassDevsW(
            Some(&GUID_DEVINTERFACE_USB_DEVICE),
            PCWSTR::null(),
            None,
            DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
        ) else {
            return 0;
        };
        let mut n = 0;
        loop {
            let mut data = SP_DEVICE_INTERFACE_DATA {
                cbSize: std::mem::size_of::<SP_DEVICE_INTERFACE_DATA>() as u32,
                ..Default::default()
            };
            if SetupDiEnumDeviceInterfaces(set, None, &GUID_DEVINTERFACE_USB_DEVICE, n, &mut data)
                .is_err()
            {
                break;
            }
            n += 1;
        }
        let _ = SetupDiDestroyDeviceInfoList(set);
        n
    }
}

/// Bit mask of drive letters (bit 0 = A:).
pub fn drives() -> u32 {
    unsafe { GetLogicalDrives() }
}

#[cfg(test)]
mod tests {
    #[test]
    fn sees_the_system_drive() {
        // C: is bit 2.
        assert_ne!(super::drives() & 0b100, 0);
    }
}
