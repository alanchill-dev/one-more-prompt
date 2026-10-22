import userEvent from "@testing-library/user-event"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ModelFilterControl, TimeScopeControl } from "@/components/prompt-usage-timeline-filters"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

describe("Timeline Time Filter", () => {

  it("shows a persistent model icon in the model filter trigger", () => {
    render(<ModelFilterControl value="all" options={[{ key: "gpt-5.6-sol", label: "GPT-5.6 Sol" }]} onChange={vi.fn()} />)
    const trigger = screen.getByRole("combobox", { name: "Filter Model" })
    expect(within(trigger).getByTestId("prompt-usage-model-filter-icon")).toBeInTheDocument()
    expect(trigger).toHaveTextContent("All Models")
  })
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-08T12:00:00"))
    window.localStorage.clear()
    useAppPreferencesStore.getState().resetState()
  })

  afterEach(() => vi.useRealTimers())

  it("applies a local time window including a 24:00 end", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeScopeControl scope={{ type: "day", dateKey: "2026-09-04" }} onChange={onChange} />)
    await user.click(within(screen.getByTestId("prompt-usage-time-filter")).getByRole("button", { expanded: false }))
    await user.click(screen.getByRole("button", { name: "Custom", exact: true }))
    fireEvent.change(screen.getByLabelText("Start Time"), { target: { value: "23:30" } })
    fireEvent.change(screen.getByLabelText("End Time"), { target: { value: "24:00" } })
    await user.click(screen.getByRole("button", { name: "Apply Filter" }))
    expect(onChange).toHaveBeenCalledWith({ type: "window", dateKey: "2026-09-04", startMinute: 1410, endMinute: 1440 })
  })

  it("explains invalid time input and prevents an empty or reversed window", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeScopeControl scope={{ type: "today" }} onChange={onChange} />)
    await user.click(within(screen.getByTestId("prompt-usage-time-filter")).getByRole("button"))
    await user.click(screen.getByRole("button", { name: "Custom", exact: true }))
    fireEvent.change(screen.getByLabelText("Start Time"), { target: { value: "09:00" } })
    for (const value of ["09:00", "08:00", "24:01", ""]) {
      fireEvent.change(screen.getByLabelText("End Time"), { target: { value } })
      expect(screen.getByRole("button", { name: "Apply Filter" })).toBeDisabled()
      expect(screen.getByRole("alert")).toBeInTheDocument()
    }
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("End Time"), { target: { value: "24:00" } })
    expect(screen.getByRole("button", { name: "Apply Filter" })).toBeEnabled()
  })

  it("reopens the current window for editing and clears it back to the 30-day default", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeScopeControl scope={{ type: "window", dateKey: "2026-09-04", startMinute: 540, endMinute: 720 }} onChange={onChange} />)
    const filter = within(screen.getByTestId("prompt-usage-time-filter"))
    expect(filter.getByRole("button", { expanded: false })).toHaveTextContent("9/4 · 09:00–12:00")
    await user.click(filter.getByRole("button", { expanded: false }))
    await user.click(screen.getByRole("button", { name: "Custom", exact: true }))
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(screen.getByRole("gridcell", { name: "Select 2026/9/4" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByLabelText("Start Time")).toHaveValue("09:00")
    expect(screen.getByLabelText("End Time")).toHaveValue("12:00")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(filter.getByRole("button", { name: "Clear time filter" })).toBeVisible())
    await user.click(filter.getByRole("button", { name: "Clear time filter" }))
    expect(onChange).toHaveBeenCalledWith({ type: "lastDays", days: 30 })
  })
  it("uses one calendar for single days and ranges and dismisses outside without applying a draft", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<><button>Outside</button><TimeScopeControl scope={{ type: "today" }} onChange={onChange} /></>)
    const filter = within(screen.getByTestId("prompt-usage-time-filter"))
    await user.click(filter.getByRole("button"))
    await user.click(screen.getByRole("button", { name: "Custom", exact: true }))
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument()
    await user.click(screen.getByRole("gridcell", { name: "Select 2026/9/4" }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Outside" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Custom Usage" })).not.toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
    await waitFor(() => expect(filter.getByRole("button")).toBeVisible())
    await user.click(filter.getByRole("button"))
    await user.click(screen.getByRole("button", { name: "Custom", exact: true }))
    await user.click(screen.getByRole("tab", { name: "Date Range", exact: true }))
    await user.click(screen.getByRole("gridcell", { name: "Select 2026/9/3" }))
    await user.click(screen.getByRole("gridcell", { name: "Select 2026/9/7" }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Apply Filter" }))
    expect(onChange).toHaveBeenCalledWith({ type: "range", startKey: "2026-09-03", endKey: "2026-09-07" })
  })

  it("preserves the exact interval on cancel and clears it back to the 30-day default", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const scope = { type: "interval" as const, startAt: new Date(2026, 8, 4, 9, 15, 20).getTime(), endAt: new Date(2026, 8, 4, 10, 20, 40).getTime() }
    render(<TimeScopeControl scope={scope} onChange={onChange} />)
    const filter = within(screen.getByTestId("prompt-usage-time-filter"))
    expect(filter.getByRole("button", { expanded: false })).toHaveTextContent("2026/9/4 09:15–2026/9/4 10:20")
    await user.click(filter.getByRole("button", { expanded: false }))
    await user.click(screen.getByRole("button", { name: "Custom", exact: true }))
    expect(screen.getByLabelText("Start Time")).toHaveValue("09:15")
    expect(screen.getByLabelText("End Time")).toHaveValue("10:21")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(filter.getByRole("button", { name: "Clear time filter" })).toBeVisible())
    expect(onChange).not.toHaveBeenCalled()
    expect(filter.getByRole("button", { expanded: false })).toHaveTextContent("2026/9/4 09:15–2026/9/4 10:20")
    await user.click(filter.getByRole("button", { name: "Clear time filter" }))
    expect(onChange).toHaveBeenCalledWith({ type: "lastDays", days: 30 })
  })

  it("opens a cross-day interval as a covering range draft and preserves it on outside dismissal", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<><button>Outside</button><TimeScopeControl scope={{ type: "interval", startAt: new Date(2026, 8, 3, 23, 30).getTime(), endAt: new Date(2026, 8, 5).getTime() }} onChange={onChange} /></>)
    const filter = within(screen.getByTestId("prompt-usage-time-filter"))
    await user.click(filter.getByRole("button", { expanded: false }))
    await user.click(screen.getByRole("button", { name: "Custom", exact: true }))
    expect(screen.getByRole("tab", { name: "Date Range" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("gridcell", { name: "Select 2026/9/3" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("gridcell", { name: "Select 2026/9/4" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("gridcell", { name: "Select 2026/9/5" })).toHaveAttribute("aria-selected", "false")
    await user.click(screen.getByRole("button", { name: "Outside" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

})
