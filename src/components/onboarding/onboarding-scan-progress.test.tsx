import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OnboardingScanProgress } from "./onboarding-scan-progress"

describe("OnboardingScanProgress", () => {
  afterEach(() => { vi.useRealTimers() })

  it("fills only when real processed-file counts change, never as time passes", () => {
    vi.useFakeTimers()
    const view = render(<OnboardingScanProgress language="en" progress={{ phase: "reading", processedFiles: 1, totalFiles: 4 }} />)
    const progress = screen.getByRole("progressbar", { name: "Record Files Checked" })
    expect(progress).toHaveAttribute("aria-valuenow", "25")
    expect(screen.getByText("Checked 1 / 4 record files")).toBeInTheDocument()
    expect(screen.getByText("25%")).toBeInTheDocument()
    expect(screen.getByText("Elapsed 0:00")).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(14_000) })
    expect(screen.queryByText(/Large histories can take longer/)).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText(/Large histories can take longer/)).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(50_000) })
    expect(progress).toHaveAttribute("aria-valuenow", "25")
    expect(screen.getByText("Elapsed 1:05")).toBeInTheDocument()
    view.rerender(<OnboardingScanProgress language="en" progress={{ phase: "reading", processedFiles: 3, totalFiles: 4 }} />)
    expect(progress).toHaveAttribute("aria-valuenow", "75")
    expect(screen.getByText("Checked 3 / 4 record files")).toBeInTheDocument()
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
    render(<OnboardingScanProgress language="en" progress={null} />)
    expect(screen.getByText("Elapsed 0:00")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
  })

  it("distinguishes discovery and result assembly from file processing", () => {
    const view = render(<OnboardingScanProgress language="en" progress={{ phase: "discovering", processedFiles: 0, totalFiles: 0 }} />)
    expect(screen.getByRole("status")).toHaveTextContent("Finding Record Files…")
    expect(screen.queryByText("0%")).not.toBeInTheDocument()
    view.rerender(<OnboardingScanProgress language="en" progress={{ phase: "summarizing", processedFiles: 4, totalFiles: 4 }} />)
    expect(screen.getByRole("status")).toHaveTextContent("Organizing Results…")
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
  })

  it("handles an empty inventory without dividing by zero", () => {
    render(<OnboardingScanProgress language="en" progress={{ phase: "reading", processedFiles: 0, totalFiles: 0 }} />)
    expect(screen.getByText("Checked 0 / 0 record files")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
  })

  it("localizes counts and limits percentages to two decimals", () => {
    render(<OnboardingScanProgress language="zh-TW" progress={{ phase: "reading", processedFiles: 1, totalFiles: 3 }} />)
    expect(screen.getByText("已等待 0:00")).toBeInTheDocument()
    expect(screen.getByText("已檢查 1 / 3 個紀錄檔")).toBeInTheDocument()
    expect(screen.getByText("33.33%")).toBeInTheDocument()
  })
})
