import { isTauri } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { AppWindow, File, Lightning, PuzzlePiece } from "@phosphor-icons/react"
import { Children, isValidElement, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import type { Link, Nodes, Root, Text } from "mdast"
import type { Root as HtmlRoot } from "hast"
import { useI18n } from "@/hooks/use-i18n"
import { promptQuestionReplies, promptReferenceName, promptSkillLabel } from "@/lib/prompt-usage-display"
import "./prompt-usage-text.css"

function httpUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

function labelText(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child)
    return isValidElement<{ children?: ReactNode }>(child) ? labelText(child.props.children) : ""
  }).join("")
}

function PromptLink({ href, children }: { href?: string; children: ReactNode }) {
  const t = useI18n()
  const [failed, setFailed] = useState(false)
  if (href?.startsWith("browser-skill:")) return null
  const url = httpUrl(href)
  if (url) {
    return <>
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={event => {
        if (!isTauri()) return
        event.preventDefault()
        setFailed(false)
        openUrl(url).catch(error => {
          console.error("Failed to open prompt link:", error)
          setFailed(true)
        })
      }}>{children}</a>
      {failed && <span className="prompt-usage-text-link-error" role="status">{t("promptUsage.linkOpenFailed")}</span>}
    </>
  }

  const label = labelText(children).trim()
  const skill = label.startsWith("$") || /(?:^|[\\/])\.(?:codex|agents)[\\/]skills[\\/]|[\\/]\.codex[\\/]plugins[\\/]cache[\\/].*[\\/]SKILL\.md(?:$|[?#])/i.test(href ?? "")
  const file = /^(?:\/|file:\/\/|[A-Za-z]:[\\/])/.test(href ?? "")
  const kind = href?.startsWith("plugin://") ? "plugin" : href?.startsWith("app://") ? "app" : skill ? "skill" : file ? "file" : null
  if (!kind) return <>{children}</>
  const displayLabel = kind === "plugin" ? promptReferenceName(label)
    : kind === "app" ? `$${promptReferenceName(label)}`
    : kind === "skill" && label.includes("?") ? promptSkillLabel(label) : children
  const Icon = kind === "skill" ? Lightning : kind === "plugin" ? PuzzlePiece : kind === "app" ? AppWindow : File
  return <span className="prompt-usage-text-reference" data-reference-kind={kind}>
    <Icon size={13} aria-hidden="true" />{displayLabel}
  </span>
}

// Codex treats an authored <br> as a line break while keeping other HTML literal.
// Transform only HTML nodes so XML and <br> inside code remain untouched.
function remarkPromptBreaks() {
  return (tree: Root) => {
    function visit(node: Nodes) {
      if (!("children" in node)) return
      if (node.type === "link") return
      const children: Nodes[] = node.children
      node.children = children.flatMap<Nodes>(child => {
        if (child.type === "html" && /^<br\s*\/?\s*>$/i.test(child.value.trim())) return [{ type: "break", position: child.position }]
        if (child.type !== "text") return [child]
        const parts: (Text | Link)[] = [], pattern = /\[([$@][^\]\s]+)\]/g
        let index = 0
        for (const match of child.value.matchAll(pattern)) {
          parts.push({ type: "text", value: child.value.slice(index, match.index) })
          parts.push({ type: "link", url: match[1].startsWith("@") ? `plugin://${match[1].slice(1)}` : "skill:", children: [{ type: "text", value: match[1] }] })
          index = match.index + match[0].length
        }
        return index ? [...parts, { type: "text", value: child.value.slice(index) }] : [child]
      }) as typeof node.children
      node.children.forEach(visit)
    }
    visit(tree)
  }
}

// mdast adds a formatting newline after <br>; pre-wrap would display it twice.
function rehypePromptBreaks() {
  return (tree: HtmlRoot) => {
    function visit(node: HtmlRoot | HtmlRoot["children"][number]) {
      if (!("children" in node)) return
      node.children.forEach((child, index) => {
        const previous = node.children[index - 1]
        if (child.type === "text" && previous?.type === "element" && previous.tagName === "br") child.value = child.value.replace(/^\n/, "")
        visit(child)
      })
    }
    visit(tree)
  }
}

const questionParser = unified().use(remarkParse).use(remarkGfm, { singleTilde: false })
function questionPlainText(value: string): string {
  function plain(node: Nodes): string {
    if ("value" in node) return node.value
    if (node.type === "image" || node.type === "imageReference") return node.alt ?? ""
    if (node.type === "break") return "\n"
    const separator = ["root", "list", "listItem", "blockquote", "table"].includes(node.type) ? "\n" : node.type === "tableRow" ? "\t" : ""
    return "children" in node ? node.children.map(plain).join(separator) : ""
  }
  return plain(questionParser.parse(value)).replace(/\s+/g, " ").trim()
}

function PromptMarkdown({ text }: { text: string }) {
  const source = text.replace(/\]\(codex-text-link:\/\//g, "](")
  const lines = source.split(/\r?\n/)
  return <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkBreaks, remarkPromptBreaks]} rehypePlugins={[rehypePromptBreaks]} urlTransform={value => value} components={{
      a: ({ href, children }) => <PromptLink href={href}>{children}</PromptLink>,
      img: ({ src, alt }) => <>!<PromptLink href={typeof src === "string" ? src : undefined}>{alt || src}</PromptLink></>,
      li: ({ node, children, ...props }) => {
        const line = lines[(node?.position?.start.line ?? 1) - 1]
        const marker = /^\s*(\d+)[.)]\s/.exec(line)
        return <li {...props} value={marker ? Number(marker[1]) : undefined}>{children}</li>
      },
    }}>{source}</ReactMarkdown>
}

export function PromptUsageText({ text, className = "" }: { text: string; className?: string }) {
  const replies = promptQuestionReplies(text)
  return <div className={`prompt-usage-text ${className}`} data-testid="prompt-usage-text">
    {replies ? replies.map(({ question, answer }, index) => {
      const plainQuestion = questionPlainText(question)
      return <div className="prompt-usage-text-reply" key={index} data-testid="prompt-usage-question-reply">
        <div className="prompt-usage-text-question" title={plainQuestion}>{plainQuestion}</div>
        <div className="prompt-usage-text-answer"><PromptMarkdown text={answer} /></div>
      </div>
    }) : <PromptMarkdown text={text} />}
  </div>
}
