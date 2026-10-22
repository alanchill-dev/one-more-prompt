import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  UsageTrendModelComposition,
  makeModelColorOrder,
  modelColor,
  modelSurfaceColor,
  type ModelShare,
} from "@/components/usage-trend-model-composition"

const shares: ModelShare[] = [
  { name: "GPT-5.6 Sol", tokens: 2_410_000_000, share: 0.787 },
  { name: "GPT-5.6 Luna", tokens: 451_460_000, share: 0.148 },
  { name: "GPT-5", tokens: 136_280_000, share: 0.045 },
  { name: "GPT-5.6 Terra", tokens: 65_060_000, share: 0.021 },
  { name: "auto-review", tokens: 54_224, share: 0.0001 },
]
const colorOrder = new Map(shares.map((model, index) => [model.name, index]))

describe("UsageTrendModelComposition", () => {
  it("keeps ranked model names visible and reveals sub-3% details only on interaction", () => {
    const onActiveModelChange = vi.fn()
    render(<UsageTrendModelComposition shares={shares} colorOrder={colorOrder} revealKey="preset:14" onActiveModelChange={onActiveModelChange} />)

    const composition = screen.getByTestId("usage-trend-model-composition")
    const band = screen.getByTestId("usage-trend-model-band")
    const segments = shares.map((_, index) => screen.getByTestId(`usage-trend-model-segment-${index}`))
    const labels = shares.slice(0, 3).map((_, index) => screen.getByTestId(`usage-trend-model-label-${index}`))
    expect(composition).toHaveAttribute("data-reveal-key", "preset:14")
    expect(band.querySelectorAll(".trend-model-band-segment")).toHaveLength(5)
    expect(screen.getByTestId("usage-trend-model-ranking")).toHaveClass("sr-only")
    expect(labels.map((label) => label.textContent)).toEqual(shares.slice(0, 3).map((model) => model.name))
    expect(screen.queryByTestId("usage-trend-model-label-3")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-model-label-4")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-model-band-stage")).toHaveClass("h-16")
    expect(screen.getByTestId("usage-trend-model-composition-title")).toHaveTextContent("Period Model Composition")
    expect(composition).not.toHaveTextContent("5 Models")
    for (const label of labels) {
      expect(label.parentElement).toHaveClass("-translate-x-1/2")
      expect(label.parentElement).toHaveClass("top-6")
      expect(label.parentElement).not.toHaveStyle({ right: "0px" })
    }
    for (const leader of composition.querySelectorAll(".trend-model-label-leader")) {
      expect(leader).toHaveClass("top-[18px]", "h-1.5")
    }
    expect(segments[0]).toHaveTextContent("78.7%")
    expect(segments[0]).toHaveStyle({ backgroundColor: "var(--trend-model-surface-rank-1)" })
    expect(segments[0].querySelector(".trend-model-band-identity-accent")).not.toBeInTheDocument()
    expect(segments[1]).toHaveTextContent("14.8%")
    expect(segments[1]).toHaveStyle({ backgroundColor: "var(--trend-model-surface-rank-2)" })
    expect(segments[2]).toHaveTextContent("4.5%")
    expect(segments[3].querySelector(".trend-model-band-percent")).not.toBeInTheDocument()
    expect(segments[4].querySelector(".trend-model-band-percent")).not.toBeInTheDocument()
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    fireEvent.pointerEnter(segments[0])
    expect(segments[0]).toHaveStyle({ backgroundColor: "var(--trend-model-rank-1)" })
    expect(onActiveModelChange).toHaveBeenLastCalledWith("GPT-5.6 Sol")
    expect(screen.getByTestId("usage-trend-model-token-0")).toHaveTextContent("2.41B Tokens")
    expect(screen.getByRole("tooltip")).toHaveTextContent("2.41B Tokens")
    fireEvent.pointerLeave(segments[0])
    expect(segments[0]).toHaveStyle({ backgroundColor: "var(--trend-model-surface-rank-1)" })
    expect(onActiveModelChange).toHaveBeenLastCalledWith(null)
    expect(screen.queryByTestId("usage-trend-model-token-0")).not.toBeInTheDocument()

    fireEvent.pointerEnter(segments[3])
    expect(screen.getByRole("tooltip")).toHaveTextContent("GPT-5.6 Terra · 2.1%")
    expect(screen.getByRole("tooltip")).toHaveTextContent("65.06M Tokens")
    expect(segments[3]).toHaveAttribute("data-active", "true")
    fireEvent.pointerLeave(segments[3])
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    fireEvent.focus(segments[4])
    expect(screen.getByRole("tooltip")).toHaveTextContent("auto-review · <0.1%")
    expect(screen.getByRole("tooltip")).toHaveTextContent("54,224 Tokens")
    fireEvent.blur(segments[4])

    fireEvent.focus(labels[2])
    expect(screen.getByTestId("usage-trend-model-token-2")).toHaveTextContent("136.28M Tokens")
  })

  it("uses the same top-five current-period ranking as the stacked columns", () => {
    const rankedOrder = new Map([
      ["Long Tail", 0],
      ["Model A", 1],
      ["Model B", 2],
      ["Model C", 3],
      ["Model D", 4],
      ["Model E", 5],
    ])
    render(
      <UsageTrendModelComposition
        shares={[
          { name: "Long Tail", tokens: 600, share: 0.6 },
          { name: "Model A", tokens: 80, share: 0.08 },
          { name: "Model B", tokens: 80, share: 0.08 },
          { name: "Model C", tokens: 80, share: 0.08 },
          { name: "Model D", tokens: 80, share: 0.08 },
          { name: "Model E", tokens: 80, share: 0.08 },
        ]}
        colorOrder={rankedOrder}
        revealKey="preset:30"
      />,
    )

    expect(screen.getByTestId("usage-trend-model-composition")).toHaveTextContent("Other Models")
    expect(screen.getByTestId("usage-trend-model-composition")).toHaveTextContent("Long Tail")
    expect(screen.getByTestId("usage-trend-model-composition")).not.toHaveTextContent("Model E")
    expect(screen.getByTestId("usage-trend-model-segment-5")).toHaveStyle({ backgroundColor: "var(--trend-model-other)" })
  })

  it("assigns colors strictly by current Token rank across spelling variants", () => {
    const order = makeModelColorOrder([{
      label: "8/20",
      value: 1_000,
      modelUsage: [
        { name: "gpt-5.6-sol", tokens: 40 },
        { name: "GPT-5.6-Terra", tokens: 30 },
        { name: "gpt_5.6_luna", tokens: 20 },
        { name: "GPT-5.5", tokens: 10 },
        { name: "GPT-5", tokens: 900 },
      ],
    }])

    expect(order.has("GPT-5.6 Sol")).toBe(true)
    expect(order.has("GPT-5.6 Terra")).toBe(true)
    expect(order.has("GPT-5.6 Luna")).toBe(true)
    expect(modelColor("GPT-5", order)).toBe("var(--trend-model-rank-1)")
    expect(modelColor("GPT-5.6 Sol", order)).toBe("var(--trend-model-rank-2)")
    expect(modelColor("gpt-5.6-terra", order)).toBe("var(--trend-model-rank-3)")
    expect(modelColor("GPT 5.6 Luna", order)).toBe("var(--trend-model-rank-4)")
    expect(modelColor("gpt_5.5", order)).toBe("var(--trend-model-rank-5)")
    expect(modelSurfaceColor("GPT-5", order)).toBe("var(--trend-model-surface-rank-1)")
    expect(modelSurfaceColor("GPT-5.6 Sol", order)).toBe("var(--trend-model-surface-rank-2)")
  })
})
