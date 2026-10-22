import { afterEach, describe, expect, it, vi } from "vitest"

const { renderGuide } = vi.hoisted(() => ({ renderGuide: vi.fn() }))
vi.mock("./components/guide/workspace", () => ({ renderGuide }))

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe("Guide entry point", () => {
  it.each([false, true])("initializes with Windows native injection: %s", async native => {
    vi.resetModules()
    renderGuide.mockClear()
    const frame = document.createElement("iframe")
    document.body.append(frame)
    const guideWindow = frame.contentWindow!
    const nativeInvoke = vi.fn(() => { throw new Error("Guide reached native IPC") })
    if (native) {
      // WebView2 injects Tauri's non-configurable globals into child frames too.
      const internals = {}
      Object.defineProperty(internals, "invoke", { value: nativeInvoke })
      Object.defineProperty(internals, "transformCallback", { value: vi.fn() })
      Object.defineProperty(internals, "unregisterCallback", { value: vi.fn() })
      Object.defineProperty(guideWindow, "__TAURI_INTERNALS__", { value: internals })
      Object.defineProperty(guideWindow, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
        value: Object.freeze({ unregisterListener: vi.fn() }),
      })
      Object.defineProperty(guideWindow, "isTauri", { value: true })
      vi.stubGlobal("isTauri", true)
    }
    vi.stubGlobal("window", guideWindow)
    const send = vi.spyOn(guideWindow.parent, "postMessage").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    document.body.insertAdjacentHTML("beforeend", '<div id="root"></div>')
    await import("./guide-main")
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ type: "omp-guide-ready" }, "*"))
    guideWindow.dispatchEvent(new MessageEvent("message", {
      source: guideWindow.parent,
      data: { type: "omp-guide-init", language: "en", themeMode: "dark", modelPalette: {} },
    }))
    await vi.waitFor(() => expect(renderGuide).toHaveBeenCalledOnce())
    expect(error).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')).toBeNull()
    const { invoke, isTauri, Resource } = await import("@tauri-apps/api/core")
    expect(isTauri()).toBe(false)
    await expect(invoke("query_codex_hourly_usage")).resolves.toBeInstanceOf(Array)
    await expect(invoke("reset_onboarding")).rejects.toThrow("blocked native command")
    await expect(new Resource(7).close()).rejects.toThrow("blocked native command")
    const { Store } = await import("@tauri-apps/plugin-store")
    const store = await Store.load("settings.json")
    await store.set("modelPalette", { slots: [{ base: "#FF4400" }] })
    await store.save()
    await expect(store.get("modelPalette")).resolves.toMatchObject({ slots: [{ base: "#FF4400" }, {}, {}, {}, {}] })
    await expect(store.set("language", "en")).rejects.toThrow("blocked native command")
    const { listen } = await import("@tauri-apps/api/event")
    const unlisten = await listen("practice-event", () => {})
    await expect(unlisten()).resolves.toBeUndefined()
    expect(nativeInvoke).not.toHaveBeenCalled()
    frame.remove()
  })

  it("keeps the main window on the native connection", async () => {
    vi.resetModules()
    const nativeInvoke = vi.fn().mockResolvedValue("native result")
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke: nativeInvoke })
    vi.stubGlobal("isTauri", true)
    const { invoke, isTauri } = await import("@tauri-apps/api/core")
    expect(isTauri()).toBe(true)
    await expect(invoke("main-command", { value: 1 })).resolves.toBe("native result")
    expect(nativeInvoke).toHaveBeenCalledWith("main-command", { value: 1 }, undefined)
  })
})
