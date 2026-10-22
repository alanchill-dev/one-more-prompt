import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { UsageTrendExplorer } from "./usage-trend-explorer"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@/lib/settings", async (original) => ({
  ...await original<typeof import("@/lib/settings")>(),
  saveModelColorPreferences: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  useAppPreferencesStore.getState().resetState()
  useAppPreferencesStore.getState().setModelColorsHydrated(true)
})

it("closes an applied-then-reopened palette and cancels its draft when leaving the guide step", () => {
  const chartNow = new Date(2026, 9, 20, 17)
  const props = {
    label: "Usage Trend", chartNow, loadHistoricalHourly: vi.fn().mockResolvedValue([]),
    hourlyPoints: [{ label: "17:00", startAt: chartNow.toISOString(), value: 100, valueLabel: "100 Tokens", modelUsage: [{ name: "GPT-5.6 Sol", tokens: 100 }] }],
    points: [{ label: "10/20", startAt: "2026-10-20", value: 100, valueLabel: "100 Tokens", modelUsage: [{ name: "GPT-5.6 Sol", tokens: 100 }] }],
  }
  const { rerender } = render(<UsageTrendExplorer {...props} modelPaletteGuideActive />)
  fireEvent.click(screen.getByTestId("usage-trend-model-colors-button"))
  fireEvent.change(screen.getByLabelText("HEX"), { target: { value: "#123456" } })
  fireEvent.click(screen.getByRole("button", { name: "Apply" }))
  expect(screen.getByTestId("usage-trend-explorer")).toHaveAttribute("data-palette-applied", "true")
  expect(useAppPreferencesStore.getState().modelColors.slots[0].base).toBe("#123456")

  fireEvent.click(screen.getByTestId("usage-trend-model-colors-button"))
  fireEvent.change(screen.getByLabelText("HEX"), { target: { value: "#ABCDEF" } })
  expect(useAppPreferencesStore.getState().modelColors.slots[0].base).toBe("#ABCDEF")
  rerender(<UsageTrendExplorer {...props} modelPaletteGuideActive={false} />)

  expect(screen.getByTestId("usage-trend-model-color-inspector")).toHaveAttribute("data-state", "closed")
  expect(useAppPreferencesStore.getState().modelColors.slots[0].base).toBe("#123456")
})
