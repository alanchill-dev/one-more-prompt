import { describe, expect, it } from "vitest"
import { GUIDE_STEPS } from "@/components/guide/steps"
import { APP_LANGUAGES, createTranslator } from "@/lib/i18n"
import { getGuideCopy, type GuideCopy } from "./copy"
import { getGuideDemoContent } from "./content"

const stepCopy = (copy: GuideCopy, id: string) => copy.steps[GUIDE_STEPS.findIndex((step) => step.id === id)]

describe("production guide translations", () => {
  it("provides a localized Skip Guide action in every supported language", () => {
    expect(APP_LANGUAGES).toHaveLength(9)
    for (const { value } of APP_LANGUAGES) {
      expect(getGuideCopy(value).chrome.skip.trim()).not.toBe("")
    }
    expect(getGuideCopy("zh-TW").chrome.skip).toBe("略過導覽")
    expect(getGuideCopy("en").chrome.skip).toBe("Skip Guide")
  })

  it.each(APP_LANGUAGES)("provides every step and interaction in $value", ({ value }) => {
    const copy = getGuideCopy(value)
    const t = createTranslator(value)
    const content = getGuideDemoContent(value)
    expect(copy.stages).toHaveLength(3)
    expect(copy.steps).toHaveLength(GUIDE_STEPS.length)
    expect(copy.steps).toHaveLength(20)
    expect(copy.welcome.stageDetails).toHaveLength(3)
    for (const [index, step] of copy.steps.entries()) {
      expect(step.title.trim().length).toBeGreaterThan(0)
      expect(step.body.trim().length).toBeGreaterThan(0)
      expect(step.body.length).toBeLessThanOrEqual(140)
      const isTimelineIntro = GUIDE_STEPS[index].id === "timeline-intro"
      expect(step.points?.length ?? 0).toBeLessThanOrEqual(isTimelineIntro ? 4 : 3)
      expect(step).not.toHaveProperty("action")
      for (const point of step.points ?? []) {
        for (const text of point) expect(text.trim().length).toBeGreaterThan(0)
      }
    }
    for (const text of Object.values(copy.chrome)) expect(text.trim().length).toBeGreaterThan(0)
    expect(copy.chrome).not.toHaveProperty("readTask")
    expect(copy.welcome.range).toContain("20")
    expect(stepCopy(copy, "month").title).toContain("30")
    expect(stepCopy(copy, "model-palette").title).toContain(t("modelColors.title"))
    expect(stepCopy(copy, "model-palette").body).toContain(t("modelColors.apply"))
    expect(stepCopy(copy, "api-estimate").title).toContain(t("cost.apiEquivalent"))
    expect(stepCopy(copy, "drill").title).toContain(t("promptUsage.viewHierarchy"))
    expect(stepCopy(copy, "session").title).toContain(content.sessionTitles["story-homepage"])
    expect(stepCopy(copy, "prompt").title).toContain("18M")
    expect(stepCopy(copy, "prompt").body).toContain(content.featuredPromptLead)
    expect(stepCopy(copy, "event").title).toContain(content.sessionTitles["story-homepage"])
    expect(stepCopy(copy, "project-intro").points).toHaveLength(3)
    expect(stepCopy(copy, "timeline-intro").points?.map(([label]) => label[0])).toEqual(["1", "2", "3", "4"])
    expect(stepCopy(copy, "prompt-agents").points?.flat().join(" ")).toMatch(/55%.*25%.*20%.*100%/)
    for (const id of ["prompt-original", "prompt-timing", "prompt-usage", "prompt-agents"]) {
      expect(stepCopy(copy, id).title.trim().length).toBeGreaterThan(0)
      expect(GUIDE_STEPS.find((step) => step.id === id)?.type).toBe("read")
    }
    for (const hint of [copy.chrome.panKeyboard, copy.chrome.zoomKeyboard]) {
      expect(hint).toContain("←")
      expect(hint).toContain("→")
    }
  })

  it("uses three stages and keeps the peak lesson free of hover instructions", () => {
    expect([1, 2, 3].map((stage) => GUIDE_STEPS.filter((step) => step.stage === stage).length)).toEqual([7, 8, 5])
    expect(GUIDE_STEPS.find((step) => step.id === "peak")?.type).toBe("read")
    const copy = getGuideCopy("zh-TW")
    expect(stepCopy(copy, "peak").title + stepCopy(copy, "peak").body).not.toMatch(/滑鼠|移到|懸停|hover/i)
    expect(stepCopy(copy, "api-estimate").points).toContainEqual(["估算金額", "方便比較用量，並非實際帳單"])
  })

  it("starts with today's hours and teaches the model palette after choosing 30 days", () => {
    expect(GUIDE_STEPS.slice(0, 4).map((step) => step.id)).toEqual(["chart-intro", "quota-intro", "month", "model-palette"])
    expect(GUIDE_STEPS.some((step) => step.id === "reset-history")).toBe(false)
    for (const { value } of APP_LANGUAGES) {
      const copy = getGuideCopy(value)
      expect(copy.steps.slice(0, 4).flatMap((step) => [step.title, step.body]).join(" ")).not.toMatch(/7|重置次數|重置次数|Rate Limit Resets/)
      expect(stepCopy(copy, "chart-intro").points).toHaveLength(3)
      expect(stepCopy(copy, "model-palette").points).toHaveLength(2)
    }
    expect(stepCopy(getGuideCopy("zh-TW"), "chart-intro").points).toContainEqual(["時間", "今天每小時的活動"])
    expect(stepCopy(getGuideCopy("en"), "chart-intro").points).toContainEqual(["Hours", "Today’s activity hour by hour"])
    expect(stepCopy(getGuideCopy("zh-TW"), "model-palette").points).toContainEqual(["套用", "保留本次練習的配色"])
  })

  it("retains the approved introduction while explaining one detail at a time", () => {
    const copy = getGuideCopy("zh-TW")
    expect(copy.welcome.title).toBe("從用量，找到工作")
    expect(copy.welcome.body).toBe("使用示範資料，親手操作總覽、專案與時間軸。你的紀錄不會被更動。")
    const summary = stepCopy(copy, "summary")
    expect(summary.title).toBe("上排看專案，下排看這段對話")
    expect(summary.body).toContain("日期只篩選下方 Prompt 清單")
    expect(summary.points).toContainEqual(["Project", "整個專案內所有對話的合計"])
    expect(summary.points).toContainEqual(["Session", "目前選中這段對話的合計"])
    expect(stepCopy(copy, "prompt-original").body).toContain("完整原文")
    expect(stepCopy(copy, "prompt-timing").body).toContain("有紀錄的有效時間")
    expect(stepCopy(copy, "prompt-usage").points).toContainEqual(["輸入／快取", "輸入已包含快取讀取"])
    expect(stepCopy(copy, "prompt-usage").points).toContainEqual(["輸出／推理", "輸出已包含推理用量"])
    expect(stepCopy(copy, "prompt-agents").body).toContain("已包含在上方總數")
    expect(stepCopy(copy, "event").points).toContainEqual(["群組數字", "多筆 Prompt"])
    expect(stepCopy(copy, "event").points).toContainEqual(["直線高度", "Token 用量，非執行時間"])
    expect(copy.chrome.completedTask).toBe("已完成")
  })
})
