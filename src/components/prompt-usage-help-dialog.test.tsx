import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"
import { PromptUsageHelpDialog } from "./prompt-usage-help-dialog"

function Help({ id = "help", title = "Read This" }: { id?: string; title?: string }) {
  return <PromptUsageHelpDialog title={title} closeLabel="Close Help" testId={id}><p>Useful explanation.</p><button>Detail Action</button></PromptUsageHelpDialog>
}
afterEach(() => vi.useRealTimers())

it("opens only by click, traps keyboard focus and restores its trigger after the reverse morph", async () => {
  const user = userEvent.setup()
  render(<><Help /><button>Outside</button></>)
  const trigger = screen.getByRole("button", { name: "Read This" })
  await user.hover(trigger)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await user.click(trigger)
  const popup = screen.getByRole("dialog", { name: "Read This" })
  expect(popup).toHaveAttribute("aria-modal", "true")
  await waitFor(() => expect(popup).toHaveFocus())
  await user.tab({ shift: true })
  await waitFor(() => expect(screen.getByRole("button", { name: "Detail Action" })).toHaveFocus())
  await user.tab()
  await waitFor(() => expect(screen.getByRole("button", { name: "Close Help" })).toHaveFocus())
  await user.keyboard("{Escape}")
  expect(trigger).toHaveAttribute("data-help-hidden", "true")
  expect(screen.getByTestId("help-morph")).toHaveAttribute("data-state", "closed")
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(trigger).not.toHaveAttribute("data-help-hidden")
  await waitFor(() => expect(trigger).toHaveFocus())
})

it("closes from X or the backdrop, retaining the source through the whole closing interval", async () => {
  vi.useFakeTimers()
  render(<Help />)
  fireEvent.click(screen.getByRole("button", { name: "Read This" }))
  fireEvent.click(screen.getByRole("button", { name: "Close Help" }))
  act(() => vi.advanceTimersByTime(319))
  expect(screen.getByTestId("help-trigger")).toHaveAttribute("data-help-hidden", "true")
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByTestId("help-trigger")).not.toHaveAttribute("data-help-hidden")
  fireEvent.click(screen.getByTestId("help-trigger"))
  fireEvent.mouseDown(screen.getByTestId("help-backdrop"))
  fireEvent.mouseUp(screen.getByTestId("help-backdrop"))
  fireEvent.click(screen.getByTestId("help-backdrop"))
  act(() => vi.advanceTimersByTime(320))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

it("measures source and natural content within the rounded AppPanel and remeasures on resize", async () => {
  let bounds = new DOMRect(20, 30, 900, 650)
  const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("app-panel-surface")) return bounds
    if (this.getAttribute("data-testid") === "help-trigger") return new DOMRect(800, 80, 32, 32)
    if (this.getAttribute("data-testid") === "help") return new DOMRect(0, 0, 500, 360)
    return new DOMRect()
  })
  try {
    render(<div className="app-panel-surface" style={{ borderRadius: "14px" }}><Help /></div>)
    fireEvent.click(screen.getByRole("button", { name: "Read This" }))
    const popup = screen.getByRole("dialog")
    expect(popup).toHaveStyle({ width: "500px", left: "220px", top: "175px", maxHeight: "610px" })
    const backdrop = screen.getByTestId("help-backdrop")
    expect(screen.getByTestId("help-frame")).not.toContainElement(backdrop)
    expect(backdrop.parentElement).toBe(screen.getByTestId("help-frame").parentElement)
    expect(backdrop).toHaveStyle({ left: "20px", top: "30px", width: "900px", height: "650px", borderRadius: "14px" })
    expect(screen.getByTestId("help-frame").style.clipPath).toContain("20px round 14px")
    expect(screen.getByTestId("help-morph").style.getPropertyValue("--shared-source-left")).toBe("800px")
    bounds = new DOMRect(10, 10, 400, 300)
    fireEvent(window, new Event("resize"))
    expect(popup).toHaveStyle({ width: "360px", left: "30px", top: "30px", maxHeight: "260px" })
  } finally { geometry.mockRestore() }
})

it("allows only one shared help dialog at a time", () => {
  render(<><Help /><Help id="second" title="Other Help" /></>)
  fireEvent.click(screen.getByTestId("help-trigger"))
  fireEvent.click(screen.getByTestId("second-trigger"))
  expect(screen.getAllByRole("dialog")).toHaveLength(1)
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Other Help")
})
