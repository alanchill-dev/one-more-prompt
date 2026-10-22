import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PromptUsageColumnBrowser } from "./prompt-usage-columns"
import { useAppUiStore } from "@/stores/app-ui-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import type { PromptUsageProject, PromptUsageSession } from "@/lib/prompt-usage"

const session: PromptUsageSession = { id: "session", title: "Homepage", updatedAt: "2026-10-21T09:00:00Z", promptCount: 0, turns: [], isActive: false, codexOrder: 0, costUsd: null, estimationStatus: "unknown" }
const project: PromptUsageProject = { id: "site", name: "Website", kind: "project", sessions: [session], sessionCount: 1, promptCount: 0, updatedAt: session.updatedAt, isActive: false, codexOrder: 0 }
const second: PromptUsageProject = { ...project, id: "photo", name: "Photo Library", sessions: [{ ...session, id: "other", title: "Upload" }] }
const callbacks = { onSelectEntry: vi.fn(), onSelectSession: vi.fn(), onSelectTurn: vi.fn(), onNavigateToSession: vi.fn(), onCloseInspector: vi.fn(), onCopy: vi.fn() }
const browser = (entries = [project, second]) => <PromptUsageColumnBrowser {...callbacks} entries={entries} selectedEntryId="site" expandedEntryId="site" selectedSessionId="session" selectedTurnId={null} copyState={null} />
const order = () => [...screen.getByTestId("prompt-usage-pinned-projects").querySelectorAll<HTMLElement>('[data-pin-row-id^="project:"]')].map(row => row.dataset.pinRowId)

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

beforeEach(() => {
  useAppPreferencesStore.setState({ language: "en" })
  useAppUiStore.setState({ promptUsagePinnedProjectIds: [], promptUsagePinnedSessionIds: [] })
  usePromptUsageUnreadStore.setState({ activeKeys: [], unreadKeys: [] })
  Object.values(callbacks).forEach(callback => callback.mockClear())
})

it("pins a Project folder above Session pins without changing selection or duplicating the folder", () => {
  useAppUiStore.setState({ promptUsagePinnedSessionIds: ["other"] })
  render(browser())
  const pin = screen.getByRole("button", { name: "Pin Project: Website" })
  pin.focus()
  fireEvent.click(pin)
  expect(order()).toEqual(["project:site"])
  expect(screen.getByRole("button", { name: "Unpin Project: Website" })).toHaveFocus()
  const pinned = screen.getByTestId("prompt-usage-pinned-projects")
  const folder = within(pinned).getByRole("button", { name: "Open Project Website" })
  expect(folder).toHaveAttribute("aria-expanded", "true")
  const child = within(pinned).getByRole("button", { name: "Open Session Homepage" })
  expect(child).toBeVisible()
  expect(child.closest(".prompt-project-pinned-children")).not.toBeNull()
  expect(folder.closest("[data-pin-row-id]")?.contains(child)).toBe(false)
  expect(screen.getAllByRole("button", { name: "Open Project Website" })).toHaveLength(1)
  expect(pinned.compareDocumentPosition(screen.getByTestId("prompt-usage-pinned-sessions")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  Object.values(callbacks).forEach(callback => expect(callback).not.toHaveBeenCalled())
  expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["other"])
})

it("retains empty-date pinned folders and keeps the folder's expand-only action", () => {
  useAppUiStore.setState({ promptUsagePinnedProjectIds: ["site"] })
  const view = render(browser([{ ...project, sessions: [], sessionCount: 0, promptCount: 0 }]))
  expect(order()).toEqual(["project:site"])
  fireEvent.click(screen.getByRole("button", { name: "Open Project Website" }))
  expect(callbacks.onSelectEntry).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "site", sessions: [] }))
  expect(callbacks.onSelectSession).not.toHaveBeenCalled()
  expect(callbacks.onNavigateToSession).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Unpin Project: Website" }))
  expect(screen.queryByTestId("prompt-usage-pinned-projects")).toBeNull()
  view.rerender(browser())
  expect(screen.getByRole("button", { name: "Pin Project: Website" })).toBeVisible()
})

it("reorders Project pins independently and keeps Session pins out of the Project drag contract", () => {
  useAppUiStore.setState({ promptUsagePinnedProjectIds: ["site", "photo"], promptUsagePinnedSessionIds: ["other"] })
  render(browser())
  const folder = screen.getByRole("button", { name: "Open Project Website" })
  folder.focus()
  fireEvent.keyDown(folder, { altKey: true, key: "ArrowDown" })
  expect(order()).toEqual(["project:photo", "project:site"])
  expect(folder).toHaveFocus()
  expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["other"])
  expect(callbacks.onSelectEntry).not.toHaveBeenCalled()
  act(() => useAppUiStore.getState().reorderPromptUsageProjectPin("site", "photo"))
  expect(order()).toEqual(["project:site", "project:photo"])
})

it("drags only Project folders and suppresses the following expand click", () => {
  vi.stubGlobal("PointerEvent", MouseEvent)
  useAppUiStore.setState({ promptUsagePinnedProjectIds: ["site", "photo"], promptUsagePinnedSessionIds: ["other"] })
  render(browser())
  const pinned = screen.getByTestId("prompt-usage-pinned-projects")
  for (const [index, row] of [...pinned.querySelectorAll<HTMLElement>('[data-pin-row-id^="project:"]')].entries()) {
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ top: index * 100, bottom: index * 100 + 44, height: 44 } as DOMRect)
  }
  const folder = screen.getByRole("button", { name: "Open Project Website" })
  fireEvent.pointerDown(folder, { button: 0, clientY: 22 })
  fireEvent.pointerMove(folder, { clientY: 122 })
  expect(order()).toEqual(["project:site", "project:photo"])
  fireEvent.pointerUp(folder, { clientY: 122 })
  fireEvent.click(folder)
  expect(order()).toEqual(["project:photo", "project:site"])
  expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["other"])
  expect(callbacks.onSelectEntry).not.toHaveBeenCalled()
})
