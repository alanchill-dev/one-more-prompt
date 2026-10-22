import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAppUiStore } from "@/stores/app-ui-store"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
import { PromptUsageSessionLanes, type PromptUsageSessionLanesProps } from "./prompt-usage-session-lanes"

const start = new Date("2026-09-07T09:00:00").getTime()
function item(id: string, minute: number): TimelineItem {
  const startedAt = start + minute * 60_000
  const turn = {
    id: `turn-${id}`, prompt: `Request ${id}`, startedAt: new Date(startedAt).toISOString(), timeLabel: "09:00",
    agents: [], quotaObservation: null, costUsd: null, estimationStatus: "current_rate" as const,
    tokens: { totalTokens: 100, inputTokens: 80, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0 },
  }
  const session = { id, title: `Session ${id}`, updatedAt: turn.startedAt, promptCount: 1, isActive: false, codexOrder: 0, costUsd: null, estimationStatus: "current_rate" as const, turns: [turn] }
  const project = { id: "project", kind: "project" as const, name: "Project", updatedAt: turn.startedAt, promptCount: 1, sessionCount: 1, isActive: false, codexOrder: 0, sessions: [session] }
  return { project, session, turn, startedAt, dateKey: "2026-09-07", model: null }
}
function props(items: TimelineItem[]): PromptUsageSessionLanesProps {
  return {
    items, start, end: start + 60 * 60_000, focusedSessionId: null, highlightedTurnId: null,
    onFocusSession: vi.fn(), onHighlight: vi.fn(), onSelect: vi.fn(), onSelectGroup: vi.fn(), markerColor: () => "#abcd00",
    labels: { session: "Sessions", sentAt: "Sent At", empty: "No Activity", focusSession: "Focus Session", prompts: "Prompts" },
  }
}
const order = () => [...document.querySelectorAll(".prompt-session-lane")].map(row => row.getAttribute("data-session-id"))
const pin = (id: string) => screen.getByRole("button", { name: `Pin Session: Session ${id}` })
const unpin = (id: string) => screen.getByRole("button", { name: `Unpin Session: Session ${id}` })

describe("session lane pins", () => {
  beforeEach(() => useAppUiStore.setState({ promptUsagePinnedSessionIds: [] }))

  it("shifts pins and session title boxes together without shrinking pin targets, including pinned rows", () => {
    const style = document.createElement("style")
    style.textContent = ["prompt-usage-session-lanes.css", "prompt-usage-pin-button.css"].map(name => readFileSync(resolve(process.cwd(), `src/components/${name}`), "utf8")).join("\n")
    document.head.append(style)
    try {
      render(<PromptUsageSessionLanes {...props([item("a", 5), item("b", 10)])} />)
      const expectRowSpacing = () => {
        for (const button of document.querySelectorAll(".prompt-session-pin")) {
          const computed = getComputedStyle(button)
          expect(computed.position).toBe("absolute")
          expect(computed.marginLeft).toBe("4px")
          expect(computed.width).toBe("24px")
          expect(computed.height).toBe("36px")
          const title = button.parentElement!.querySelector(".prompt-session-identity")!
          const titleStyle = getComputedStyle(title)
          expect(titleStyle.marginLeft).toBe("4px")
          expect(titleStyle.flexGrow).toBe("1")
          expect(titleStyle.paddingLeft).toBe("9px")
        }
      }
      expectRowSpacing()
      fireEvent.click(pin("b"))
      expect(unpin("b")).toHaveAttribute("aria-pressed", "true")
      expectRowSpacing()
    } finally {
      style.remove()
    }
  })

  it("moves the newest pin first, supports multiple pins, and restores natural order on unpin", () => {
    const inputs = props([item("a", 5), item("b", 10), item("c", 15)])
    render(<PromptUsageSessionLanes {...inputs} />)
    expect(order()).toEqual(["a", "b", "c"])
    expect(pin("c")).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(pin("c"))
    expect(order()).toEqual(["c", "a", "b"])
    expect(unpin("c")).toHaveAttribute("aria-pressed", "true")
    expect(unpin("c").closest(".prompt-session-lane")).toHaveAttribute("data-pinned", "true")
    fireEvent.click(pin("b"))
    expect(order()).toEqual(["b", "c", "a"])
    fireEvent.click(unpin("c"))
    expect(order()).toEqual(["b", "a", "c"])
    fireEvent.click(unpin("b"))
    expect(order()).toEqual(["a", "b", "c"])
    expect(inputs.onFocusSession).not.toHaveBeenCalled()
    expect(inputs.onSelect).not.toHaveBeenCalled()
  })

  it("retains a filtered session's pin and restores its position when the session returns", () => {
    const items = [item("a", 5), item("b", 10), item("c", 15)]
    const inputs = props(items)
    const { rerender } = render(<PromptUsageSessionLanes {...inputs} />)
    fireEvent.click(pin("c"))
    rerender(<PromptUsageSessionLanes {...inputs} items={items.slice(0, 2)} />)
    expect(order()).toEqual(["a", "b"])
    expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["c"])
    rerender(<PromptUsageSessionLanes {...inputs} />)
    expect(order()).toEqual(["c", "a", "b"])
    expect(unpin("c")).toHaveAttribute("aria-pressed", "true")
  })

  it("stacks only visible pins beneath the axis and closes gaps after filtering or unpinning", () => {
    useAppUiStore.setState({ promptUsagePinnedSessionIds: ["hidden", "c", "b"] })
    const items = [item("a", 5), item("b", 10), item("c", 15)]
    const inputs = props(items)
    const { rerender } = render(<PromptUsageSessionLanes {...inputs} />)
    const row = (id: string) => document.querySelector<HTMLElement>(`[data-session-id="${id}"]`)!
    expect(row("c").style.getPropertyValue("--pinned-row-index")).toBe("0")
    expect(row("b").style.getPropertyValue("--pinned-row-index")).toBe("1")
    rerender(<PromptUsageSessionLanes {...inputs} items={items.slice(0, 2)} />)
    expect(row("b").style.getPropertyValue("--pinned-row-index")).toBe("0")
    fireEvent.click(unpin("b"))
    expect(row("b")).not.toHaveAttribute("data-pinned")
    expect(row("b").style.getPropertyValue("--pinned-row-index")).toBe("")
  })

  it("reorders pinned titles with the keyboard without changing Session focus", () => {
    useAppUiStore.setState({ promptUsagePinnedSessionIds: ["c", "b"] })
    const inputs = props([item("a", 5), item("b", 10), item("c", 15)])
    render(<PromptUsageSessionLanes {...inputs} />)
    const title = screen.getByRole("button", { name: "Focus Session: Session c" })
    title.focus()
    fireEvent.keyDown(title, { altKey: true, key: "ArrowDown" })
    expect(order()).toEqual(["b", "c", "a"])
    expect(title).toHaveFocus()
    expect(inputs.onFocusSession).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem("one-more-prompt.ui.prompt-usage-pins.v1")!)).toEqual(["b", "c"])
  })

  it("supports Enter and Space without moving focus away from the reordered pin", async () => {
    const user = userEvent.setup()
    const inputs = props([item("a", 5), item("b", 10)])
    render(<PromptUsageSessionLanes {...inputs} />)
    pin("b").focus()
    await user.keyboard("{Enter}")
    expect(order()).toEqual(["b", "a"])
    expect(unpin("b")).toHaveFocus()
    await user.keyboard(" ")
    expect(order()).toEqual(["a", "b"])
    expect(pin("b")).toHaveFocus()
    expect(inputs.onFocusSession).not.toHaveBeenCalled()
  })

  it("keeps prompt previews available after pinning the row already at the top", () => {
    render(<PromptUsageSessionLanes {...props([item("a", 15), item("b", 30)])} />)
    fireEvent.click(pin("a"))
    expect(order()).toEqual(["a", "b"])
    const events = document.querySelector<HTMLElement>(".prompt-session-events")!
    vi.spyOn(events, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 70))
    fireEvent.pointerMove(events.querySelector(".prompt-session-event")!, { clientX: 150, clientY: 35, pointerType: "mouse" })
    expect(screen.getByTestId("prompt-usage-details-column")).toHaveTextContent("Request a")
  })
})
