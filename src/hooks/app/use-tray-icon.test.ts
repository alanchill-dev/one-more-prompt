import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PluginMeta } from "@/lib/plugin-types"
import type { MenubarActivityRotationSpeed, MenubarIconStyle, PluginSettings } from "@/lib/settings"
import {
  buildTraySettingsPreview,
  getMultiTrayProviderIds,
  isWindowsTrayRuntime,
  useTrayIcon,
} from "@/hooks/app/use-tray-icon"

const { image, tray, invokeMock, renderIconMock, renderMultiIconMock } = vi.hoisted(() => ({
  image: {
    close: vi.fn(),
    rgba: vi.fn(),
    size: vi.fn(),
  },
  tray: {
    setIcon: vi.fn(),
    setIconAsTemplate: vi.fn(),
    setTitle: vi.fn(),
    setTooltip: vi.fn(),
    close: vi.fn(),
  },
  invokeMock: vi.fn(),
  renderIconMock: vi.fn(),
  renderMultiIconMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tauri-apps/api/core")>(),
  invoke: invokeMock,
  isTauri: () => true,
}))
vi.mock("@tauri-apps/api/path", () => ({
  resolveResource: vi.fn(async (path: string) => path),
}))
vi.mock("@tauri-apps/api/tray", () => ({
  TrayIcon: {
    getById: vi.fn(async () => tray),
    removeById: vi.fn(async () => {}),
  },
}))
vi.mock("@/lib/tray-bars-icon", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/tray-bars-icon")>(),
  renderTrayBarsIcon: renderIconMock,
  renderMultiTrayIcon: renderMultiIconMock,
}))

const pluginsMeta: PluginMeta[] = [
  {
    id: "claude",
    name: "Claude",
    iconUrl: "claude-icon",
    lines: [],
    links: [],
    primaryCandidates: ["Session"],
    weeklyCandidate: "Weekly",
    multiTrayLines: [],
    detected: true,
  },
  {
    id: "cursor",
    name: "Cursor",
    iconUrl: "cursor-icon",
    lines: [],
    links: [],
    primaryCandidates: ["Credits", "Total usage"],
    weeklyCandidate: null,
    trayPrimaryLabel: "Total usage",
    multiTrayLines: ["Auto usage", "API usage"],
    detected: true,
  },
  {
    id: "codex",
    name: "Codex",
    iconUrl: "codex-icon",
    lines: [],
    links: [],
    primaryCandidates: ["Session"],
    weeklyCandidate: "Weekly",
    multiTrayLines: [],
    detected: true,
  },
]

const pluginSettings: PluginSettings = {
  order: ["claude", "cursor", "codex"],
  disabled: [],
}

describe("isWindowsTrayRuntime", () => {
  it("selects the fixed square tray presentation only on Windows", () => {
    expect(isWindowsTrayRuntime("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(true)
    expect(isWindowsTrayRuntime("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(false)
  })
})

describe("getMultiTrayProviderIds", () => {
  it("includes enabled providers without primary metrics up to the cap", () => {
    expect(getMultiTrayProviderIds(pluginsMeta, pluginSettings)).toEqual([
      "claude",
      "cursor",
      "codex",
    ])
  })

  it("respects plugin order and skips disabled providers", () => {
    expect(
      getMultiTrayProviderIds(pluginsMeta, {
        order: ["codex", "claude", "cursor"],
        disabled: ["claude"],
      }),
    ).toEqual(["codex", "cursor"])
  })

  it("respects configured max provider count", () => {
    expect(getMultiTrayProviderIds(pluginsMeta, pluginSettings, 2)).toEqual([
      "claude",
      "cursor",
    ])
  })
})

describe("buildTraySettingsPreview", () => {
  it("populates single-style and multi-style preview fields together", () => {
    const preview = buildTraySettingsPreview({
      pluginsMeta,
      pluginSettings,
      pluginStates: {
        claude: {
          data: {
            providerId: "claude",
            lines: [
              { type: "progress", label: "Session", used: 70, limit: 100 },
              { type: "progress", label: "Weekly", used: 36, limit: 100 },
            ],
          },
          loading: false,
          error: null,
        },
      },
      displayMode: "used",
      menubarMetric: "default",
      activeView: "home",
      lastTrayProviderId: null,
    })

    expect(preview.providerIconUrl).toBe("claude-icon")
    expect(preview.providerPercentText).toBe("70%")
    expect(preview.providerBars[0]?.fraction).toBe(0.7)
    expect(preview.multiProviders).toHaveLength(3)
    expect(preview.multiProviders[0]).toMatchObject({
      id: "claude",
      sessionText: "70%",
      weeklyText: "36%",
    })
    expect(preview.multiProviders[1]).toMatchObject({
      id: "cursor",
      iconUrl: "cursor-icon",
    })
    expect(preview.bars.length).toBeGreaterThan(0)
  })

  it("uses Cursor multiTrayLines for multi preview metrics", () => {
    const preview = buildTraySettingsPreview({
      pluginsMeta,
      pluginSettings,
      pluginStates: {
        cursor: {
          data: {
            providerId: "cursor",
            lines: [
              { type: "progress", label: "Credits", used: 10, limit: 100 },
              { type: "progress", label: "Total usage", used: 55, limit: 100 },
              { type: "progress", label: "Auto usage", used: 42, limit: 100 },
              { type: "progress", label: "API usage", used: 18, limit: 100 },
            ],
          },
          loading: false,
          error: null,
        },
      },
      displayMode: "used",
      menubarMetric: "default",
      activeView: "home",
      lastTrayProviderId: null,
    })

    expect(preview.multiProviders[1]).toMatchObject({
      id: "cursor",
      sessionText: "42%",
      weeklyText: "18%",
      sessionFraction: 0.42,
      weeklyFraction: 0.18,
    })
  })

  it("uses Total usage for Cursor provider and bars preview", () => {
    const preview = buildTraySettingsPreview({
      pluginsMeta,
      pluginSettings: { order: ["cursor", "claude"], disabled: [] },
      pluginStates: {
        cursor: {
          data: {
            providerId: "cursor",
            lines: [
              { type: "progress", label: "Credits", used: 10, limit: 100 },
              { type: "progress", label: "Total usage", used: 42, limit: 100 },
              { type: "progress", label: "Auto usage", used: 70, limit: 100 },
              { type: "progress", label: "API usage", used: 30, limit: 100 },
            ],
          },
          loading: false,
          error: null,
        },
      },
      displayMode: "used",
      menubarMetric: "default",
      activeView: "cursor",
      lastTrayProviderId: null,
    })

    expect(preview.providerBars).toEqual([
      { id: "cursor", fraction: 0.42, label: "Total usage" },
    ])
    expect(preview.providerPercentText).toBe("42%")
    expect(preview.bars[0]).toEqual({ id: "cursor", fraction: 0.42, label: "Total usage" })
  })
})

const renderCases = [
  ["bars", "bars", false],
  ["donut", "donut", false],
  ["dual", "dual", false],
  ["provider", "provider", false],
  ["multi", "multi", false],
  ["Windows numbers", "provider", true],
  ["Windows dual", "dual", true],
  ["Windows bars", "bars", true],
  ["Windows donut", "donut", true],
  ["Windows multi", "multi", true],
] as const

function mountTray(style: MenubarIconStyle, enabled = true, overrides: Partial<Parameters<typeof useTrayIcon>[0]> = {}) {
  const args: Parameters<typeof useTrayIcon>[0] = {
    pluginsMeta,
    pluginSettings: { order: ["codex"], disabled: enabled ? [] : ["codex"] },
    pluginStates: {
      codex: {
        data: {
          providerId: "codex",
          lines: [
            { type: "progress", label: "Session", used: 35, limit: 100 },
            { type: "progress", label: "Weekly", used: 15, limit: 100 },
          ],
        },
        loading: false,
        error: null,
      },
    },
    displayMode: "used",
    menubarIconStyle: style,
    menubarActivityRotationSpeed: "standard",
    menubarMetric: "default",
    multiTrayProviderCount: 1,
    multiTrayDisplayMode: "percent",
    activeView: "home",
  }
  return renderHook((rotationSpeed: MenubarActivityRotationSpeed = "standard") => useTrayIcon({
    ...args,
    ...overrides,
    menubarActivityRotationSpeed: rotationSpeed,
  }))
}

describe("useTrayIcon Image Resource Lifetime", () => {
  beforeEach(() => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Macintosh")
    for (const method of Object.values(image)) method.mockReset()
    image.close.mockResolvedValue(undefined)
    image.rgba.mockResolvedValue(new Uint8Array([0, 0, 0, 255]))
    image.size.mockResolvedValue({ width: 1, height: 1 })
    for (const method of Object.values(tray)) method.mockReset().mockResolvedValue(undefined)
    invokeMock.mockReset().mockResolvedValue(undefined)
    renderIconMock.mockReset().mockResolvedValue(image)
    renderMultiIconMock.mockReset().mockResolvedValue(image)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("publishes only the rotation period without reading system motion preferences", async () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList)
    const { rerender } = mountTray("provider")

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("set_tray_activity_preferences", {
      rotationPeriodMs: 1_200,
    }))
    expect(matchMedia).not.toHaveBeenCalled()

    rerender("fast")
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("set_tray_activity_preferences", {
      rotationPeriodMs: 800,
    }))

    rerender("slow")
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("set_tray_activity_preferences", {
      rotationPeriodMs: 2_000,
    }))
    expect(matchMedia).not.toHaveBeenCalled()
  })

  it.each(renderCases)("closes the %s image after its native consumers finish", async (_name, style, windows) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(windows ? "Windows NT 10.0" : "Macintosh")
    mountTray(style)

    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(tray.setIcon).toHaveBeenCalledWith(image)
    expect(image.close.mock.invocationCallOrder[0]).toBeGreaterThan(tray.setIcon.mock.invocationCallOrder[0])
    if (style !== "multi" && !windows) {
      expect(image.rgba).toHaveBeenCalledTimes(1)
      expect(image.size).toHaveBeenCalledTimes(1)
      const publishIndex = invokeMock.mock.calls.findIndex(([command]) => command === "set_tray_activity_icon")
      expect(publishIndex).toBeGreaterThanOrEqual(0)
      expect(image.close.mock.invocationCallOrder[0]).toBeGreaterThan(invokeMock.mock.invocationCallOrder[publishIndex])
    } else {
      expect(image.rgba).not.toHaveBeenCalled()
      expect(invokeMock).not.toHaveBeenCalledWith("set_tray_activity_icon", expect.anything())
    }
    expect(tray.close).not.toHaveBeenCalled()
  })

  it.each(renderCases)("closes the %s image when setting the tray icon fails", async (_name, style, windows) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(windows ? "Windows NT 10.0" : "Macintosh")
    const error = new Error("tray update failed")
    tray.setIcon.mockRejectedValueOnce(error)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    mountTray(style)

    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(log).toHaveBeenCalledWith(expect.any(String), error)
    expect(image.rgba).not.toHaveBeenCalled()
    expect(tray.close).not.toHaveBeenCalled()
  })

  it("closes the image when publishing native activity fails", async () => {
    const error = new Error("activity update failed")
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "set_tray_activity_icon") throw error
    })
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    mountTray("provider")

    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(image.rgba).toHaveBeenCalledTimes(1)
    expect(image.size).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(expect.any(String), error)
  })

  it.each(["provider", "dual", "multi"] as const)("renders Windows %s quotas into the square icon without rotating numbers", async (style) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    mountTray(style)
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(renderIconMock).toHaveBeenCalledWith(expect.objectContaining({ percentText: "35%", windowsSquare: true }))
    expect(tray.setIconAsTemplate).toHaveBeenCalledWith(false)
    expect(tray.setTitle).not.toHaveBeenCalled()
    expect(tray.setTooltip).toHaveBeenCalledWith(expect.stringContaining(style === "multi" ? "35% · 15%" : "5-Hour Limit: 35%\nWeekly Limit: 15%"))
    expect(invokeMock).toHaveBeenCalledWith("clear_tray_activity_icon")
    expect(invokeMock).not.toHaveBeenCalledWith("set_tray_activity_icon", expect.anything())
    expect(image.rgba).not.toHaveBeenCalled()
  })

  it.each([false, true])("reads the Windows system theme for numeric contrast (dark: %s)", async (dark) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    invokeMock.mockImplementation(async (command: string) => command === "get_windows_tray_is_dark" ? dark : undefined)
    mountTray("provider")
    await waitFor(() => expect(renderIconMock).toHaveBeenCalledWith(expect.objectContaining({ windowsIsDark: dark, windowsSquare: true, sizePx: 16 })))
    expect(tray.setTooltip).toHaveBeenCalledWith(expect.stringContaining("35%"))
  })

  it("preserves the previous icon and logs a Windows appearance lookup failure", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    const error = new Error("Windows system appearance unavailable")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_windows_tray_is_dark") throw error
    })
    mountTray("provider")
    await waitFor(() => expect(log).toHaveBeenCalledWith("Failed to update the Windows tray icon:", error))
    expect(renderIconMock).not.toHaveBeenCalled()
  })

  it("uses the selected weekly quota in the Windows numeric icon", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    mountTray("dual", true, { menubarMetric: "weekly" })
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(renderIconMock).toHaveBeenCalledWith(expect.objectContaining({ percentText: "15%", windowsSquare: true }))
    expect(tray.setTooltip).toHaveBeenCalledWith(expect.stringContaining("5-Hour Limit: 35%\nWeekly Limit: 15%"))
  })

  it("renders Windows quota numbers despite legacy disabled Codex settings", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    mountTray("dual", false)
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))
    expect(renderIconMock).toHaveBeenCalledWith(expect.objectContaining({ percentText: "35%", windowsSquare: true }))
    expect(tray.setTooltip).toHaveBeenCalledWith(expect.stringContaining("Weekly Limit: 15%"))
  })

  it("uses remaining quota when the Windows display mode requests it", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    mountTray("dual", true, { displayMode: "left" })
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(renderIconMock).toHaveBeenCalledWith(expect.objectContaining({ percentText: "65%", windowsSquare: true }))
  })

  it.each(["bars", "donut"] as const)("preserves the configured Windows %s graphic without rotating quota data", async (style) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    mountTray(style)
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(renderIconMock).toHaveBeenCalledWith(expect.objectContaining({ style, windowsSquare: true }))
    expect(invokeMock).toHaveBeenCalledWith("clear_tray_activity_icon")
    expect(image.rgba).not.toHaveBeenCalled()
  })

  it("adapts Windows Multi Bars to a square bar graphic", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    mountTray("multi", true, { multiTrayDisplayMode: "bars" })
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(renderIconMock).toHaveBeenCalledWith(expect.objectContaining({ style: "bars", windowsSquare: true }))
    expect(renderMultiIconMock).not.toHaveBeenCalled()
    expect(image.rgba).not.toHaveBeenCalled()
  })

  it("keeps the provider glyph animated while Windows quotas are unavailable", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
    mountTray("dual", true, { pluginStates: {} })
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(renderIconMock).toHaveBeenCalledWith(expect.objectContaining({ percentText: "--%", windowsSquare: true }))
    const activity = invokeMock.mock.calls.find(([command]) => command === "set_tray_activity_icon")?.[1]
    expect(activity.input).toMatchObject({ glyphX: 1, glyphY: 1, glyphSize: 15 })
    expect(image.rgba).toHaveBeenCalledTimes(1)
    expect(image.close.mock.invocationCallOrder[0]).toBeGreaterThan(image.size.mock.invocationCallOrder[0])
  })

  it("closes the image when reading native activity pixels fails", async () => {
    const error = new Error("image pixels unavailable")
    image.rgba.mockRejectedValueOnce(error)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    mountTray("bars")

    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(image.size).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.any(String), error)
  })

  it("waits for in-flight image readers and closes after unmount", async () => {
    let finishRead!: (value: Uint8Array) => void
    image.rgba.mockImplementationOnce(() => new Promise<Uint8Array>((resolve) => { finishRead = resolve }))
    const { unmount } = mountTray("provider")
    await waitFor(() => expect(image.rgba).toHaveBeenCalledTimes(1))

    unmount()
    expect(image.close).not.toHaveBeenCalled()
    await act(async () => { finishRead(new Uint8Array([0, 0, 0, 255])) })
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    expect(image.size).toHaveBeenCalledTimes(1)
    const publishIndex = invokeMock.mock.calls.findIndex(([command]) => command === "set_tray_activity_icon")
    expect(image.close.mock.invocationCallOrder[0]).toBeGreaterThan(invokeMock.mock.invocationCallOrder[publishIndex])
  })

  it("releases a generated image on every repeated probe", async () => {
    const { result } = mountTray("provider")
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(1))

    act(() => result.current.scheduleTrayIconUpdate("probe"))
    await waitFor(() => expect(image.close).toHaveBeenCalledTimes(2))

    expect(renderIconMock).toHaveBeenCalledTimes(2)
  })

  it("keeps resource-owned default icons and the tray handle open", async () => {
    mountTray("provider", true, { pluginSettings: { order: [], disabled: [] } })
    await waitFor(() => expect(tray.setIcon).toHaveBeenCalledWith("icons/tray-icon.png"))

    expect(renderIconMock).not.toHaveBeenCalled()
    expect(renderMultiIconMock).not.toHaveBeenCalled()
    expect(image.close).not.toHaveBeenCalled()
    expect(tray.close).not.toHaveBeenCalled()
  })
})
