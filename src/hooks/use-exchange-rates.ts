import { useCallback, useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import type { ExchangeRate } from "@/bindings"

type ExchangeRateState =
  | { status: "loading"; rates: ExchangeRate[] }
  | { status: "ready"; rates: ExchangeRate[] }
  | { status: "error"; rates: ExchangeRate[] }

const USD_BASE_RATE: ExchangeRate = {
  code: "USD",
  rate: 1,
  date: null,
  source: "USD Base",
  status: "base",
}

let cachedRates: ExchangeRate[] = [USD_BASE_RATE]

export function useExchangeRates() {
  const [state, setState] = useState<ExchangeRateState>({
    status: cachedRates.length > 1 ? "ready" : "loading",
    rates: cachedRates,
  })

  const refresh = useCallback(async () => {
    if (typeof isTauri !== "function" || !isTauri()) {
      setState({ status: "ready", rates: cachedRates })
      return cachedRates
    }
    setState((current) => ({ status: "loading", rates: current.rates }))
    try {
      const loaded = await invoke<ExchangeRate[]>("get_exchange_rates")
      if (!Array.isArray(loaded) || loaded.length === 0) throw new Error("Exchange-rate response was empty")
      cachedRates = loaded
      setState({ status: "ready", rates: loaded })
      return loaded
    } catch (error) {
      console.error("Failed to load exchange rates:", error)
      setState((current) => ({ status: "error", rates: current.rates }))
      return null
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}
