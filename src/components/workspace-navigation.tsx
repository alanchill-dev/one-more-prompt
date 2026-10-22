import { ChartBar, Clock, FolderSimple } from "@phosphor-icons/react"
import { useId, useRef, type KeyboardEvent } from "react"
import { useI18n } from "@/hooks/use-i18n"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

export function WorkspaceNavigation({ activeIndex, onNavigate }: {
  activeIndex: number
  onNavigate: (index: number) => void
}) {
  const t = useI18n()
  const language = useAppPreferencesStore((state) => state.language)
  const descriptionId = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const items = [
    { label: t("nav.overview"), purpose: t("nav.overviewPurpose"), icon: ChartBar },
    { label: t("nav.projects"), purpose: t("nav.projectsPurpose"), icon: FolderSimple },
    { label: t("promptUsage.viewTimeline"), purpose: t("nav.timelinePurpose"), icon: Clock },
  ]

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % items.length
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + items.length - 1) % items.length
    if (event.key === "Home") next = 0
    if (event.key === "End") next = items.length - 1
    if (next !== null) {
      event.preventDefault()
      buttons.current[next]?.focus()
    }
  }

  return (
    <div className="workspace-navigation" lang={language} data-testid="top-header-primary-region">
      <div className="workspace-switcher" data-testid="top-header-primary-nav" role="group" aria-label={t("nav.primaryDestinations")}>
        <span className="workspace-selection" aria-hidden="true" data-visible={activeIndex >= 0}
          style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}>
          <span className="workspace-selection-surface" />
        </span>
        {items.map(({ label, purpose, icon: Icon }, index) => (
          <button key={index} ref={(node) => { buttons.current[index] = node }} type="button" className="workspace-destination"
            data-workspace-destination={index === 0 ? "overview" : index === 1 ? "hierarchy" : "timeline"}
            aria-label={label} aria-describedby={`${descriptionId}-${index}`} title={purpose}
            aria-current={activeIndex === index ? "page" : undefined}
            onClick={() => { if (index !== activeIndex) onNavigate(index) }}
            onKeyDown={(event) => moveFocus(event, index)}>
            <span className="workspace-destination-symbol" aria-hidden="true">
              <Icon size={20} weight="regular" aria-hidden="true" />
            </span>
            <span className="workspace-destination-copy">
              <span className="workspace-destination-name">{label}</span>
              <span className="sr-only" id={`${descriptionId}-${index}`}>{purpose}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
