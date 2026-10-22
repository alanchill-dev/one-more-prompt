import { describe, expect, it } from "vitest"
import { hourlyPoints, quotaFixture } from "@/lib/guide-demo/fixtures"
import { guideInvoke, memoryStorage, readGuideInit } from "./isolation"

describe("Guide document isolation", () => {
  it("keeps practice writes in a separate storage instance", () => {
    const workspace = memoryStorage()
    workspace.setItem("selected-prompt", "real-prompt")
    const guide = memoryStorage()
    guide.setItem("selected-prompt", "demo-prompt")
    guide.clear()
    expect(workspace.getItem("selected-prompt")).toBe("real-prompt")
    expect(guide.getItem("selected-prompt")).toBeNull()
  })

  it("only serves demo queries and rejects native writes", async () => {
    const invoke = guideInvoke(quotaFixture, undefined, hourlyPoints)
    expect(await invoke("query_session_quota")).toBe(quotaFixture)
    expect(await invoke("query_codex_hourly_usage")).toBe(hourlyPoints)
    await expect(invoke("reset_onboarding")).rejects.toThrow("blocked native command")
    await expect(invoke("plugin:store|set")).rejects.toThrow("blocked native command")
  })

  it("stores only the practice palette in memory and rejects other settings or resource handles", async () => {
    const invoke = guideInvoke(quotaFixture)
    await expect(invoke("plugin:store|load", { path: "/real/settings.json" })).rejects.toThrow("blocked native command")
    const rid = await invoke("plugin:store|load", { path: "settings.json" })
    const original = await invoke("plugin:store|get", { rid, key: "modelPalette" })
    await invoke("plugin:store|set", { rid, key: "modelPalette", value: { slots: [{ base: "#EB8C76" }] } })
    await invoke("plugin:store|save", { rid })
    expect(await invoke("plugin:store|get", { rid, key: "modelPalette" })).toEqual([
      expect.objectContaining({ slots: expect.arrayContaining([{ base: "#EB8C76" }]) }), true,
    ])
    const anotherGuide = guideInvoke(quotaFixture)
    await anotherGuide("plugin:store|load", { path: "settings.json" })
    expect(await anotherGuide("plugin:store|get", { rid, key: "modelPalette" })).toEqual(original)
    await expect(invoke("plugin:store|set", { rid, key: "language", value: "en" })).rejects.toThrow("blocked native command")
    await expect(invoke("plugin:store|set", { rid: 2, key: "modelPalette" })).rejects.toThrow("blocked native command")
    await expect(invoke("plugin:store|delete", { rid, key: "modelPalette" })).rejects.toThrow("blocked native command")
  })

  it("validates initialization from the host before accepting preferences", () => {
    expect(readGuideInit({ type: "omp-guide-init", language: "xx", themeMode: "dark" })).toBeNull()
    expect(readGuideInit({ type: "omp-guide-init", language: "zh-TW", themeMode: "unknown" })).toBeNull()
    expect(readGuideInit({ type: "omp-guide-init", language: "zh-TW", themeMode: "dark", modelPalette: { slots: [{ base: "#FF4400" }] } }))
      .toMatchObject({ language: "zh-TW", themeMode: "dark", modelPalette: { slots: [{ base: "#FF4400" }, {}, {}, {}, {}] } })
  })
})
