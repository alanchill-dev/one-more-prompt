import { describe, expect, it } from "vitest"
import { formatPromptDate, formatPromptModel, promptCopyText, promptModelEfforts, promptPreviewText, promptQuestionReplies } from "./prompt-usage-display"
import type { PromptUsageTurn } from "./prompt-usage"

const questionReply = (data: unknown) => `<send_user_message_question_reply>${JSON.stringify(data)}</send_user_message_question_reply>`
const replyItem = { questionItemId: "synthetic-question-1", question: "第一個問題？", answer: "第一個回答。" }

describe("Prompt Usage Display", () => {
  it("extracts three valid question replies without leaking IDs", () => {
    const items = [replyItem, { ...replyItem, questionItemId: "synthetic-question-2", question: "第二個問題？", answer: "第二個回答。" },
      { ...replyItem, questionItemId: "synthetic-question-3", question: "第三個問題？", answer: "第三個回答。" }]
    expect(promptQuestionReplies(` \n${questionReply(items)}\n `)).toEqual(items.map(({ question, answer }) => ({ question, answer })))
    expect(promptCopyText(questionReply(items))).toBe("第一個問題？\n第一個回答。\n\n第二個問題？\n第二個回答。\n\n第三個問題？\n第三個回答。")
  })

  it("accepts a singleton object and empty strings as in the native format", () => {
    expect(promptQuestionReplies(questionReply(replyItem))).toEqual([{ question: replyItem.question, answer: replyItem.answer }])
    const empty = questionReply({ questionItemId: "", question: "", answer: "" })
    expect(promptQuestionReplies(empty)).toEqual([{ question: "", answer: "" }])
    expect(promptCopyText(empty)).toBe("\n")
  })

  it.each([
    [], null, "text", 3,
    { question: "Question", answer: "Answer" },
    { ...replyItem, questionItemId: 3 }, { ...replyItem, question: null }, { ...replyItem, answer: [] },
    [replyItem, { ...replyItem, answer: 3 }],
  ])("keeps the entire prompt unchanged for invalid or mixed payloads: %j", data => {
    const prompt = ` \n${questionReply(data)}\n `
    expect(promptQuestionReplies(prompt)).toBeNull()
    expect(promptCopyText(prompt)).toBe(prompt)
    expect(promptPreviewText(prompt)).toBe(prompt)
  })

  it("leaves malformed wrappers and literal prose or code examples untouched", () => {
    const wrapped = questionReply(replyItem)
    for (const prompt of ["<send_user_message_question_reply>{bad JSON}</send_user_message_question_reply>",
      wrapped.replace("question_reply>", 'question_reply source="example">'),
      wrapped.slice(0, -1), `範例：${wrapped}`, `\`\`\`xml\n${wrapped}\n\`\`\``, `${wrapped}\n說明`]) {
      expect(promptQuestionReplies(prompt)).toBeNull()
      expect(promptCopyText(prompt)).toBe(prompt)
    }
  })

  it("copies complete Markdown questions and multiline answers while previews show link labels", () => {
    const question = "**完整問題**\n查看 [文件](https://example.com/docs)"
    const answer = "1. 第一行\n3. `程式碼`\n\n" + "完整回答。".repeat(80)
    const prompt = questionReply({ ...replyItem, question, answer })
    expect(promptCopyText(prompt)).toBe(`${question}\n${answer}`)
    expect(promptPreviewText(prompt)).toBe(`**完整問題**\n查看 文件\n${answer}`)
    expect(promptCopyText("普通 **提示詞**\n第二行")).toBe("普通 **提示詞**\n第二行")
  })

  it("shows reference and web-link labels in snippets without changing the full prompt", () => {
    const prompt = "使用 [$format](/Users/example/.codex/skills/format/SKILL.md) 看 [文件](https://example.com/docs_(v2))\n保留 https://example.com/plain"
    expect(promptPreviewText(prompt)).toBe("使用 $format 看 文件\n保留 https://example.com/plain")
    expect(prompt).toContain("/Users/example/.codex/skills/format/SKILL.md")
    expect(promptPreviewText("[工具](</Users/example/My Skill/SKILL.md>)")).toBe("工具")
    expect(promptPreviewText("[文件](codex-text-link://https://example.com)")).toBe("文件")
    expect(promptPreviewText("[$format?label=Format%20Text&icon=custom](/tmp/SKILL.md)")).toBe("Format Text")
    expect(promptPreviewText("查看 [Browser](browser-skill:browser) 文件")).toBe("查看  文件")
    expect(promptPreviewText("[@Drive](plugin://drive) [Notion](app://notion)")).toBe("Drive $Notion")
    expect(promptPreviewText("<request>保留 XML</request>\n一般文字")).toBe("<request>保留 XML</request>\n一般文字")
  })

  it("formats local dates consistently without UTC date shifts", () => {
    expect(formatPromptDate("2026-08-09")).toBe("2026/8/9")
    expect(formatPromptDate(new Date(2026, 7, 9, 23, 30).toISOString())).toBe("2026/8/9")
  })

  it("shows observed mixed efforts and explicitly identifies missing effort", () => {
    expect(formatPromptModel("gpt-6-astra", ["high", "xhigh", "high"], "Not Recorded")).toBe("gpt-6-astra · High / XHigh")
    expect(formatPromptModel("gpt-6-astra", undefined, "Not Recorded")).toBe("gpt-6-astra · Not Recorded")
    const turn = { model: "gpt-6-astra", reasoningEfforts: ["high"], agents: [] } as unknown as PromptUsageTurn
    expect(promptModelEfforts(turn, "gpt-6-astra")).toEqual(["high"])
    expect(promptModelEfforts(turn, "gpt-5.6-sol")).toEqual([])
  })
})
