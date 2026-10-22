import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}))

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tauri-apps/api/core")>(),
  invoke: tauri.invoke,
  isTauri: tauri.isTauri,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/components/notifications-section", () => ({
  NotificationsSection: ({ triggerLabel }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel ?? "Notifications"}</button>
  ),
}))

import { SettingsPage } from "@/pages/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const defaultProps = {
  autoUpdateInterval: 15 as const,
  onAutoUpdateIntervalChange: vi.fn(),
  themeMode: "system" as const,
  onThemeModeChange: vi.fn(),
  menubarIconStyle: "provider" as const,
  onMenubarIconStyleChange: vi.fn(),
  menubarMetric: "default" as const,
  onMenubarMetricChange: vi.fn(),
  globalShortcut: null,
  onGlobalShortcutChange: vi.fn(),
  startOnLogin: false,
  onStartOnLoginChange: vi.fn(),
}

afterEach(() => {
  cleanup()
  tauri.invoke.mockReset()
  tauri.isTauri.mockReset()
  tauri.isTauri.mockReturnValue(false)
  useAppPreferencesStore.getState().resetState()
  vi.restoreAllMocks()
})

describe("SettingsPage", () => {
  it("renders only Codex-focused product settings", () => {
    render(<SettingsPage {...defaultProps} />)

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByText("Tune how One More Prompt reads, presents, and alerts you about Codex usage.")).toBeInTheDocument()
    expect(screen.queryByText("Plugins")).not.toBeInTheDocument()
    expect(screen.queryByText("Supporter")).not.toBeInTheDocument()
    expect(screen.queryByText(/API Key/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Referral/i)).not.toBeInTheDocument()
    expect(screen.queryByText("Quick Usage Overview")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Display" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "API Equivalent Estimate" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Menu Bar & Quick Open" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument()
    expect(screen.getAllByText("Keyboard Shortcut")).toHaveLength(1)
    expect(screen.queryByText("Usage Display")).not.toBeInTheDocument()
    expect(screen.queryByText("Reset Timers")).not.toBeInTheDocument()
    expect(screen.queryByText("Time Format")).not.toBeInTheDocument()
  })

  it("changes the display currency while USD remains the default", async () => {
    const user = userEvent.setup()
    render(<SettingsPage {...defaultProps} />)

    const currency = screen.getByRole("combobox", { name: "Display Currency" })
    expect(currency.tagName).toBe("BUTTON")
    expect(currency).toHaveTextContent("USD")
    await user.click(currency)
    await user.click(await screen.findByRole("option", { name: /TWD/ }))
    expect(currency).toHaveTextContent("TWD")
    expect(useAppPreferencesStore.getState().displayCurrency).toBe("TWD")
    expect(screen.getByTestId("settings-pricing-status-bar")).toBeInTheDocument()
  })

  it("presents the Codex model menu, a static rate ledger, and detailed pricing information", async () => {
    const user = userEvent.setup()
    tauri.isTauri.mockReturnValue(true)
    tauri.invoke.mockImplementation((command: string) => {
      if (command === "get_exchange_rates") {
        return Promise.resolve([{ code: "USD", rate: 1, date: null, source: "USD Base", status: "base" }])
      }
      if (command === "get_pricing_catalog") {
        return Promise.resolve({
          source: "embedded",
          sourceUrl: "bundled",
          observedAt: "2026-08-31T12:00:00Z",
          estimationStatus: "current_rate",
          modelSource: "codex_cache",
          models: [
            ["gpt-5.6-sol", "GPT-5.6-Sol"],
            ["gpt-5.6-terra", "GPT-5.6-Terra"],
            ["gpt-5.6-luna", "GPT-5.6-Luna"],
            ["gpt-5.5", "GPT-5.5"],
            ["gpt-5.4", "GPT-5.4"],
            ["gpt-5.4-mini", "GPT-5.4-Mini"],
            ["gpt-5.3-codex-spark", "GPT-5.3-Codex-Spark"],
          ].map(([model, displayName]) => ({ model, displayName, input: 1.25, cacheRead: 0.125, cacheWrite: 1.5, output: 10 })),
        })
      }
      return Promise.resolve(undefined)
    })

    render(<SettingsPage {...defaultProps} />)

    const model = await screen.findByRole("combobox", { name: "Model Pricing" })
    expect(model.tagName).toBe("BUTTON")
    expect(model).toHaveTextContent("5.6 Sol")
    await user.click(model)
    const modelList = await screen.findByRole("listbox")
    expect(within(modelList).getAllByRole("option").map((option) => option.textContent?.replace(/Codex$/, "").trim())).toEqual([
      "5.6 Sol",
      "5.6 Terra",
      "5.6 Luna",
      "5.5",
      "5.4",
      "5.4 Mini",
      "5.3 Codex Spark",
    ])
    const matrix = screen.getByTestId("settings-pricing-matrix")
    expect(within(matrix).getByText("Input")).toBeInTheDocument()
    expect(within(matrix).getByText("Cached Input")).toBeInTheDocument()
    expect(within(matrix).getByText("Cache Write")).toBeInTheDocument()
    expect(within(matrix).getByText("Output")).toBeInTheDocument()
    expect(matrix).not.toHaveClass("rounded-[12px]", "bg-border/60")
    expect(screen.getByTestId("settings-pricing-status-bar")).toHaveTextContent("Current Rate Estimate")
    const details = screen.getByTestId("settings-pricing-details")
    expect(details).toHaveTextContent("Model ListCurrent Codex Menu")
    expect(details).toHaveTextContent("Price SourceBundled Snapshot")
    expect(details).toHaveTextContent("Exchange RateUSD Base, No Conversion")
    expect(screen.getByText(/If an update fails, One More Prompt keeps the last usable price/)).toBeInTheDocument()
  })

  it("updates core Codex display preferences", async () => {
    const onRefresh = vi.fn()
    const onTheme = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onAutoUpdateIntervalChange={onRefresh}
        onThemeModeChange={onTheme}
      />
    )

    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Auto-update interval" })).getByRole("radio", { name: "30 min" }))
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Theme mode" })).getByRole("radio", { name: "Dark" }))

    expect(onRefresh).toHaveBeenCalledWith(30)
    expect(onTheme).toHaveBeenCalledWith("dark")
  })

  it("owns the scheduled refresh countdown and app version in General and Support", async () => {
    const onRefreshAll = vi.fn()
    const onShowAbout = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        autoUpdateNextAt={Date.now() + 300_000}
        onRefreshAll={onRefreshAll}
        appVersion="0.8.0"
        onShowAbout={onShowAbout}
      />
    )

    expect(screen.getByText(/Next update in/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Next update in/ }))
    await userEvent.click(screen.getByRole("button", { name: "One More Prompt 0.8.0" }))

    expect(onRefreshAll).toHaveBeenCalledTimes(1)
    expect(onShowAbout).toHaveBeenCalledTimes(1)
  })

  it("removes multi-provider menu bar controls", () => {
    render(<SettingsPage {...defaultProps} />)

    const group = screen.getByRole("radiogroup", { name: "Menubar icon style" })
    expect(within(group).queryByRole("radio", { name: /Multi/ })).not.toBeInTheDocument()
    expect(within(group).getAllByRole("radio")).toHaveLength(3)
  })

  it("offers and selects Dual Line only when both account windows exist", () => {
    const { rerender } = render(
      <SettingsPage {...defaultProps} menubarIconStyle="dual" dualQuotaAvailable />
    )

    let group = screen.getByRole("radiogroup", { name: "Menubar icon style" })
    expect(within(group).getByRole("radio", { name: "Dual Line" })).toHaveAttribute("aria-checked", "true")
    expect(within(group).getAllByRole("radio")).toHaveLength(4)
    expect(screen.queryByRole("radiogroup", { name: "Menubar metric" })).not.toBeInTheDocument()

    rerender(<SettingsPage {...defaultProps} menubarIconStyle="dual" dualQuotaAvailable={false} />)
    group = screen.getByRole("radiogroup", { name: "Menubar icon style" })
    expect(within(group).queryByRole("radio", { name: "Dual Line" })).not.toBeInTheDocument()
    expect(within(group).getByRole("radio", { name: "Codex" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radiogroup", { name: "Menubar metric" })).toBeInTheDocument()
  })

  it.each(["provider", "dual", "multi"] as const)("shows stored Windows %s as one Numbers choice without rewriting the preference", async (menubarIconStyle) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    const onIconChange = vi.fn()
    const onMetricChange = vi.fn()
    render(<SettingsPage {...defaultProps} menubarIconStyle={menubarIconStyle} dualQuotaAvailable onMenubarIconStyleChange={onIconChange} onMenubarMetricChange={onMetricChange} />)

    const styles = screen.getByRole("radiogroup", { name: "Menubar icon style" })
    expect(within(styles).getAllByRole("radio").map((option) => option.textContent)).toEqual(["Numbers", "Donut", "Bars"])
    expect(within(styles).getByRole("radio", { name: "Numbers" })).toHaveAttribute("aria-checked", "true")
    expect(onIconChange).not.toHaveBeenCalled()
    expect(screen.getByText("Windows uses a square icon. Numbers shows the primary quota; hover to see both account limits.")).toBeInTheDocument()

    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Menubar metric" })).getByRole("radio", { name: "Weekly" }))
    expect(onMetricChange).toHaveBeenCalledWith("weekly")
    await userEvent.click(within(styles).getByRole("radio", { name: "Numbers" }))
    expect(onIconChange).toHaveBeenCalledWith("provider")
  })

  it.each(["bars", "donut"] as const)("preserves the selected Windows %s style and its primary metric control", (menubarIconStyle) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    render(<SettingsPage {...defaultProps} menubarIconStyle={menubarIconStyle} dualQuotaAvailable />)
    const styles = screen.getByRole("radiogroup", { name: "Menubar icon style" })
    expect(within(styles).getByRole("radio", { name: menubarIconStyle === "bars" ? "Bars" : "Donut" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radiogroup", { name: "Menubar metric" })).toBeInTheDocument()
  })

  it("localizes the Windows Numbers choice without exposing a second numeric mode", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    useAppPreferencesStore.getState().setLanguage("zh-TW")
    render(<SettingsPage {...defaultProps} language="zh-TW" menubarIconStyle="dual" dualQuotaAvailable />)
    const styles = screen.getByRole("radiogroup", { name: "選單列圖示樣式" })
    expect(within(styles).getByRole("radio", { name: "數字" })).toHaveAttribute("aria-checked", "true")
    expect(within(styles).queryByRole("radio", { name: "雙行" })).not.toBeInTheDocument()
  })

  it("keeps startup and folds the required diagnostics under Troubleshooting", async () => {
    const onStartOnLoginChange = vi.fn()
    render(<SettingsPage {...defaultProps} onStartOnLoginChange={onStartOnLoginChange} />)

    await userEvent.click(screen.getByRole("checkbox", { name: "Start on login" }))
    expect(onStartOnLoginChange).toHaveBeenCalledWith(true)

    const troubleshootingSummary = screen.getByText("Troubleshooting").closest("summary")
    expect(troubleshootingSummary).not.toBeNull()
    await userEvent.click(troubleshootingSummary!)

    expect(screen.queryByRole("checkbox", { name: "Get Beta Updates" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start Diagnostic Logging" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Log Location" })).toBeInTheDocument()
    expect(screen.queryByText("Show Stats")).not.toBeInTheDocument()
    expect(screen.queryByText("About One More Prompt")).not.toBeInTheDocument()
    expect(screen.getByText("Operation Guide")).toBeInTheDocument()
    expect(screen.getByText("Codex Check")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Replay Guide" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Recheck Codex" })).toBeInTheDocument()
    expect(screen.queryByText("Quit One More Prompt")).not.toBeInTheDocument()
  })

  it("switches language and exposes exactly three fixed window width presets", async () => {
    const onLanguageChange = vi.fn()
    const onWindowWidthChange = vi.fn()
    const { rerender } = render(
      <SettingsPage
        {...defaultProps}
        language="en"
        onLanguageChange={onLanguageChange}
        windowWidth={1240}
        onWindowWidthChange={onWindowWidthChange}
      />
    )

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Language" }),
      "zh-TW",
    )
    const widthGroup = screen.getByRole("radiogroup", { name: "Window width" })
    expect(within(widthGroup).getAllByRole("radio")).toHaveLength(3)
    expect(within(widthGroup).getByRole("radio", { name: /Compact.*980 px/ })).toBeInTheDocument()
    expect(within(widthGroup).getByRole("radio", { name: /Comfortable.*1240 px/ })).toHaveAttribute("aria-checked", "true")
    expect(within(widthGroup).getByRole("radio", { name: /Wide.*1440 px/ })).toBeInTheDocument()
    await userEvent.click(within(widthGroup).getByRole("radio", { name: /Wide.*1440 px/ }))

    expect(onLanguageChange).toHaveBeenCalledWith("zh-TW")
    expect(onWindowWidthChange).toHaveBeenCalledWith(1440)

    rerender(
      <SettingsPage
        {...defaultProps}
        language="en"
        windowWidth={980}
        onWindowWidthChange={onWindowWidthChange}
      />
    )
    expect(screen.getByRole("radio", { name: /Compact.*980 px/ })).toHaveAttribute("aria-checked", "true")
  })

  it("renders the Settings surface in Traditional Chinese immediately", () => {
    useAppPreferencesStore.getState().setLanguage("zh-TW")
    render(<SettingsPage {...defaultProps} language="zh-TW" />)

    expect(screen.getByRole("heading", { name: "設定" })).toBeInTheDocument()
    expect(screen.getByText("視窗寬度")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "一般" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "選單列與快速開啟" })).toBeInTheDocument()
    expect(screen.getByText("疑難排解")).toBeInTheDocument()
  })
})
