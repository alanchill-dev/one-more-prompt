import { beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fixtureTemplate, powershell, writePack } from "../../scripts/windows/prepare-qa-fixture.mjs"
import { makeCtx } from "../test-helpers.js"

const now = new Date("2026-10-13T12:00:00.000Z")
function materialize() {
  return JSON.parse(JSON.stringify(fixtureTemplate()).replace(/__(UTC|DATE|HOUR|HOUR_LABEL)_(-?\d+)__/g, (_, kind, seconds) => {
    const date = new Date(now.getTime() + Number(seconds) * 1000)
    if (kind === "UTC") return date.toISOString()
    if (kind === "DATE") return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
    if (kind === "HOUR_LABEL") return String(date.getHours()).padStart(2, "0") + ":00"
    date.setUTCMinutes(0, 0, 0)
    return date.toISOString()
  }))
}

beforeEach(() => { delete globalThis.__one_more_prompt_plugin; vi.resetModules() })

describe("Windows synthetic QA pack", () => {
  it("feeds the real local parser three measured sessions and running/complete changes without auth", async () => {
    const fixture = materialize()
    const startCwd = powershell.match(/cwd = '([^']+)'/)[1]
    expect(startCwd.split("\\")).toEqual(["C:", "Synthetic QA", "Sample Project"])
    expect(fixture.globalState["local-projects"].qa.rootPaths).toEqual([startCwd])
    for (const session of fixture.sessions) {
      expect(session.records.filter((record) => record.payload.cwd).every((record) => record.payload.cwd === startCwd)).toBe(true)
    }
    const ctx = makeCtx()
    ctx.app.platform = "windows"
    ctx.nowIso = now.toISOString()
    const home = "C:/Synthetic QA/codex-home"
    ctx.host.env.get.mockImplementation((key) => key === "CODEX_HOME" ? home : null)
    ctx.host.fs.writeText(home + "/.codex-global-state.json", JSON.stringify(fixture.globalState))
    for (const session of fixture.sessions) {
      ctx.host.fs.writeText(home + "/sessions/" + session.file, session.records.map((record) => JSON.stringify(record)).join("\n") + "\n")
    }
    await import("./plugin.js")
    const probe = () => globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines
    const prompts = () => probe().filter((line) => line.label === "Prompt").map((line) => JSON.parse(line.subtitle))
    expect(probe().filter((line) => line.label === "Project Group")).toHaveLength(1)
    expect(probe().filter((line) => line.label === "Session")).toHaveLength(3)
    const measured = prompts()
    expect(measured).toHaveLength(3)
    expect(measured.reduce((sum, prompt) => sum + prompt.usage.totalTokens, 0)).toBe(4800)
    expect(measured.filter((prompt) => prompt.isActive)).toHaveLength(1)
    expect(measured.every((prompt) => prompt.tokenUsageRecorded && prompt.model === "gpt-6-sol")).toBe(true)
    const path = home + "/sessions/qa-0.jsonl"
    const append = (type, payload) => ctx.host.fs.writeText(path, ctx.host.fs.readText(path) + JSON.stringify({ timestamp: ctx.nowIso, type, payload }) + "\n")
    append("event_msg", { type: "task_complete", turn_id: "synthetic-qa-0-turn" })
    expect(prompts().every((prompt) => !prompt.isActive)).toBe(true)
    append("event_msg", { type: "task_started", turn_id: "synthetic-qa-fresh" })
    append("turn_context", { turn_id: "synthetic-qa-fresh", model: "gpt-6-sol", cwd: startCwd })
    append("event_msg", { type: "user_message", message: "Synthetic Windows QA: fresh running indicator check." })
    const active = prompts().filter((prompt) => prompt.isActive)
    expect(active).toHaveLength(1)
    expect(probe().filter((line) => line.label === "Project Group")).toHaveLength(1)
    expect(active[0]).toMatchObject({ id: "synthetic-qa-fresh", tokenUsageRecorded: false })
    expect(ctx.host.http.request).not.toHaveBeenCalled()
    const snapshot = fixture.cache.snapshots.codex
    expect(snapshot.lines.filter((line) => line.type === "progress").map((line) => line.limit - line.used)).toEqual([75, 60])
    for (const chart of snapshot.lines.filter((line) => line.type === "barChart")) {
      expect(chart.points.reduce((sum, point) => sum + point.value, 0)).toBe(chart.granularity === "hourly" ? 1600 : 4800)
      expect(chart.points.every((point) => point.modelUsage[0].tokens === point.value)).toBe(true)
    }
    expect(JSON.stringify(fixture)).not.toMatch(/__(UTC|DATE|HOUR)/)
  })

  it("creates a standalone pack without overwriting a previous backup or changing system policy", async () => {
    const output = await mkdtemp(join(tmpdir(), "omp-windows-qa-"))
    expect(await writePack(output)).toEqual(["fixture-template.json", "fixture.ps1", "qa.cmd", "README.txt"])
    const cmd = await readFile(join(output, "qa.cmd"), "utf8")
    expect(cmd).toContain("-NoProfile")
    expect(cmd).toContain("-Command")
    expect(cmd).not.toContain("-File")
    expect(powershell).toContain("Assert-Stopped")
    expect(powershell).toContain("GetProcessesByName('one-more-prompt')")
    expect(powershell).toContain("if ($entry.existed)")
    expect(powershell).toContain("Move-Item -LiteralPath $destination")
    const onboarding = await readFile("src-tauri/src/onboarding.rs", "utf8")
    const marker = onboarding.match(/const COMPLETION_MARKER_FILE: &str = "([^"]+)";/)?.[1]
    expect(marker).toBeTruthy()
    const backupPaths = powershell.match(/\$paths = @\(([^)]+)\)/)?.[1]
    expect(backupPaths).toContain(`'${marker}'`)
    expect(powershell).not.toMatch(/Set-ExecutionPolicy|ExecutionPolicy|SetEnvironmentVariable|Stop-Process|Remove-Item|Registry|auth\.json/)
    await expect(writePack(output)).rejects.toMatchObject({ code: "EEXIST" })
    expect(JSON.parse(await readFile(join(output, "fixture-template.json"), "utf8"))).toEqual(fixtureTemplate())
  })
})
