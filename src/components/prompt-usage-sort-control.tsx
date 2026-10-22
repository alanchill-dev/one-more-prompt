import "./prompt-usage-sort-control.css"
import { Select } from "@base-ui/react/select"
import { CaretDown, Check, ClockCounterClockwise, Coins, ListNumbers, SidebarSimple, SortAscending } from "@phosphor-icons/react"
import { useI18n } from "@/hooks/use-i18n"
import type { SortMode } from "./prompt-usage-sort"

const options = [
  { value: "recent", label: "promptUsage.sortRecent", description: "promptUsage.sortRecentDescription", icon: ClockCounterClockwise },
  { value: "prompts", label: "promptUsage.sortPrompts", description: "promptUsage.sortPromptsDescription", icon: ListNumbers },
  { value: "tokens", label: "promptUsage.sortTokens", description: "promptUsage.sortTokensDescription", icon: Coins },
  { value: "name", label: "promptUsage.sortName", description: "promptUsage.sortNameDescription", icon: SortAscending },
  { value: "codex", label: "promptUsage.sortCodex", description: "promptUsage.sortCodexDescription", icon: SidebarSimple },
] as const

export function PromptUsageSortControl({ value, onChange }: { value: SortMode; onChange: (value: SortMode) => void }) {
  const t = useI18n()
  return <Select.Root value={value} onValueChange={next => next != null && onChange(next)}>
    <Select.Trigger className="prompt-browser-sort-trigger" aria-label={t("promptUsage.sort")}>
      <Select.Value>{t(options.find(option => option.value === value)!.label)}</Select.Value>
      <Select.Icon><CaretDown size={12} aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner sideOffset={8} align="start" alignItemWithTrigger={false} className="z-[80]">
        <Select.Popup className="prompt-browser-sort-popup">
          <Select.List>
            {options.map(({ value: key, label, description, icon: Icon }) => <Select.Item key={key} value={key} className="prompt-browser-sort-option">
              <Icon size={17} className="prompt-browser-sort-icon" aria-hidden="true" />
              <span className="prompt-browser-sort-copy">
                <Select.ItemText className="prompt-browser-sort-label">{t(label)}</Select.ItemText>
                <span className="prompt-browser-sort-description">{t(description)}</span>
              </span>
              <Select.ItemIndicator className="prompt-browser-sort-check"><Check size={14} weight="bold" aria-hidden="true" /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>
}
