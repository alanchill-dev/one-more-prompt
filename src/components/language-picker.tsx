import { CaretDown } from "@phosphor-icons/react"
import {
  APP_LANGUAGES,
  isAppLanguage,
  type AppLanguage,
} from "@/lib/i18n"

interface LanguagePickerProps {
  value: AppLanguage
  onValueChange: (value: AppLanguage) => void
  label: string
  disabled?: boolean
}

export function LanguagePicker({
  value,
  onValueChange,
  label,
  disabled = false,
}: LanguagePickerProps) {
  return (
    <label className="relative inline-flex min-h-11 min-w-44 max-w-full items-center">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          if (isAppLanguage(event.target.value)) {
            onValueChange(event.target.value)
          }
        }}
        className="min-h-11 w-full cursor-pointer appearance-none rounded-[10px] border border-border/70 bg-background/80 py-2 pl-3 pr-10 text-sm font-medium text-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow] duration-200 hover:bg-background focus-visible:border-ring/70 focus-visible:ring-2 focus-visible:ring-ring/35"
      >
        {APP_LANGUAGES.map((language) => (
          <option key={language.value} value={language.value}>
            {language.label}
          </option>
        ))}
      </select>
      <CaretDown
        aria-hidden
        className="pointer-events-none absolute right-3 size-4 text-muted-foreground"
        weight="bold"
      />
    </label>
  )
}
