import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Select } from "@base-ui/react/select"
import { ArrowsClockwise, CaretDown, Check } from "@phosphor-icons/react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import type { PricingCatalog } from "@/bindings"
import { useExchangeRates } from "@/hooks/use-exchange-rates"
import { useI18n } from "@/hooks/use-i18n"
import { CURRENCY_LABELS, exchangeRateFor, formatCurrency } from "@/lib/currency"
import {
  DISPLAY_CURRENCIES,
  saveDisplayCurrency,
  type DisplayCurrency,
} from "@/lib/settings"
import { cn } from "@/lib/utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

function formatObservedAt(value: string | null, locale: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatCodexModelName(value: string) {
  return value.replace(/^GPT-/i, "").replace(/-/g, " ")
}

type AnchoredSelectOption = {
  value: string
  label: string
  detail?: string
}

function AnchoredSelect({
  label,
  value,
  options,
  disabled = false,
  onChange,
  testId,
}: {
  label: string
  value: string
  options: AnchoredSelectOption[]
  disabled?: boolean
  onChange: (value: string) => void
  testId: string
}) {
  const selected = options.find((option) => option.value === value) ?? options[0]
  return (
    <Select.Root value={value} onValueChange={(next) => next != null && onChange(next)} disabled={disabled}>
      <Select.Trigger
        aria-label={label}
        className="group flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-[11px] border border-border/70 bg-background/70 px-3 text-left text-foreground outline-none transition-[background-color,border-color,box-shadow] duration-200 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/70 data-[popup-open]:border-border disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={testId}
      >
        <span className="min-w-0">
          <Select.Value>
            {() => <span className="block truncate text-sm font-semibold">{selected?.label ?? value}</span>}
          </Select.Value>
          {selected?.detail ? <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{selected.detail}</span> : null}
        </span>
        <Select.Icon className="shrink-0 text-muted-foreground">
          <CaretDown size={14} className="transition-transform duration-200 group-data-[popup-open]:rotate-180" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="bottom" align="end" sideOffset={6} alignItemWithTrigger={false} className="z-[80] outline-none">
          <Select.Popup className="max-h-[min(18rem,var(--available-height))] w-[var(--anchor-width)] min-w-56 origin-[var(--transform-origin)] overflow-y-auto rounded-[12px] border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-2xl transition-[transform,opacity] duration-200 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  key={option.value || option.label}
                  value={option.value}
                  disabled={!option.value}
                  className="grid min-h-10 cursor-default grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[selected]:text-foreground data-[disabled]:opacity-50"
                >
                  <Select.ItemText className="min-w-0">
                    <span className="block truncate font-medium">{option.label}</span>
                    {option.detail ? <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{option.detail}</span> : null}
                  </Select.ItemText>
                  <Select.ItemIndicator className="text-[var(--wire-orange)]">
                    <Check size={14} weight="bold" aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

function PricingRow({
  title,
  description,
  children,
  last = false,
}: {
  title: string
  description: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div className={cn(
      "grid min-h-[76px] items-center gap-3 py-4 lg:grid-cols-[minmax(150px,0.72fr)_minmax(260px,1.28fr)] lg:gap-6",
      !last && "border-b border-border/60",
    )}>
      <div>
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <p className="mt-0.5 max-w-[46ch] text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 lg:justify-self-end">{children}</div>
    </div>
  )
}

export function PricingSettingsSection() {
  const t = useI18n()
  const displayCurrency = useAppPreferencesStore((state) => state.displayCurrency)
  const setDisplayCurrency = useAppPreferencesStore((state) => state.setDisplayCurrency)
  const exchangeRates = useExchangeRates()
  const [catalog, setCatalog] = useState<PricingCatalog | null>(null)
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading")
  const [selectedModel, setSelectedModel] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)

  useEffect(() => {
    if (typeof isTauri !== "function" || !isTauri()) {
      setCatalogStatus("error")
      return
    }
    let mounted = true
    void (async () => {
      try {
        const loaded = await invoke<PricingCatalog>("get_pricing_catalog")
        if (!mounted) return
        setCatalog(loaded)
        setCatalogStatus("ready")
      } catch (error) {
        if (!mounted) return
        console.error("Failed to load model pricing:", error)
        setCatalogStatus("error")
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (selectedModel && catalog?.models.some((entry) => entry.model === selectedModel)) return
    setSelectedModel(catalog?.models[0]?.model ?? "")
  }, [catalog, selectedModel])

  const selectedEntry = useMemo(
    () => catalog?.models.find((entry) => entry.model === selectedModel) ?? null,
    [catalog, selectedModel],
  )
  const selectedRate = exchangeRateFor(exchangeRates.rates, displayCurrency)
  const exchangeRateValue = selectedRate?.rate ?? null
  const rateDate = selectedRate?.date ?? null
  const locale = t("settings.currency.locale")

  function updateCurrency(value: string) {
    if (!DISPLAY_CURRENCIES.includes(value as DisplayCurrency)) return
    const next = value as DisplayCurrency
    setDisplayCurrency(next)
    void saveDisplayCurrency(next).catch((error) => {
      console.error("Failed to save display currency:", error)
    })
  }

  async function refreshPricing() {
    setRefreshing(true)
    setRefreshFailed(false)
    try {
      const [nextCatalog, nextRates] = await Promise.all([
        invoke<PricingCatalog>("refresh_pricing_catalog"),
        exchangeRates.refresh(),
      ])
      setCatalog(nextCatalog)
      setCatalogStatus("ready")
      if (nextRates == null) setRefreshFailed(true)
    } catch (error) {
      console.error("Failed to refresh model pricing:", error)
      if (!catalog) setCatalogStatus("error")
      setRefreshFailed(true)
    } finally {
      setRefreshing(false)
    }
  }

  const pricingStatus = catalogStatus === "loading"
    ? t("settings.pricing.loading")
    : catalogStatus === "error"
      ? t("settings.pricing.unavailable")
      : catalog?.estimationStatus === "historical_rate"
        ? t("settings.pricing.historicalRate")
        : t("settings.pricing.currentRate")
  const observedAt = formatObservedAt(catalog?.observedAt ?? null, locale)
  const exchangeStatus = displayCurrency === "USD"
    ? null
    : selectedRate?.status === "stale"
      ? t("settings.currency.rateStale")
      : selectedRate?.rate == null
        ? t("settings.currency.rateUnavailable")
        : t("settings.currency.rateCurrent")
  const priceSource = catalog?.source === "embedded" ? t("settings.pricing.sourceEmbedded") : catalog ? "LiteLLM" : t("settings.pricing.unavailable")
  const modelSource = !catalog
    ? t("settings.pricing.unavailable")
    : catalog.modelSource === "codex_cache"
      ? t("settings.pricing.modelSourceCodex")
      : t("settings.pricing.modelSourceBundled")
  const exchangeSource = displayCurrency === "USD"
    ? t("settings.pricing.usdBase")
    : [exchangeStatus, rateDate ? t("settings.currency.rateDate", { date: rateDate }) : null]
        .filter((value): value is string => Boolean(value))
        .join(", ")
  const currencyOptions = DISPLAY_CURRENCIES.map((currency) => ({
    value: currency,
    label: currency,
    detail: CURRENCY_LABELS[currency],
  }))
  const modelOptions = catalog?.models.length
    ? catalog.models.map((entry) => ({
        value: entry.model,
        label: formatCodexModelName(entry.displayName),
        detail: "Codex",
      }))
    : [{ value: "", label: t("settings.pricing.noModels") }]

  return (
    <section className="grid gap-5 border-b border-border/70 px-5 py-6 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8 md:px-7 md:py-7">
      <div className="self-start md:sticky md:top-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{t("settings.pricing.title")}</h3>
        <p className="mt-1 max-w-[28ch] text-xs leading-5 text-muted-foreground">{t("settings.pricing.description")}</p>
      </div>
      <div className="min-w-0">
        <PricingRow title={t("settings.currency.title")} description={t("settings.currency.description")}>
          <div className="w-full max-w-[430px] lg:min-w-[360px]">
            <AnchoredSelect
              label={t("settings.currency.title")}
              value={displayCurrency}
              options={currencyOptions}
              onChange={updateCurrency}
              testId="settings-currency-select"
            />
          </div>
        </PricingRow>
        <PricingRow title={t("settings.pricing.modelTitle")} description={t("settings.pricing.modelDescription")}>
          <div className="w-full max-w-[430px] space-y-3 lg:min-w-[360px]">
            <AnchoredSelect
              label={t("settings.pricing.modelTitle")}
              value={selectedModel}
              disabled={!catalog?.models.length}
              options={modelOptions}
              onChange={setSelectedModel}
              testId="settings-model-select"
            />

            {selectedEntry ? (
              <div className="border-y border-border/60" data-testid="settings-pricing-matrix">
                <p className="border-b border-border/45 py-2 text-[9px] font-medium text-muted-foreground">{t("settings.pricing.perMillion")}</p>
                <dl className="grid grid-cols-2 text-xs sm:grid-cols-4">
                  {([
                    [t("settings.pricing.input"), selectedEntry.input],
                    [t("settings.pricing.cachedInput"), selectedEntry.cacheRead],
                    [t("settings.pricing.cacheWrite"), selectedEntry.cacheWrite],
                    [t("settings.pricing.output"), selectedEntry.output],
                  ] as const).map(([term, usd], index) => (
                    <div key={term} className={cn("py-3 pr-3", index > 0 && "sm:border-l sm:border-border/45 sm:pl-3")}>
                      <dt className="text-[10px] font-medium text-muted-foreground">{term}</dt>
                      <dd className="mt-1 font-semibold tabular-nums text-foreground">
                        {usd == null || exchangeRateValue == null ? t("settings.pricing.rateUnavailable") : formatCurrency(usd * exchangeRateValue, displayCurrency, locale)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {selectedEntry && exchangeRateValue == null ? <p className="text-[10px] text-destructive" role="status">{t("cost.exchangeUnavailable")}</p> : null}
          </div>
        </PricingRow>
        <PricingRow title={t("settings.pricing.dataTitle")} description={t("settings.pricing.dataDescription")} last>
          <div className="w-full max-w-[430px] border-y border-border/60" data-testid="settings-pricing-status-bar">
            <div className="flex items-center gap-3 py-3">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full bg-[var(--wire-orange)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--wire-orange)_12%,transparent)]",
                  catalogStatus === "loading" && "animate-pulse",
                  catalogStatus === "error" && "bg-destructive shadow-none",
                )}
                aria-hidden="true"
              />
              <p className={cn("min-w-0 flex-1 text-xs font-semibold", catalogStatus === "error" ? "text-destructive" : "text-foreground")}>{pricingStatus}</p>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void refreshPricing()}
                className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[9px] border border-border/70 bg-background/70 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-wait disabled:opacity-50"
              >
                <ArrowsClockwise size={16} className={cn(refreshing && "animate-spin")} aria-hidden="true" />
                {refreshing ? t("settings.pricing.refreshing") : t("settings.pricing.refresh")}
              </button>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 border-t border-border/45 py-3 text-[10px] leading-4" data-testid="settings-pricing-details">
              <dt className="text-muted-foreground">{t("settings.pricing.modelCatalog")}</dt>
              <dd className="text-right font-medium text-foreground">{modelSource}</dd>
              <dt className="text-muted-foreground">{t("settings.pricing.priceSource")}</dt>
              <dd className="text-right font-medium text-foreground">{priceSource}</dd>
              <dt className="text-muted-foreground">{t("settings.pricing.priceObserved")}</dt>
              <dd className="text-right font-medium text-foreground">{observedAt ?? t("settings.pricing.notObserved")}</dd>
              <dt className="text-muted-foreground">{t("settings.pricing.exchangeSource")}</dt>
              <dd className={cn("text-right font-medium text-foreground", selectedRate?.rate == null && displayCurrency !== "USD" && "text-destructive")}>{exchangeSource}</dd>
            </dl>
            <p className="border-t border-border/45 py-2.5 text-[10px] leading-4 text-muted-foreground">{t("settings.pricing.offlinePolicy")}</p>
            {refreshFailed ? <p className="border-t border-border/45 py-2.5 text-[10px] text-destructive" role="status">{t("settings.pricing.refreshFailed")}</p> : null}
          </div>
        </PricingRow>
      </div>
    </section>
  )
}
