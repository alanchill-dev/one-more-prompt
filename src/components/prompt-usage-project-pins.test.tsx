import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PromptUsageColumnBrowser } from "./prompt-usage-columns"
import { useAppUiStore } from "@/stores/app-ui-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import type { PromptUsageProject, PromptUsageSession } from "@/lib/prompt-usage"

const session = (id: string, title: string): PromptUsageSession => ({ id, title, updatedAt: "2026-10-21T09:00:00Z", promptCount: 0, turns: [], isActive: false, codexOrder: 0, costUsd: null, estimationStatus: "unknown" })
const a = session("a", "Alpha"), b = session("b", "Beta"), solo = session("solo-session", "Independent")
const project: PromptUsageProject = { id: "project", name: "Product Website", kind: "project", sessions: [a, b], sessionCount: 2, promptCount: 0, updatedAt: a.updatedAt, isActive: false, codexOrder: 0 }
const standalone: PromptUsageProject = { ...project, id: "standalone", name: solo.title, kind: "standalone", sessions: [solo], sessionCount: 1 }
const entries = [project, standalone]
const callbacks = { onSelectEntry: vi.fn(), onSelectSession: vi.fn(), onSelectTurn: vi.fn(), onNavigateToSession: vi.fn(), onCloseInspector: vi.fn(), onCopy: vi.fn() }
const browser = (rows = entries) => <PromptUsageColumnBrowser {...callbacks} entries={rows} fullEntries={entries} selectedEntryId="project" expandedEntryId="project" selectedSessionId="a" selectedTurnId={null} copyState={null} />
const pinnedOrder = () => [...screen.getByTestId("prompt-usage-pinned-sessions").querySelectorAll<HTMLElement>("[data-session-id]")].map(row => row.dataset.sessionId)

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

beforeEach(() => {
  useAppPreferencesStore.setState({ language: "en" })
  useAppUiStore.setState({ promptUsagePinnedSessionIds: [] })
  usePromptUsageUnreadStore.setState({ activeKeys: [], unreadKeys: [] })
  Object.values(callbacks).forEach(callback => callback.mockClear())
})

it("pins both Session kinds with one shared control without selecting, navigating or marking read", () => {
  render(browser())
  const pin = screen.getByRole("button", { name: "Pin Session: Alpha" })
  expect(pin.closest("button")?.parentElement?.closest("button")).toBeNull()
  pin.focus()
  fireEvent.click(pin)
  expect(pinnedOrder()).toEqual(["a"])
  expect(screen.getByRole("button", { name: "Unpin Session: Alpha" })).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByRole("button", { name: "Unpin Session: Alpha" })).toHaveFocus()
  expect(within(screen.getByTestId("prompt-usage-pinned-sessions")).getByText("Product Website")).toBeVisible()
  expect(screen.getAllByRole("button", { name: "Open Session Alpha" })).toHaveLength(1)
  fireEvent.click(screen.getByRole("button", { name: "Pin Session: Independent" }))
  expect(pinnedOrder()).toEqual(["solo-session", "a"])
  expect(screen.queryByTestId("prompt-usage-entry-standalone")).toBeNull()
  expect(screen.getByRole("button", { name: "Open Project Product Website" })).toBeVisible()
  expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["solo-session", "a"])
  Object.values(callbacks).forEach(callback => expect(callback).not.toHaveBeenCalled())
  expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual([])
})

it("uses shared pin order, retains supplied empty-date rows and unpins back into the hierarchy", () => {
  useAppUiStore.setState({ promptUsagePinnedSessionIds: ["b", "a"] })
  const view = render(browser())
  expect(pinnedOrder()).toEqual(["b", "a"])
  view.rerender(browser([{ ...project, sessions: [{ ...a, turns: [], promptCount: 0 }, { ...b, turns: [], promptCount: 0 }] }]))
  expect(pinnedOrder()).toEqual(["b", "a"])
  fireEvent.click(screen.getByRole("button", { name: "Unpin Session: Alpha" }))
  expect(pinnedOrder()).toEqual(["b"])
  expect(screen.getByTestId("prompt-usage-session-a")).toBeVisible()
  expect(screen.getByRole("button", { name: "Open Project Product Website" })).toBeVisible()
})

it("shares title keyboard reordering and restores focus without Timeline layout classes", () => {
  useAppUiStore.setState({ promptUsagePinnedSessionIds: ["a", "hidden", "b"] })
  render(browser())
  const title = screen.getByRole("button", { name: "Open Session Alpha" })
  title.focus()
  fireEvent.keyDown(title, { altKey: true, key: "ArrowDown" })
  expect(pinnedOrder()).toEqual(["b", "a"])
  expect(title).toHaveFocus()
  expect(screen.getByTestId("prompt-usage-scope-column").querySelector(".prompt-session-lane")).toBeNull()
  expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["hidden", "b", "a"])
  expect(callbacks.onSelectSession).not.toHaveBeenCalled()
  act(() => useAppUiStore.getState().reorderPromptUsageSessionPin("a", "b"))
  expect(pinnedOrder()).toEqual(["a", "b"])
})

it("reorders pinned project titles by dragging and suppresses the following selection click", () => {
  vi.stubGlobal("PointerEvent", MouseEvent)
  useAppUiStore.setState({ promptUsagePinnedSessionIds: ["a", "b"] })
  render(browser())
  const pinned = screen.getByTestId("prompt-usage-pinned-sessions")
  for (const [index, row] of [...pinned.querySelectorAll<HTMLElement>("[data-session-id]")].entries()) {
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ top: index * 60, bottom: index * 60 + 60, height: 60 } as DOMRect)
  }
  const title = screen.getByRole("button", { name: "Open Session Alpha" })
  fireEvent.pointerDown(title, { button: 0, clientY: 30 })
  fireEvent.pointerMove(title, { clientY: 90 })
  expect(pinnedOrder()).toEqual(["a", "b"])
  expect(title.closest("[data-session-id]")).toHaveAttribute("data-pin-dragging", "true")
  fireEvent.pointerUp(title, { clientY: 90 })
  fireEvent.click(title)
  expect(pinnedOrder()).toEqual(["b", "a"])
  expect(callbacks.onSelectSession).not.toHaveBeenCalled()
})

it("preserves the existing relationship entry before and after pinning a delegated Session", () => {
  const source = { ...a, relatedTaskCount: 1, relatedTasks: [{ id: b.id, title: b.title }] }
  const child = { ...b, isDelegated: true, relatedSourceId: a.id, relatedSourceTitle: a.title }
  render(browser([{ ...project, sessions: [source, child] }]))
  const destination = screen.getByTestId("prompt-usage-relationship-destination")
  fireEvent.click(destination)
  expect(callbacks.onNavigateToSession).toHaveBeenLastCalledWith(b.id)
  callbacks.onNavigateToSession.mockClear()
  fireEvent.click(screen.getByRole("button", { name: "Pin Session: Beta" }))
  const pinned = within(screen.getByTestId("prompt-usage-pinned-sessions"))
  const pinnedDestination = pinned.getByTestId("prompt-usage-relationship-destination")
  expect(pinnedDestination).toHaveAccessibleName(destination.getAttribute("aria-label")!)
  expect(pinned.getByRole("button", { name: "Open Session Beta" })).toHaveClass("pr-[5.5rem]")
  fireEvent.click(pinnedDestination)
  expect(callbacks.onNavigateToSession).toHaveBeenCalledExactlyOnceWith(b.id)
  expect(callbacks.onSelectSession).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Pin Session: Alpha" }))
  expect(pinned.getByTestId("prompt-usage-relationship-source-node")).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "Unpin Session: Beta" }))
  const restoredDestination = screen.getByTestId("prompt-usage-relationship-destination")
  expect(restoredDestination.closest("[data-session-id]")).toHaveAttribute("data-session-id", b.id)
  expect(restoredDestination).toHaveAccessibleName(destination.getAttribute("aria-label")!)
  callbacks.onNavigateToSession.mockClear()
  fireEvent.click(restoredDestination)
  expect(callbacks.onNavigateToSession).toHaveBeenCalledExactlyOnceWith(b.id)
})
