import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ContextualGuide } from "./contextual-guide"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const mocks = vi.hoisted(() => ({ pending: vi.fn(), dismiss: vi.fn(), language: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }))
vi.mock("@/lib/settings", async original => ({
  ...await original<typeof import("@/lib/settings")>(),
  loadOnboardingGuidePending: mocks.pending,
  loadAppLanguage: mocks.language,
  dismissOnboardingGuide: mocks.dismiss,
}))

beforeEach(() => {
  mocks.pending.mockResolvedValue(true)
  mocks.dismiss.mockResolvedValue(undefined)
  mocks.language.mockResolvedValue("en")
  useAppPreferencesStore.getState().resetState()
})

async function mountGuide() {
  const view = render(<div><button type="button">Original Workspace</button><ContextualGuide /></div>)
  await screen.findByTestId("contextual-guide")
  return { ...view, frame: view.container.querySelector("iframe")! }
}

function message(source: Window | null, data: unknown) {
  fireEvent(window, new MessageEvent("message", { source, data }))
}

describe("Isolated workspace guide host", () => {
  it("keeps the real workspace mounted and suspends its input until exit", async () => {
    const { frame } = await mountGuide()
    const original = screen.getByRole("button", { name: "Original Workspace", hidden: true })
    expect(original.inert).toBe(true)
    expect(frame.src).toContain("/guide.html")
    message(frame.contentWindow, { type: "omp-guide-exit", finished: false })
    await waitFor(() => expect(screen.queryByTestId("contextual-guide")).not.toBeInTheDocument())
    expect(original).toBeInTheDocument()
    expect(original.inert).toBeFalsy()
    expect(mocks.dismiss).toHaveBeenCalledWith(false)
  })

  it("names the guide for assistive technology without a native hover tooltip over every step", async () => {
    const { frame } = await mountGuide()
    expect(frame).toHaveAttribute("aria-label", "Getting Started")
    expect(frame).not.toHaveAttribute("title")
  })

  it("accepts only its own iframe and passes display preferences without real usage or credentials", async () => {
    mocks.language.mockResolvedValue("zh-TW")
    useAppPreferencesStore.getState().setLanguage("zh-TW")
    const { frame } = await mountGuide()
    const send = vi.spyOn(frame.contentWindow!, "postMessage")
    message(window, { type: "omp-guide-exit", finished: true })
    message(window, { type: "omp-guide-ready" })
    expect(send).not.toHaveBeenCalled()
    expect(mocks.dismiss).not.toHaveBeenCalled()
    message(frame.contentWindow, { type: "omp-guide-ready" })
    await waitFor(() => expect(send).toHaveBeenCalledWith({
      type: "omp-guide-init", language: "zh-TW", themeMode: "system",
      modelPalette: useAppPreferencesStore.getState().modelColors,
    }, "*"))
    message(frame.contentWindow, { type: "omp-guide-exit", finished: "yes" })
    expect(mocks.dismiss).not.toHaveBeenCalled()
  })

  it("records completion and supports Escape without changing the real document", async () => {
    const { frame } = await mountGuide()
    message(frame.contentWindow, { type: "omp-guide-exit", finished: true })
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith(true))
    expect(screen.getByText("Original Workspace")).toBeInTheDocument()
  })

  it("keeps the guide open with a retry action if saving dismissal fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.dismiss.mockRejectedValueOnce(new Error("disk unavailable"))
    await mountGuide()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be dismissed")
    expect(screen.getByTestId("contextual-guide")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByTestId("contextual-guide")).not.toBeInTheDocument())
  })

  it("does not mount a guide unless requested", async () => {
    mocks.pending.mockResolvedValue(false)
    render(<ContextualGuide />)
    await waitFor(() => expect(mocks.pending).toHaveBeenCalled())
    expect(screen.queryByTestId("contextual-guide")).not.toBeInTheDocument()
  })

  it("refreshes the saved language instead of sending the main window's stale English preference", async () => {
    mocks.language.mockResolvedValue("zh-TW")
    const { frame } = await mountGuide()
    useAppPreferencesStore.getState().setLanguage("en")
    const send = vi.spyOn(frame.contentWindow!, "postMessage")
    message(frame.contentWindow, { type: "omp-guide-ready" })
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ language: "zh-TW" }), "*"))
    expect(useAppPreferencesStore.getState().language).toBe("zh-TW")
  })

  it("refreshes the main language after setup even when the guide was not requested", async () => {
    mocks.pending.mockResolvedValue(false)
    mocks.language.mockResolvedValue("ja")
    render(<ContextualGuide />)
    await waitFor(() => expect(useAppPreferencesStore.getState().language).toBe("ja"))
    expect(screen.queryByTestId("contextual-guide")).not.toBeInTheDocument()
  })

  it("reports a guide language read failure without sending an English fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { frame } = await mountGuide()
    mocks.language.mockRejectedValueOnce(new Error("store unavailable"))
    const send = vi.spyOn(frame.contentWindow!, "postMessage")
    message(frame.contentWindow, { type: "omp-guide-ready" })
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()
    mocks.language.mockResolvedValue("ja")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    const retrySend = vi.spyOn(frame.contentWindow!, "postMessage")
    message(frame.contentWindow, { type: "omp-guide-ready" })
    await waitFor(() => expect(retrySend).toHaveBeenCalledWith(expect.objectContaining({ language: "ja" }), "*"))
  })
})
