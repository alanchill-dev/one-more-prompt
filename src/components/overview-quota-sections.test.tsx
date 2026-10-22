import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { MetricLine } from "@/lib/plugin-types"
import { OverviewQuotaSections } from "@/components/overview-quota-sections"

const progressLines: MetricLine[] = [
  { type: "progress", label: "Weekly", used: 35, limit: 100, format: { kind: "percent" } },
  { type: "progress", label: "Spark", used: 10, limit: 100, format: { kind: "percent" } },
  { type: "progress", label: "Spark Weekly", used: 20, limit: 100, format: { kind: "percent" } },
]

describe("OverviewQuotaSections", () => {
  it("embeds account facts into one continuous allowance field", () => {
    render(
      <OverviewQuotaSections
        progressLines={progressLines}
        accountLines={[
          { type: "text", label: "Rate Limit Resets", value: "1 available" },
          { type: "text", label: "Credits", value: "$119.40" },
        ]}
        links={<a href="https://status.openai.com">Status</a>}
        renderProgressLine={(line, index) => <div key={index}>{line.label}</div>}
        renderAccountLine={(line, index) => <div key={index}>{line.label}</div>}
      />,
    )

    const usageConsole = screen.getByTestId("overview-usage-limits")
    expect(usageConsole).toHaveAttribute("data-layout", "allowance-ledger")
    expect(usageConsole).not.toHaveClass("rounded-3xl", "border", "shadow-lg")
    expect(screen.getByRole("region", { name: "Usage Limits" })).toBeInTheDocument()
    expect(usageConsole.querySelector("header")).toContainElement(screen.getByRole("link", { name: "Status" }))
    expect(screen.getByTestId("overview-usage-links")).toHaveClass("flex-col", "gap-1")
    expect(screen.getByTestId("overview-account-status")).toHaveTextContent("Rate Limit ResetsCredits")
    expect(screen.queryByText("Account Activity")).not.toBeInTheDocument()
    expect(screen.getAllByText(/^(Weekly|Spark|Spark Weekly)$/)).toHaveLength(3)
  })
})
