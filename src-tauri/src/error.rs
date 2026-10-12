use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// Errors of the core. Sent to the UI as `{ code, message, detail }`; the UI translates
/// `code` with the i18n key `error.<code>` and falls back to `message`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
    #[error("data format error: {0}")]
    Format(String),
    #[error("file not found: {0}")]
    FileNotFound(String),
    #[error("windows error: {0}")]
    Win(String),
    #[error("window error: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("{0}")]
    Message(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Db(_) => "storage",
            AppError::Io(_) => "io",
            AppError::Format(_) => "format",
            AppError::FileNotFound(_) => "fileNotFound",
            AppError::Win(_) => "windows",
            AppError::Tauri(_) => "window",
            AppError::Message(_) => "message",
        }
    }

    pub fn msg(text: impl Into<String>) -> Self {
        AppError::Message(text.into())
    }

    pub fn format(text: impl std::fmt::Display) -> Self {
        AppError::Format(text.to_string())
    }
}

impl From<windows::core::Error> for AppError {
    fn from(e: windows::core::Error) -> Self {
        AppError::Win(e.message())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Format(e.to_string())
    }
}

impl From<rmp_serde::encode::Error> for AppError {
    fn from(e: rmp_serde::encode::Error) -> Self {
        AppError::Format(e.to_string())
    }
}

impl From<rmp_serde::decode::Error> for AppError {
    fn from(e: rmp_serde::decode::Error) -> Self {
        AppError::Format(e.to_string())
    }
}

impl From<image::ImageError> for AppError {
    fn from(e: image::ImageError) -> Self {
        AppError::Format(e.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("AppError", 3)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        let detail = match self {
            AppError::FileNotFound(p) => Some(p.as_str()),
            _ => None,
        };
        st.serialize_field("detail", &detail)?;
        st.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_message_and_detail() {
        let e = AppError::FileNotFound("C:\\x.exe".into());
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["code"], "fileNotFound");
        assert_eq!(v["detail"], "C:\\x.exe");
        assert!(v["message"].as_str().unwrap().contains("x.exe"));
    }
}
