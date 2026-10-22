use rquickjs::{Ctx, Exception, Function, Object};
use serde::Serialize;
use specta::Type;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ScanPhase {
    Waiting,
    Discovering,
    Reading,
    Summarizing,
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingScanProgress {
    pub phase: ScanPhase,
    pub processed_files: f64,
    pub total_files: f64,
}

impl OnboardingScanProgress {
    pub fn phase(phase: ScanPhase) -> Self {
        Self {
            phase,
            processed_files: 0.0,
            total_files: 0.0,
        }
    }

    fn checked(phase: &str, processed_files: f64, total_files: f64) -> Option<Self> {
        let phase = match phase {
            "reading" => ScanPhase::Reading,
            "summarizing" => ScanPhase::Summarizing,
            _ => return None,
        };
        if !processed_files.is_finite()
            || !total_files.is_finite()
            || processed_files < 0.0
            || total_files < processed_files
            || total_files > 9_007_199_254_740_991.0
            || processed_files.fract() != 0.0
            || total_files.fract() != 0.0
        {
            return None;
        }
        Some(Self {
            phase,
            processed_files,
            total_files,
        })
    }
}

pub type ScanProgressCallback = Arc<dyn Fn(OnboardingScanProgress) + Send + Sync>;

// Installed only for the local onboarding probe; normal probes expose no callback.
pub fn inject(ctx: &Ctx<'_>, on_progress: ScanProgressCallback) -> rquickjs::Result<()> {
    let probe_ctx: Object = ctx.globals().get("__one_more_prompt_ctx")?;
    let host: Object = probe_ctx.get("host")?;
    host.set(
        "scanProgress",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, phase: String, processed: f64, total: f64| {
                let progress = OnboardingScanProgress::checked(&phase, processed, total)
                    .ok_or_else(|| {
                        log::warn!("plugin reported invalid onboarding scan progress");
                        Exception::throw_type(&ctx_inner, "Invalid scan progress")
                    })?;
                on_progress(progress);
                Ok::<(), rquickjs::Error>(())
            },
        )?,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_safe_counts_and_known_plugin_phases() {
        for (phase, processed, total) in [
            ("reading", f64::NAN, 1.0),
            ("reading", 0.0, f64::INFINITY),
            ("reading", -1.0, 2.0),
            ("reading", 3.0, 2.0),
            ("reading", 0.5, 2.0),
            ("reading", 1.0, 2.5),
            ("reading", 0.0, 9_007_199_254_740_992.0),
            ("waiting", 0.0, 0.0),
            ("/private/path", 0.0, 0.0),
        ] {
            assert!(OnboardingScanProgress::checked(phase, processed, total).is_none());
        }
        assert!(OnboardingScanProgress::checked("reading", 0.0, 0.0).is_some());
        assert!(OnboardingScanProgress::checked("summarizing", 2.0, 2.0).is_some());
    }

    #[test]
    fn payload_contains_only_phase_and_counts() {
        let value =
            serde_json::to_value(OnboardingScanProgress::checked("reading", 2.0, 3.0).unwrap())
                .unwrap();
        assert_eq!(
            value,
            serde_json::json!({ "phase": "reading", "processedFiles": 2.0, "totalFiles": 3.0 })
        );
    }
}
