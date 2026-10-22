import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TopHeader, type ActiveView } from "./side-nav"
import { UsageTrendExplorer } from "./usage-trend-explorer"
import { localDateKey } from "./usage-trend-utils"
import { WorkspaceNavigation } from "./workspace-navigation"
import { APP_LANGUAGES, createTranslator } from "@/lib/i18n"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const today = new Date()
const points = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29 + index)
  return { label: `${date.getMonth() + 1}/${date.getDate()}`, date: localDateKey(date), value: (index + 1) * 100,
    valueLabel: `${(index + 1) * 100} tokens`, modelUsage: [{ name: "Example Model", tokens: (index + 1) * 100 }] }
})
const loadHourly = vi.fn(async () => [])

function Harness() {
  const [view, setView] = useState<ActiveView>("home")
  const [mode, setMode] = useState<"hierarchy" | "timeline">("hierarchy")
  return <div>
    <TopHeader activeView={view} onViewChange={setView} promptUsageViewMode={mode} onPromptUsageViewModeChange={setMode} />
    <UsageTrendExplorer label="Usage Trend" points={points} hourlyPoints={[]} loadHistoricalHourly={loadHourly} />
    <output data-testid="active-route">{view}:{mode}</output>
  </div>
}

beforeEach(() => useAppPreferencesStore.getState().resetState())
afterEach(() => { useAppPreferencesStore.getState().resetState(); vi.restoreAllMocks() })

describe("workspace navigation", () => {
  it("updates the active destination without remounting controls or calling routing again", () => {
    const onNavigate = vi.fn()
    const { rerender } = render(<WorkspaceNavigation activeIndex={0} onNavigate={onNavigate} />)
    const overview = screen.getByRole("button", { name: "Overview" })
    const timeline = screen.getByRole("button", { name: "Timeline" })
    rerender(<WorkspaceNavigation activeIndex={2} onNavigate={onNavigate} />)
    expect(screen.getByRole("button", { name: "Overview" })).toBe(overview)
    expect(screen.getByRole("button", { name: "Timeline" })).toBe(timeline)
    expect(timeline).toHaveAttribute("aria-current", "page")
    fireEvent.click(timeline)
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(overview)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(0)
  })

  it("leaves every workspace unselected on Settings", () => {
    const { container, rerender } = render(<WorkspaceNavigation activeIndex={0} onNavigate={vi.fn()} />)
    const selection = container.querySelector(".workspace-selection")
    rerender(<WorkspaceNavigation activeIndex={2} onNavigate={vi.fn()} />)
    expect(container.querySelector(".workspace-selection")).toBe(selection)
    expect(selection).toHaveStyle({ transform: "translateX(200%)" })
    rerender(<WorkspaceNavigation activeIndex={-1} onNavigate={vi.fn()} />)
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
    expect(selection).toHaveAttribute("data-visible", "false")
    expect(selection).toHaveAttribute("aria-hidden", "true")
  })

  it("keeps every route immediate and leaves selected chart dates untouched", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "14 Days" }))
    const chart = screen.getByTestId("usage-trend-daily-stacked-columns")
    for (const [label, route] of [["Projects", "prompt-usage:hierarchy"], ["Timeline", "prompt-usage:timeline"], ["Overview", "home:timeline"]]) {
      fireEvent.click(screen.getByRole("button", { name: label, exact: true }))
      expect(screen.getByTestId("active-route")).toHaveTextContent(route)
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-current", "page")
      expect(screen.getByRole("button", { name: "14 Days" })).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByTestId("usage-trend-daily-stacked-columns")).toBe(chart)
    }
  })

  it("uses arrow keys for focus, Enter for navigation, and preserves an accessible purpose", async () => {
    render(<Harness />)
    const user = userEvent.setup()
    const overview = screen.getByRole("button", { name: "Overview" })
    expect(overview).toHaveAccessibleDescription("At A Glance")
    expect(overview).toHaveAttribute("title", "At A Glance")
    overview.focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("button", { name: "Projects" })).toHaveFocus()
    expect(screen.getByTestId("active-route")).toHaveTextContent("home:hierarchy")
    await user.keyboard("{Enter}")
    expect(screen.getByTestId("active-route")).toHaveTextContent("prompt-usage:hierarchy")
    await user.keyboard("{End}")
    expect(screen.getByRole("button", { name: "Timeline" })).toHaveFocus()
    await user.keyboard(" ")
    expect(screen.getByTestId("active-route")).toHaveTextContent("prompt-usage:timeline")
  })

  it.each(APP_LANGUAGES)("localizes the destination purposes in $value", ({ value }) => {
    useAppPreferencesStore.getState().setLanguage(value)
    const t = createTranslator(value)
    render(<WorkspaceNavigation activeIndex={0} onNavigate={vi.fn()} />)
    expect(screen.getByRole("button", { name: t("nav.overview") })).toHaveAccessibleDescription(t("nav.overviewPurpose"))
    expect(screen.getByTestId("top-header-primary-region")).toHaveAttribute("lang", value)
  })

  it("keeps comparison controls out of the production navigation", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
    expect(read("src/components/app/app-shell.tsx")).not.toContain("DesignPreview")
    expect(read("src/components/workspace-navigation.tsx")).not.toMatch(/design-preview|Popover|data-design/)
    const css = read("src/components/top-header.css")
    expect(css).not.toContain("prefers-reduced-motion")
    expect(css).not.toMatch(/data-design|workspace-view-popup/)
  })
})

describe("preset shortcuts and independent custom dates", () => {
  it("retains presets, custom dates, source hiding, and Escape focus restoration", async () => {
    render(<Harness />)
    for (const label of ["Today", "7 Days", "14 Days", "30 Days"]) {
      fireEvent.click(screen.getByRole("button", { name: label }))
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true")
    }
    const presets = screen.getByTestId("usage-trend-range-row")
    expect(presets.querySelectorAll(".trend-period-tick")).toHaveLength(0)
    expect(screen.getByTestId("usage-trend-range-thumb")).toBeInTheDocument()
    expect(within(presets).getAllByRole("button")).toHaveLength(5)
    const track = screen.getByTestId("usage-trend-preset-track")
    expect(within(track).getAllByRole("button")).toHaveLength(4)
    const custom = screen.getByRole("button", { name: "Custom" })
    expect(track).not.toContainElement(custom)
    vi.spyOn(custom, "getBoundingClientRect").mockReturnValue(new DOMRect(710, 140, 112, 52))
    fireEvent.click(custom)
    expect(screen.getByRole("dialog", { name: "Custom Usage" })).toBeInTheDocument()
    const morph = screen.getByTestId("usage-trend-date-picker-shared-morph")
    for (const [key, value] of Object.entries({ left: "710px", top: "140px", width: "112px", height: "52px", radius: "9px", background: "transparent", border: "var(--border)" })) {
      expect(morph.style.getPropertyValue(`--shared-source-${key}`)).toBe(value)
    }
    expect(morph.style.getPropertyValue("--shared-destination-radius")).toBe("var(--radius-xl)")
    const sourceVisual = morph.querySelector(".shared-element-morph-source-visual")!
    expect(sourceVisual).toHaveTextContent("Custom")
    expect(sourceVisual.querySelector("svg")).toHaveAttribute("width", "18")
    expect(sourceVisual.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    expect(sourceVisual.querySelector("svg")?.innerHTML).toBe(custom.querySelector("svg")?.innerHTML)
    expect(custom).toHaveClass("opacity-0")
    expect(screen.getByTestId("usage-trend-range-thumb")).toHaveClass("opacity-0")
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Custom Usage" }), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Custom Usage" })).not.toBeInTheDocument())
    await waitFor(() => expect(custom).not.toHaveClass("opacity-0"))
    expect(custom).toHaveFocus()
    expect(screen.getByTestId("usage-trend-range-thumb")).not.toHaveClass("opacity-0")
    expect(screen.getByRole("button", { name: "30 Days" })).toHaveAttribute("aria-pressed", "true")
  })

  it("moves keyboard focus across the preset/custom boundary without changing selection", async () => {
    render(<Harness />)
    const user = userEvent.setup()
    const custom = screen.getByRole("button", { name: "Custom" })
    const todayButton = screen.getByRole("button", { name: "Today" })
    const lastPreset = screen.getByRole("button", { name: "30 Days" })
    lastPreset.focus()
    await user.keyboard("{ArrowRight}")
    expect(custom).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(todayButton).toHaveFocus()
    expect(todayButton).toHaveAttribute("aria-pressed", "true")
    expect(lastPreset).toHaveAttribute("aria-pressed", "false")
    await user.keyboard("{End}")
    expect(custom).toHaveFocus()
    await user.keyboard("{Home}")
    expect(todayButton).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(todayButton).toHaveAttribute("aria-pressed", "true")
  })

  it("keeps the custom selection separate until a preset is selected again", async () => {
    render(<Harness />)
    const custom = screen.getByRole("button", { name: "Custom" })
    fireEvent.click(custom)
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    fireEvent.click(screen.getByRole("gridcell", { name: `Select ${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}` }))
    await waitFor(() => expect(custom).not.toHaveClass("opacity-0"))
    expect(custom).toHaveAttribute("aria-pressed", "true")
    expect(custom).toHaveFocus()
    expect(screen.getByTestId("usage-trend-range-thumb")).toHaveClass("opacity-0")
    for (const button of within(screen.getByTestId("usage-trend-preset-track")).getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-pressed", "false")
    }
    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    expect(custom).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("usage-trend-range-thumb")).not.toHaveClass("opacity-0")
  })

  it("keeps Today and Custom reachable when daily history is absent", async () => {
    render(<UsageTrendExplorer label="Usage Trend" points={[]} hourlyPoints={[]} loadHistoricalHourly={loadHourly} />)
    const track = screen.getByTestId("usage-trend-preset-track")
    expect(within(track).getAllByRole("button")).toHaveLength(1)
    const todayButton = within(track).getByRole("button", { name: "Today" })
    expect(todayButton).toHaveAttribute("aria-pressed", "true")
    todayButton.focus()
    await userEvent.keyboard("{ArrowRight}")
    expect(screen.getByRole("button", { name: "Custom" })).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    expect(todayButton).toHaveFocus()
  })

  it("preserves the date console without changing the workspace navigation", () => {
    render(<Harness />)
    expect(screen.getByTestId("usage-trend-control-stack")).toHaveClass("border-l", "pl-7")
    expect(screen.getByTestId("usage-trend-control-console")).toHaveClass("h-[3.25rem]")
    expect(screen.queryByTestId("usage-trend-period-dates")).not.toBeInTheDocument()
    const thumb = screen.getByTestId("usage-trend-range-thumb")
    const overview = screen.getByRole("button", { name: "Overview" })
    for (const [index, label] of ["Today", "7 Days", "14 Days", "30 Days"].entries()) {
      fireEvent.click(screen.getByRole("button", { name: label }))
      expect(thumb.style.transform).toBe(`translateX(${index * 100}%)`)
      expect(screen.getByRole("button", { name: "Overview" })).toBe(overview)
      expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page")
    }
  })
})
