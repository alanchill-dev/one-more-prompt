import {
  Gear,
  PushPin,
  type Icon,
} from "@phosphor-icons/react"

import { Logo } from "@/components/logo"
import { AppUpdateButton } from "@/components/app-update"
import { useI18n } from "@/hooks/use-i18n"
import type { TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { WorkspaceNavigation } from "./workspace-navigation"
import "./top-header.css"

const ACTIVE_VIEWS = ["home", "prompt-usage", "settings"] as const

type ActiveView = (typeof ACTIVE_VIEWS)[number]
type HeaderPromptUsageViewMode = "hierarchy" | "timeline"

interface SideNavProps {
  activeView: ActiveView
  onViewChange: (view: ActiveView) => void
  promptUsageViewMode?: HeaderPromptUsageViewMode
  onPromptUsageViewModeChange?: (mode: HeaderPromptUsageViewMode) => void
  isCodexActive?: boolean
  isPinned?: boolean
  onPinnedChange?: (pinned: boolean) => void
  appVersion?: string
}

type NavItem = {
  view: ActiveView
  labelKey: TranslationKey
  shortcut: string
  icon: Icon
}

type LocalizedNavItem = NavItem & { label: string }

const SECONDARY_ITEMS: NavItem[] = [
  { view: "settings", labelKey: "nav.settings", shortcut: "⌘3", icon: Gear },
]

function NavButton({
  item,
  label,
  isActive,
  onClick,
  className,
}: {
  item: LocalizedNavItem
  label: string
  isActive: boolean
  onClick: () => void
  className?: string
}) {
  const ItemIcon = item.icon

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      aria-label={label}
      title={`${label} (${item.shortcut})`}
      data-active={isActive}
      className={cn(
        "header-nav-key flex h-11 min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3.5 text-left text-[13px] font-semibold outline-none sm:px-4",
        "focus-visible:outline-2 focus-visible:outline-[var(--wire-orange)] focus-visible:outline-offset-2",
        className,
      )}
    >
      <ItemIcon
        aria-hidden="true"
        className="header-nav-key-icon size-4 shrink-0"
        weight="regular"
      />
      <span className="shrink-0">{label}</span>
    </button>
  )
}

export function TopHeader({
  activeView,
  onViewChange,
  promptUsageViewMode = "hierarchy",
  onPromptUsageViewModeChange = () => {},
  isCodexActive = false,
  isPinned = false,
  onPinnedChange = () => {},
  appVersion = "",
}: SideNavProps) {
  const t = useI18n()
  const secondaryItems = SECONDARY_ITEMS.map((item) => ({ ...item, label: t(item.labelKey) }))
  const activeWorkspaceIndex = activeView === "home"
    ? 0
    : activeView === "prompt-usage"
      ? promptUsageViewMode === "timeline" ? 2 : 1
      : -1

  const openWorkspace = (index: number) => {
    if (index === 0) {
      onViewChange("home")
      return
    }
    onViewChange("prompt-usage")
    onPromptUsageViewModeChange(index === 1 ? "hierarchy" : "timeline")
  }

  return (
    <nav
      aria-label={t("nav.primary")}
      data-testid="top-header"
      data-tauri-drag-region={isPinned ? "deep" : undefined}
      className="app-header-surface relative z-20 flex min-h-[4.25rem] shrink-0 items-center border-b border-border/70 px-3 py-2.5 sm:px-4"
    >
      <div className="header-brand flex min-w-0 shrink-0 items-center gap-2.5">
        <Logo active={isCodexActive} className="size-8 shrink-0 text-foreground" />
        <p className="min-w-0 truncate text-[17px] leading-snug font-bold tracking-[-0.02em] text-foreground">{t("app.name")}</p>
      </div>

      <WorkspaceNavigation activeIndex={activeWorkspaceIndex} onNavigate={openWorkspace} />

      <div className="min-w-3 flex-1" aria-hidden="true" />

      <button
        type="button"
        onClick={() => onPinnedChange(!isPinned)}
        aria-label={t(isPinned ? "nav.unpinWindow" : "nav.pinWindow")}
        title={t(isPinned ? "nav.unpinWindow" : "nav.pinWindow")}
        aria-pressed={isPinned}
        data-active={isPinned}
        className="header-nav-key flex size-10 shrink-0 items-center justify-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--wire-orange)] focus-visible:outline-offset-2"
      >
        <PushPin
          aria-hidden="true"
          className="header-nav-key-icon size-4 shrink-0"
          weight={isPinned ? "fill" : "regular"}
        />
      </button>
      <div
        className="ml-1 flex shrink-0 items-center gap-1 border-l border-[var(--header-nav-divider)] pl-2 sm:ml-2 sm:pl-3"
        data-testid="top-header-actions"
        role="group"
        aria-label={t("nav.actions")}
      >
        <AppUpdateButton appVersion={appVersion} />
        {secondaryItems.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            label={item.label}
            isActive={activeView === item.view}
            onClick={() => onViewChange(item.view)}
          />
        ))}
      </div>
    </nav>
  )
}

/** Kept as a compatibility export for persisted imports; the UI is a top header. */
export const SideNav = TopHeader

export function isActiveView(value: unknown): value is ActiveView {
  return typeof value === "string" && (ACTIVE_VIEWS as readonly string[]).includes(value)
}

export { ACTIVE_VIEWS }
export type { ActiveView }
