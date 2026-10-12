//! Storage: SQLite (WAL), MessagePack + zstd documents, content-addressed assets, backups.

pub mod assets;
pub mod codec;
pub mod db;
pub mod kv;
pub mod migrate;
pub mod package;
pub mod settings;
pub mod world_store;
