import { useI18n } from "@/hooks/use-i18n"
import { PromptUsageHelpDialog } from "./prompt-usage-help-dialog"

export function PromptUsageTimeHelp() {
  const t = useI18n()
  return <PromptUsageHelpDialog title={t("promptUsage.timeHelpTitle")} closeLabel={t("promptUsage.timeHelpClose")} testId="prompt-time-help">
    <p className="prompt-time-intro">{t("promptUsage.timeHelpIntro")}</p>
    <figure className="prompt-time-figure">
      <svg viewBox="0 0 440 140" role="img" aria-label={t("promptUsage.timeHelpDiagram")}>
        <rect className="time-overlap" x="178" y="20" width="72" height="80" />
        <text x="6" y="44">Prompt 1</text><text x="6" y="87">Prompt 2</text>
        <rect className="time-interval" x="106" y="31" width="144" height="15" rx="3" />
        <rect className="time-interval-second" x="178" y="74" width="216" height="15" rx="3" />
        <text x="178" y="24" textAnchor="middle">{t("promptUsage.timeHelpMinutes", { count: 2 })}</text>
        <text x="286" y="67" textAnchor="middle">{t("promptUsage.timeHelpMinutes", { count: 3 })}</text>
        <path className="time-axis" d="M106 111h288" />
        {[0, 1, 2, 3, 4].map(index => <g key={index}>
          <path className="time-axis" d={`M${106 + index * 72} 108v7`} />
          <text x={106 + index * 72} y="132" textAnchor="middle">{t("promptUsage.timeHelpMinutes", { count: index })}</text>
        </g>)}
      </svg>
      <figcaption>{t("promptUsage.timeHelpEquation")}</figcaption>
    </figure>
    <p className="prompt-time-emphasis">{t("promptUsage.timeHelpEmphasis")}</p>
    <section className="prompt-time-detail"><h3>{t("promptUsage.timeHelpCoverageTitle")}</h3><p>{t("promptUsage.timeHelpCoverageBody")}</p></section>
    <p className="prompt-time-scope">{t("promptUsage.timeHelpScope")}</p>
    <p className="prompt-time-footnote">{t("promptUsage.timeHelpExampleNote")}</p>
  </PromptUsageHelpDialog>
}
