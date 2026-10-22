import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { TokenLedger } from "./prompt-usage-token-ledger"
import type { PromptUsageTurn } from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const tokens = { totalTokens: 100, inputTokens: 80, cachedInputTokens: 60, outputTokens: 20, reasoningOutputTokens: 10 }
const turn: PromptUsageTurn = {
  id: "table-test", prompt: "Example", timeLabel: "10:00", startedAt: null,
  tokens, costUsd: 1, estimationStatus: "current_rate", quotaObservation: null,
  agents: [{ id: "one", name: "Very Long Agent Name", kind: "subagent", role: null, models: [], tokens, costUsd: 1, estimationStatus: "current_rate" }],
}

beforeEach(() => useAppPreferencesStore.setState({ language: "en" }))

describe("TokenLedger", () => {
  it("labels share concisely and places the subagent role after its model and effort", () => {
    useAppPreferencesStore.setState({ language: "zh-TW" })
    render(<TokenLedger turn={{ ...turn, agents: [{
      ...turn.agents[0], name: "Euclid", role: "worker",
      models: [{ ...tokens, name: "gpt-6-astra", reasoningEfforts: ["low"] }],
    }] }} />)
    expect(screen.getByRole("columnheader", { name: "佔比%" })).toBeInTheDocument()
    const row = screen.getByTestId("prompt-usage-subagent-agent")
    const identity = within(row).getByTestId("prompt-usage-agent-identity")
    expect(identity).toHaveTextContent(/^子代理 \(Euclid\)$/)
    expect(within(identity).getByText("(Euclid)")).toHaveClass("token-ledger-nickname")
    expect(within(row).getByTitle("gpt-6-astra · Low · worker")).toHaveTextContent(/^gpt-6-astra · Low · worker$/)
  })

  it("pairs related values in five semantic columns and keeps agents as rows", () => {
    render(<TokenLedger turn={turn} />)
    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5)
    expect(within(table).getAllByRole("row")).toHaveLength(3)
    const row = screen.getByTestId("prompt-usage-subagent-agent")
    expect(within(row).getByRole("rowheader")).toHaveTextContent("Very Long Agent Name")
    const cells = within(row).getAllByRole("cell")
    expect(cells).toHaveLength(4)
    expect(cells[0]).toHaveTextContent("100")
    expect(within(cells[0]).getByTestId("prompt-usage-agent-cost")).toBeInTheDocument()
    expect(cells[1].textContent).toBe("8060")
    expect(cells[2].textContent).toBe("2010")
    expect(cells[3]).toHaveTextContent(/^100%$/)
  })

  it("keeps a recorded zero total at zero share", () => {
    render(<TokenLedger turn={{ ...turn, tokens: { ...tokens, totalTokens: 0 } }} />)
    expect(within(screen.getByTestId("prompt-usage-token-summary")).getAllByRole("cell")[3]).toHaveTextContent(/^0%$/)
  })

  it("does not represent missing token data as measured zeroes or costs", () => {
    render(<TokenLedger turn={{ ...turn, tokenUsageRecorded: false }} />)
    expect(screen.getByTestId("prompt-usage-no-token-data")).toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-agent-cost")).not.toBeInTheDocument()
    for (const cell of within(screen.getByTestId("prompt-usage-subagent-agent")).getAllByRole("cell")) {
      expect(cell.textContent).toMatch(/^—+$/)
    }
  })
})
