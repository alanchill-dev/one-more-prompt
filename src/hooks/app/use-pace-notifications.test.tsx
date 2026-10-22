import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PluginState } from "@/hooks/app/types"

const state = vi.hoisted(() => ({
  invokeMock: vi.fn().mockResolvedValue(undefined),
  isPermissionGrantedMock: vi.fn().mockResolvedValue(false),
  hydrateMock: vi.fn().mockResolvedValue(undefined),
  settings: {
    underTenPercent: true,
    sessionReset: true,
  },
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: state.invokeMock }))
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: state.isPermissionGrantedMock,
}))
vi.mock("@/stores/app-notifications-store", () => ({
  useAppNotificationsStore: vi.fn((selector) => selector({ settings: state.settings, hydrate: state.hydrateMock })),
}))

import { deliverPaceNotification, usePaceNotifications } from "./use-pace-notifications"

function pluginState(used: number): Record<string, PluginState> {
  return {
    claude: {
      data: {
        providerId: "claude",
        displayName: "Claude",
        plan: null,
        iconUrl: "",
        lines: [
          {
            type: "progress",
            label: "Session",
            used,
            limit: 100,
            format: { kind: "percent" },
            resetsAt: null,
            periodDurationMs: null,
            color: null,
          },
        ],
      },
      loading: false,
      error: null,
      lastManualRefreshAt: null,
      lastUpdatedAt: null,
    },
  }
}

describe("usePaceNotifications", () => {
  beforeEach(() => {
    state.invokeMock.mockClear()
    state.invokeMock.mockResolvedValue(undefined)
    state.isPermissionGrantedMock.mockClear()
    state.isPermissionGrantedMock.mockResolvedValue(false)
    state.hydrateMock.mockClear()
  })

  it("delivers pace alerts through the native command that applies the bundled macOS app icon", async () => {
    await deliverPaceNotification({
      title: "Almost Out",
      body: "Claude Session — Under 10% usage remaining for this window.",
    })

    await waitFor(() => {
      expect(state.invokeMock).toHaveBeenCalledWith("send_pace_notification", {
        title: "Almost Out",
        body: "Claude Session — Under 10% usage remaining for this window.",
      })
    })
  })

  it("sends pace alerts through native delivery even when frontend notification permission would be false", async () => {
    const { rerender } = renderHook(({ states }) => usePaceNotifications(states), {
      initialProps: { states: pluginState(50) },
    })

    rerender({ states: pluginState(95) })

    await waitFor(() => {
      expect(state.invokeMock).toHaveBeenCalledWith("send_pace_notification", {
        title: "Almost Out",
        body: "Claude Session — Under 10% usage remaining for this window.",
      })
    })
    expect(state.isPermissionGrantedMock).not.toHaveBeenCalled()
  })

  it.each([
    ["low remaining quota", 95, 96],
    ["session reset", 0, 0],
  ] as const)("retries a failed %s notification on the next refresh, then stops after success", async (_label, used, laterUsed) => {
    const error = new Error("Windows rejected the notification")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    state.invokeMock.mockRejectedValueOnce(error)
    try {
      const { rerender } = renderHook(({ states }) => usePaceNotifications(states), {
        initialProps: { states: pluginState(50) },
      })
      rerender({ states: pluginState(used) })
      await waitFor(() => expect(log).toHaveBeenCalledWith("Failed to send pace notification:", error))

      rerender({ states: pluginState(used) })
      await waitFor(() => expect(state.invokeMock).toHaveBeenCalledTimes(2))

      await act(async () => rerender({ states: pluginState(laterUsed) }))
      expect(state.invokeMock).toHaveBeenCalledTimes(2)
    } finally {
      log.mockRestore()
    }
  })
})
