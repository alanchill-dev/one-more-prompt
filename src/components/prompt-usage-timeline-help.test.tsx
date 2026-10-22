import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it } from "vitest"
import { TimelineHelp } from "./prompt-usage-timeline-help"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

beforeEach(() => useAppPreferencesStore.setState({ language: "en" }))
it("opens by click and dismisses with Escape", async () => {
  const user = userEvent.setup()
  render(<TimelineHelp />)
  await user.click(screen.getByRole("button", { name: "Read The Timeline" }))
  expect(await screen.findByRole("dialog")).toHaveTextContent("Read The Timeline")
  await user.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
})
it("opens an guide matching timestamp strokes, count badges and current navigation and restores focus after Escape", async () => {
  const user = userEvent.setup()
  render(<TimelineHelp />)
  const trigger = screen.getByRole("button", { name: "Read The Timeline" })
  await user.tab()
  expect(trigger).toHaveFocus()
  await user.keyboard("{Enter}")
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveTextContent("Only overlapping marks are grouped")
  expect(dialog).toHaveTextContent("The number inside is the prompt count")
  expect(dialog).toHaveTextContent("groups add their Token usage together")
  expect(dialog.querySelectorAll(".timeline-help-legend li")).toHaveLength(4)
  expect(dialog).toHaveTextContent("Mixed-model groups and unknown models use a neutral color")
  expect(dialog.querySelector("svg[aria-hidden=true]")).not.toBeNull()
  expect(dialog).toHaveTextContent("Scroll over session names on the left")
  expect(dialog).toHaveTextContent("select any prompt directly from its list")
  expect(dialog).toHaveTextContent("Alt/Option + scroll")
  const badges = [...dialog.querySelectorAll<SVGRectElement>("rect.timeline-help-count-badge")]
  expect(badges).toHaveLength(2)
  for (const badge of badges) {
    expect(badge).toHaveAttribute("stroke", "currentColor")
    expect(badge).toHaveAttribute("stroke-width", "1.5")
    const label = badge.nextElementSibling!
    expect(Number(label.getAttribute("x"))).toBeGreaterThan(Number(badge.getAttribute("x")))
    expect(Number(label.getAttribute("x"))).toBeLessThan(Number(badge.getAttribute("x")) + Number(badge.getAttribute("width")))
    expect(Number(label.getAttribute("y"))).toBeGreaterThan(Number(badge.getAttribute("y")))
    expect(Number(label.getAttribute("y"))).toBeLessThan(Number(badge.getAttribute("y")) + Number(badge.getAttribute("height")))
  }
  expect(dialog.querySelectorAll(".timeline-help-resize[data-edge]")).toHaveLength(2)
  expect(dialog.querySelector(".timeline-help-grip text")).toHaveTextContent("6 Hours")
  expect(trigger).toHaveClass("timeline-help-trigger")
  expect(trigger.querySelector("svg")).toHaveAttribute("width", "20")
  await user.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
})
it("supports explicit close and outside dismissal", async () => {
  const user = userEvent.setup()
  render(<><TimelineHelp /><button>Outside</button></>)
  const trigger = screen.getByRole("button", { name: "Read The Timeline" })
  await user.click(trigger)
  await user.click(screen.getByRole("button", { name: "Close Timeline Guide" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await user.click(trigger)
  await user.click(screen.getByTestId("timeline-help-backdrop"))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
})

it("does not open or dismiss by hover", async () => {
  const user = userEvent.setup()
  render(<TimelineHelp />)
  const trigger = screen.getByRole("button", { name: "Read The Timeline" })
  await user.hover(trigger)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await user.click(trigger)
  await user.unhover(trigger)
  expect(screen.getByRole("dialog")).toBeInTheDocument()
})

it("explains actual grouping and separates time navigation from Session browsing in Traditional Chinese", async () => {
  useAppPreferencesStore.setState({ language: "zh-TW" })
  const user = userEvent.setup()
  render(<TimelineHelp />)
  await user.click(screen.getByRole("button", { name: "時間軸怎麼看" }))
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveTextContent("只有標記重疊時才合併；框內數字是提示詞筆數。")
  expect(dialog).toHaveTextContent("混合模型群組與未知模型用中性色。")
  expect(dialog).toHaveTextContent("在左側 Session 名稱區上下捲動。")
  expect(dialog).toHaveTextContent("拖兩側、Alt/Option＋滾輪可縮放。")
  expect(dialog).toHaveTextContent("再點一次取消聚焦。")
})
