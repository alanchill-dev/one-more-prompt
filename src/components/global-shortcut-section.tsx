import { useEffect, useRef, useState } from "react"
import { X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/hooks/use-i18n"
import type { GlobalShortcut } from "@/lib/settings"

function platformModifierLabels() {
  const isApple = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
  return isApple ? { command: "Cmd", alt: "Opt" } : { command: "Ctrl", alt: "Alt" }
}

// Convert internal shortcut format to the current platform's display format.
function formatShortcutForDisplay(shortcut: string): string {
  const labels = platformModifierLabels()
  return shortcut
    .replace(/CommandOrControl/g, labels.command)
    .replace(/Command/g, labels.command)
    .replace(/Control/g, "Ctrl")
    .replace(/Option/g, labels.alt)
    .replace(/Alt/g, labels.alt)
    .replace(/\+/g, " + ")
}

// Modifier codes (using event.code for reliable detection)
const MODIFIER_CODES = new Set([
  "MetaLeft", "MetaRight",
  "ControlLeft", "ControlRight",
  "AltLeft", "AltRight",
  "ShiftLeft", "ShiftRight",
])

// Normalize modifier code to base name
function normalizeModifierCode(code: string): string {
  if (code.startsWith("Meta")) return "Meta"
  if (code.startsWith("Control")) return "Control"
  if (code.startsWith("Alt")) return "Alt"
  if (code.startsWith("Shift")) return "Shift"
  return code
}

// Convert event.code to a display-friendly key name
function codeToDisplayKey(code: string): string {
  // Handle letter keys (KeyA -> A)
  if (code.startsWith("Key")) return code.slice(3)
  // Handle digit keys (Digit1 -> 1)
  if (code.startsWith("Digit")) return code.slice(5)
  // Handle numpad (Numpad1 -> Num1)
  if (code.startsWith("Numpad")) return "Num" + code.slice(6)
  // Handle special keys
  const specialKeys: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Backspace: "Backspace",
    Tab: "Tab",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Escape: "Esc",
    Delete: "Del",
    Insert: "Ins",
    Home: "Home",
    End: "End",
    PageUp: "PgUp",
    PageDown: "PgDn",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
  }
  return specialKeys[code] || code
}

// Convert event.code to Tauri shortcut key format
function codeToTauriKey(code: string): string {
  if (code.startsWith("Key")) return code.slice(3)
  if (code.startsWith("Digit")) return code.slice(5)
  const specialKeys: Record<string, string> = {
    Space: "Space",
    Enter: "Return",
    Backspace: "Backspace",
    Tab: "Tab",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
  }
  return specialKeys[code] || code
}

// Build shortcut array from currently pressed keys (modifiers + main key)
function buildShortcutFromCodes(codes: Set<string>): { display: string; tauri: string | null } {
  const labels = platformModifierLabels()
  const modifiers: string[] = []
  const displayMods: string[] = []
  let mainCode: string | null = null

  for (const code of codes) {
    if (MODIFIER_CODES.has(code)) {
      const normalized = normalizeModifierCode(code)
      if (normalized === "Meta" || normalized === "Control") {
        if (!modifiers.includes("CommandOrControl")) {
          modifiers.push("CommandOrControl")
          displayMods.push(labels.command)
        }
      } else if (normalized === "Alt") {
        if (!modifiers.includes("Alt")) {
          modifiers.push("Alt")
          displayMods.push(labels.alt)
        }
      } else if (normalized === "Shift") {
        if (!modifiers.includes("Shift")) {
          modifiers.push("Shift")
          displayMods.push("Shift")
        }
      }
    } else {
      // Non-modifier key - use the last one pressed
      mainCode = code
    }
  }

  // Build display string
  const displayParts = [...displayMods]
  if (mainCode) {
    displayParts.push(codeToDisplayKey(mainCode))
  }
  const display = displayParts.join(" + ")

  // Build Tauri shortcut (only valid if we have at least one modifier AND a main key)
  let tauri: string | null = null
  if (modifiers.length > 0 && mainCode) {
    tauri = [...modifiers, codeToTauriKey(mainCode)].join("+")
  }

  return { display, tauri }
}

interface GlobalShortcutSectionProps {
  globalShortcut: GlobalShortcut
  onGlobalShortcutChange: (value: GlobalShortcut) => void
}

export function GlobalShortcutSection({
  globalShortcut,
  onGlobalShortcutChange,
}: GlobalShortcutSectionProps) {
  const t = useI18n()
  const [isRecording, setIsRecording] = useState(false)
  // Track pressed keys using event.code (physical key location)
  const pressedCodesRef = useRef<Set<string>>(new Set())
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null)
  const [pendingDisplay, setPendingDisplay] = useState<string>("")
  // Ref for the recording input to focus it properly
  const recordingRef = useRef<HTMLDivElement>(null)

  // Focus the recording element after it mounts
  useEffect(() => {
    if (isRecording && recordingRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        recordingRef.current?.focus()
      }, 10)
      return () => clearTimeout(timer)
    }
  }, [isRecording])

  const startRecording = () => {
    setIsRecording(true)
    pressedCodesRef.current = new Set()
    setPendingShortcut(null)
    setPendingDisplay("")
  }

  const stopRecording = () => {
    setIsRecording(false)
    pressedCodesRef.current = new Set()
    setPendingShortcut(null)
    setPendingDisplay("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Escape cancels recording and clears the shortcut (disabled state)
    if (e.code === "Escape") {
      onGlobalShortcutChange(null)
      stopRecording()
      return
    }

    // Add this key code to the set
    pressedCodesRef.current.add(e.code)

    // Build shortcut from all currently pressed keys
    const { display, tauri } = buildShortcutFromCodes(pressedCodesRef.current)
    setPendingDisplay(display)
    if (tauri) {
      setPendingShortcut(tauri)
    }
  }

  const handleKeyUp = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Remove this key code from the ref
    pressedCodesRef.current.delete(e.code)

    // When all keys are released and we have a valid shortcut, save it
    if (pressedCodesRef.current.size === 0 && pendingShortcut) {
      onGlobalShortcutChange(pendingShortcut)
      stopRecording()
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onGlobalShortcutChange(null)
  }

  const handleBlur = () => {
    // If user clicks away during recording, cancel without saving
    stopRecording()
  }

  // Display value logic
  const getDisplayValue = (): string => {
    if (isRecording) {
      if (pendingDisplay) return pendingDisplay
      return t("shortcut.pressKeys")
    }
    return globalShortcut ? formatShortcutForDisplay(globalShortcut) : t("shortcut.clickToSet")
  }

  const hasShortcut = globalShortcut !== null

  return (
    <div className="w-full min-w-0 lg:w-[360px]">
      <div>
        {isRecording ? (
          <div
            ref={recordingRef}
            tabIndex={0}
            role="textbox"
            aria-label={t("shortcut.pressKeysToRecord")}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onBlur={handleBlur}
            className={cn(
              "flex min-h-11 w-full items-center rounded-[10px] border-2 border-ring/70 bg-background px-3 text-sm",
              "outline-none shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_12%,transparent)]",
              !pendingDisplay && "text-muted-foreground"
            )}
          >
            {getDisplayValue()}
          </div>
        ) : (
          <div
            className={cn(
              "flex min-h-11 w-full cursor-pointer items-center rounded-[10px] border border-border/70 bg-background/70 px-3 text-left text-sm",
              "transition-colors duration-200 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
              !hasShortcut && "text-muted-foreground"
            )}
            onClick={startRecording}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startRecording() }}
            role="button"
            tabIndex={0}
          >
            <span>{getDisplayValue()}</span>
            {hasShortcut ? (
              <button
                type="button"
                onClick={handleClear}
                className="ml-auto grid size-8 cursor-pointer place-items-center rounded-[8px] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                aria-label={t("shortcut.clear")}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : (
              <span className="ml-auto text-xs text-muted-foreground">{t("shortcut.clickToSet")}</span>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("shortcut.escapeHint")}</p>
    </div>
  )
}
