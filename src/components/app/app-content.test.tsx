import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { overviewPageMock, promptUsagePageMock, settingsPageMock } = vi.hoisted(() => ({
  overviewPageMock: vi.fn(),
  settingsPageMock: vi.fn(),
  promptUsagePageMock: vi.fn(),
}))

vi.mock("@/pages/overview", () => ({
  OverviewPage: (props: unknown) => {
    overviewPageMock(props)
    return <div data-testid="overview-page" />
  },
}))

vi.mock("@/pages/settings", () => ({
  SettingsPage: (props: unknown) => {
    settingsPageMock(props)
    return <div data-testid="settings-page" />
  },
}))

vi.mock("@/pages/prompt-usage", () => ({
  PromptUsagePage: (props: unknown) => {
    promptUsagePageMock(props)
    return <div data-testid="prompt-usage-page" />
  },
}))

import { AppContent, type AppContentProps } from "@/components/app/app-content"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"

function createProps(): AppContentProps {
  return {
    displayPlugins: [{
      meta: {
        id: "codex",
        name: "Codex",
        iconUrl: "/codex.svg",
        brandColor: "#000000",
        lines: [],
        primaryCandidates: [], detected: true,
      },
      data: null,
      loading: false,
      error: null,
      lastManualRefreshAt: null,
      lastUpdatedAt: null,
    }],
    windowWidth: 1_240,
    onRetryPlugin: vi.fn(),
    onAutoUpdateIntervalChange: vi.fn(),
    onThemeModeChange: vi.fn(),
    onUsageValueToggle: vi.fn(),
    onResetTimerDisplayModeToggle: vi.fn(),
    onMenubarIconStyleChange: vi.fn(),
    onMenubarMetricChange: vi.fn(),
    onGlobalShortcutChange: vi.fn(),
    onStartOnLoginChange: vi.fn(),
    onLanguageChange: vi.fn(),
    onWindowWidthChange: vi.fn(),
  }
}

describe("AppContent", () => {
  beforeEach(() => {
    overviewPageMock.mockReset()
    settingsPageMock.mockReset()
    promptUsagePageMock.mockReset()
    useAppUiStore.getState().resetState()
    useAppPreferencesStore.getState().resetState()
  })

  it("renders overview page for home view", () => {
    useAppUiStore.getState().setActiveView("home")
    render(<AppContent {...createProps()} />)

    expect(screen.getByTestId("overview-page")).toBeInTheDocument()
    expect(overviewPageMock).toHaveBeenCalledTimes(1)
  })

  it("renders settings page for settings view", async () => {
    useAppUiStore.getState().setActiveView("settings")
    render(<AppContent {...createProps()} />)

    expect(await screen.findByTestId("settings-page")).toBeInTheDocument()
    expect(settingsPageMock).toHaveBeenCalledTimes(1)
  })

  it("exposes Dual Line settings only for real account Session and Weekly windows", async () => {
    const props = createProps()
    props.displayPlugins[0]!.meta.primaryCandidates = ["Session", "Weekly"]
    props.displayPlugins[0]!.meta.weeklyCandidate = "Weekly"
    props.displayPlugins[0]!.data = {
      providerId: "codex",
      displayName: "Codex",
      iconUrl: "",
      lines: [
        { type: "progress", label: "Session", used: 28, limit: 100 },
        { type: "progress", label: "Weekly", used: 9, limit: 100 },
      ],
    }
    useAppUiStore.getState().setActiveView("settings")
    render(<AppContent {...props} />)

    await screen.findByTestId("settings-page")
    expect(settingsPageMock).toHaveBeenCalledWith(expect.objectContaining({
      dualQuotaAvailable: true,
    }))
  })

  it("supplies the existing Codex retry action to Prompt Usage", async () => {
    const props = createProps()
    useAppUiStore.getState().setActiveView("prompt-usage")
    render(<AppContent {...props} />)

    expect(await screen.findByTestId("prompt-usage-page")).toBeInTheDocument()

    expect(promptUsagePageMock).toHaveBeenCalledWith(expect.objectContaining({
      plugin: expect.objectContaining({ meta: expect.objectContaining({ id: "codex" }) }),
      onRetryPlugin: props.onRetryPlugin,
    }))
  })

  it("keeps Prompt Usage mounted while another page is visible", async () => {
    useAppUiStore.getState().setActiveView("prompt-usage")
    render(<AppContent {...createProps()} />)

    const promptPage = await screen.findByTestId("prompt-usage-page")
    fireEvent.scroll(promptPage, { target: { scrollTop: 240 } })

    act(() => useAppUiStore.getState().setActiveView("home"))

    expect(screen.getByTestId("prompt-usage-view")).toHaveClass("hidden")
    expect(screen.getByTestId("prompt-usage-page")).toBe(promptPage)
    expect(screen.getByTestId("overview-page")).toBeInTheDocument()

    act(() => useAppUiStore.getState().setActiveView("prompt-usage"))
    expect(screen.getByTestId("prompt-usage-view")).toHaveClass("contents")
    expect(screen.getByTestId("prompt-usage-page")).toBe(promptPage)
  })

})
