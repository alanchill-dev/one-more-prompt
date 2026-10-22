import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UsageTrendDatePicker } from "@/components/usage-trend-date-picker"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

function props() {
  return {
    open: true,
    anchorRect: { left: 200, top: 40, width: 100, height: 36 },
    sourceLabel: "Custom",
    selection: { mode: "single" as const, dateKey: "2026-09-07" },
    todayKey: "2026-09-08",
    minimumKey: "2025-09-09",
    onClose: vi.fn(), onSelectSingle: vi.fn(), onSelectRange: vi.fn(),
  }
}

describe("UsageTrendDatePicker", () => {
  beforeEach(() => {
    useAppPreferencesStore.getState().resetState()
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1 })
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it("preserves Overview's immediate single-day and second-click range callbacks", () => {
    const inputs = props()
    render(<UsageTrendDatePicker {...inputs} />)
    fireEvent.click(screen.getByRole("gridcell", { name: "Select 2026/9/5" }))
    expect(inputs.onSelectSingle).toHaveBeenCalledWith("2026-09-05")
    expect(screen.queryByRole("button", { name: "Apply Filter" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "Date Range" }))
    fireEvent.click(screen.getByRole("gridcell", { name: "Select 2026/9/2" }))
    expect(inputs.onSelectRange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("gridcell", { name: "Select 2026/9/7" }))
    expect(inputs.onSelectRange).toHaveBeenCalledWith("2026-09-02", "2026-09-07")
  })

  it("drafts a single day, rejects invalid windows, and accepts 24:00 as the exclusive end", () => {
    const inputs = props()
    const onSelectWindow = vi.fn()
    render(<UsageTrendDatePicker {...inputs} onSelectWindow={onSelectWindow} />)
    fireEvent.click(screen.getByRole("gridcell", { name: "Select 2026/9/6" }))
    expect(inputs.onSelectSingle).not.toHaveBeenCalled()
    const start = screen.getByLabelText("Start Time")
    const end = screen.getByLabelText("End Time")
    const apply = screen.getByRole("button", { name: "Apply Filter" })
    expect(start).toHaveValue("00:00")
    expect(end).toHaveValue("24:00")
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(screen.queryByText(/Selected 2026/)).not.toBeInTheDocument()
    for (const value of ["9:00", "24:00"]) {
      fireEvent.change(start, { target: { value } })
      expect(apply).toBeDisabled()
      expect(screen.getByRole("alert")).toBeInTheDocument()
    }
    fireEvent.change(start, { target: { value: "23:30" } })
    fireEvent.change(end, { target: { value: "24:01" } })
    expect(apply).toBeDisabled()
    fireEvent.change(end, { target: { value: "24:00" } })
    expect(apply).toBeEnabled()
    fireEvent.click(apply)
    expect(onSelectWindow).toHaveBeenCalledWith("2026-09-06", 1410, 1440)
    fireEvent.change(start, { target: { value: "00:00" } })
    fireEvent.click(apply)
    expect(inputs.onSelectSingle).toHaveBeenCalledWith("2026-09-06")
  })

  it("resets the selected day and optional time window on each opening", () => {
    const inputs = props()
    const onSelectWindow = vi.fn()
    const { rerender } = render(<UsageTrendDatePicker {...inputs} onSelectWindow={onSelectWindow} initialWindow={{ startMinute: 60, endMinute: 120 }} />)
    expect(screen.getByLabelText("Start Time")).toHaveValue("01:00")
    fireEvent.change(screen.getByLabelText("Start Time"), { target: { value: "01:30" } })
    rerender(<UsageTrendDatePicker {...inputs} open={false} onSelectWindow={onSelectWindow} />)
    rerender(<UsageTrendDatePicker {...inputs} selection={{ mode: "single", dateKey: "2026-09-08" }} onSelectWindow={onSelectWindow} initialWindow={{ startMinute: 600, endMinute: 660 }} />)
    expect(screen.getByLabelText("Start Time")).toHaveValue("10:00")
    expect(screen.getByLabelText("End Time")).toHaveValue("11:00")
    expect(screen.getByRole("gridcell", { name: "Select 2026/9/8" })).toHaveAttribute("aria-selected", "true")
    fireEvent.click(screen.getByRole("tab", { name: "Date Range" }))
    expect(screen.queryByRole("checkbox", { name: "Narrow To Time" })).not.toBeInTheDocument()
  })

  it("honors a historical minimum for dates and keyboard navigation without a forced 365-day bound", () => {
    render(<UsageTrendDatePicker {...props()} minimumKey="2023-01-15" selection={{ mode: "single", dateKey: "2023-01-16" }} maxRangeDays={null} />)
    expect(screen.getByRole("gridcell", { name: "Select 2023/1/14" })).toBeDisabled()
    const minimum = screen.getByRole("gridcell", { name: "Select 2023/1/15" })
    expect(minimum).toBeEnabled()
    fireEvent.keyDown(screen.getByRole("gridcell", { name: "Select 2023/1/16" }), { key: "ArrowLeft" })
    expect(minimum).toHaveFocus()
    fireEvent.keyDown(minimum, { key: "ArrowLeft" })
    expect(minimum).toHaveFocus()
    fireEvent.keyDown(minimum, { key: "PageUp" })
    expect(minimum).toHaveFocus()
    expect(screen.queryByText(/Most Recent/)).not.toBeInTheDocument()
  })

  it("uses a supplied range limit and allows longer historical ranges when the limit is null", () => {
    const inputs = props()
    const { rerender } = render(<UsageTrendDatePicker {...inputs} maxRangeDays={2} />)
    fireEvent.click(screen.getByRole("tab", { name: "Date Range" }))
    fireEvent.click(screen.getByRole("gridcell", { name: "Select 2026/9/1" }))
    fireEvent.click(screen.getByRole("gridcell", { name: "Select 2026/9/3" }))
    expect(inputs.onSelectRange).not.toHaveBeenCalled()
    expect(screen.getByText("Choose a range of 2 days or fewer.")).toBeInTheDocument()
    rerender(<UsageTrendDatePicker {...inputs} open={false} />)
    rerender(<UsageTrendDatePicker {...inputs} maxRangeDays={null} minimumKey="2024-01-01" selection={{ mode: "range", startKey: "2024-01-01", endKey: null }} />)
    for (let month = 0; month < 12; month++) fireEvent.click(screen.getByRole("button", { name: "Next Month" }))
    fireEvent.click(screen.getByRole("gridcell", { name: "Select 2025/1/2" }))
    expect(inputs.onSelectRange).toHaveBeenCalledWith("2024-01-01", "2025-01-02")
  })

  it("makes the exiting dialog inert and announces exit completion only after its morph", () => {
    vi.useFakeTimers()
    const inputs = props()
    const onExitComplete = vi.fn()
    const { rerender } = render(<UsageTrendDatePicker {...inputs} onExitComplete={onExitComplete} />)
    rerender(<UsageTrendDatePicker {...inputs} open={false} onExitComplete={onExitComplete} />)
    const closing = screen.getByTestId("usage-trend-date-picker")
    expect(closing).toHaveAttribute("inert")
    expect(closing).toHaveAttribute("aria-hidden", "true")
    act(() => vi.advanceTimersByTime(319))
    expect(onExitComplete).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onExitComplete).toHaveBeenCalledOnce()
    expect(screen.queryByTestId("usage-trend-date-picker")).not.toBeInTheDocument()
  })

  it("cancels a pending exit when the calendar reopens before the morph finishes", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const inputs = props()
    const onExitComplete = vi.fn()
    const { rerender } = render(<UsageTrendDatePicker {...inputs} onExitComplete={onExitComplete} />)
    const dialog = screen.getByTestId("usage-trend-date-picker")
    rerender(<UsageTrendDatePicker {...inputs} open={false} onExitComplete={onExitComplete} />)
    act(() => vi.advanceTimersByTime(100))
    rerender(<UsageTrendDatePicker {...inputs} onExitComplete={onExitComplete} />)
    expect(screen.getByRole("dialog", { name: "Custom Usage" })).toBe(dialog)
    expect(dialog).not.toHaveAttribute("inert")
    expect(dialog).toHaveAttribute("aria-hidden", "false")
    expect(screen.getByRole("gridcell", { name: "Select 2026/9/7" })).toHaveFocus()
    act(() => vi.advanceTimersByTime(320))
    expect(onExitComplete).not.toHaveBeenCalled()
    expect(dialog).toBeInTheDocument()
    rerender(<UsageTrendDatePicker {...inputs} open={false} onExitComplete={onExitComplete} />)
    act(() => vi.advanceTimersByTime(320))
    expect(onExitComplete).toHaveBeenCalledOnce()
    expect(dialog).not.toBeInTheDocument()
  })

  it("keeps both tabs the same size, drafts ranges, and retains a reachable footer on short windows", () => {
    vi.stubGlobal("innerHeight", 881)
    const inputs = { ...props(), onSelectWindow: vi.fn(), maxRangeDays: null }
    render(<UsageTrendDatePicker {...inputs} />)
    const card = screen.getByTestId("usage-trend-date-picker")
    const morph = screen.getByTestId("usage-trend-date-picker-shared-morph")
    expect(card).toHaveStyle({ height: "520px" })
    fireEvent.click(screen.getByRole("button", { name: "Previous Month" }))
    expect(card).toHaveStyle({ height: "520px" })
    fireEvent.click(screen.getByRole("tab", { name: "Date Range" }))
    expect(card).toHaveStyle({ height: "520px" })
    const apply = screen.getByRole("button", { name: "Apply Filter" })
    expect(apply).toBeDisabled()
    fireEvent.click(screen.getByRole("gridcell", { name: "Select 2026/8/1" }))
    expect(apply).toBeDisabled()
    fireEvent.click(screen.getByRole("gridcell", { name: "Select 2026/8/31" }))
    expect(inputs.onSelectRange).not.toHaveBeenCalled()
    expect(apply).toBeEnabled()
    fireEvent.click(apply)
    expect(inputs.onSelectRange).toHaveBeenCalledWith("2026-08-01", "2026-08-31")
    vi.stubGlobal("innerHeight", 500)
    fireEvent(window, new Event("resize"))
    expect(card).toHaveStyle({ height: "468px", top: "16px" })
    expect(screen.getByTestId("calendar-date-scroll")).toHaveClass("overflow-y-auto")
    expect(screen.getByTestId("calendar-date-scroll")).not.toContainElement(apply)
    expect(morph.style.getPropertyValue("--shared-destination-height")).toBe("468px")
  })

  it("initializes keyboard focus on an enabled date when the saved selection predates the minimum", () => {
    render(<UsageTrendDatePicker {...props()} minimumKey="2026-08-15" selection={{ mode: "single", dateKey: "2024-01-01" }} onSelectWindow={vi.fn()} />)
    const firstValid = screen.getByRole("gridcell", { name: "Select 2026/8/15" })
    expect(firstValid).toBeEnabled()
    expect(firstValid).toHaveFocus()
    expect(firstValid).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("button", { name: "Apply Filter" })).toBeEnabled()
  })
})
