import { PushPin } from "@phosphor-icons/react"
import { useI18n } from "@/hooks/use-i18n"
import "./prompt-usage-pin-button.css"

export function PromptUsagePin({ pinId, kind = "session", title, pinned, onToggle }: {
  pinId: string
  kind?: "session" | "project"
  title: string
  pinned: boolean
  onToggle: () => void
}) {
  const t = useI18n()
  const label = t(kind === "project"
    ? pinned ? "promptUsage.unpinProject" : "promptUsage.pinProject"
    : pinned ? "promptUsage.unpinSession" : "promptUsage.pinSession", { title })
  return (
    <button type="button" className="prompt-session-pin" data-pin-id={pinId}
      aria-pressed={pinned} aria-label={label} title={label} onClick={onToggle}>
      <PushPin size={13} weight={pinned ? "fill" : "regular"} aria-hidden="true" />
    </button>
  )
}
