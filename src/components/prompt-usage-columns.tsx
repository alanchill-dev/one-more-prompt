import { ScopeColumn } from "./prompt-usage-scope-column"
import { PromptUsageSummary } from "./prompt-usage-summary"
import type { SessionQuotaState } from "@/hooks/use-session-quota"
import { useEffect, useRef, type MutableRefObject } from "react"

import { PromptInspector, type PromptUsageCopyState } from "@/components/prompt-usage-inspector"
import { useI18n } from "@/hooks/use-i18n"
import type {
  PromptUsageProject,
  PromptUsageSession,
  PromptUsageTurn,
} from "@/lib/prompt-usage"
import { PromptRow } from "./prompt-usage-prompt-row"

export interface PromptUsageColumnBrowserProps {
  sessionQuota?: SessionQuotaState
  initialTurnId?: string
  entries: PromptUsageProject[]
  fullEntries?: PromptUsageProject[]
  active?: boolean
  selectedEntryId: string | null
  expandedEntryId: string | null
  selectedSessionId: string | null
  selectedTurnId: string | null
  copyState: PromptUsageCopyState
  onSelectEntry: (entry: PromptUsageProject) => void
  onSelectSession: (session: PromptUsageSession) => void
  onSelectTurn: (turn: PromptUsageTurn) => void
  onNavigateToSession: (sessionId: string) => void
  onCloseInspector: () => void
  onCopy: (turn: PromptUsageTurn) => void
}

function EmptyColumn({ children, testId, wideOnly = false }: { children: string; testId: string; wideOnly?: boolean }) {
  return (
    <div
      className={`${wideOnly ? "hidden min-[1100px]:flex" : "flex"} min-h-40 items-center justify-center px-6 text-center text-xs text-muted-foreground`}
      data-testid={testId}
    >
      {children}
    </div>
  )
}



function PromptList({
  session,
  fullSession,
  project,
  active,
  sessionQuota,
  selectedTurnId,
  onSelectTurn,
  rowRefs,
}: {
  session: PromptUsageSession
  fullSession: PromptUsageSession
  project?: PromptUsageProject
  active: boolean
  sessionQuota?: SessionQuotaState
  selectedTurnId: string | null
  onSelectTurn: (turn: PromptUsageTurn) => void
  rowRefs: MutableRefObject<Map<string, HTMLButtonElement>>
}) {
  const t = useI18n()

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden" aria-label={t("promptUsage.promptsAria")} data-guide-target="prompts-local" data-testid="prompt-usage-prompt-list" data-column="prompts">
      {/* Keep this full-bleed pane free of a reserved gutter when it does not scroll. */}
      <div className="omp-scrollbar max-h-[calc(100%_-_10rem)] shrink-0 overflow-y-auto" style={{ scrollbarGutter: "auto" }} data-testid="prompt-usage-summary-header">
        <PromptUsageSummary project={project} session={fullSession} sessionQuota={sessionQuota} active={active} />
      </div>
      <h3 className="prompt-project-list-heading" data-testid="prompt-usage-prompt-list-heading">
        <span>{t("promptUsage.promptsAria")}</span><span>{session.turns.length}</span>
      </h3>
      {session.turns.length === 0 ? (
        <EmptyColumn testId="prompt-usage-no-prompts">{t("promptUsage.noMatchingPromptsTitle")}</EmptyColumn>
      ) : (
        <div className="omp-scrollbar min-h-0 flex-1 overflow-y-auto" style={{ scrollbarGutter: "auto" }} aria-label={t("promptUsage.promptsAria")} data-guide-target="prompts-selection-list" data-testid="prompt-usage-scrollable-rows">
          {session.turns.map((turn) => (
            <PromptRow
              key={turn.id}
              session={session}
              turn={turn}
              selected={selectedTurnId === turn.id}
              onSelect={() => onSelectTurn(turn)}
              buttonRef={(element) => {
                if (element) rowRefs.current.set(turn.id, element)
                else rowRefs.current.delete(turn.id)
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function PromptUsageColumnBrowser({
  initialTurnId,
  entries,
  fullEntries = entries,
  active = true,
  sessionQuota,
  selectedEntryId,
  expandedEntryId,
  selectedSessionId,
  selectedTurnId,
  copyState,
  onSelectEntry,
  onSelectSession,
  onSelectTurn,
  onNavigateToSession,
  onCloseInspector,
  onCopy,
}: PromptUsageColumnBrowserProps) {
  const t = useI18n()
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null
  const fullEntry = fullEntries.find(entry => entry.id === selectedEntryId)
  const selectedSession = selectedEntry?.sessions.find((session) => session.id === selectedSessionId) ?? null
  const fullSession = fullEntry?.sessions.find(session => session.id === selectedSessionId) ?? selectedSession
  const selectedTurn = selectedSession?.turns.find((turn) => turn.id === selectedTurnId) ?? null
  const headingRef = useRef<HTMLHeadingElement>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const lastTurnRef = useRef<string | null>(null)

  useEffect(() => {
    if (selectedTurnId) {
      lastTurnRef.current = selectedTurnId
    }
  }, [selectedTurnId])

  useEffect(() => {
    if (!initialTurnId) return
    rowRefs.current.get(initialTurnId)?.scrollIntoView?.({ block: "nearest", behavior: "instant" })
  }, [initialTurnId])

  const closeInspector = () => {
    const turnId = selectedTurnId ?? lastTurnRef.current
    onCloseInspector()
    if (turnId) window.requestAnimationFrame(() => rowRefs.current.get(turnId)?.focus())
  }

  return (
    <div
      className="relative grid min-h-0 flex-1 w-full min-w-0 grid-cols-1 grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)] overflow-hidden border-y border-border/70 min-[700px]:grid-cols-[minmax(13rem,0.72fr)_minmax(0,1.28fr)] min-[700px]:grid-rows-1 min-[1100px]:grid-cols-[minmax(14rem,0.72fr)_minmax(18rem,1fr)_minmax(22rem,1.28fr)]"
      data-testid="prompt-usage-navigation"
      data-layout="prompt-inspector"
    >
      <ScopeColumn
        entries={entries}
        selectedEntryId={selectedEntryId}
        expandedEntryId={expandedEntryId}
        selectedSessionId={selectedSessionId}
        onSelectEntry={onSelectEntry}
        onSelectSession={onSelectSession}
        onNavigateToSession={onNavigateToSession}
      />

      {selectedEntry && selectedSession ? (
        <PromptList
          session={selectedSession}
          fullSession={fullSession!}
          project={fullEntry?.kind === "project" ? fullEntry : undefined}
          active={active}
          sessionQuota={sessionQuota}
          selectedTurnId={selectedTurnId}
          onSelectTurn={onSelectTurn}
          rowRefs={rowRefs}
        />
      ) : (
        <EmptyColumn testId={selectedEntry ? "prompt-usage-select-session" : "prompt-usage-select-entry"}>
          {selectedEntry ? t("promptUsage.selectSession") : t("promptUsage.selectEntry")}
        </EmptyColumn>
      )}

      {selectedTurn && selectedEntry && selectedSession ? (
        <>
          <button
            type="button"
            aria-label={t("promptUsage.closeInspector")}
            className="absolute inset-0 z-10 bg-black/45 min-[1100px]:hidden"
            onClick={closeInspector}
          />
          <PromptInspector
            key={selectedTurn.id}
            animateEntrance={selectedTurn.id !== initialTurnId}
            session={fullSession!}
            turn={selectedTurn}
            copyState={copyState}
            onCopy={() => onCopy(selectedTurn)}
            onNavigateToSession={onNavigateToSession}
            onClose={closeInspector}
            headingRef={headingRef}
          />
        </>
      ) : (
        <EmptyColumn testId="prompt-usage-select-prompt" wideOnly>{t("promptUsage.inspectorHint")}</EmptyColumn>
      )}
    </div>
  )
}
