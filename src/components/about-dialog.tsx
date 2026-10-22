import { useEffect } from "react";
import { X } from "@phosphor-icons/react";
import { Logo } from "./logo";
import { useI18n } from "@/hooks/use-i18n";

interface AboutDialogProps {
  version: string;
  onClose: () => void;
}

export function AboutDialog({ version, onClose }: AboutDialogProps) {
  const t = useI18n();
  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close when panel hides (loses visibility)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        onClose();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-one-more-prompt-title"
      className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-black/55 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-border/70 bg-card p-6 text-left shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          autoFocus
          aria-label={t("about.close")}
          onClick={onClose}
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <div className="mb-5 flex items-center gap-3 pr-8">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-border/65 bg-muted/55">
            <Logo className="size-7 text-foreground" />
          </div>
          <div className="min-w-0">
            <h2 id="about-one-more-prompt-title" className="truncate text-lg font-semibold tracking-tight">
              {t("about.title")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("about.version", { version })}</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("about.description")}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border/60 bg-muted/35 p-3">
            <p className="font-medium text-foreground">{t("about.localFirst")}</p>
            <p className="mt-1 text-muted-foreground">{t("about.localFirstDescription")}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/35 p-3">
            <p className="font-medium text-foreground">{t("about.codexOnly")}</p>
            <p className="mt-1 text-muted-foreground">{t("about.codexOnlyDescription")}</p>
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          {t("about.attribution")}
        </p>
      </div>
    </div>
  );
}
