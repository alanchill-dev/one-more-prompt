import { ArrowsHorizontal, ArrowsVertical, CursorClick } from "@phosphor-icons/react"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { resolvedPaletteSurfaceColor } from "@/lib/model-colors"
import { useI18n } from "@/hooks/use-i18n"
import { PromptUsageHelpDialog } from "./prompt-usage-help-dialog"
import "./prompt-usage-timeline-help.css"

export function TimelineHelp() {
  const t = useI18n()
  const dark = useDarkMode()
  const palette = useAppPreferencesStore(state => state.modelColors)
  const colors = [0, 1, 2].map(slot => resolvedPaletteSurfaceColor(slot, palette, dark ? "dark" : "light"))
  const meanings = [
    { key: "promptUsage.timelineHelpTime", art: <><path d="M6 42h64 M18 37v10 M58 37v10" /><path className="legend-mark" d="M38 17v25" /><text x="38" y="58">10:00</text></> },
    { key: "promptUsage.timelineHelpHeight", art: <><path d="M6 48h64" /><path className="legend-mark" d="M18 37v11 M38 25v23 M58 12v36" /></> },
    { key: "promptUsage.timelineHelpCount", art: <><path d="M6 48h64" /><rect className="timeline-help-count-badge" x="26" y="21" width="24" height="27" rx="3" stroke="currentColor" strokeWidth="1.5" /><text x="38" y="38">3</text></> },
    { key: "promptUsage.timelineHelpColor", art: <>{colors.map((color, index) => <path key={index} stroke={color} strokeWidth="5" d={`M${14 + index * 18} 18v30`} />)}<path stroke="var(--muted-foreground)" strokeWidth="5" d="M68 18v30" /></> },
  ] as const
  const instructions = [
    { Icon: ArrowsHorizontal, title: t("promptUsage.timelineHelpNavigateTitle"), body: t("promptUsage.timelineHelpNavigate") },
    { Icon: ArrowsVertical, title: t("promptUsage.timelineHelpBrowseTitle"), body: t("promptUsage.timelineHelpBrowse") },
    { Icon: CursorClick, title: t("promptUsage.timelineHelpFocusTitle"), body: t("promptUsage.timelineHelpFocus") },
  ]
  return <PromptUsageHelpDialog title={t("promptUsage.timelineHelpTitle")} closeLabel={t("promptUsage.timelineHelpClose")} testId="timeline-help" panelClassName="timeline-help-dialog">
          <figure className="timeline-help-figure">
            <svg viewBox="0 0 300 110" aria-hidden="true" focusable="false">
              <rect className="timeline-help-rail" x="1" y="3" width="298" height="16" rx="4" />
              <path className="timeline-help-overview-bars" d="M20 6v10 M24 6v10 M44 6v10 M67 6v10 M72 6v10 M104 6v10 M122 6v10 M136 6v10 M180 6v10 M190 6v10 M223 6v10 M245 6v10 M258 6v10 M278 6v10" />
              <rect className="timeline-help-window" x="96" y="2" width="80" height="18" rx="4" />
              <path className="timeline-help-resize" data-edge="start" d="M98 7v8" />
              <path className="timeline-help-resize" data-edge="end" d="M174 7v8" />
              <g className="timeline-help-grip">
                <rect x="100" y="24" width="72" height="18" rx="9" />
                <path d="M108 29v8 M164 29v8" />
                <text x="136" y="36">{t("promptUsage.visibleHours", { count: 6 })}</text>
              </g>
              <path className="timeline-help-grid" d="M33 52v47 M110 52v47 M187 52v47 M264 52v47 M14 99h272" />
              <rect className="timeline-help-count-badge" x="190" y="64" width="22" height="35" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <text className="timeline-help-count-label" x="201" y="85">2</text>
              <path className="timeline-help-bars" d="M57 91v8 M100 73v26 M138 83v16 M245 80v19" />
            </svg>
            <figcaption><span className="timeline-help-window-key" aria-hidden="true" />{t("promptUsage.timelineHelpWindow")}</figcaption>
          </figure>
          <ul className="timeline-help-legend">
            {meanings.map(({ key, art }) => <li key={key}><svg viewBox="0 0 80 64" aria-hidden="true" focusable="false">{art}</svg><p>{t(key)}</p></li>)}
          </ul>
          <ul className="timeline-help-instructions">
            {instructions.map(({ Icon, title, body }) => <li key={title}>
              <Icon size={18} aria-hidden="true" />
              <div><h3>{title}</h3><p>{body}</p></div>
            </li>)}
          </ul>
  </PromptUsageHelpDialog>
}
