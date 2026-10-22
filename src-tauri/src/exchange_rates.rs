use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const ENDPOINT: &str =
    "https://api.frankfurter.dev/v2/rates?base=USD&quotes=TWD,EUR,JPY,GBP,CNY,KRW";
const QUOTES: [&str; 6] = ["TWD", "EUR", "JPY", "GBP", "CNY", "KRW"];
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const CACHE_VERSION: u8 = 1;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const FETCH_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_RESPONSE_BYTES: u64 = 64 * 1024;

static FETCH_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ExchangeRateStatus {
    Base,
    Fresh,
    Cached,
    Stale,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRate {
    pub code: String,
    pub rate: Option<f64>,
    pub date: Option<String>,
    pub source: String,
    pub status: ExchangeRateStatus,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct FrankfurterRate {
    date: String,
    base: String,
    quote: String,
    rate: f64,
}

#[derive(Debug, Deserialize, Serialize)]
struct CacheFile {
    version: u8,
    fetched_at_ms: u64,
    rates: Vec<FrankfurterRate>,
}

#[tauri::command]
#[specta::specta]
pub async fn get_exchange_rates(app_handle: tauri::AppHandle) -> Result<Vec<ExchangeRate>, String> {
    let cache_file = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate the exchange-rate cache: {error}"))?
        .join("exchange-rates")
        .join("frankfurter-usd.json");

    tauri::async_runtime::spawn_blocking(move || {
        let _guard = FETCH_LOCK.lock().unwrap_or_else(PoisonError::into_inner);
        resolve_rates(&cache_file, now_ms(), fetch_rates)
    })
    .await
    .map_err(|error| format!("Exchange-rate worker failed: {error}"))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn resolve_rates<F>(cache_file: &Path, now_ms: u64, fetcher: F) -> Vec<ExchangeRate>
where
    F: FnOnce() -> Result<Vec<FrankfurterRate>, String>,
{
    let cached = read_cache(cache_file);
    if let Some(cache) = cached
        .as_ref()
        .filter(|cache| cache_is_fresh(cache, now_ms))
    {
        return make_rows(Some((&cache.rates, ExchangeRateStatus::Cached)));
    }

    match fetcher() {
        Ok(rates) => {
            let cache = CacheFile {
                version: CACHE_VERSION,
                fetched_at_ms: now_ms,
                rates,
            };
            if let Err(error) = write_cache(cache_file, &cache) {
                log::warn!("Failed to save exchange rates: {error}");
            }
            make_rows(Some((&cache.rates, ExchangeRateStatus::Fresh)))
        }
        Err(error) => {
            log::warn!(
                "Frankfurter exchange-rate refresh failed ({}); serving last-good data when available",
                crate::plugin_engine::host_api::redact_log_message(&error)
            );
            cached
                .as_ref()
                .map(|cache| make_rows(Some((&cache.rates, ExchangeRateStatus::Stale))))
                .unwrap_or_else(|| make_rows(None))
        }
    }
}

fn cache_is_fresh(cache: &CacheFile, now_ms: u64) -> bool {
    cache.fetched_at_ms <= now_ms && now_ms - cache.fetched_at_ms < CACHE_TTL.as_millis() as u64
}

fn fetch_rates() -> Result<Vec<FrankfurterRate>, String> {
    let mut builder = reqwest::blocking::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(FETCH_TIMEOUT);
    if let Some(resolved) = crate::config::get_resolved_proxy() {
        builder = builder.proxy(resolved.proxy.clone());
    }
    let client = builder.build().map_err(|error| error.to_string())?;
    let response = client
        .get(ENDPOINT)
        .send()
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }

    let mut body = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut body)
        .map_err(|error| error.to_string())?;
    if body.len() as u64 > MAX_RESPONSE_BYTES {
        return Err(format!("response exceeded {MAX_RESPONSE_BYTES} bytes"));
    }
    let rates: Vec<FrankfurterRate> =
        serde_json::from_slice(&body).map_err(|error| format!("invalid JSON: {error}"))?;
    validate_rates(&rates)?;
    Ok(rates)
}

fn validate_rates(rates: &[FrankfurterRate]) -> Result<(), String> {
    let mut seen = HashMap::new();
    for rate in rates {
        if rate.base != "USD" {
            return Err(format!("unexpected base currency {}", rate.base));
        }
        if !QUOTES.contains(&rate.quote.as_str()) {
            return Err(format!("unexpected quote currency {}", rate.quote));
        }
        if rate.date.is_empty() {
            return Err(format!("{} has no rate date", rate.quote));
        }
        if !rate.rate.is_finite() || rate.rate <= 0.0 {
            return Err(format!("{} has an invalid rate", rate.quote));
        }
        if seen.insert(rate.quote.as_str(), ()).is_some() {
            return Err(format!("duplicate quote currency {}", rate.quote));
        }
    }
    if seen.len() != QUOTES.len() {
        let missing = QUOTES
            .iter()
            .filter(|quote| !seen.contains_key(**quote))
            .copied()
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!("response omitted quote currencies: {missing}"));
    }
    Ok(())
}

fn make_rows(data: Option<(&[FrankfurterRate], ExchangeRateStatus)>) -> Vec<ExchangeRate> {
    let mut rows = vec![ExchangeRate {
        code: "USD".to_string(),
        rate: Some(1.0),
        date: None,
        source: "USD Base".to_string(),
        status: ExchangeRateStatus::Base,
    }];

    rows.extend(QUOTES.into_iter().map(|code| {
        let value = data.and_then(|(rates, status)| {
            rates
                .iter()
                .find(|rate| rate.quote == code)
                .map(|rate| (rate, status))
        });
        ExchangeRate {
            code: code.to_string(),
            rate: value.map(|(rate, _)| rate.rate),
            date: value.map(|(rate, _)| rate.date.clone()),
            source: "Frankfurter".to_string(),
            status: value
                .map(|(_, status)| status)
                .unwrap_or(ExchangeRateStatus::Unavailable),
        }
    }));
    rows
}

fn read_cache(cache_file: &Path) -> Option<CacheFile> {
    let json = match fs::read(cache_file) {
        Ok(json) => json,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            log::warn!("Failed to read exchange-rate cache: {error}");
            return None;
        }
    };
    let cache: CacheFile = match serde_json::from_slice(&json) {
        Ok(cache) => cache,
        Err(error) => {
            log::warn!("Discarding invalid exchange-rate cache: {error}");
            return None;
        }
    };
    if cache.version != CACHE_VERSION {
        log::warn!("Discarding unsupported exchange-rate cache version");
        return None;
    }
    if let Err(error) = validate_rates(&cache.rates) {
        log::warn!("Discarding invalid exchange-rate cache: {error}");
        return None;
    }
    Some(cache)
}

fn write_cache(cache_file: &Path, cache: &CacheFile) -> Result<(), String> {
    let parent = cache_file
        .parent()
        .ok_or_else(|| "exchange-rate cache has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let json = serde_json::to_vec(cache).map_err(|error| error.to_string())?;
    let temp_file = cache_file.with_extension("json.tmp");
    fs::write(&temp_file, json).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temp_file, cache_file) {
        let _ = fs::remove_file(&temp_file);
        return Err(error.to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ops::Deref;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn sample_rates() -> Vec<FrankfurterRate> {
        QUOTES
            .iter()
            .enumerate()
            .map(|(index, quote)| FrankfurterRate {
                date: "2026-08-31".to_string(),
                base: "USD".to_string(),
                quote: (*quote).to_string(),
                rate: 10.0 + index as f64,
            })
            .collect()
    }

    struct TempDir(PathBuf);

    impl Deref for TempDir {
        type Target = Path;

        fn deref(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn temp_dir(name: &str) -> TempDir {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "one-more-prompt-exchange-rate-{name}-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        TempDir(path)
    }

    #[test]
    fn successful_refresh_is_cached_and_skips_the_next_network_call() {
        let dir = temp_dir("fresh");
        let cache_file = dir.join("frankfurter-usd.json");
        let fetch_count = AtomicUsize::new(0);

        let fresh_rows = resolve_rates(&cache_file, 1_000, || {
            fetch_count.fetch_add(1, Ordering::SeqCst);
            Ok(sample_rates())
        });
        let cached_rows = resolve_rates(&cache_file, 2_000, || {
            fetch_count.fetch_add(1, Ordering::SeqCst);
            Err("should not fetch again".to_string())
        });

        assert_eq!(fetch_count.load(Ordering::SeqCst), 1);
        assert_eq!(fresh_rows[0].rate, Some(1.0));
        assert_eq!(fresh_rows[0].status, ExchangeRateStatus::Base);
        assert!(
            fresh_rows[1..]
                .iter()
                .all(|row| row.status == ExchangeRateStatus::Fresh)
        );
        assert!(
            cached_rows[1..]
                .iter()
                .all(|row| row.status == ExchangeRateStatus::Cached)
        );
    }

    #[test]
    fn failed_refresh_keeps_stale_last_good_rates() {
        let dir = temp_dir("stale");
        let cache_file = dir.join("frankfurter-usd.json");
        let cache = CacheFile {
            version: CACHE_VERSION,
            fetched_at_ms: 1_000,
            rates: sample_rates(),
        };
        write_cache(&cache_file, &cache).unwrap();

        let rows = resolve_rates(&cache_file, 1_000 + CACHE_TTL.as_millis() as u64, || {
            Err("offline".to_string())
        });

        assert!(
            rows[1..]
                .iter()
                .all(|row| row.status == ExchangeRateStatus::Stale && row.rate.is_some())
        );
    }

    #[test]
    fn no_cache_and_failed_refresh_returns_explicitly_unavailable_rows() {
        let dir = temp_dir("unavailable");
        let cache_file = dir.join("frankfurter-usd.json");
        let rows = resolve_rates(&cache_file, 1_000, || Err("offline".to_string()));

        assert_eq!(rows.len(), QUOTES.len() + 1);
        assert_eq!(rows[0].rate, Some(1.0));
        assert!(rows[1..].iter().all(|row| {
            row.status == ExchangeRateStatus::Unavailable
                && row.rate.is_none()
                && row.date.is_none()
        }));
    }

    #[test]
    fn incomplete_or_invalid_remote_data_is_rejected() {
        let mut incomplete = sample_rates();
        incomplete.pop();
        assert!(validate_rates(&incomplete).is_err());

        let mut invalid = sample_rates();
        invalid[0].rate = 0.0;
        assert!(validate_rates(&invalid).is_err());
    }
}
