import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { SessionQuotaHelp, SessionQuotaMetric, formatSessionQuota, projectQuotaValue, sessionQuotaValue } from "./session-quota"
import type { SessionQuotaStatus } from "@/bindings"
import type { SessionQuotaState } from "@/hooks/use-session-quota"
import type { PromptUsageSession } from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
const ready = (value: number | null, status: SessionQuotaStatus = value == null ? "unavailable" : "available"): SessionQuotaState => ({ loading: false, error: false, response: {
  dataAsOf: "2026-09-22T08:00:00Z", entries: [{ threadId: "session", status, weeklyPercent: value }],
} })
beforeEach(() => useAppPreferencesStore.setState({ language: "zh-TW" }))
describe("Official session allowance", () => {
  it.each([0, 10, null])("keeps quota %s usable without inventing a missing data timestamp", async value => {
    const user = userEvent.setup()
    const state = ready(value)
    state.response!.dataAsOf = null
    render(<><SessionQuotaMetric state={state} id="session" /><SessionQuotaHelp state={state} /></>)
    expect(screen.getByTestId("session-quota-value")).toHaveTextContent(value == null ? "官方尚未提供" : formatSessionQuota(value))
    await user.click(screen.getByRole("button", { name: "週額度怎麼看" }))
    const popup = await screen.findByRole("dialog")
    expect(popup).toHaveTextContent("來源：Codex 官方用量資料")
    expect(popup).not.toHaveTextContent(/資料截至|Invalid Date|1970|無法取得官方額度資料/)
  })
  it("adds available project roots once and reports incomplete coverage", () => {
    const session = (id: string, descendants: string[] = []): PromptUsageSession => ({ id, descendantThreadIds: descendants,
      title: id, updatedAt: null, promptCount: 0, isActive: false, codexOrder: null, turns: [], costUsd: null, estimationStatus: "unknown" })
    const state: SessionQuotaState = { loading: false, error: false, response: { dataAsOf: "2026-10-14T10:00:00Z", entries: [
      { threadId: "parent", status: "available", weeklyPercent: 6 },
      { threadId: "child", status: "available", weeklyPercent: 4 },
      { threadId: "second", status: "available", weeklyPercent: 3 },
      { threadId: "missing", status: "unavailable", weeklyPercent: null },
    ] } }
    const sessions = [session("parent", ["child"]), session("child"), session("second")]
    expect(projectQuotaValue(state, sessions)).toEqual({ value: 9, partial: false, recorded: 2, total: 2 })
    expect(projectQuotaValue(state, [...sessions, session("missing")])).toEqual({ value: 9, partial: true, recorded: 2, total: 3 })
    expect(projectQuotaValue(state, [session("missing")])).toEqual({ value: null, partial: true, recorded: 0, total: 1 })
    expect(projectQuotaValue(ready(0), [session("session")])).toEqual({ value: 0, partial: false, recorded: 1, total: 1 })
    expect(projectQuotaValue(state, [session("parent", ["shared"]), session("second", ["shared"])]))
      .toEqual({ value: 6, partial: true, recorded: 1, total: 2 })
    state.response!.entries[0].status = "partial"
    expect(projectQuotaValue(state, sessions)).toEqual({ value: 9, partial: true, recorded: 2, total: 2 })
    expect(projectQuotaValue(state, [...sessions, session("missing")])).toEqual({ value: 9, partial: true, recorded: 2, total: 3 })
    state.response!.entries[0].status = "available"
    state.response!.entries[1].status = "partial"
    expect(projectQuotaValue(state, sessions)).toEqual({ value: 9, partial: false, recorded: 2, total: 2 })
  })

  it("does not clamp lifetime usage or turn small usage into zero", () => {
    expect(formatSessionQuota(128.4)).toBe("128.4%")
    expect(formatSessionQuota(0)).toBe("0%")
    expect(formatSessionQuota(.0001)).toBe("<0.01%")
  })
  it("counts every full-project root, including sessions that could not be queried", () => {
    const sessions = [{ id: "session", createdAt: "2026-10-15T09:00:00Z" }, { id: "not-queried", createdAt: null }] as PromptUsageSession[]
    expect(projectQuotaValue(ready(0), sessions)).toEqual({ value: 0, partial: true, recorded: 1, total: 2 })
    render(<SessionQuotaMetric state={ready(0)} id="project" sessions={sessions} />)
    expect(screen.getByTestId("session-quota-value")).toHaveTextContent("0%")
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
    fireEvent.click(screen.getByTestId("session-quota-coverage-trigger"))
    expect(screen.getByTestId("session-quota-coverage")).toHaveTextContent("1 段已提供額度 · 1 段未提供額度")
    expect(screen.queryByTestId("session-quota-partial")).toBeNull()
  })
  it("omits redundant Session counts and warning badges while preserving value details", () => {
    const view = render(<SessionQuotaMetric state={ready(10)} id="session" />)
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
    expect(screen.queryByTestId("session-quota-partial")).toBeNull()
    fireEvent.click(screen.getByTestId("session-quota-coverage-trigger"))
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
    expect(screen.getByTestId("session-quota-coverage-trigger")).not.toHaveAccessibleName(/1\/1/)
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("1/1")
    expect(screen.getByRole("tooltip")).toHaveTextContent("對話累積用量")
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("官方標記")
    fireEvent.keyDown(document, { key: "Escape" })
    view.rerender(<SessionQuotaMetric state={ready(10, "partial")} id="session" />)
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
    expect(screen.queryByTestId("session-quota-partial")).toBeNull()
    expect(screen.getByTestId("session-quota-coverage-trigger")).not.toHaveAccessibleName(/缺少資料不算 0|實際總量可能更高/)
    fireEvent.click(screen.getByTestId("session-quota-coverage-trigger"))
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
    expect(screen.getByTestId("session-quota-coverage-trigger")).not.toHaveAccessibleName(/1\/1/)
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("1/1")
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("資料不完整")
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("不完整")
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("完整用量可能更高")
    fireEvent.keyDown(document, { key: "Escape" })
    view.rerender(<SessionQuotaMetric state={ready(null)} id="session" />)
    fireEvent.click(screen.getByTestId("session-quota-coverage-trigger"))
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
    expect(screen.getByRole("tooltip").querySelector(".prompt-summary-quota-chart")).toBeNull()
    expect(screen.getByTestId("session-quota-value")).not.toHaveTextContent("0%")
  })
  it.each([
    undefined,
    { response: null, loading: true, error: false },
    { response: null, loading: false, error: true },
    { ...ready(10), loading: true },
    { ...ready(10), error: true },
  ])("does not invent zero coverage for unresolved or failed state %s", state => {
    render(<SessionQuotaMetric state={state} id="session" />)
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
    expect(screen.queryByTestId("session-quota-partial")).toBeNull()
    fireEvent.click(screen.getByTestId("session-quota-coverage-trigger"))
    expect(screen.getByRole("tooltip")).toBeVisible()
    expect(screen.getByRole("tooltip").querySelector(".prompt-summary-quota-chart")).toBeNull()
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
  })
  it.each([0, .0001, 10, 151.52, null])("retains partial ratio %s and its details without a warning badge or redundant counts", value => {
    const state = ready(value, "partial")
    expect(sessionQuotaValue(state, "session")).toBe(value)
    render(<SessionQuotaMetric state={state} id="session" />)
    expect(screen.queryByTestId("session-quota-partial")).toBeNull()
    expect(screen.getByTestId("session-quota-metric")).not.toHaveAccessibleName(/實際總量可能更高/)
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
    fireEvent.click(screen.getByTestId("session-quota-coverage-trigger"))
    expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
    expect(screen.getByTestId("session-quota-coverage-trigger")).not.toHaveAccessibleName(/\d\/1 Session/)
    expect(screen.getByRole("tooltip").querySelector(".prompt-summary-quota-chart") == null).toBe(value == null)
    expect(screen.getByTestId("session-quota-metric")).not.toHaveTextContent("用量尚未完整")
    expect(screen.getByTestId("session-quota-value")).toHaveTextContent(value == null ? "尚未提供" : formatSessionQuota(value))
    expect(screen.getByTestId("session-quota-coverage-trigger")).toHaveClass("prompt-summary-value-trigger")
  })
  it("counts missing roots once without inferring completeness from root counts or descendants", () => {
    const state = ready(10)
    state.response!.entries.push({ threadId: "child", status: "partial", weeklyPercent: 4 })
    const sessions = [{ id: "session", descendantThreadIds: ["child"] }, { id: "child" }, { id: "missing" }] as PromptUsageSession[]
    const view = render(<SessionQuotaMetric state={state} id="project" sessions={sessions} />)
    fireEvent.click(screen.getByTestId("session-quota-coverage-trigger"))
    expect(screen.getByTestId("session-quota-coverage")).toHaveTextContent("1 段已提供額度 · 1 段未提供額度")
    expect(within(screen.getByRole("tooltip")).queryByRole("heading", { name: "對話資料" })).toBeNull()
    expect(screen.getByRole("tooltip")).toHaveTextContent("1 段未提供額度")
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("官方標記")
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("完整用量可能更高")
    fireEvent.keyDown(document, { key: "Escape" })
    state.response!.entries[0].status = "partial"
    view.rerender(<SessionQuotaMetric state={state} id="project" sessions={sessions} />)
    fireEvent.click(screen.getByTestId("session-quota-coverage-trigger"))
    const popup = screen.getByRole("tooltip")
    expect(popup).not.toHaveTextContent("資料不完整")
    expect(popup).toHaveTextContent("1 段未提供額度")
    expect(popup.querySelectorAll('.prompt-summary-quota-markers > [data-recorded="true"]')).toHaveLength(1)
    expect(popup.querySelectorAll('.prompt-summary-quota-markers > [data-recorded="false"]')).toHaveLength(1)
  })
  it("marks a project aggregate incomplete while retaining its other available root", () => {
    const state = ready(4, "partial")
    state.response!.entries.push({ threadId: "other", status: "available", weeklyPercent: 6 })
    const sessions = [{ id: "session" }, { id: "other" }] as PromptUsageSession[]
    render(<SessionQuotaMetric state={state} id="project" sessions={sessions} />)
    expect(screen.getByTestId("session-quota-value")).toHaveTextContent("10%")
    expect(screen.queryByTestId("session-quota-partial")).toBeNull()
  })
  it("keeps an unavailable project distinct from incomplete usage without inventing a ratio", () => {
    const sessions = [{ id: "session" }] as PromptUsageSession[]
    const view = render(<SessionQuotaMetric state={ready(null)} id="project" sessions={sessions} />)
    expect(screen.queryByTestId("session-quota-partial")).toBeNull()
    view.rerender(<SessionQuotaMetric state={ready(null, "partial")} id="project" sessions={sessions} />)
    expect(screen.queryByTestId("session-quota-partial")).toBeNull()
    expect(screen.getByTestId("session-quota-value")).not.toHaveTextContent("0%")
  })
  it("keeps unavailable, loading and failed values distinct when opening their details", () => {
    const view = render(<SessionQuotaMetric state={ready(null)} id="session" />)
    expect(screen.getByTestId("session-quota-metric")).toHaveAccessibleName(/官方尚未提供/)
    view.rerender(<SessionQuotaMetric state={{ response: null, loading: true, error: false }} id="session" />)
    expect(screen.getByTestId("session-quota-metric")).toHaveAccessibleName(/查詢中/)
    view.rerender(<SessionQuotaMetric state={{ response: null, loading: false, error: true }} id="session" />)
    expect(screen.getByTestId("session-quota-metric")).toHaveAccessibleName(/查詢失敗/)
    expect(screen.getByTestId("session-quota-coverage-trigger")).toHaveClass("prompt-summary-value-trigger")
  })
  it("opens help only on activation and dismisses with Escape", async () => {
    const user = userEvent.setup()
    render(<SessionQuotaHelp state={ready(10)} />)
    const trigger = screen.getByRole("button", { name: "週額度怎麼看" })
    expect(trigger).toHaveClass("timeline-help-trigger")
    expect(trigger.querySelector("svg")).toHaveAttribute("width", "20")
    await user.tab()
    expect(screen.queryByRole("dialog")).toBeNull()
    await user.keyboard("{Enter}")
    const popup = await screen.findByRole("dialog")
    expect(popup).toBeVisible()
    expect(popup.querySelector("h2")).toHaveTextContent("週額度怎麼看")
    expect(popup).toHaveTextContent("100% 相當於目前方案一週的完整額度")
    expect(popup.querySelector(".session-quota-explanation-scopes")).toBeNull()
    expect(popup).not.toHaveTextContent("有紀錄，不代表完整")
    expect(popup).not.toHaveTextContent("實際總量可能更高")
    expect(popup).not.toHaveTextContent("缺少資料不算 0")
    expect(popup.querySelector(".session-quota-explanation-incomplete")).toBeNull()
    expect(popup.querySelector(".session-quota-example-count svg")).toBeNull()
    expect(popup).toHaveTextContent("有紀錄筆數：2/3 Session（示例）")
    expect(popup).not.toHaveTextContent("1/1 也不代表完整")
    expect(popup).toHaveTextContent("Session A13%")
    expect(popup).toHaveTextContent("Session B12%")
    expect(popup).toHaveTextContent("Session C未提供")
    expect(popup).toHaveTextContent("示例僅供說明，不是你的實際用量")
    expect(popup).toHaveTextContent("2026")
    expect(popup).not.toHaveTextContent("6% + 4%")
    expect(popup.querySelector("figure")).toHaveTextContent("累積用量（示例）")
    expect(popup.querySelector(".quota-example-bar")).toHaveAttribute("width", "99.5")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
  it("keeps click-open help present after pointer travel until explicitly closed", async () => {
    const user = userEvent.setup()
    render(<SessionQuotaHelp state={ready(51.52)} />)
    const trigger = screen.getByRole("button", { name: "週額度怎麼看" })
    await user.hover(trigger)
    expect(screen.queryByRole("dialog")).toBeNull()
    await user.click(trigger)
    const popup = await screen.findByRole("dialog")
    await user.hover(popup)
    expect(popup).toBeVisible()
    await user.unhover(popup)
    expect(popup).toBeVisible()
    await user.click(screen.getByRole("button", { name: "關閉說明" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
  it("shows request failures in the shared help without restoring the removed warning", async () => {
    const user = userEvent.setup()
    render(<SessionQuotaHelp state={{ response: null, loading: false, error: true }} />)
    await user.click(screen.getByRole("button", { name: "週額度怎麼看" }))
    const popup = await screen.findByRole("dialog")
    expect(popup).toHaveTextContent("無法取得官方額度資料")
    expect(popup).not.toHaveTextContent("只加總已取得的用量")
    expect(popup).toHaveTextContent("來源：Codex 官方用量資料")
  })
})
