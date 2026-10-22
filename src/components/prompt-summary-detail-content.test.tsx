import { render, screen } from "@testing-library/react"
import { beforeEach, expect, it } from "vitest"
import { TimeSummaryDetail, QuotaSummaryDetail } from "./prompt-summary-detail-content"
import { APP_LANGUAGES, createTranslator } from "@/lib/i18n"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

beforeEach(() => useAppPreferencesStore.setState({ language: "en" }))

it("represents 18 of 29 real Prompts with exactly 18 filled and 11 outline dots", () => {
  render(<TimeSummaryDetail recorded={18} total={29} scope="session" />)
  const detail = screen.getByTestId("duration-coverage")
  expect(detail).toHaveAccessibleName("18/29 Prompt")
  expect(screen.getByRole("heading")).toHaveTextContent("18 Prompts Have Calculable Time")
  expect(detail).toHaveTextContent("This Session contains 29 Prompts.")
  expect(detail.querySelectorAll('.prompt-summary-detail-dot[data-recorded="true"]')).toHaveLength(18)
  expect(detail.querySelectorAll('.prompt-summary-detail-dot[data-recorded="false"]')).toHaveLength(11)
  expect(detail.querySelector(".prompt-summary-detail-bar")).toBeNull()
  expect(detail).toHaveTextContent("18 included")
  expect(detail).toHaveTextContent("11 excluded")
  expect(detail).toHaveTextContent("Parallel Prompts are added separately.")
})

it("switches above 60 actual Prompts to a true proportional bar and retains the numeric legend", () => {
  const view = render(<TimeSummaryDetail recorded={60} total={60} scope="project" />)
  expect(document.querySelectorAll(".prompt-summary-detail-dot")).toHaveLength(60)
  expect(screen.getByTestId("duration-coverage")).toHaveTextContent("Every Prompt has calculable time.")
  view.rerender(<TimeSummaryDetail recorded={107} total={169} scope="project" />)
  expect(document.querySelectorAll(".prompt-summary-detail-dot")).toHaveLength(0)
  expect(screen.getByRole("img")).toHaveAccessibleName(/169.*107.*62/)
  expect(document.querySelector(".prompt-summary-detail-bar-recorded")).toHaveStyle({ width: `${107 / 169 * 100}%` })
  expect(screen.getByTestId("duration-coverage")).toHaveTextContent("107 included")
  expect(screen.getByTestId("duration-coverage")).toHaveTextContent("62 excluded")
})

it("keeps zero recorded and empty scopes honest without invented filled dots", () => {
  const view = render(<TimeSummaryDetail recorded={0} total={29} scope="session" />)
  expect(document.querySelectorAll('.prompt-summary-detail-dot[data-recorded="true"]')).toHaveLength(0)
  expect(document.querySelectorAll('.prompt-summary-detail-dot[data-recorded="false"]')).toHaveLength(29)
  expect(screen.getByTestId("duration-coverage")).toHaveTextContent("29 excluded")
  view.rerender(<TimeSummaryDetail recorded={0} total={0} scope="session" />)
  expect(screen.getByTestId("duration-coverage")).toHaveAccessibleName("0/0 Prompt")
  expect(screen.queryByRole("img")).toBeNull()
  expect(screen.getByTestId("duration-coverage")).toHaveTextContent("There are no Prompts in this scope.")
})

it.each(APP_LANGUAGES)("provides localized short-copy and explicit units in $value", ({ value: language }) => {
  useAppPreferencesStore.setState({ language })
  const t = createTranslator(language)
  const view = render(<QuotaSummaryDetail value={1.83} valueLabel="1.83%" scope="session" recorded={1} total={1} resolved loading={false} error={false} />)
  expect(screen.getByRole("heading")).toHaveTextContent(t("summaryDetail.quotaSessionTitle"))
  expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
  expect(document.body).not.toHaveTextContent(t("summaryDetail.quotaPartialExplanation"))
  expect(document.body).not.toHaveTextContent(t("summaryDetail.quotaIncomplete"))
  expect(document.body).not.toHaveTextContent(t("summaryDetail.quotaBasis"))
  view.rerender(<TimeSummaryDetail recorded={18} total={29} scope="project" />)
  expect(screen.getByRole("heading")).toHaveTextContent(t("summaryDetail.timeTitle", { recorded: 18 }))
  expect(screen.getByTestId("duration-coverage")).toHaveAccessibleName("18/29 Prompt")
  expect(document.body).toHaveTextContent(t("summaryDetail.timeIntro", { scope: t("promptUsage.projectSummary"), total: 29 }))
  expect(document.body.textContent).not.toContain("{recorded}")
  expect(document.body.textContent).not.toContain("{total}")
})


it.each([0, 1.83, 151.52, 300])("uses an honest weekly scale for %s without a minimum or clamped fill", value => {
  render(<QuotaSummaryDetail value={value} valueLabel={`${value}%`} scope="session" recorded={1} total={1} resolved loading={false} error={false} />)
  const maximum = Math.max(100, Math.ceil(value / 100) * 100)
  expect(document.querySelector(".prompt-summary-quota-fill")).toHaveStyle({ width: `${value / maximum * 100}%` })
  const figure = screen.getByRole("img")
  expect(figure).toHaveAccessibleName(`Usage ${value}%; 100% is one weekly allowance. Scale: 0 to ${maximum}%.`)
  expect(figure.querySelector(".prompt-summary-quota-track")).toContainElement(screen.getByText(`${value}%`, { selector: "strong" }))
  expect(figure.querySelector(".prompt-summary-quota-axis")).toHaveTextContent("0%")
  expect(screen.queryByText("Recorded so far")).toBeNull()
  if (value > 100) expect(document.querySelector(".prompt-summary-quota-reference")).toHaveStyle({ left: `${100 / maximum * 100}%` })
  else expect(document.querySelector(".prompt-summary-quota-reference")).toBeNull()
})

it("shows Project record counts without claiming official completeness", () => {
  render(<QuotaSummaryDetail value={1.83} valueLabel="1.83%" scope="project" recorded={1} total={1} resolved loading={false} error={false} />)
  expect(screen.getByTestId("session-quota-coverage")).toHaveAccessibleName("Of 1 conversations (Session), official weekly quota values are provided for 1 and not provided for 0.")
  expect(document.querySelectorAll('.prompt-summary-quota-markers > [data-recorded="true"]')).toHaveLength(1)
  expect(screen.queryByText("Incomplete Data")).toBeNull()
  expect(screen.queryByRole("heading", { name: "Conversation Data" })).toBeNull()
  expect(screen.getByTestId("session-quota-coverage")).toHaveTextContent("With official quota: 1 · Quota not provided: 0")
  expect(screen.queryByText("Full usage may be higher.")).toBeNull()
})
