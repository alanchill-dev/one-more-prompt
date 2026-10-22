import { Tooltip } from "@base-ui/react/tooltip"
import { useEffect, useState, type ReactNode } from "react"

export function PromptSummaryValueDetail({ label, testId, content, children }: {
  label: string; testId: string; content: ReactNode; children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return
      // The Prompt Inspector handles Escape on document bubble; this detail owns it first.
      event.preventDefault()
      setOpen(false)
    }
    document.addEventListener("keydown", dismiss, true)
    return () => document.removeEventListener("keydown", dismiss, true)
  }, [open])
  return <Tooltip.Root open={open} onOpenChange={(next, details) => {
    // A press follows pointer focus. Keep the same readable detail open for mouse and touch.
    if (!next && details.reason === "trigger-press") { details.cancel(); return }
    setOpen(next)
  }}>
    <Tooltip.Trigger type="button" delay={0} closeDelay={0} className="prompt-summary-value-trigger" aria-label={label} data-testid={`${testId}-trigger`} onClick={() => setOpen(true)}>
      {children}
    </Tooltip.Trigger>
    {open && <Tooltip.Portal><Tooltip.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-[100]">
      <Tooltip.Popup role="tooltip" className="prompt-summary-detail-popup" data-summary-value-detail>
        {content}
      </Tooltip.Popup>
    </Tooltip.Positioner></Tooltip.Portal>}
  </Tooltip.Root>
}
