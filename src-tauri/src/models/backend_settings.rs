use crate::models::logging_config::LoggingConfig;
use crate::models::search_engine_config::SearchEngineConfig;

use crate::commands::hash_commands::ChecksumMethod;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BackendSettings {
    /// Configuration for the search engine, including result limits and indexing options
    pub search_engine_config: SearchEngineConfig,
    /// Configuration for logging behavior
    pub logging_config: LoggingConfig,
    /// Default hash algorithm for file checksums
    pub default_checksum_hash: ChecksumMethod,
}

impl Default for BackendSettings {
    fn default() -> Self {
        Self {
            search_engine_config: SearchEngineConfig::default(),
            logging_config: LoggingConfig::default(),
            default_checksum_hash: ChecksumMethod::SHA256,
        }
    }
}
