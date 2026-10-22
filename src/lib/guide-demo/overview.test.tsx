import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OverviewPage } from "@/pages/overview"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import codexManifest from "../../../plugins/codex/plugin.json"
import { makeGuideOverviewPlugin } from "./overview"
import { DEMO_NOW, hourlyPoints, trendPoints } from "./fixtures"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]), isTauri: () => false }))

describe("Guide Overview Fixture", () => {
  beforeEach(() => {
    useAppPreferencesStore.getState().resetState()
    useAppUiStore.getState().resetState()
  })

  it("provides a consistent synthetic account snapshot with the real public resource links", () => {
    const now = Date.now()
    const plugin = makeGuideOverviewPlugin("Demo Account", now)
    expect(plugin.meta.links).toEqual(codexManifest.links)
    expect(plugin.data?.plan).toBe("Plus")
    const charts = plugin.data?.lines.filter(line => line.type === "barChart")
    expect(charts).toEqual([
      expect.objectContaining({ granularity: "daily", points: trendPoints }),
      expect.objectContaining({ granularity: "hourly", points: hourlyPoints }),
    ])
    const line = plugin.data?.lines.find(line => line.type === "text" && line.label === "Rate Limit Resets")
    if (line?.type !== "text") throw new Error("Missing reset snapshot")
    const credits = line.resetCredits!
    expect(credits.availableCount).toBe(credits.credits!.length)
    expect(credits.availableCount).toBe(2)
    expect(credits.historyState).toBe("ready")
    expect(credits.credits!.every(credit => Date.parse(credit.grantedAt!) < now && Date.parse(credit.expiresAt!) > now)).toBe(true)
    expect(line.resetExpiry).toEqual(credits.credits!.map(credit => credit.expiresAt))
    expect(credits.history.every(event => Date.parse(event.occurredAt) >= Date.parse(credits.historyWindowStart!) && Date.parse(event.occurredAt) <= now)).toBe(true)
    expect(credits.history.filter(event => event.kind === "granted").length - credits.history.filter(event => event.kind === "used").length).toBe(2)
  })

  it("renders the real account header, reset dialog and history from the guide payload", async () => {
    const plugin = makeGuideOverviewPlugin("Demo Account", DEMO_NOW)
    const user = userEvent.setup()
    render(<div className="app-panel-surface"><OverviewPage plugin={plugin} displayMode="left" resetTimerDisplayMode="relative" /></div>)

    const header = screen.getByTestId("overview-account-status")
    expect(within(header).getByText("Rate Limit Resets")).toBeInTheDocument()
    expect(within(header).getByText("$12.4 USD · 310 credits")).toBeInTheDocument()
    const links = screen.getByTestId("overview-usage-links")
    for (const link of codexManifest.links) {
      expect(links.querySelector(`[data-resource-link="${link.label}"]`)).toHaveAttribute("href", link.url)
    }
    const trigger = within(header).getByRole("button", { name: /View Usage Reset Details/ })
    expect(trigger).toHaveAttribute("data-guide-target", "reset-history-trigger")
    await user.click(trigger)
    const dialog = await screen.findByRole("dialog", { name: "Usage Resets" })
    expect(dialog).toHaveAttribute("data-guide-target", "reset-history-detail")
    expect(dialog.closest(".app-panel-surface")).not.toBeNull()
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2)
    await user.click(within(dialog).getByRole("tab", { name: "History" }))
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(4)
    expect(within(dialog).getAllByText("Reset Received")).toHaveLength(3)
    expect(within(dialog).getByText("Reset Used")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
