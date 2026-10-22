import { useCallback, useEffect, useRef, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window"
import { isActiveView, type ActiveView } from "@/components/side-nav"
import { readUiStorage } from "@/lib/brand-migration"
import {
  clampWindowWidth,
  DEFAULT_WINDOW_WIDTH,
  getDisplaySafeWindowHeight,
  type WindowWidth,
} from "@/lib/window"

const LEGACY_DEFAULT_PANEL_WIDTH_MAX = 1024
const COLUMN_BROWSER_DEFAULT_PANEL_WIDTH = 1240
const PANEL_SIZE_STORAGE_KEY = "one-more-prompt.ui.panel-size.v1"
const PANEL_SIZE_LAYOUT_STORAGE_KEY = "one-more-prompt.ui.panel-size-layout.v2"
const PANEL_SIZE_LAYOUT_MARKER = "column-browser"

type UsePanelArgs = {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  showAbout: boolean
  setShowAbout: (value: boolean) => void
}

type SavedPanelSize = {
  width: number
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  if (target.isContentEditable) return true
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
  )
}

function readPanelSize(): SavedPanelSize | null {
  try {
    const raw = readUiStorage(PANEL_SIZE_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<SavedPanelSize>
    if (!Number.isFinite(parsed.width)) return null

    const savedWidth = clampWindowWidth(parsed.width as number)
    const shouldUpgradeLegacyDefault = (
      savedWidth <= LEGACY_DEFAULT_PANEL_WIDTH_MAX &&
      readUiStorage(PANEL_SIZE_LAYOUT_STORAGE_KEY) !== PANEL_SIZE_LAYOUT_MARKER
    )
    if (shouldUpgradeLegacyDefault) {
      window.localStorage.setItem(PANEL_SIZE_LAYOUT_STORAGE_KEY, PANEL_SIZE_LAYOUT_MARKER)
    }

    return {
      width: shouldUpgradeLegacyDefault ? COLUMN_BROWSER_DEFAULT_PANEL_WIDTH : savedWidth,
    }
  } catch (error) {
    console.error("Failed to restore the panel size:", error)
    return null
  }
}

function writePanelSize(size: SavedPanelSize) {
  try {
    window.localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify(size))
    // Mark the saved size as belonging to the current panel layout. Without
    // this marker, a deliberately narrow custom width looks like the legacy
    // 980px default and gets upgraded to the column-browser width on relaunch.
    window.localStorage.setItem(PANEL_SIZE_LAYOUT_STORAGE_KEY, PANEL_SIZE_LAYOUT_MARKER)
  } catch (error) {
    console.error("Failed to save the panel size:", error)
  }
}

function getPanelHeight() {
  return getDisplaySafeWindowHeight(window.screen?.availHeight ?? 0, window.innerHeight)
}

export function usePanel({
  activeView,
  setActiveView,
  showAbout,
  setShowAbout,
}: UsePanelArgs) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [panelWidth, setPanelWidthState] = useState<WindowWidth>(DEFAULT_WINDOW_WIDTH)
  const [isPinned, setIsPinned] = useState(false)
  const setActiveViewRef = useRef(setActiveView)
  const setShowAboutRef = useRef(setShowAbout)
  setActiveViewRef.current = setActiveView
  setShowAboutRef.current = setShowAbout

  const setPanelWidth = useCallback((width: WindowWidth) => {
    const nextWidth = clampWindowWidth(width)
    setPanelWidthState(nextWidth)
    if (!isTauri()) return

    writePanelSize({ width: nextWidth })
    getCurrentWindow()
      .setSize(new LogicalSize(nextWidth, getPanelHeight()))
      .then(() => invoke("reposition_panel"))
      .catch((error) => {
        console.error("Failed to apply the panel width:", error)
      })
  }, [])

  const setPanelPinned = useCallback(async (pinned: boolean) => {
    if (!isTauri()) {
      setIsPinned(pinned)
      return
    }
    try {
      await invoke("set_panel_pinned", { pinned })
      setIsPinned(pinned)
    } catch (error) {
      console.error("Failed to update the pinned window mode:", error)
    }
  }, [])

  const focusContainer = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (!document.querySelector('.prompt-help-frame, [data-testid="contextual-guide"]')) containerRef.current?.focus({ preventScroll: true })
    })
  }, [])

  // Reset the content position when the user explicitly changes pages. Focus,
  // visibility, and tray clicks intentionally leave the chosen page intact.
  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0
  }, [activeView])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) focusContainer()
    }

    window.addEventListener("focus", focusContainer)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", focusContainer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [focusContainer])

  useEffect(() => {
    if (!isTauri()) return

    invoke("init_panel").catch((error) => {
      console.error("Failed to initialize the panel:", error)
    })

    const savedSize = readPanelSize()
    if (!savedSize) {
      setPanelWidthState(clampWindowWidth(window.innerWidth))
      return
    }

    setPanelWidthState(clampWindowWidth(savedSize.width))

    getCurrentWindow()
      .setSize(new LogicalSize(savedSize.width, getPanelHeight()))
      .then(() => invoke("reposition_panel"))
      .catch((error) => {
        console.error("Failed to restore the panel size:", error)
      })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('.prompt-help-frame, [data-testid="contextual-guide"]')) return

      if (event.key === "Escape") {
        event.preventDefault()
        if (showAbout) {
          setShowAbout(false)
        } else if (isTauri()) {
          invoke("hide_panel").catch((error) => {
            console.error("Failed to hide the panel:", error)
          })
        }
        return
      }

      if (showAbout || isEditableTarget(event.target)) return
      if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return

      const shortcutViews: Record<string, ActiveView> = {
        "1": "home",
        "2": "prompt-usage",
        "3": "settings",
      }
      const nextView = shortcutViews[event.key]
      if (!nextView || nextView === activeView) return

      event.preventDefault()
      setActiveView(nextView)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeView, setActiveView, setShowAbout, showAbout])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const unlisteners: (() => void)[] = []

    async function setup() {
      const unlistenNavigate = await listen<unknown>("tray:navigate", (event) => {
        if (!isActiveView(event.payload) || document.querySelector('[data-testid="contextual-guide"]')) return
        setActiveViewRef.current(event.payload)
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0
        focusContainer()
      })
      if (cancelled) {
        unlistenNavigate()
        return
      }
      unlisteners.push(unlistenNavigate)

      const unlistenShowAbout = await listen("tray:show-about", () => {
        setShowAboutRef.current(true)
        focusContainer()
      })
      if (cancelled) {
        unlistenShowAbout()
        return
      }
      unlisteners.push(unlistenShowAbout)
    }

    void setup().catch((error) => {
      console.error("Failed to subscribe to panel events:", error)
    })

    return () => {
      cancelled = true
      for (const unlisten of unlisteners) unlisten()
    }
  }, [focusContainer])

  return {
    containerRef,
    scrollContainerRef,
    panelWidth,
    setPanelWidth,
    isPinned,
    setPanelPinned,
  }
}
