import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SideNav, isActiveView } from "@/components/side-nav"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUpdateStore } from "@/stores/app-update-store"

describe("SideNav", () => {
  beforeEach(() => {
    useAppPreferencesStore.getState().resetState()
    useAppUpdateStore.setState({ result: null, checking: false, error: null, lastCheckedAt: null })
  })
  afterEach(() => {
    useAppPreferencesStore.getState().resetState()
    vi.restoreAllMocks()
  })

  it("changes only the center navigation while preserving the original header edges", () => {
    render(<SideNav activeView="home" onViewChange={vi.fn()} />)

    const header = screen.getByTestId("top-header")
    expect(header).toHaveClass(
      "app-header-surface",
      "min-h-[4.25rem]",
      "px-3",
      "py-2.5",
      "sm:px-4",
    )
    expect(header).not.toHaveClass("workspace-header")

    const brand = header.querySelector(".header-brand")
    expect(brand).not.toBeNull()
    expect(within(brand as HTMLElement).getByText("One More Prompt")).toBeInTheDocument()
    expect(within(brand as HTMLElement).queryByText("for Codex")).not.toBeInTheDocument()
    expect(brand?.querySelector("svg")).toHaveClass("size-8")

    const primary = screen.getByTestId("top-header-primary-nav")
    expect(within(primary).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Overview",
      "Projects",
      "Timeline",
    ])
    expect(screen.queryByRole("button", { name: "Prompt Usage" })).not.toBeInTheDocument()

    const pin = screen.getByRole("button", { name: "Pin Window" })
    expect(pin).toHaveClass("header-nav-key", "size-10")
    const actions = screen.getByTestId("top-header-actions")
    expect(actions).toHaveClass("border-l", "border-[var(--header-nav-divider)]")
    const settings = within(actions).getByRole("button", { name: "Settings" })
    expect(settings).toHaveClass("header-nav-key", "h-11", "min-h-11", "text-[13px]", "sm:px-4")
    expect(settings).toHaveAttribute("title", "Settings (⌘3)")
  })

  it("keeps the three workspace destinations in a dedicated centered region", () => {
    render(<SideNav activeView="home" onViewChange={vi.fn()} />)

    const region = screen.getByTestId("top-header-primary-region")
    expect(region).toHaveClass("workspace-navigation")
    expect(region.parentElement).toBe(screen.getByTestId("top-header"))
    expect(screen.getByTestId("top-header-primary-nav")).toHaveClass("workspace-switcher")
    expect(screen.queryByTestId("header-prompt-usage-context-options")).not.toBeInTheDocument()
  })

  it("places the compact update control immediately before Settings only when a newer release exists", () => {
    useAppUpdateStore.setState({ result: {
      status: "available", currentVersion: "1.0.0", latestVersion: "1.0.1",
      downloadUrl: "https://github.com/alanchill-dev/one-more-prompt/releases/download/v1.0.1/One-More-Prompt-1.0.1.dmg",
      releaseUrl: "https://github.com/alanchill-dev/one-more-prompt/releases/tag/v1.0.1", publishedAt: "2026-10-22T00:00:00Z",
    } })
    render(<SideNav activeView="home" onViewChange={vi.fn()} appVersion="1.0.0" />)
    const actions = screen.getByTestId("top-header-actions")
    expect(within(actions).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "New Version Available: 1.0.1", "Settings",
    ])
    expect(within(actions).getByRole("button", { name: "New Version Available: 1.0.1" })).toHaveClass("app-update-trigger")
  })

  it("keeps Settings in place without an update control when no newer release is confirmed", () => {
    render(<SideNav activeView="home" onViewChange={vi.fn()} />)
    expect(within(screen.getByTestId("top-header-actions")).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Settings"])
  })

  it("opens Projects and Timeline as peer workspace destinations", async () => {
    const onViewChange = vi.fn()
    const onPromptUsageViewModeChange = vi.fn()
    render(
      <SideNav
        activeView="home"
        onViewChange={onViewChange}
        promptUsageViewMode="hierarchy"
        onPromptUsageViewModeChange={onPromptUsageViewModeChange}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Projects" }))
    expect(onViewChange).toHaveBeenLastCalledWith("prompt-usage")
    expect(onPromptUsageViewModeChange).toHaveBeenLastCalledWith("hierarchy")

    await userEvent.click(screen.getByRole("button", { name: "Timeline" }))
    expect(onViewChange).toHaveBeenLastCalledWith("prompt-usage")
    expect(onPromptUsageViewModeChange).toHaveBeenLastCalledWith("timeline")
  })

  it("marks only the active workspace as the current page", () => {
    const { rerender } = render(
      <SideNav activeView="prompt-usage" onViewChange={vi.fn()} promptUsageViewMode="hierarchy" />
    )
    expect(screen.getByRole("button", { name: "Projects" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("button", { name: "Timeline" })).not.toHaveAttribute("aria-current")

    rerender(<SideNav activeView="prompt-usage" onViewChange={vi.fn()} promptUsageViewMode="timeline" />)
    expect(screen.getByRole("button", { name: "Timeline" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("button", { name: "Projects" })).not.toHaveAttribute("aria-current")

    rerender(<SideNav activeView="settings" onViewChange={vi.fn()} promptUsageViewMode="timeline" />)
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-current", "page")
    for (const label of ["Overview", "Projects", "Timeline"]) {
      expect(screen.getByRole("button", { name: label })).not.toHaveAttribute("aria-current")
    }
  })

  it("supports arrow-key focus movement within only the three workspace destinations", async () => {
    render(<SideNav activeView="home" onViewChange={vi.fn()} />)
    const overview = screen.getByRole("button", { name: "Overview" })
    const projects = screen.getByRole("button", { name: "Projects" })
    const timeline = screen.getByRole("button", { name: "Timeline" })

    overview.focus()
    await userEvent.keyboard("{ArrowRight}")
    expect(projects).toHaveFocus()
    await userEvent.keyboard("{End}")
    expect(timeline).toHaveFocus()
    await userEvent.keyboard("{Home}")
    expect(overview).toHaveFocus()
  })

  it("leaves the pin control behavior unchanged", async () => {
    const onPinnedChange = vi.fn()
    const { rerender } = render(
      <SideNav activeView="home" onViewChange={vi.fn()} onPinnedChange={onPinnedChange} />
    )

    const pin = screen.getByRole("button", { name: "Pin Window" })
    expect(pin).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(pin)
    expect(onPinnedChange).toHaveBeenCalledWith(true)

    rerender(<SideNav activeView="home" onViewChange={vi.fn()} isPinned onPinnedChange={onPinnedChange} />)
    expect(screen.getByRole("button", { name: "Unpin Window" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("top-header")).toHaveAttribute("data-tauri-drag-region", "deep")
  })

  it("leaves Settings as the existing independent right-side action", async () => {
    const onViewChange = vi.fn()
    render(<SideNav activeView="home" onViewChange={onViewChange} />)
    const settings = screen.getByRole("button", { name: "Settings" })
    await userEvent.click(settings)
    expect(onViewChange).toHaveBeenCalledWith("settings")
    expect(screen.getByTestId("top-header-actions")).toContainElement(settings)
  })

  it("rotates the original header mark only while Codex is active", () => {
    const { rerender } = render(<SideNav activeView="home" onViewChange={vi.fn()} isCodexActive />)
    expect(screen.getByTestId("logo-activity-ring")).toHaveAttribute("data-active", "true")
    expect(screen.getByTestId("logo-activity-chevron")).toHaveClass("signal-aperture-chevron-active")

    rerender(<SideNav activeView="home" onViewChange={vi.fn()} />)
    expect(screen.getByTestId("logo-activity-ring")).toHaveAttribute("data-active", "false")
  })

  it("localizes only the new Projects workspace while retaining existing header copy", () => {
    useAppPreferencesStore.getState().setLanguage("zh-TW")
    render(<SideNav activeView="home" onViewChange={vi.fn()} />)

    expect(screen.getByRole("button", { name: "總覽" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "專案" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "時間軸" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "設定" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "釘選視窗" })).toBeInTheDocument()
    expect(screen.getByText("One More Prompt")).toBeInTheDocument()
    expect(screen.queryByText("專為 Codex 打造")).not.toBeInTheDocument()
  })

  it("validates persisted and event-driven top-level views", () => {
    expect(isActiveView("home")).toBe(true)
    expect(isActiveView("prompt-usage")).toBe(true)
    expect(isActiveView("settings")).toBe(true)
    expect(isActiveView("timeline")).toBe(false)
    expect(isActiveView(null)).toBe(false)
  })
})
