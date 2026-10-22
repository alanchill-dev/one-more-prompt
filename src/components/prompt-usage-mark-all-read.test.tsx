import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PromptUsageProject } from "@/lib/prompt-usage"
import { usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import { PromptUsageMarkAllRead } from "./prompt-usage-mark-all-read"

vi.mock("@/hooks/use-i18n", () => ({ useI18n: () => (key: string, values?: { count: number }) => ({
  "promptUsage.markAllRead": "全部已讀",
  "promptUsage.markAllReadHint": "將所有專案的未讀結果標為已讀，不受目前篩選影響",
  "promptUsage.markedAllRead": `已將 ${values?.count} 個結果標為已讀`,
  "promptUsage.undoMarkAllRead": "復原",
  "promptUsage.markAllReadUndone": "已還原未讀狀態",
})[key] }))

function projects(isActive: boolean, sessionId = "session"): PromptUsageProject[] {
  return [{ sessions: [{ id: sessionId, turns: [{ id: "turn", isActive }] }] }] as PromptUsageProject[]
}
function complete(sessionId = "session") {
  const store = usePromptUsageUnreadStore.getState()
  store.observeProjects(projects(true, sessionId))
  store.observeProjects(projects(false, sessionId))
}
function workspace() {
  return render(<div className="app-panel-surface relative overflow-hidden" data-testid="app-frame">
    <header data-testid="list-header"><PromptUsageMarkAllRead /></header>
    <nav>Project Rows</nav>
  </div>)
}

beforeEach(() => {
  vi.useFakeTimers()
  usePromptUsageUnreadStore.getState().resetState()
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe("PromptUsageMarkAllRead", () => {
  it("hides the action with no unread completions, including historical prompts", () => {
    usePromptUsageUnreadStore.getState().observeProjects(projects(false))
    workspace()
    expect(screen.queryByRole("button", { name: /^全部已讀/ })).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite")
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true")
    expect(screen.queryByRole("button", { name: "復原" })).not.toBeInTheDocument()
  })

  it("clears all projects and offers Undo without consuming a future completion", () => {
    complete("one")
    complete("two")
    usePromptUsageUnreadStore.getState().observeProjects(projects(true, "future"))
    workspace()
    expect(screen.getByRole("button", { name: "全部已讀 2" })).toHaveAttribute("title", "將所有專案的未讀結果標為已讀，不受目前篩選影響")
    fireEvent.click(screen.getByRole("button", { name: "全部已讀 2" }))
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual([])
    expect(JSON.parse(window.localStorage.getItem("one-more-prompt.ui.prompt-usage-unread.v1")!).unreadKeys).toEqual([])
    expect(screen.getByRole("status")).toHaveTextContent("已將 2 個結果標為已讀")
    expect(screen.queryByRole("button", { name: /^全部已讀/ })).not.toBeInTheDocument()
    expect(screen.getByRole("status").parentElement).toBe(screen.getByTestId("app-frame"))
    expect(screen.getByTestId("list-header")).not.toContainElement(screen.getByRole("status"))
    act(() => usePromptUsageUnreadStore.getState().observeProjects(projects(false, "future")))
    expect(screen.getByRole("button", { name: "全部已讀 1" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "復原" }))
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toHaveLength(3)
    expect(JSON.parse(window.localStorage.getItem("one-more-prompt.ui.prompt-usage-unread.v1")!).unreadKeys).toHaveLength(3)
    expect(screen.getByRole("status")).toHaveTextContent("已還原未讀狀態")
    expect(screen.queryByRole("button", { name: "復原" })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(8_000))
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })

  it("expires Undo after eight seconds and cancels its timer on unmount", () => {
    const schedule = vi.spyOn(window, "setTimeout")
    const cancel = vi.spyOn(window, "clearTimeout")
    complete()
    const { unmount } = workspace()
    fireEvent.click(screen.getByRole("button", { name: "全部已讀 1" }))
    act(() => vi.advanceTimersByTime(7_999))
    expect(screen.getByRole("button", { name: "復原" })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole("button", { name: "復原" })).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual([])
    act(() => complete("second"))
    fireEvent.click(screen.getByRole("button", { name: "全部已讀 1" }))
    const undoTimerIndex = schedule.mock.calls.map(([, delay]) => delay).lastIndexOf(8_000)
    const undoTimer = schedule.mock.results[undoTimerIndex].value
    unmount()
    expect(cancel).toHaveBeenCalledWith(undoTimer)
  })

  it("replaces an older Undo with the latest bulk action", () => {
    complete("one")
    workspace()
    fireEvent.click(screen.getByRole("button", { name: "全部已讀 1" }))
    act(() => vi.advanceTimersByTime(4_000))
    act(() => complete("two"))
    fireEvent.click(screen.getByRole("button", { name: "全部已讀 1" }))
    act(() => vi.advanceTimersByTime(4_001))
    fireEvent.click(screen.getByRole("button", { name: "復原" }))
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual(['["two","turn"]'])
  })

  it("keeps Undo keyboard accessible after the action disappears", async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    complete()
    workspace()
    screen.getByRole("button", { name: "全部已讀 1" }).focus()
    await user.keyboard("{Enter}")
    expect(screen.queryByRole("button", { name: /^全部已讀/ })).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByRole("button", { name: "復原" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("button", { name: "全部已讀 1" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("已還原未讀狀態")
  })

  it("keeps synthetic preview feedback inside its explicit host and never portals to the document body", () => {
    complete()
    const { unmount } = render(<section data-prompt-usage-feedback-surface className="relative overflow-hidden">
      <PromptUsageMarkAllRead />
    </section>)
    fireEvent.click(screen.getByRole("button", { name: "全部已讀 1" }))
    expect(screen.getByRole("status").parentElement).toHaveAttribute("data-prompt-usage-feedback-surface")
    unmount()
    render(<PromptUsageMarkAllRead />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})
