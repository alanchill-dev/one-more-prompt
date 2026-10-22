import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it } from "vitest"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { PromptUsageTimeHelp } from "./prompt-usage-time-help"
beforeEach(() => useAppPreferencesStore.setState({ language: "en" }))
it("explains additive execution time with overlapping intervals and honest Prompt coverage", async () => {
  const user = userEvent.setup()
  render(<PromptUsageTimeHelp />)
  await user.click(screen.getByRole("button", { name: "How Total Execution Time Works" }))
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveTextContent("2 min + 3 min = 5 min")
  expect(screen.getByRole("img")).toHaveAccessibleName(/overlap for 1 minute/)
  const first = dialog.querySelector(".time-interval")!, second = dialog.querySelector(".time-interval-second")!
  expect(Number(first.getAttribute("width"))).toBe(144)
  expect(Number(second.getAttribute("x")) - Number(first.getAttribute("x"))).toBe(72)
  expect(Number(second.getAttribute("width"))).toBe(216)
  expect(dialog).toHaveTextContent("not the elapsed time of the Project")
  expect(dialog).toHaveTextContent("60 unique Prompts, 49 have calculable time")
  expect(dialog).toHaveTextContent("Running Prompts count when their start time is valid")
  expect(dialog).toHaveTextContent("interrupted Prompts and those missing required time records do not")
  expect(dialog).toHaveTextContent("regardless of date and search filters")
  expect(dialog).toHaveTextContent("not your actual activity")
})
it("renders the approved Traditional Chinese explanation", async () => {
  useAppPreferencesStore.setState({ language: "zh-TW" })
  const user = userEvent.setup()
  render(<PromptUsageTimeHelp />)
  await user.click(screen.getByRole("button", { name: "總執行時間怎麼算" }))
  expect(screen.getByRole("dialog")).toHaveTextContent("逐筆加總，並行會重複計時，非專案經過時間。")
  expect(screen.getByRole("dialog")).toHaveTextContent("60 筆不重複的 Prompt")
})
