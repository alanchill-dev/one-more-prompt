import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppShell } from "./app-shell"
import type { AppContentActionProps } from "./app-content"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import { useAppUiStore } from "@/stores/app-ui-store"

const state = vi.hoisted(() => ({ dismiss: vi.fn(), retry: vi.fn(), pending: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }))
vi.mock("@/lib/settings", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/settings")>()),
  loadOnboardingGuidePending: state.pending,
  loadAppLanguage: async () => "en",
  loadOnboardingGuideRequired: async () => true,
  dismissOnboardingGuide: state.dismiss,
}))
vi.mock("@/hooks/app/use-panel", async () => {
  const { useRef } = await import("react")
  return { usePanel: () => ({
    containerRef: useRef(null), scrollContainerRef: useRef(null),
    panelWidth: 640, setPanelWidth: vi.fn(), isPinned: false, setPanelPinned: vi.fn(),
  }) }
})
vi.mock("@/hooks/app/use-app-version", () => ({ useAppVersion: () => "1.0.0" }))
vi.mock("@/hooks/app/use-workspace-page-motion", () => ({ useWorkspacePageMotion: vi.fn() }))
vi.mock("@/components/window-resize-handles", () => ({ WindowResizeHandles: () => null }))
vi.mock("@/components/prompt-usage-drilldown-transition", () => ({ PromptUsageDrilldownTransitionLayer: () => null }))
vi.mock("@/components/about-dialog", () => ({ AboutDialog: () => null }))
vi.mock("@/components/side-nav", () => ({
  TopHeader: () => <header data-testid="top-header" />,
  isActiveView: (value: unknown) => ["home", "prompt-usage", "settings"].includes(String(value)),
}))
vi.mock("./app-content", () => ({ AppContent: () => <div>Ready For Your First Codex Session</div> }))

function codex(overrides: Partial<DisplayPluginState> = {}): DisplayPluginState {
  return {
    meta: { id: "codex", name: "Codex", iconUrl: "/codex.svg", brandColor: "#000000", lines: [], primaryCandidates: [], detected: true },
    data: null, loading: false, error: null, lastManualRefreshAt: null, lastUpdatedAt: null,
    ...overrides,
  }
}

const actions: AppContentActionProps = {
  onRetryPlugin: state.retry,
  onAutoUpdateIntervalChange: vi.fn(), onThemeModeChange: vi.fn(), onUsageValueToggle: vi.fn(),
  onResetTimerDisplayModeToggle: vi.fn(), onMenubarIconStyleChange: vi.fn(), onMenubarMetricChange: vi.fn(),
  onGlobalShortcutChange: vi.fn(), onStartOnLoginChange: vi.fn(), onLanguageChange: vi.fn(),
}

function shell(displayPlugins: DisplayPluginState[]) {
  return <AppShell displayPlugins={displayPlugins} appContentProps={actions} onRefreshAll={vi.fn()} autoUpdateNextAt={null} />
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const height = this.classList.contains("contextual-guide-dock") ? 240 : this.tagName === "HEADER" ? 60 : 680
    return { left: 0, top: 0, right: 640, bottom: height, width: 640, height, x: 0, y: 0, toJSON: () => ({}) }
  })
  useAppUiStore.getState().resetState()
  state.dismiss.mockReset().mockResolvedValue(undefined)
  state.retry.mockReset()
  state.pending.mockReset().mockResolvedValue(true)
})

afterEach(() => { vi.restoreAllMocks() })

describe("AppShell isolated demo guide", () => {
  it("uses flush pane geometry only for Projects and preserves the Timeline gutter", async () => {
    state.pending.mockResolvedValue(false)
    const view = render(shell([codex()]))
    const main = view.container.querySelector<HTMLElement>(".app-main-surface")!
    const scroll = main.firstElementChild!
    expect(main).toHaveAttribute("data-active-view", "home")
    expect(main).toHaveClass("px-3", "sm:px-4")
    expect(scroll).toHaveClass("overflow-y-auto")

    await act(async () => useAppUiStore.setState({ activeView: "prompt-usage", promptUsageViewMode: "hierarchy" }))
    expect(main).toHaveAttribute("data-active-view", "prompt-usage")
    expect(main).toHaveAttribute("data-prompt-usage-view-mode", "hierarchy")
    expect(main).toHaveClass("p-0")
    expect(main).not.toHaveClass("px-3")
    expect(scroll).toHaveClass("overflow-hidden")
    expect(scroll).not.toHaveClass("-ml-3", "pl-3")

    await act(async () => useAppUiStore.setState({ promptUsageViewMode: "timeline" }))
    expect(main).toHaveAttribute("data-prompt-usage-view-mode", "timeline")
    expect(main).toHaveClass("p-0")
    expect(main).not.toHaveClass("px-3", "sm:px-4")
    expect(scroll).toHaveClass("overflow-hidden")
    expect(scroll).not.toHaveClass("-ml-3", "pl-3", "sm:-ml-4", "sm:pl-4")

    await act(async () => useAppUiStore.setState({ activeView: "settings" }))
    expect(main).toHaveAttribute("data-active-view", "settings")
    expect(main).toHaveClass("px-3", "sm:px-4")
    expect(scroll).toHaveClass("overflow-y-auto")
    expect(scroll).not.toHaveClass("-ml-3", "pl-3")
  })

  it.each([
    ["missing plugin", []],
    ["settled idle plugin", [codex()]],
    ["loading request", [codex({ loading: true })]],
    ["unreadable records", [codex({ error: "Local records unreadable" })]],
  ] as const)("offers the complete demo guide for %s without touching the route", async (_name, plugins) => {
    useAppUiStore.setState({ activeView: "settings" })
    render(shell([...plugins]))
    expect(await screen.findByTestId("contextual-guide")).toBeInTheDocument()
    expect(useAppUiStore.getState().activeView).toBe("settings")
    expect(screen.getByText("Ready For Your First Codex Session")).toBeInTheDocument()
    expect(state.dismiss).not.toHaveBeenCalled()
  })
})
