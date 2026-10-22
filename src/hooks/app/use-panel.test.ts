import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  getCurrentWindowMock,
  invokeMock,
  isTauriMock,
  listenMock,
  setSizeMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  listenMock: vi.fn(),
  getCurrentWindowMock: vi.fn(),
  setSizeMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}))

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
  LogicalSize: class LogicalSize {
    width: number
    height: number

    constructor(width: number, height: number) {
      this.width = width
      this.height = height
    }
  },
}))

import { usePanel } from "@/hooks/app/use-panel"

describe("usePanel", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue(undefined)
    isTauriMock.mockReset().mockReturnValue(true)
    listenMock.mockReset().mockResolvedValue(vi.fn())
    setSizeMock.mockReset().mockResolvedValue(undefined)
    getCurrentWindowMock.mockReset().mockReturnValue({ setSize: setSizeMock })
    window.localStorage.clear()
    Object.defineProperty(window.screen, "availHeight", { configurable: true, value: 900 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("migrates a saved width to the nearest supported preset", async () => {
    window.localStorage.setItem(
      "one-more-prompt.ui.panel-size.v1",
      JSON.stringify({ width: 1_420, height: 980 })
    )

    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    await waitFor(() => {
      expect(setSizeMock).toHaveBeenCalledWith(
        expect.objectContaining({ width: 1_440, height: 875 })
      )
    })
  })

  it("caps an oversized saved width at the wide preset", async () => {
    window.localStorage.setItem(
      "one-more-prompt.ui.panel-size.v1",
      JSON.stringify({ width: 1_800, height: 980 })
    )

    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    await waitFor(() => {
      expect(setSizeMock).toHaveBeenCalledWith(
        expect.objectContaining({ width: 1_440, height: 875 })
      )
    })
  })

  it("restores the compact preset when the modern layout marker is present", async () => {
    window.localStorage.setItem(
      "one-more-prompt.ui.panel-size.v1",
      JSON.stringify({ width: 730, height: 720 })
    )
    window.localStorage.setItem("one-more-prompt.ui.panel-size-layout.v2", "column-browser")

    renderHook(() =>
      usePanel({
        activeView: "settings",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    await waitFor(() => {
      expect(setSizeMock).toHaveBeenCalledWith(
        expect.objectContaining({ width: 980, height: 875 })
      )
    })
  })

  it("upgrades the legacy default width once for the column browser", async () => {
    window.localStorage.setItem(
      "one-more-prompt.ui.panel-size.v1",
      JSON.stringify({ width: 988, height: 720 })
    )

    const first = renderHook(() =>
      usePanel({
        activeView: "prompt-usage",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    await waitFor(() => {
      expect(setSizeMock).toHaveBeenCalledWith(
        expect.objectContaining({ width: 1_240, height: 875 })
      )
    })
    expect(window.localStorage.getItem("one-more-prompt.ui.panel-size-layout.v2")).toBe("column-browser")

    first.unmount()
    setSizeMock.mockClear()
    window.localStorage.setItem(
      "one-more-prompt.ui.panel-size.v1",
      JSON.stringify({ width: 988, height: 720 })
    )

    renderHook(() =>
      usePanel({
        activeView: "prompt-usage",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    await waitFor(() => {
      expect(setSizeMock).toHaveBeenCalledWith(
        expect.objectContaining({ width: 980, height: 875 })
      )
    })
  })

  it("persists only the selected width and applies the display-safe fixed height", () => {
    Object.defineProperty(window.screen, "availHeight", { configurable: true, value: 812 })

    const { result } = renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    act(() => {
      result.current.setPanelWidth(1_440)
    })

    expect(setSizeMock).toHaveBeenCalledWith(expect.objectContaining({ width: 1_440, height: 812 }))
    expect(JSON.parse(window.localStorage.getItem("one-more-prompt.ui.panel-size.v1") ?? "null")).toEqual({
      width: 1_440,
    })
    expect(window.localStorage.getItem("one-more-prompt.ui.panel-size-layout.v2")).toBe("column-browser")
  })

  it.each([
    [620, 980],
    [1_520, 1_440],
  ])("clamps a requested width of %s to %s", (requested, expected) => {
    Object.defineProperty(window.screen, "availHeight", { configurable: true, value: 812 })

    const { result } = renderHook(() =>
      usePanel({
        activeView: "settings",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    act(() => {
      result.current.setPanelWidth(requested)
    })

    expect(setSizeMock).toHaveBeenCalledWith(expect.objectContaining({
      width: expected,
      height: 812,
    }))
  })

  it("repositions after the native resize resolves", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 812 })

    const { result } = renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    act(() => {
      result.current.setPanelWidth(900)
    })

    expect(invokeMock).not.toHaveBeenCalledWith("reposition_panel")

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("reposition_panel")
    })
  })

  it("keeps the current page and About state when focus returns", () => {
    const setActiveView = vi.fn()
    const setShowAbout = vi.fn()

    renderHook(() =>
      usePanel({
        activeView: "settings",
        setActiveView,
        showAbout: true,
        setShowAbout,
      })
    )

    act(() => {
      window.dispatchEvent(new Event("focus"))
    })

    expect(setActiveView).not.toHaveBeenCalled()
    expect(setShowAbout).not.toHaveBeenCalled()
  })

  it("changes pinned state only after the native window accepts it", async () => {
    const { result } = renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    expect(result.current.isPinned).toBe(false)
    await act(async () => {
      await result.current.setPanelPinned(true)
    })

    expect(invokeMock).toHaveBeenCalledWith("set_panel_pinned", { pinned: true })
    expect(result.current.isPinned).toBe(true)
  })

  it("honors an explicit valid tray navigation event", async () => {
    const setActiveView = vi.fn()
    const callbacks = new Map<string, (event: { payload: unknown }) => void>()
    listenMock.mockImplementation(async (event, callback) => {
      callbacks.set(event, callback)
      return vi.fn()
    })

    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView,
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    await waitFor(() => expect(listenMock).toHaveBeenCalledTimes(2))

    act(() => {
      callbacks.get("tray:navigate")?.({ payload: "prompt-usage" })
    })

    expect(setActiveView).toHaveBeenCalledWith("prompt-usage")
  })

  it("ignores obsolete provider navigation payloads", async () => {
    const setActiveView = vi.fn()
    const callbacks = new Map<string, (event: { payload: unknown }) => void>()
    listenMock.mockImplementation(async (event, callback) => {
      callbacks.set(event, callback)
      return vi.fn()
    })

    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView,
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    await waitFor(() => expect(listenMock).toHaveBeenCalledTimes(2))

    act(() => {
      callbacks.get("tray:navigate")?.({ payload: "codex" })
    })

    expect(setActiveView).not.toHaveBeenCalled()
  })

  it.each([
    ["1", "home"],
    ["2", "prompt-usage"],
    ["3", "settings"],
  ] as const)("opens the %s shortcut view", (key, view) => {
    const setActiveView = vi.fn()
    renderHook(() =>
      usePanel({
        activeView: "settings",
        setActiveView,
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: true }))
    })

    if (view === "settings") {
      expect(setActiveView).not.toHaveBeenCalled()
    } else {
      expect(setActiveView).toHaveBeenCalledWith(view)
    }
  })

  it("opens a shortcut view with Control on Windows", () => {
    const setActiveView = vi.fn()
    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView,
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", ctrlKey: true }))
    })

    expect(setActiveView).toHaveBeenCalledWith("prompt-usage")
  })

  it("does not trigger page shortcuts while editing", () => {
    const setActiveView = vi.fn()
    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView,
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )
    const input = document.createElement("input")
    document.body.appendChild(input)

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "2", metaKey: true, bubbles: true }))
    })

    expect(setActiveView).not.toHaveBeenCalled()
    input.remove()
  })

  it("closes About with Escape before hiding the panel", () => {
    const setShowAbout = vi.fn()
    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: true,
        setShowAbout,
      })
    )

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })

    expect(setShowAbout).toHaveBeenCalledWith(false)
    expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")
  })

  it("hides the panel with Escape from a normal page", () => {
    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
      })
    )

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })

    expect(invokeMock).toHaveBeenCalledWith("hide_panel")
  })

  it("leaves Escape and navigation shortcuts to the open help dialog", () => {
    const setActiveView = vi.fn()
    renderHook(() => usePanel({ activeView: "home", setActiveView, showAbout: false, setShowAbout: vi.fn() }))
    const help = document.createElement("div")
    help.className = "prompt-help-frame"
    document.body.append(help)
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", metaKey: true }))
    })
    help.remove()
    expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")
    expect(setActiveView).not.toHaveBeenCalled()
  })

  it("handles tray show-about and unregisters both listeners", async () => {
    const setShowAbout = vi.fn()
    const callbacks = new Map<string, (event: { payload: unknown }) => void>()
    const unlistenNavigate = vi.fn()
    const unlistenAbout = vi.fn()
    listenMock
      .mockImplementationOnce(async (event, callback) => {
        callbacks.set(event, callback)
        return unlistenNavigate
      })
      .mockImplementationOnce(async (event, callback) => {
        callbacks.set(event, callback)
        return unlistenAbout
      })

    const { unmount } = renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout,
      })
    )

    await waitFor(() => expect(listenMock).toHaveBeenCalledTimes(2))
    act(() => callbacks.get("tray:show-about")?.({ payload: null }))
    expect(setShowAbout).toHaveBeenCalledWith(true)

    unmount()
    expect(unlistenNavigate).toHaveBeenCalledTimes(1)
    expect(unlistenAbout).toHaveBeenCalledTimes(1)
  })
})
