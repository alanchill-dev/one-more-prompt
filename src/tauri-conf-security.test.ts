import { describe, expect, it } from "vitest"
import defaultCapability from "../src-tauri/capabilities/default.json"
import tauriConf from "../src-tauri/tauri.conf.json"

describe("tauri security config", () => {
  it("allows blob images so release builds can render dynamic tray icons", () => {
    const csp = tauriConf.app.security.csp

    expect(csp).toMatch(/img-src[^;]*\bblob:/)
  })

  it("allows the pinned panel to start dragging from its header", () => {
    expect(defaultCapability.permissions).toContain("core:window:allow-start-dragging")
  })
})
