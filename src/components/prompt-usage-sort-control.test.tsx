import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PromptUsageSortControl } from "./prompt-usage-sort-control"

vi.mock("@/hooks/use-i18n", () => ({ useI18n: () => (key: string) => key }))

describe("PromptUsageSortControl", () => {
  it("opens its custom list and selects Token sorting", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PromptUsageSortControl value="recent" onChange={onChange} />)
    await user.click(screen.getByRole("combobox"))
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(5))
    expect(screen.getByText("promptUsage.sortCodexDescription")).toBeInTheDocument()
    await user.click(screen.getByRole("option", { name: /promptUsage.sortTokens/ }))
    expect(onChange).toHaveBeenCalledWith("tokens")
  })
  it("supports keyboard opening, navigation, and selection", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PromptUsageSortControl value="recent" onChange={onChange} />)
    screen.getByRole("combobox").focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(5))
    await user.keyboard("{End}{Enter}")
    expect(onChange).toHaveBeenCalledWith("codex")
  })
})
