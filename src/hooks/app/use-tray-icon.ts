import { useCallback, useEffect, useRef, useState } from "react"
import { resolveResource } from "@tauri-apps/api/path"
import { TrayIcon } from "@tauri-apps/api/tray"
import { invoke, isTauri } from "@tauri-apps/api/core"
import type { PluginMeta } from "@/lib/plugin-types"
import type {
  DisplayMode,
  MenubarActivityRotationSpeed,
  MenubarIconStyle,
  MenubarMetric,
  MultiTrayDisplayMode,
  PluginSettings,
} from "@/lib/settings"
import {
  getEnabledPluginIds,
  MENUBAR_ACTIVITY_ROTATION_PERIOD_MS,
} from "@/lib/settings"
import {
  getTrayActivityGlyphBounds,
  getTrayIconSizePx,
  MULTI_TRAY_MAX_PROVIDERS,
  renderMultiTrayIcon,
  renderTrayBarsIcon,
} from "@/lib/tray-bars-icon"
import {
  getTrayDualQuotaMetrics,
  getTrayPrimaryBars,
  getTrayMultiProviderMetrics,
  hasTrayDualQuota,
  type TrayPrimaryBar,
} from "@/lib/tray-primary-progress"
import {
  formatTrayPercentIfPresent,
  formatTrayPercentText,
  formatTrayTooltip,
  formatTrayTooltipDual,
  formatTrayTooltipMulti,
  type TrayMultiProviderRow,
} from "@/lib/tray-tooltip"
import type { PluginState } from "@/hooks/app/types"

async function withTrayImage(
  image: Awaited<ReturnType<typeof renderTrayBarsIcon>>,
  consume: () => Promise<void>,
): Promise<void> {
  try {
    await consume()
  } finally {
    // Tauri keeps generated images in its resource table until explicitly closed.
    await image.close()
  }
}

type TrayUpdateReason = "probe" | "settings" | "init"

const MULTI_AUX_TRAY_IDS = ["tray-multi-1", "tray-multi-2"] as const

type UseTrayIconArgs = {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState>
  displayMode: DisplayMode
  menubarIconStyle: MenubarIconStyle
  menubarActivityRotationSpeed: MenubarActivityRotationSpeed
  menubarMetric: MenubarMetric
  multiTrayProviderCount: number
  multiTrayDisplayMode: MultiTrayDisplayMode
  activeView: string
}

export type TrayMultiProviderPreview = {
  id: string
  iconUrl?: string
  sessionText?: string
  weeklyText?: string
  sessionFraction?: number
  weeklyFraction?: number
}

export type TraySettingsPreview = {
  bars: TrayPrimaryBar[]
  providerBars: TrayPrimaryBar[]
  providerId?: string
  providerIconUrl?: string
  providerPercentText: string
  multiProviders: TrayMultiProviderPreview[]
}

export function isWindowsTrayRuntime(userAgent: string): boolean {
  return /Windows/i.test(userAgent)
}

const EMPTY_TRAY_SETTINGS_PREVIEW: TraySettingsPreview = {
  bars: [],
  providerBars: [],
  providerPercentText: "--%",
  multiProviders: [],
}

function isSameTraySettingsPreview(a: TraySettingsPreview, b: TraySettingsPreview): boolean {
  if (a.providerId !== b.providerId) return false
  if (a.providerIconUrl !== b.providerIconUrl) return false
  if (a.providerPercentText !== b.providerPercentText) return false
  if (a.bars.length !== b.bars.length) return false
  if (a.providerBars.length !== b.providerBars.length) return false
  for (let i = 0; i < a.bars.length; i += 1) {
    if (a.bars[i]?.id !== b.bars[i]?.id) return false
    if (a.bars[i]?.fraction !== b.bars[i]?.fraction) return false
  }
  for (let i = 0; i < a.providerBars.length; i += 1) {
    if (a.providerBars[i]?.id !== b.providerBars[i]?.id) return false
    if (a.providerBars[i]?.fraction !== b.providerBars[i]?.fraction) return false
  }
  if (a.multiProviders.length !== b.multiProviders.length) return false
  for (let i = 0; i < a.multiProviders.length; i += 1) {
    const left = a.multiProviders[i]
    const right = b.multiProviders[i]
    if (left?.id !== right?.id) return false
    if (left?.iconUrl !== right?.iconUrl) return false
    if (left?.sessionText !== right?.sessionText) return false
    if (left?.weeklyText !== right?.weeklyText) return false
    if (left?.sessionFraction !== right?.sessionFraction) return false
    if (left?.weeklyFraction !== right?.weeklyFraction) return false
  }
  return true
}

type MultiTrayIconInput = {
  iconUrl?: string
  sessionText?: string
  weeklyText?: string
  sessionFraction?: number
  weeklyFraction?: number
}

function getMultiTrayIconFingerprint(
  providerIds: string[],
  providers: MultiTrayIconInput[],
  sizePx: number,
  providerCount: number,
  displayMode: MultiTrayDisplayMode,
): string {
  return JSON.stringify({ providerIds, providers, sizePx, providerCount, displayMode })
}

function resolveTrayProviderId(args: {
  enabledPluginIds: string[]
  activeView: string
  lastTrayProviderId: string | null
}): string | null {
  const { enabledPluginIds, activeView, lastTrayProviderId } = args
  const activeProviderId =
    activeView !== "home" && activeView !== "settings" ? activeView : null

  if (activeProviderId && enabledPluginIds.includes(activeProviderId)) {
    return activeProviderId
  }
  if (lastTrayProviderId && enabledPluginIds.includes(lastTrayProviderId)) {
    return lastTrayProviderId
  }
  return enabledPluginIds[0] ?? null
}

function getMultiTrayProviderIds(
  pluginsMeta: PluginMeta[],
  pluginSettings: PluginSettings,
  maxProviders = MULTI_TRAY_MAX_PROVIDERS,
): string[] {
  const metaIds = new Set(pluginsMeta.map((plugin) => plugin.id))
  return getEnabledPluginIds(pluginSettings)
    .filter((id) => metaIds.has(id))
    .slice(0, maxProviders)
}

function buildTraySettingsPreview(args: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings
  pluginStates: Record<string, PluginState>
  displayMode: DisplayMode
  menubarMetric: MenubarMetric
  activeView: string
  lastTrayProviderId: string | null
}): TraySettingsPreview {
  const {
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
    menubarMetric,
    activeView,
    lastTrayProviderId,
  } = args

  const enabledPluginIds = getEnabledPluginIds(pluginSettings)
  const preferWeekly = menubarMetric === "weekly"
  const trayProviderId = resolveTrayProviderId({
    enabledPluginIds,
    activeView,
    lastTrayProviderId,
  })

  const bars = getTrayPrimaryBars({
    pluginsMeta,
    pluginSettings,
    pluginStates,
    maxBars: 4,
    displayMode,
    preferWeekly,
  })

  const providerBars = trayProviderId
    ? getTrayPrimaryBars({
        pluginsMeta,
        pluginSettings,
        pluginStates,
        maxBars: 1,
        displayMode,
        pluginId: trayProviderId ?? "",
        preferWeekly,
      })
    : []

  const providerIconUrl = trayProviderId
    ? pluginsMeta.find((plugin) => plugin.id === trayProviderId)?.iconUrl
    : undefined
  const providerPercentText = formatTrayPercentText(providerBars[0]?.fraction)

  const multiProviders: TrayMultiProviderPreview[] = getMultiTrayProviderIds(
    pluginsMeta,
    pluginSettings,
  ).map((pluginId) => {
    const { sessionFraction, weeklyFraction } = getTrayMultiProviderMetrics({
      pluginId,
      pluginsMeta,
      pluginSettings,
      pluginStates,
      displayMode,
    })

    return {
      id: pluginId,
      iconUrl: pluginsMeta.find((plugin) => plugin.id === pluginId)?.iconUrl,
      sessionText: formatTrayPercentIfPresent(sessionFraction),
      weeklyText: formatTrayPercentIfPresent(weeklyFraction),
      sessionFraction,
      weeklyFraction,
    }
  })

  return {
    bars,
    providerBars,
    providerId: trayProviderId ?? undefined,
    providerIconUrl,
    providerPercentText,
    multiProviders,
  }
}

export { buildTraySettingsPreview, getMultiTrayProviderIds }

export function useTrayIcon({
  pluginsMeta,
  pluginSettings,
  pluginStates,
  displayMode,
  menubarIconStyle,
  menubarActivityRotationSpeed,
  menubarMetric,
  multiTrayProviderCount,
  multiTrayDisplayMode,
  activeView,
}: UseTrayIconArgs) {
  const isWindowsTray = isWindowsTrayRuntime(window.navigator.userAgent)
  const trayRef = useRef<TrayIcon | null>(null)
  const trayGaugeIconPathRef = useRef<string | null>(null)
  const trayWindowsIconPathRef = useRef<string | null>(null)
  const trayUpdateTimerRef = useRef<number | null>(null)
  const trayUpdatePendingRef = useRef(false)
  const trayUpdateQueuedRef = useRef(false)
  const lastMultiTrayIconFingerprintRef = useRef<string | null>(null)
  const [trayReady, setTrayReady] = useState(false)
  const [traySettingsPreview, setTraySettingsPreview] = useState<TraySettingsPreview>(
    EMPTY_TRAY_SETTINGS_PREVIEW
  )

  const pluginsMetaRef = useRef(pluginsMeta)
  const pluginSettingsRef = useRef(pluginSettings)
  const pluginStatesRef = useRef(pluginStates)
  const displayModeRef = useRef(displayMode)
  const menubarIconStyleRef = useRef(menubarIconStyle)
  const menubarActivityRotationSpeedRef = useRef(menubarActivityRotationSpeed)
  const menubarMetricRef = useRef(menubarMetric)
  const multiTrayProviderCountRef = useRef(multiTrayProviderCount)
  const multiTrayDisplayModeRef = useRef(multiTrayDisplayMode)
  const activeViewRef = useRef(activeView)
  const lastTrayProviderIdRef = useRef<string | null>(null)

  // Single sync effect replaces 7 individual useRef+useEffect pairs.
  // No deps array = runs after every render, keeping refs current for the
  // `scheduleTrayIconUpdate` callback without forcing it to be recreated.
  useEffect(() => {
    pluginsMetaRef.current = pluginsMeta
    pluginSettingsRef.current = pluginSettings
    pluginStatesRef.current = pluginStates
    displayModeRef.current = displayMode
    menubarIconStyleRef.current = menubarIconStyle
    menubarActivityRotationSpeedRef.current = menubarActivityRotationSpeed
    menubarMetricRef.current = menubarMetric
    multiTrayProviderCountRef.current = multiTrayProviderCount
    multiTrayDisplayModeRef.current = multiTrayDisplayMode
    activeViewRef.current = activeView
  })

  const clearNativeActivityIcon = useCallback(() => {
    if (!isTauri()) return
    void invoke("clear_tray_activity_icon").catch((error) => {
      console.error("Failed to clear native tray activity icon:", error)
    })
  }, [])

  const publishNativeActivityIcon = useCallback(async (
    image: Awaited<ReturnType<typeof renderTrayBarsIcon>>,
    glyphBounds: ReturnType<typeof getTrayActivityGlyphBounds>,
  ) => {
    if (!isTauri()) return
    const rgba = await image.rgba()
    const size = await image.size()
    await invoke("set_tray_activity_icon", {
      input: {
        rgba: Array.from(rgba),
        width: size.width,
        height: size.height,
        glyphX: glyphBounds.x,
        glyphY: glyphBounds.y,
        glyphSize: glyphBounds.size,
      },
    })
  }, [])

  const publishNativeActivityPreferences = useCallback(() => {
    if (!isTauri()) return
    void invoke("set_tray_activity_preferences", {
      rotationPeriodMs: MENUBAR_ACTIVITY_ROTATION_PERIOD_MS[menubarActivityRotationSpeedRef.current],
    }).catch((error) => {
      console.error("Failed to set native tray activity preferences:", error)
    })
  }, [])

  const scheduleTrayIconUpdate = useCallback((
    _reason: TrayUpdateReason,
    delayMs = 0,
  ) => {
    if (trayUpdateTimerRef.current !== null) {
      window.clearTimeout(trayUpdateTimerRef.current)
      trayUpdateTimerRef.current = null
    }

    trayUpdateTimerRef.current = window.setTimeout(() => {
      void (async () => {
      trayUpdateTimerRef.current = null
      if (trayUpdatePendingRef.current) {
        trayUpdateQueuedRef.current = true
        return
      }
      trayUpdatePendingRef.current = true

      const finalizeUpdate = () => {
        trayUpdatePendingRef.current = false
        if (!trayUpdateQueuedRef.current) return
        trayUpdateQueuedRef.current = false
        scheduleTrayIconUpdate("probe", 0)
      }

      const tray = trayRef.current
      if (!tray) {
        finalizeUpdate()
        return
      }

      async function removeAuxTrays(): Promise<void> {
        for (const id of MULTI_AUX_TRAY_IDS) {
          try {
            await TrayIcon.removeById(id)
          } catch {
            // already removed
          }
        }
      }

      const maybeSetTitle = (tray as TrayIcon & { setTitle?: (value: string) => Promise<void> }).setTitle
      const setTitleFn =
        typeof maybeSetTitle === "function" ? (value: string) => maybeSetTitle.call(tray, value) : null
      const supportsNativeTrayTitle = setTitleFn !== null && !isWindowsTray
      const setTrayTitle = (title: string) => {
        if (setTitleFn && !isWindowsTray) {
          return setTitleFn(title)
        }
        return Promise.resolve()
      }

      const maybeSetTooltip = (tray as TrayIcon & { setTooltip?: (value: string) => Promise<void> }).setTooltip
      const setTooltipFn =
        typeof maybeSetTooltip === "function" ? (value: string) => maybeSetTooltip.call(tray, value) : null
      const setTrayTooltip = (tooltip: string) => {
        if (setTooltipFn) {
          return setTooltipFn(tooltip)
        }
        return Promise.resolve()
      }

      const restoreGaugeIcon = () => {
        clearNativeActivityIcon()
        const gaugePath = isWindowsTray
          ? trayWindowsIconPathRef.current
          : trayGaugeIconPathRef.current
        if (gaugePath) {
          Promise.all([
            tray.setIcon(gaugePath),
            tray.setIconAsTemplate(!isWindowsTray),
            setTrayTitle(""),
            setTrayTooltip("One More Prompt"),
          ])
            .catch((e) => {
              console.error("Failed to restore tray gauge icon:", e)
            })
            .finally(() => {
              finalizeUpdate()
            })
        } else {
          finalizeUpdate()
        }
      }

      const applyWindowsTrayIcon = async (
        tooltip: string,
        activityImage?: Awaited<ReturnType<typeof renderTrayBarsIcon>>,
        glyphBounds?: ReturnType<typeof getTrayActivityGlyphBounds>,
      ) => {
        if (activityImage) {
          await tray.setIcon(activityImage)
          if (glyphBounds) await publishNativeActivityIcon(activityImage, glyphBounds)
          else clearNativeActivityIcon()
        } else {
          clearNativeActivityIcon()
          const iconPath = trayWindowsIconPathRef.current
          if (iconPath) await tray.setIcon(iconPath)
        }
        await Promise.all([
          tray.setIconAsTemplate(false),
          setTrayTitle(""),
          setTrayTooltip(tooltip),
        ])
      }

      const currentSettings = pluginSettingsRef.current
      if (!currentSettings) {
        setTraySettingsPreview(EMPTY_TRAY_SETTINGS_PREVIEW)
        await removeAuxTrays()
        restoreGaugeIcon()
        return
      }

      const enabledPluginIds = getEnabledPluginIds(currentSettings)
      if (enabledPluginIds.length === 0) {
        setTraySettingsPreview(EMPTY_TRAY_SETTINGS_PREVIEW)
        await removeAuxTrays()
        restoreGaugeIcon()
        return
      }

      const style = menubarIconStyleRef.current
      const sizePx = getTrayIconSizePx(window.devicePixelRatio, isWindowsTray)
      if (style !== "multi") {
        lastMultiTrayIconFingerprintRef.current = null
      }
      const nextPreview = buildTraySettingsPreview({
        pluginsMeta: pluginsMetaRef.current,
        pluginSettings: currentSettings,
        pluginStates: pluginStatesRef.current,
        displayMode: displayModeRef.current,
        menubarMetric: menubarMetricRef.current,
        activeView: activeViewRef.current,
        lastTrayProviderId: lastTrayProviderIdRef.current,
      })
      setTraySettingsPreview((prev) =>
        isSameTraySettingsPreview(prev, nextPreview) ? prev : nextPreview
      )

      if (style === "multi") {
        try {
          clearNativeActivityIcon()
          await removeAuxTrays()

          const providerCount = multiTrayProviderCountRef.current
          const providerIds = getMultiTrayProviderIds(
            pluginsMetaRef.current,
            currentSettings,
            providerCount,
          )

          const multiRows: TrayMultiProviderRow[] = providerIds.map((pluginId) => {
            const { sessionFraction, weeklyFraction } = getTrayMultiProviderMetrics({
              pluginId,
              pluginsMeta: pluginsMetaRef.current,
              pluginSettings: currentSettings,
              pluginStates: pluginStatesRef.current,
              displayMode: displayModeRef.current,
            })

            return { id: pluginId, sessionFraction, weeklyFraction }
          })

          const iconProviders = providerIds.map((_pluginId, i) => {
            const preview = nextPreview.multiProviders[i]
            return {
              id: preview?.id,
              iconUrl: preview?.iconUrl,
              sessionText: preview?.sessionText,
              weeklyText: preview?.weeklyText,
              sessionFraction: preview?.sessionFraction,
              weeklyFraction: preview?.weeklyFraction,
            }
          })
          const displayMode = multiTrayDisplayModeRef.current
          const iconFingerprint = getMultiTrayIconFingerprint(
            providerIds,
            iconProviders,
            sizePx,
            providerCount,
            displayMode,
          )
          const tooltip = formatTrayTooltipMulti(multiRows, pluginsMetaRef.current)
          if (isWindowsTray) {
            const image = await renderTrayBarsIcon({
              bars: nextPreview.bars,
              sizePx,
              style: displayMode === "bars" ? "bars" : "provider",
              percentText: nextPreview.providerPercentText,
              providerIconUrl: nextPreview.providerIconUrl,
              providerId: nextPreview.providerId,
              windowsSquare: true,
              windowsIsDark: displayMode === "percent" ? await invoke<boolean>("get_windows_tray_is_dark") : undefined,
            })
            const glyphBounds = displayMode === "percent" && nextPreview.providerPercentText === "--%"
              ? getTrayActivityGlyphBounds({ sizePx, style: "provider", providerId: nextPreview.providerId })
              : undefined
            await withTrayImage(image, () => applyWindowsTrayIcon(tooltip, image, glyphBounds))
            return
          }
          const iconChanged = iconFingerprint !== lastMultiTrayIconFingerprintRef.current

          if (iconChanged) {
            const compositeIcon = await renderMultiTrayIcon({
              providers: iconProviders,
              sizePx,
              compact: true,
              displayMode,
            })

            await withTrayImage(compositeIcon, async () => {
              await tray.setIcon(compositeIcon)
              await tray.setIconAsTemplate(true)
              lastMultiTrayIconFingerprintRef.current = iconFingerprint
            })
          }

          if (setTitleFn) await setTitleFn("")
          await setTrayTooltip(tooltip)
        } catch (e) {
          console.error("Failed to update multi tray icons:", e)
        } finally {
          finalizeUpdate()
        }
        return
      }

      await removeAuxTrays()

      const preferWeekly = menubarMetricRef.current === "weekly"
      const trayProviderId = resolveTrayProviderId({
        enabledPluginIds,
        activeView: activeViewRef.current,
        lastTrayProviderId: lastTrayProviderIdRef.current,
      })
      const { bars: barsForPreview, providerBars, providerId, providerIconUrl, providerPercentText } =
        nextPreview

      const dualMetrics = getTrayDualQuotaMetrics({
        pluginId: trayProviderId ?? "",
        pluginsMeta: pluginsMetaRef.current,
        pluginSettings: currentSettings,
        pluginStates: pluginStatesRef.current,
        displayMode: displayModeRef.current,
      })
      const canShowDual = hasTrayDualQuota(dualMetrics)
      const tooltipBars = getTrayPrimaryBars({
        pluginsMeta: pluginsMetaRef.current,
        pluginSettings: currentSettings,
        pluginStates: pluginStatesRef.current,
        maxBars: 20, // Show more in tooltip
        displayMode: displayModeRef.current,
        preferWeekly,
      })
      const providerName = pluginsMetaRef.current.find((plugin) => plugin.id === trayProviderId)?.name ?? trayProviderId ?? "Codex"
      const tooltip = (style === "dual" || isWindowsTray) && canShowDual
        ? formatTrayTooltipDual(providerName, dualMetrics)
        : formatTrayTooltip(tooltipBars, pluginsMetaRef.current, preferWeekly)
      const updateTooltip = () => setTrayTooltip(tooltip)

      if (isWindowsTray) {
        try {
          const windowsRenderArgs = {
            bars: style === "bars" ? barsForPreview : providerBars,
            sizePx,
            style,
            percentText: providerPercentText,
            providerIconUrl,
            providerId,
            windowsSquare: true,
            windowsIsDark: style !== "bars" && style !== "donut" ? await invoke<boolean>("get_windows_tray_is_dark") : undefined,
          }
          const image = await renderTrayBarsIcon(windowsRenderArgs)
          const glyphBounds = style !== "bars" && style !== "donut" && providerPercentText === "--%"
            ? getTrayActivityGlyphBounds({ sizePx, style: "provider", providerId })
            : undefined
          await withTrayImage(image, () =>
            applyWindowsTrayIcon(tooltip, image, glyphBounds)
          )
        } catch (error) {
          console.error("Failed to update the Windows tray icon:", error)
        } finally {
          finalizeUpdate()
        }
        return
      }

      if (style === "bars") {
        renderTrayBarsIcon({
          bars: barsForPreview,
          sizePx,
          style: "bars",
        })
          .then((img) => withTrayImage(img, async () => {
            await tray.setIcon(img)
            await tray.setIconAsTemplate(true)
            await publishNativeActivityIcon(img, getTrayActivityGlyphBounds({ sizePx, style: "bars" }))
            await setTrayTitle("")
            await updateTooltip()
          }))
          .catch((e) => {
            console.error("Failed to update tray icon:", e)
          })
          .finally(() => {
            finalizeUpdate()
          })
        return
      }

      if (!trayProviderId) {
        restoreGaugeIcon()
        return
      }
      lastTrayProviderIdRef.current = trayProviderId

      if (style === "donut") {
        renderTrayBarsIcon({
          bars: providerBars,
          sizePx,
          style: "donut",
          providerIconUrl,
          providerId,
        })
          .then((img) => withTrayImage(img, async () => {
            await tray.setIcon(img)
            await tray.setIconAsTemplate(true)
            await publishNativeActivityIcon(img, getTrayActivityGlyphBounds({ sizePx, style: "donut", providerId }))
            await setTrayTitle("")
            await updateTooltip()
          }))
          .catch((e) => {
            console.error("Failed to update tray icon:", e)
          })
          .finally(() => {
            finalizeUpdate()
          })
        return
      }

      if (style === "dual" && canShowDual) {
        const sessionText = formatTrayPercentIfPresent(dualMetrics.sessionFraction)
        const weeklyText = formatTrayPercentIfPresent(dualMetrics.weeklyFraction)
        renderTrayBarsIcon({
          bars: providerBars,
          sizePx,
          style: "provider",
          percentText: sessionText ? `5H ${sessionText}` : undefined,
          secondaryPercentText: weeklyText ? `7D ${weeklyText}` : undefined,
          providerIconUrl,
          providerId,
          compact: true,
        })
          .then((img) => withTrayImage(img, async () => {
            await tray.setIcon(img)
            await tray.setIconAsTemplate(true)
            await publishNativeActivityIcon(img, getTrayActivityGlyphBounds({
              sizePx,
              style: "provider",
              percentText: sessionText ? `5H ${sessionText}` : undefined,
              secondaryPercentText: weeklyText ? `7D ${weeklyText}` : undefined,
              providerId,
              compact: true,
            }))
            await setTrayTitle("")
            await updateTooltip()
          }))
          .catch((e) => {
            console.error("Failed to update dual-line tray icon:", e)
          })
          .finally(() => {
            finalizeUpdate()
          })
        return
      }

      renderTrayBarsIcon({
        bars: providerBars,
        sizePx,
        style: "provider",
        percentText: supportsNativeTrayTitle ? undefined : providerPercentText,
        providerIconUrl,
        providerId,
      })
        .then((img) => withTrayImage(img, async () => {
          await tray.setIcon(img)
          await tray.setIconAsTemplate(true)
          await publishNativeActivityIcon(img, getTrayActivityGlyphBounds({
            sizePx,
            style: "provider",
            percentText: supportsNativeTrayTitle ? undefined : providerPercentText,
            providerId,
          }))
          await setTrayTitle(providerPercentText)
          await updateTooltip()
        }))
        .catch((e) => {
          console.error("Failed to update tray icon:", e)
        })
        .finally(() => {
          finalizeUpdate()
        })
      })().catch((e) => {
        console.error("Failed to schedule tray icon update:", e)
      })
    }, delayMs)
  }, [clearNativeActivityIcon, isWindowsTray, publishNativeActivityIcon])

  const trayInitializedRef = useRef(false)
  useEffect(() => {
    if (trayInitializedRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const tray = await TrayIcon.getById("tray")
        if (cancelled) return
        trayRef.current = tray
        trayInitializedRef.current = true

        try {
          const [gaugePath, windowsPath] = await Promise.all([
            resolveResource("icons/tray-icon.png"),
            resolveResource("icons/icon.png"),
          ])
          trayGaugeIconPathRef.current = gaugePath
          trayWindowsIconPathRef.current = windowsPath
        } catch (e) {
          console.error("Failed to resolve tray icon resources:", e)
        }

        if (cancelled) return
        setTrayReady(true)
      } catch (e) {
        console.error("Failed to load tray icon handle:", e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!trayReady) return
    if (!pluginSettings) return
    if (pluginsMeta.length === 0) return
    scheduleTrayIconUpdate("init", 0)
  }, [pluginsMeta.length, pluginSettings, scheduleTrayIconUpdate, trayReady])

  useEffect(() => {
    if (!trayReady) return
    scheduleTrayIconUpdate("settings", 0)
  }, [menubarIconStyle, menubarMetric, multiTrayProviderCount, multiTrayDisplayMode, scheduleTrayIconUpdate, trayReady])

  useEffect(() => {
    if (!trayReady) return
    publishNativeActivityPreferences()
  }, [menubarActivityRotationSpeed, publishNativeActivityPreferences, trayReady])

  // activeView only affects single-provider tray styles; multi mode ignores it.
  useEffect(() => {
    if (!trayReady) return
    if (menubarIconStyleRef.current === "multi") return
    scheduleTrayIconUpdate("settings", 0)
  }, [activeView, scheduleTrayIconUpdate, trayReady])

  useEffect(() => {
    return () => {
      if (trayUpdateTimerRef.current !== null) {
        window.clearTimeout(trayUpdateTimerRef.current)
        trayUpdateTimerRef.current = null
      }
      trayUpdatePendingRef.current = false
      trayUpdateQueuedRef.current = false
    }
  }, [])

  return {
    scheduleTrayIconUpdate,
    traySettingsPreview,
  }
}
