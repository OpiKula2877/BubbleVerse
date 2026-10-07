//! Volume, mute, speech and sounds.

use windows::core::HSTRING;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator, PlaySoundW, SND_FILENAME, SND_SYNC,
};
use windows::Win32::Media::Speech::{ISpVoice, SpVoice, SPF_DEFAULT};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

use super::com::ComGuard;
use crate::error::{AppError, AppResult};

fn endpoint() -> AppResult<IAudioEndpointVolume> {
    unsafe {
        let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let dev = en.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let vol: IAudioEndpointVolume = dev.Activate(CLSCTX_ALL, None)?;
        Ok(vol)
    }
}

/// Master volume 0–100 %.
pub fn set_volume(percent: f64) -> AppResult<()> {
    let _com = ComGuard::new();
    let v = endpoint()?;
    unsafe {
        v.SetMasterVolumeLevelScalar((percent / 100.0).clamp(0.0, 1.0) as f32, std::ptr::null())?
    };
    Ok(())
}

/// "mute" | "unmute" | "toggle"
pub fn set_mute(how: &str) -> AppResult<()> {
    let _com = ComGuard::new();
    let v = endpoint()?;
    unsafe {
        let now = v.GetMute()?.as_bool();
        let next = match how {
            "mute" => true,
            "unmute" => false,
            _ => !now,
        };
        v.SetMute(next, std::ptr::null())?;
    }
    Ok(())
}

/// Reads text aloud with a Windows voice (blocks until done).
pub fn speak(text: &str) -> AppResult<()> {
    let _com = ComGuard::new();
    unsafe {
        let voice: ISpVoice = CoCreateInstance(&SpVoice, None, CLSCTX_ALL)?;
        voice.Speak(&HSTRING::from(text), SPF_DEFAULT.0 as u32, None)?;
    }
    Ok(())
}

/// Plays a sound file and waits until it ends. WAV plays directly; other formats through the
/// Windows media player engine.
pub fn play(path: &str) -> AppResult<()> {
    let p = std::path::Path::new(path);
    if !p.is_file() {
        return Err(AppError::FileNotFound(path.to_string()));
    }
    let is_wav = p.extension().is_some_and(|e| e.eq_ignore_ascii_case("wav"));
    if is_wav {
        let ok =
            unsafe { PlaySoundW(&HSTRING::from(path), None, SND_FILENAME | SND_SYNC).as_bool() };
        return if ok {
            Ok(())
        } else {
            Err(AppError::msg("the sound could not be played"))
        };
    }
    play_media(p)
}

fn play_media(p: &std::path::Path) -> AppResult<()> {
    use windows::Foundation::Uri;
    use windows::Media::Core::MediaSource;
    use windows::Media::Playback::{MediaPlaybackState, MediaPlayer};
    let url = format!("file:///{}", p.display().to_string().replace('\\', "/"));
    let player = MediaPlayer::new()?;
    player.SetSource(&MediaSource::CreateFromUri(&Uri::CreateUri(
        &HSTRING::from(url),
    )?)?)?;
    player.Play()?;
    let session = player.PlaybackSession()?;
    // Wait for the start, then for the end (at most 10 minutes).
    let start = std::time::Instant::now();
    let mut started = false;
    while start.elapsed().as_secs() < 600 {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let state = session.PlaybackState()?;
        if state == MediaPlaybackState::Playing {
            started = true;
        } else if started || start.elapsed().as_secs() > 10 {
            break;
        }
    }
    let _ = player.Close();
    Ok(())
}
