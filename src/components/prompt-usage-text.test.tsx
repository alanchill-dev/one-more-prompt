import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PromptUsageText } from "./prompt-usage-text"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const state = vi.hoisted(() => ({ isTauri: vi.fn(), openUrl: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ isTauri: state.isTauri }))
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: state.openUrl }))

beforeEach(() => {
  state.isTauri.mockReturnValue(false)
  state.openUrl.mockResolvedValue(undefined)
  useAppPreferencesStore.setState({ language: "en" })
})

const questionReply = (data: unknown) => `<send_user_message_question_reply>${JSON.stringify(data)}</send_user_message_question_reply>`
const replyItem = { questionItemId: "synthetic-question-1", question: "第一個問題？", answer: "第一個回答。" }

describe("Prompt Usage Text", () => {
  it("renders three question/answer groups without JSON, wrapper tags or IDs", () => {
    const items = [replyItem, { ...replyItem, questionItemId: "synthetic-question-2", question: "第二個問題？", answer: "第二個回答。" },
      { ...replyItem, questionItemId: "synthetic-question-3", question: "第三個問題？", answer: "第三個回答。" }]
    const { container } = render(<PromptUsageText text={questionReply(items)} />)
    const groups = screen.getAllByTestId("prompt-usage-question-reply")
    expect(groups).toHaveLength(3)
    expect([...container.querySelectorAll(".prompt-usage-text-question")].map(question => question.textContent)).toEqual(items.map(item => item.question))
    for (const [index, group] of groups.entries()) expect(group).toHaveTextContent(items[index].answer)
    expect(screen.getByTestId("prompt-usage-text")).not.toHaveTextContent("synthetic-question")
    expect(screen.getByTestId("prompt-usage-text")).not.toHaveTextContent("questionItemId")
    expect(screen.getByTestId("prompt-usage-text")).not.toHaveTextContent("send_user_message_question_reply")
  })

  it("uses full plain Markdown question titles and formatted multiline answers for a singleton", () => {
    const question = "**完整問題**：查看 [文件](https://example.com/docs)\n以及 `命令`？"
    const answer = "第一行\n第二行\n\n1. **保留粗體**\n3. `保留程式碼`\n\n<request>保留 XML</request>"
    const { container } = render(<PromptUsageText text={questionReply({ ...replyItem, question, answer })} />)
    const heading = container.querySelector(".prompt-usage-text-question")!
    expect(heading.textContent).toBe("完整問題：查看 文件 以及 命令？")
    expect(heading).toHaveAttribute("title", "完整問題：查看 文件 以及 命令？")
    expect(heading.querySelector("a, strong, code")).toBeNull()
    expect(container.querySelector("strong")).toHaveTextContent("保留粗體")
    expect(container.querySelector("code")).toHaveTextContent("保留程式碼")
    expect(container.querySelectorAll("br")).toHaveLength(1)
    expect([...container.querySelectorAll("ol li")].map(item => item.getAttribute("value"))).toEqual(["1", "3"])
    expect(screen.getByTestId("prompt-usage-text")).toHaveTextContent("<request>保留 XML</request>")
  })

  it("keeps every question line available in the plain title", () => {
    const question = "1. **第一段問題**\n2. 第二段問題 " + "完整長問題內容。".repeat(30)
    const { container } = render(<PromptUsageText text={questionReply({ ...replyItem, question })} />)
    const heading = container.querySelector(".prompt-usage-text-question")!
    const expected = "第一段問題 第二段問題 " + "完整長問題內容。".repeat(30)
    expect(heading.textContent).toBe(expected)
    expect(heading).toHaveAttribute("title", expected)
  })

  it.each([
    questionReply([{ ...replyItem }, { ...replyItem, answer: 3 }]),
    "<send_user_message_question_reply>{bad JSON}</send_user_message_question_reply>",
    questionReply([]), questionReply({ question: "Question", answer: "Answer" }),
  ])("keeps invalid question-reply data visible as authored text", prompt => {
    render(<PromptUsageText text={prompt} />)
    expect(screen.queryByTestId("prompt-usage-question-reply")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-text").textContent).toBe(prompt)
  })

  it("does not interpret wrapper examples inside prose, code, or an answer recursively", () => {
    const wrapped = questionReply(replyItem)
    const prompt = `範例：\n\n\`\`\`xml\n${wrapped}\n\`\`\``
    const { rerender, container } = render(<PromptUsageText text={prompt} />)
    expect(screen.queryByTestId("prompt-usage-question-reply")).not.toBeInTheDocument()
    expect(container.querySelector("code")?.textContent).toContain(wrapped)
    rerender(<PromptUsageText text={questionReply({ ...replyItem, answer: wrapped })} />)
    expect(screen.getAllByTestId("prompt-usage-question-reply")).toHaveLength(1)
    expect(screen.getByTestId("prompt-usage-text")).toHaveTextContent(wrapped)
  })

  it("renders the authored numbered request without replacing its item numbers", () => {
    const { container } = render(<PromptUsageText text={"1. 每筆 **Prompt** 的呈現效果不滿意\n3. 選一筆 prompt 看清指令\n3. 結尾資料不同？"} />)
    const items = container.querySelectorAll("ol > li")
    expect(items).toHaveLength(3)
    expect([...items].map(item => item.getAttribute("value"))).toEqual(["1", "3", "3"])
    expect(container.querySelector("strong")).toHaveTextContent("Prompt")
    expect(items[0]).toHaveTextContent("每筆 Prompt 的呈現效果不滿意")
  })

  it("preserves ordinary line breaks and only converts authored HTML br outside code", () => {
    const { container } = render(<PromptUsageText text={"第一行\n第二行<br>第三行\n\n`<br>` 和 `<request>保留</request>`"} />)
    const paragraphs = container.querySelectorAll("p")
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].querySelectorAll("br")).toHaveLength(2)
    expect(paragraphs[0].textContent).toBe("第一行第二行第三行")
    expect([...container.querySelectorAll("code")].map(code => code.textContent)).toEqual(["<br>", "<request>保留</request>"])
  })

  it("renders Markdown and bare web URLs with their visible labels", () => {
    render(<PromptUsageText text={"查看 [文件](https://example.com/docs?q=test) 與 https://example.com/plain"} />)
    expect(screen.getByRole("link", { name: "文件" })).toHaveAttribute("href", "https://example.com/docs?q=test")
    expect(screen.getByRole("link", { name: "https://example.com/plain" })).toHaveAttribute("href", "https://example.com/plain")
    expect(screen.getByTestId("prompt-usage-text")).not.toHaveTextContent("](https:")
  })

  it.each([
    "/Users/example/.codex/skills/format/SKILL.md",
    "/Users/example/.agents/skills/format/SKILL.md",
    "/Users/example/.codex/plugins/cache/format/format/0.3.0/skills/format/SKILL.md",
    "skill:format",
  ])("shows an unresolved skill as a named chip without exposing its path: %s", path => {
    const { container } = render(<PromptUsageText text={`使用 [$format](${path}) 處理`} />)
    expect(container.querySelector('[data-reference-kind="skill"]')).toHaveTextContent("$format")
    expect(screen.getByTestId("prompt-usage-text")).not.toHaveTextContent(path)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("classifies skill paths even when the label omits dollar and named plugin/app references", () => {
    const { container } = render(<PromptUsageText text={"[format](/Users/example/.codex/skills/format/SKILL.md) [Drive](plugin://drive) [Notion](app://notion)"} />)
    expect(container.querySelector('[data-reference-kind="skill"]')).toHaveTextContent("format")
    expect(container.querySelector('[data-reference-kind="plugin"]')).toHaveTextContent("Drive")
    expect(container.querySelector('[data-reference-kind="app"]')).toHaveTextContent("$Notion")
  })

  it("prioritizes explicit plugin and app destinations over dollar labels", () => {
    const { container } = render(<PromptUsageText text={"[$Drive](plugin://drive) [$Notion](app://notion)"} />)
    expect(container.querySelector('[data-reference-kind="plugin"]')).toHaveTextContent("Drive")
    expect(container.querySelector('[data-reference-kind="plugin"]')).not.toHaveTextContent("$Drive")
    expect(container.querySelector('[data-reference-kind="app"]')).toHaveTextContent("$Notion")
    expect(container.querySelector('[data-reference-kind="skill"]')).toBeNull()
  })

  it("renders local file references as readable chips", () => {
    const { container } = render(<PromptUsageText text={"[file name.md](/tmp/file%20name.md)"} />)
    expect(container.querySelector('[data-reference-kind="file"]')).toHaveTextContent("file name.md")
    expect(screen.getByTestId("prompt-usage-text")).not.toHaveTextContent("/tmp/")
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("shows explicit skill display labels without query metadata", () => {
    const { container } = render(<PromptUsageText text={"[$format?label=Format%20Text&icon=lightning](/Users/example/.codex/skills/format/SKILL.md) [$unknown?icon=custom](skill:unknown)"} />)
    const chips = container.querySelectorAll('[data-reference-kind="skill"]')
    expect(chips[0]).toHaveTextContent("Format Text")
    expect(chips[1]).toHaveTextContent("$unknown")
    expect(screen.getByTestId("prompt-usage-text")).not.toHaveTextContent("?icon=")
  })

  it("renders bare mentions without Markdown brackets and preserves code examples", () => {
    const { container } = render(<PromptUsageText text={"使用 [$format] 與 [@Drive]，保留 `[$example]`。"} />)
    expect(container.querySelector('[data-reference-kind="skill"]')).toHaveTextContent("$format")
    expect(container.querySelector('[data-reference-kind="plugin"]')).toHaveTextContent("Drive")
    expect(container.querySelector('[data-reference-kind="plugin"]')).not.toHaveTextContent("@Drive")
    expect(container.querySelector("code")).toHaveTextContent("[$example]")
    expect(screen.getByTestId("prompt-usage-text")).not.toHaveTextContent("[$format]")
  })

  it("keeps a dollar web-link label clickable and normalizes native text-link transport", () => {
    render(<PromptUsageText text={"[$cost](https://example.com) [文件](codex-text-link://https://example.com/docs)"} />)
    expect(screen.getByRole("link", { name: "$cost" })).toHaveAttribute("href", "https://example.com/")
    expect(screen.getByRole("link", { name: "文件" })).toHaveAttribute("href", "https://example.com/docs")
  })

  it("omits the native browser-skill transport reference", () => {
    render(<PromptUsageText text={"查看 [Browser](browser-skill:browser) 文件"} />)
    expect(screen.getByTestId("prompt-usage-text")).toHaveTextContent("查看 文件")
    expect(screen.getByTestId("prompt-usage-text")).not.toHaveTextContent("Browser")
  })

  it("keeps intentional XML and code visible without executing raw HTML", () => {
    const { container } = render(<PromptUsageText text={'<request>保留 XML</request>\n\n```xml\n<request source="user">保留</request>\n```\n\n<script>alert(1)</script>'} />)
    expect(screen.getByTestId("prompt-usage-text").textContent).toContain("<request>保留 XML</request>")
    expect(container.querySelector("pre code")).toHaveTextContent('<request source="user">保留</request>')
    expect(container.querySelector("script")).toBeNull()
    expect(screen.getByTestId("prompt-usage-text").textContent).toContain("<script>alert(1)</script>")
  })

  it("shows user-message image notation as a link without loading remote images", () => {
    const { container } = render(<PromptUsageText text={"![畫面](https://example.com/private-image.png)"} />)
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByTestId("prompt-usage-text")).toHaveTextContent("!畫面")
    expect(screen.getByRole("link", { name: "畫面" })).toHaveAttribute("href", "https://example.com/private-image.png")
  })

  it("never makes unsafe or unsupported destinations navigable", () => {
    render(<PromptUsageText text={"[危險](javascript:alert%281%29) [資料](data:text/html,hello) [本機](file:///tmp/test)"} />)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-text")).toHaveTextContent("危險 資料 本機")
    expect(state.openUrl).not.toHaveBeenCalled()
  })

  it("supports GFM while leaving a single authored tilde literal", () => {
    const { container } = render(<PromptUsageText text={"~保持原文~ 與 ~~刪除線~~"} />)
    expect(screen.getByTestId("prompt-usage-text")).toHaveTextContent("~保持原文~ 與 刪除線")
    expect(container.querySelector("del")).toHaveTextContent("刪除線")
  })

  it("opens native links through Tauri and shows a visible error on failure", async () => {
    state.isTauri.mockReturnValue(true)
    state.openUrl.mockRejectedValue(new Error("Opener unavailable"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    render(<PromptUsageText text={"[文件](https://example.com/docs)"} />)
    const link = screen.getByRole("link", { name: "文件" })
    expect(fireEvent.click(link)).toBe(false)
    await waitFor(() => expect(state.openUrl).toHaveBeenCalledWith("https://example.com/docs"))
    expect(await screen.findByRole("status")).toHaveTextContent("Could Not Open Link")
    expect(error).toHaveBeenCalledWith("Failed to open prompt link:", expect.any(Error))
  })
})
