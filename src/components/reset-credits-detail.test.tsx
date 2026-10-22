import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import type { MetricLine, ResetCredits } from "@/bindings"
import { ResetCreditsDetail } from "./reset-credits-detail"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const snapshot: ResetCredits = {
  availableCount: 2,
  credits: [
    { id: "later", grantedAt: "2026-09-05T04:19:00Z", expiresAt: "2026-10-05T04:19:00Z" },
    { id: "earlier", grantedAt: "2026-09-04T02:11:00Z", expiresAt: "2026-10-04T02:11:00Z" },
  ],
  history: [
    { id: "grant-1", kind: "granted", occurredAt: "2026-09-04T02:11:00Z" },
    { id: "used-1", kind: "used", occurredAt: "2026-09-10T07:12:00Z" },
    { id: "grant-2", kind: "granted", occurredAt: "2026-09-05T04:19:00Z" },
  ],
  historyState: "ready",
  historyWindowStart: "2026-08-14T00:00:00Z",
  historyAsOf: "2026-09-13T00:00:00Z",
}

async function openDetail(data: ResetCredits | null = snapshot, value = "2 available") {
  const line: Extract<MetricLine, { type: "text" }> = {
    type: "text", label: "Rate Limit Resets", value, color: null, subtitle: null, resetExpiry: null, resetCredits: data,
  }
  render(<div className="app-panel-surface"><ResetCreditsDetail line={line} value={value} /></div>)
  const user = userEvent.setup()
  const trigger = screen.getByRole("button", { name: /View Usage Reset Details/ })
  await user.click(trigger)
  const dialog = await screen.findByRole("dialog", { name: "Usage Resets" })
  return { user, trigger, dialog }
}

describe("ResetCreditsDetail", () => {
  beforeEach(() => useAppPreferencesStore.getState().resetState())

  it("opens inside the app frame and lists each credit with its own expiry, earliest first", async () => {
    const { dialog } = await openDetail()
    expect(dialog.closest(".app-panel-surface")).not.toBeNull()
    const rows = within(dialog).getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector(".reset-credits-row-date time")).toHaveAttribute("datetime", "2026-10-04T02:11:00Z")
    expect(rows[1].querySelector(".reset-credits-row-date time")).toHaveAttribute("datetime", "2026-10-05T04:19:00Z")
    expect(within(rows[0]).getByText("Expires First")).toBeInTheDocument()
    expect(within(rows[1]).queryByText("Expires First")).not.toBeInTheDocument()
  })

  it("keeps two credits that expire at the same instant as separate rows", async () => {
    await openDetail({ ...snapshot, credits: [snapshot.credits![0], { ...snapshot.credits![0], id: "same-expiry-different-credit" }] })
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
  })

  it("shows actual received and used event times in reverse chronological order", async () => {
    const { user } = await openDetail()
    await user.click(screen.getByRole("tab", { name: "History" }))
    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent("Reset Used")
    expect(rows[0].querySelector("time")).toHaveAttribute("datetime", "2026-09-10T07:12:00Z")
    expect(rows[1]).toHaveTextContent("Reset Received")
    expect(rows[1].querySelector("time")).toHaveAttribute("datetime", "2026-09-05T04:19:00Z")
    expect(screen.getByText("Past 30 Days")).toBeInTheDocument()
  })

  it("supports keyboard tabs, traps focus, and restores the trigger on Escape", async () => {
    const { user, trigger, dialog } = await openDetail()
    await waitFor(() => expect(dialog).toHaveFocus())
    await user.tab()
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("tab", { name: "Available 2" })).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("shows truthful zero-credit and empty-history states", async () => {
    const { user } = await openDetail({ ...snapshot, availableCount: 0, credits: [], history: [] }, "0 available")
    expect(screen.getByText("No Resets Available")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "History" }))
    expect(screen.getByText("No History for This Period")).toBeInTheDocument()
  })

  it("distinguishes unavailable detail from a successful empty response", async () => {
    const { user } = await openDetail(null)
    expect(screen.getByText(/Available reset details could not be loaded/)).toBeInTheDocument()
    expect(screen.queryByText("No Resets Available")).not.toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "History" }))
    expect(screen.getByText(/Reset history could not be loaded/)).toBeInTheDocument()
    expect(screen.queryByText("No History for This Period")).not.toBeInTheDocument()
  })

  it("marks partial history while retaining the events that were received", async () => {
    const { user } = await openDetail({ ...snapshot, historyState: "partial" })
    await user.click(screen.getByRole("tab", { name: "History" }))
    expect(screen.getByRole("status")).toHaveTextContent(/older/)
    expect(screen.getByText("Reset Used")).toBeInTheDocument()
  })

  it("does not invent an expiry when the server omits it", async () => {
    await openDetail({ ...snapshot, credits: [{ id: "without-expiry", expiresAt: null, grantedAt: null }] })
    expect(screen.getByText("Expiration time unavailable")).toBeInTheDocument()
    expect(screen.queryByText("Expires First")).not.toBeInTheDocument()
  })
})
