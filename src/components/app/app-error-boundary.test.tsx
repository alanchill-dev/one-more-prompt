import { render, screen } from "@testing-library/react"
import { useLayoutEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { AppErrorBoundary, reportFrontendError } from "./app-error-boundary"

const sensitiveMessage = "private prompt with credential sk-private-test-value"

function RenderFailure(): never {
  throw new TypeError(sensitiveMessage)
}

function LayoutFailure() {
  useLayoutEffect(() => { throw new SyntaxError(sensitiveMessage) }, [])
  return <div>Workspace</div>
}

beforeEach(() => {
  useAppPreferencesStore.getState().resetState()
})
afterEach(() => useAppPreferencesStore.getState().resetState())

describe("app error recovery", () => {
  it("keeps a healthy workspace unchanged", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    render(<AppErrorBoundary><div>Workspace</div></AppErrorBoundary>, { onCaughtError: reportFrontendError })
    expect(screen.getByText("Workspace")).toBeVisible()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(log).not.toHaveBeenCalled()
  })

  it.each([RenderFailure, LayoutFailure])("shows localized recovery for %s and logs no error payload", Failure => {
    useAppPreferencesStore.getState().setLanguage("zh-TW")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    render(<AppErrorBoundary><Failure /></AppErrorBoundary>, { onCaughtError: reportFrontendError })
    expect(screen.getByRole("alert")).toHaveTextContent("畫面暫時無法顯示")
    expect(screen.getByRole("button", { name: "重新載入 App" })).toBeEnabled()
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument()
    expect(screen.queryByText(sensitiveMessage)).not.toBeInTheDocument()
    expect(log).toHaveBeenCalledWith("Frontend Error", expect.objectContaining({
      type: Failure === RenderFailure ? "TypeError" : "SyntaxError",
      componentStack: expect.stringContaining(Failure.name),
    }))
    expect(JSON.stringify(log.mock.calls)).not.toContain(sensitiveMessage)
  })

  it("omits thrown payloads, nested causes and messages from runtime reports", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = new Error(sensitiveMessage)
    Object.assign(error, { cause: { prompt: sensitiveMessage } })
    reportFrontendError(error)
    reportFrontendError({ prompt: sensitiveMessage })
    expect(log).toHaveBeenNthCalledWith(1, "Frontend Error", { type: "Error", componentStack: null })
    expect(log).toHaveBeenNthCalledWith(2, "Frontend Error", { type: "NonErrorThrow", componentStack: null })
    expect(JSON.stringify(log.mock.calls)).not.toContain(sensitiveMessage)
  })
})
