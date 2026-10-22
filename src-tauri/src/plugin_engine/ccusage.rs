//! Adapter over the vendored ccusage core. All local behavior lives here;
//! `vendor/ccusage` is byte-identical to upstream apart from the edits its
//! `VENDORING.md` records. See that file before changing anything under
//! `vendor/`.
//!
//! This replaces a `bunx ccusage@20.0.2 <provider> daily --json --breakdown
//! --order desc` subprocess. The daily contract retains the upstream fields;
//! Codex adds cache-write measurement/completeness metadata and the accounting
//! corrections recorded in `VENDORING.md`.

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Claude,
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Granularity {
    Daily,
    Hourly,
}

/// Run a provider usage load at the requested granularity.
///
/// Hourly data is a Codex-only contract because Claude's existing loader does
/// not expose event timestamps that can be safely bucketed into local hours.
/// Callers must treat an hourly Claude request as an error rather than
/// fabricating a series from daily totals.
pub fn query(
    provider: Provider,
    granularity: Granularity,
    home: Option<&Path>,
    since: Option<&str>,
    until: Option<&str>,
    pricing_overlay: Option<&str>,
) -> Result<serde_json::Value, String> {
    match (provider, granularity) {
        (Provider::Claude, Granularity::Daily) => {
            ccusage_vendor::claude_daily_json(home, since, until, pricing_overlay)
        }
        (Provider::Codex, Granularity::Daily) => {
            ccusage_vendor::codex_daily_json(home, since, until, pricing_overlay)
        }
        (Provider::Codex, Granularity::Hourly) => {
            ccusage_vendor::codex_hourly_json(home, since, until, pricing_overlay)
        }
        (Provider::Claude, Granularity::Hourly) => {
            Err("hourly granularity is only supported for Codex".to_string())
        }
    }
}

/// Run the daily-summary load in-process with the upstream fields plus Codex's
/// cache-write measurement/completeness metadata and the documented accounting
/// corrections, including independent anonymous session ownership.
///
/// `home` overrides the provider's usage directory (what the subprocess passed
/// as `CLAUDE_CONFIG_DIR` / `CODEX_HOME` on the child's environment);
/// `None` resolves the user's real directories. `since`/`until` are inclusive
/// `YYYYMMDD` local-date bounds.
///
/// `pricing_overlay` is LiteLLM JSON from [`super::pricing_cache`], laid over
/// the loader's embedded pricing snapshot. The loader itself never touches the
/// network (`OFFLINE_PRICING`), so this is the only way a price newer than the
/// snapshot reaches a Claude or Codex dollar figure — and Codex has no other
/// source of one at all, since its events carry no pre-baked cost. `None` is
/// embedded-only pricing, which is what `tests/ccusage_differential.rs` passes
/// to keep that gate hermetic.
pub fn query_daily(
    provider: Provider,
    home: Option<&Path>,
    since: Option<&str>,
    until: Option<&str>,
    pricing_overlay: Option<&str>,
) -> Result<serde_json::Value, String> {
    match provider {
        Provider::Claude => query(
            Provider::Claude,
            Granularity::Daily,
            home,
            since,
            until,
            pricing_overlay,
        ),
        // The reference fixture records additive cache-write metadata and the
        // DATA-R2-2 independent-owner correction; daily/hourly queries share it.
        Provider::Codex => ccusage_vendor::codex_daily_json(home, since, until, pricing_overlay),
    }
}
