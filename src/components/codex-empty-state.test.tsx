import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CodexEmptyState, isCodexSignInRequired } from "@/components/codex-empty-state"
import { APP_LANGUAGES } from "@/lib/i18n"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

beforeEach(() => useAppPreferencesStore.getState().resetState())

describe("CodexEmptyState", () => {
  it("recognizes only the exact expected Codex sign-in state", () => {
    expect(isCodexSignInRequired("Open Codex and sign in to continue.")).toBe(true)
    for (const error of [null, undefined, "", "Session expired. Sign in again.", "Network request failed.", "Open Codex and sign in to continue", " Open Codex and sign in to continue."]) {
      expect(isCodexSignInRequired(error)).toBe(false)
    }
  })

  it("explains first use and checks records without promising account access", () => {
    const onCheckForRecords = vi.fn()
    render(<CodexEmptyState onCheckForRecords={onCheckForRecords} />)

    expect(screen.getByRole("heading", { name: "Ready For Your First Codex Session" })).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByText("Your prompt history stays on this computer.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Check For Records" }))
    expect(onCheckForRecords).toHaveBeenCalledTimes(1)
  })

  it("keeps the same action identifiable and prevents repeat checks while checking", () => {
    const onCheckForRecords = vi.fn()
    const { rerender } = render(<CodexEmptyState onCheckForRecords={onCheckForRecords} />)
    const action = screen.getByRole("button", { name: "Check For Records" })
    action.focus()

    rerender(<CodexEmptyState onCheckForRecords={onCheckForRecords} checking />)
    expect(screen.getByRole("button", { name: "Check For Records" })).toBe(action)
    expect(action).toBeDisabled()
    expect(action).toHaveTextContent("Checking For Records...")
    expect(screen.getByTestId("codex-empty-state")).toHaveAttribute("aria-busy", "true")
    fireEvent.click(action)
    expect(onCheckForRecords).not.toHaveBeenCalled()
  })

  it.each(APP_LANGUAGES)("supplies complete first-use copy in $label", ({ value }) => {
    useAppPreferencesStore.setState({ language: value })
    render(<CodexEmptyState onCheckForRecords={vi.fn()} />)
    expect(screen.getAllByRole("heading")).toHaveLength(4)
    expect(screen.getByRole("button").getAttribute("aria-label")).toBeTruthy()
    expect(screen.getByTestId("codex-empty-state")).not.toHaveTextContent("undefined")
  })
})
