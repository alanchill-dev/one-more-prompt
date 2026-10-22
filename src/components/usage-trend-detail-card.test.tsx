import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { UsageTrendDetailCard } from "./usage-trend-detail-card"

afterEach(() => vi.restoreAllMocks())

it("tracks an eligible mouse even with system reduced motion and clears decorative offsets on exit", () => {
  const media = vi.spyOn(window, "matchMedia").mockImplementation(query => ({ media: query, matches: !query.includes("no-preference") }) as MediaQueryList)
  render(<UsageTrendDetailCard id="pointer-card" x={20} y={20} chartWidth={800} chartHeight={600}
    eyebrow="9/7" total="1M" shares={[]} colorOrder={new Map()} metrics={[]}
    actionLabel="View Prompts" onAction={() => {}} testId="pointer-card" />)
  const button = screen.getAllByRole("button")[0]
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 120, height: 110 } as DOMRect)
  const move = (pointerType: string) => {
    const event = new MouseEvent("pointermove", { bubbles: true, clientX: 90, clientY: 55 })
    Object.defineProperty(event, "pointerType", { value: pointerType })
    fireEvent(button, event)
  }
  move("touch")
  expect(button.style.getPropertyValue("--workspace-dx")).toBe("")
  move("mouse")
  expect(media).toHaveBeenCalledWith("(hover: hover) and (pointer: fine)")
  expect(button.style.getPropertyValue("--workspace-dx")).toBe("1.5px")
  expect(button).toHaveAttribute("data-workspace-hover", "true")
  fireEvent.pointerLeave(button)
  expect(button.style.getPropertyValue("--workspace-dx")).toBe("")
  expect(button).not.toHaveAttribute("data-workspace-hover")
  media.mockImplementation(query => ({ media: query, matches: false }) as MediaQueryList)
  move("mouse")
  expect(button.style.getPropertyValue("--workspace-dx")).toBe("")
})
