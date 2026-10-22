import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  loadAppLanguage: vi.fn(),
  loadThemeMode: vi.fn(),
  saveAppLanguage: vi.fn(),
  channels: [] as { onmessage: (progress: unknown) => void }[],
}))

const EN: Record<string, string> = {
  "onboarding.progress": "Step {current} of {total}",
  "onboarding.skip": "Skip Setup",
  "onboarding.back": "Back",
  "onboarding.retry": "Retry",
  "onboarding.continue": "Continue",
  "onboarding.chooseLanguage.title": "Choose Your Language",
  "onboarding.chooseLanguage.description": "Use this language for setup and your workspace.",
  "onboarding.chooseLanguage.saveError": "Your language could not be saved. Try again to continue.",
  "onboarding.finishError": "One More Prompt could not finish setup. Try again.",
  "onboarding.language": "Language",
  "onboarding.welcome.title": "Understand Your Codex Work",
  "onboarding.welcome.description": "See your limits and local work.",
  "onboarding.welcome.privacy": "Your prompt content stays local.",
  "onboarding.task.overviewTitle": "Understand Usage",
  "onboarding.task.overviewDescription": "Find a busy period and understand limits.",
  "onboarding.task.promptTitle": "Inspect A Prompt",
  "onboarding.task.promptDescription": "Read instructions, tokens and estimates.",
  "onboarding.task.timelineTitle": "Compare Concurrent Work",
  "onboarding.task.timelineDescription": "Compare prompts in one time range.",
  "onboarding.checkRecords": "Check Local Records",
  "onboarding.openWorkspace": "Open Workspace",
  "onboarding.startGuide": "Start Guide",
  "onboarding.scan.title": "Checking Local Codex Data",
  "onboarding.scan.description": "This checks local aggregates only.",
  "onboarding.scan.unavailableTitle": "Local Codex Data Is Unavailable",
  "onboarding.scan.unavailableDescription": "Retry or open the workspace.",
  "onboarding.scan.localActivity": "Local Sessions",
  "onboarding.scan.promptHistory": "Local Prompts",
  "onboarding.scan.privacy": "Codex Configuration",
  "onboarding.scan.scanning": "Checking Codex…",
  "onboarding.scan.waiting": "Waiting For The Current Scan…",
  "onboarding.scan.discovering": "Finding Record Files…",
  "onboarding.scan.reading": "Checking Record Files…",
  "onboarding.scan.summarizing": "Organizing Results…",
  "onboarding.scan.filesProgress": "Record Files Checked",
  "onboarding.scan.filesChecked": "Checked {processed} / {total} record files",
  "onboarding.scan.complete": "Local Scan Complete",
  "onboarding.scan.unavailable": "Local Data Is Unavailable",
  "onboarding.scan.credentialsFound": "Configuration detected; authentication not checked.",
  "onboarding.scan.credentialsMissing": "No Configuration Detected",
  "onboarding.ready.foundTitle": "Your Codex Activity Is Ready",
  "onboarding.ready.emptyTitle": "Ready For Your First Codex Session",
  "onboarding.ready.foundDescription": "Your local activity is ready.",
  "onboarding.ready.emptyDescription": "Start a Codex task, then retry this check.",
  "onboarding.ready.localOnly": "Prompt content remains on this device.",
  "onboarding.ready.guideHint": "An optional hands-on guide uses isolated demo data.",
}

const ZH = { ...EN, "onboarding.language": "語言", "onboarding.welcome.title": "看懂你的 Codex 工作" }

vi.mock("@tauri-apps/api/core", () => ({
  invoke: state.invoke,
  Channel: class {
    onmessage = (_progress: unknown) => {}
    constructor() { state.channels.push(this) }
  },
}))
vi.mock("@/lib/settings", () => ({
  loadAppLanguage: state.loadAppLanguage,
  loadThemeMode: state.loadThemeMode,
  saveAppLanguage: state.saveAppLanguage,
}))
vi.mock("@/hooks/app/use-settings-theme", () => ({ useSettingsTheme: vi.fn() }))
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: (language: "en" | "zh-TW") =>
    (key: string, values?: Record<string, string | number>) => {
      let value = (language === "zh-TW" ? ZH : EN)[key] ?? key
      for (const [name, replacement] of Object.entries(values ?? {})) {
        value = value.replace(`{${name}}`, String(replacement))
      }
      return value
    },
}))

import { OnboardingApp } from "@/components/onboarding/onboarding-app"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail })
  return { promise, resolve, reject }
}

const scanResult = { promptCount: 12, sessionCount: 3, credentialsDetected: true }

async function enterResult() {
  if (screen.queryByRole("button", { name: "Continue" })) await enterWelcome()
  await userEvent.click(screen.getByRole("button", { name: "Check Local Records" }))
  expect(screen.getByRole("list", { name: "Step 3 of 3" })).toBeInTheDocument()
}

async function enterWelcome() {
  const next = screen.getByRole("button", { name: "Continue" })
  await waitFor(() => expect(next).toBeEnabled())
  await userEvent.click(next)
  await screen.findByRole("button", { name: "Check Local Records" })
}

function finishCalls() {
  return state.invoke.mock.calls.filter(([command]) => command === "finish_onboarding")
}

describe("OnboardingApp", () => {
  beforeEach(() => {
    state.invoke.mockReset()
    state.channels = []
    state.invoke.mockImplementation((command: string) =>
      command === "scan_onboarding_codex" ? Promise.resolve(scanResult) : Promise.resolve(command === "can_skip_onboarding")
    )
    state.loadAppLanguage.mockReset().mockResolvedValue("en")
    state.loadThemeMode.mockReset().mockResolvedValue("system")
    state.saveAppLanguage.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it("starts with language selection and waits for saving before showing the Codex check", async () => {
    const saved = deferred<void>()
    state.saveAppLanguage.mockReturnValue(saved.promise)
    render(<OnboardingApp />)
    expect(screen.getByRole("heading", { name: "Choose Your Language" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Check Local Records" })).not.toBeInTheDocument()
    const next = screen.getByRole("button", { name: "Continue" })
    await waitFor(() => expect(next).toBeEnabled())
    await userEvent.click(next)
    expect(next).toBeDisabled()
    expect(screen.getByRole("combobox", { name: "Language" })).toBeDisabled()
    expect(state.invoke.mock.calls.some(([command]) => command === "scan_onboarding_codex")).toBe(false)
    await act(async () => { saved.resolve(); await saved.promise })
    expect(screen.getByRole("button", { name: "Check Local Records" })).toBeInTheDocument()
  })

  it("stays on language selection when saving fails and allows another attempt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    state.saveAppLanguage.mockRejectedValueOnce(new Error("disk unavailable"))
    render(<OnboardingApp />)
    const next = screen.getByRole("button", { name: "Continue" })
    await waitFor(() => expect(next).toBeEnabled())
    await userEvent.click(next)
    expect(await screen.findByRole("alert")).toHaveTextContent("Your language could not be saved")
    expect(screen.queryByRole("button", { name: "Check Local Records" })).not.toBeInTheDocument()
    await userEvent.click(next)
    expect(screen.getByRole("button", { name: "Check Local Records" })).toBeInTheDocument()
  })

  it("does not finish setup when the current language cannot be saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<OnboardingApp />)
    await enterResult()
    state.saveAppLanguage.mockRejectedValueOnce(new Error("disk unavailable"))
    await userEvent.click(screen.getByRole("button", { name: "Open Workspace" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Your language could not be saved")
    expect(finishCalls()).toHaveLength(0)
    expect(screen.getByRole("button", { name: "Open Workspace" })).toBeEnabled()
  })

  it("rechecks local aggregates without starting a guide", async () => {
    render(<OnboardingApp />)
    await enterResult()
    expect(await screen.findByRole("heading", { name: "Your Codex Activity Is Ready" })).toHaveFocus()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("3", { selector: "dd" })).toBeInTheDocument()
    expect(screen.getByText("Configuration detected; authentication not checked.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Open Workspace" }))
    expect(state.invoke).toHaveBeenCalledWith("finish_onboarding", { destination: "overview", showGuide: false, skipSetup: false })
  })

  it.each(["records", "empty", "error"])("offers the demo opening after first setup with %s", async outcome => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    state.invoke.mockImplementation((command: string) => {
      if (command !== "scan_onboarding_codex") return Promise.resolve(false)
      return outcome === "error" ? Promise.reject(new Error("unavailable"))
        : Promise.resolve(outcome === "empty" ? { promptCount: 0, sessionCount: 0, credentialsDetected: false } : scanResult)
    })
    render(<OnboardingApp />)
    await waitFor(() => expect(state.invoke).toHaveBeenCalledWith("can_skip_onboarding"))
    expect(screen.queryByRole("button", { name: "Skip Setup" })).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(finishCalls()).toHaveLength(0)
    await enterResult()
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Workspace" })).toBeEnabled())
    if (outcome === "error") expect(screen.queryByText("Local Sessions")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Open Workspace" }))
    expect(state.invoke).toHaveBeenCalledWith("finish_onboarding", { destination: "overview", showGuide: true, skipSetup: false })
  })

  it("waits for the scan before opening the workspace", async () => {
    const request = deferred<typeof scanResult>()
    state.invoke.mockImplementation((command: string) => command === "scan_onboarding_codex" ? request.promise : Promise.resolve(true))
    render(<OnboardingApp />)
    await enterResult()
    expect(screen.getByRole("status")).toHaveTextContent("Waiting For The Current Scan…")
    expect(state.invoke).toHaveBeenCalledWith("scan_onboarding_codex", { onProgress: state.channels[0] })
    act(() => { state.channels[0].onmessage({ phase: "reading", processedFiles: 1, totalFiles: 4 }) })
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25")
    expect(screen.getByRole("button", { name: "Open Workspace" })).toBeDisabled()
    act(() => { state.channels[0].onmessage({ phase: "summarizing", processedFiles: 4, totalFiles: 4 }) })
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
    expect(screen.getByRole("button", { name: "Open Workspace" })).toBeDisabled()
    request.resolve(scanResult)
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Workspace" })).toBeEnabled())
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("keeps scan failure distinct from zero records and retries", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    let attempts = 0
    state.invoke.mockImplementation((command: string) => {
      if (command !== "scan_onboarding_codex") return Promise.resolve(true)
      attempts += 1
      return attempts === 1 ? Promise.reject(new Error("unavailable")) : Promise.resolve(scanResult)
    })
    render(<OnboardingApp />)
    await enterResult()
    expect(await screen.findByRole("heading", { name: "Local Codex Data Is Unavailable" })).toBeInTheDocument()
    expect(screen.queryByText("Local Sessions")).not.toBeInTheDocument()
    expect(log).toHaveBeenCalledWith("Failed to scan local Codex data:", expect.any(Error))
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByRole("heading", { name: "Your Codex Activity Is Ready" })).toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it("can leave a repeated Codex check without scanning or enabling the guide", async () => {
    render(<OnboardingApp />)
    await enterWelcome()
    await userEvent.click(await screen.findByRole("button", { name: "Skip Setup" }))
    expect(state.invoke.mock.calls.some(([command]) => command === "scan_onboarding_codex")).toBe(false)
    expect(state.invoke).toHaveBeenCalledWith("finish_onboarding", { destination: "overview", showGuide: false, skipSetup: true })
  })

  it("ignores a scan response after returning to the welcome screen", async () => {
    const request = deferred<typeof scanResult>()
    state.invoke.mockImplementation((command: string) => command === "scan_onboarding_codex" ? request.promise : Promise.resolve(true))
    render(<OnboardingApp />)
    await enterResult()
    await userEvent.keyboard("{Escape}")
    act(() => { state.channels[0].onmessage({ phase: "reading", processedFiles: 1, totalFiles: 1 }) })
    await act(async () => { request.resolve(scanResult); await request.promise })
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Understand Your Codex Work" })).toHaveFocus()
    expect(screen.queryByRole("button", { name: "Open Workspace" })).not.toBeInTheDocument()
  })

  it("saves the language selection before checking Codex and keeps it through the results", async () => {
    render(<OnboardingApp />)
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Language" })).toBeEnabled())
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "zh-TW")
    expect(document.documentElement.lang).toBe("zh-TW")
    expect(state.saveAppLanguage).not.toHaveBeenCalled()
    await enterWelcome()
    expect(screen.getByRole("heading", { name: "看懂你的 Codex 工作" })).toBeInTheDocument()
    expect(state.saveAppLanguage).toHaveBeenCalledWith("zh-TW")
    await enterResult()
    expect(screen.getByRole("combobox", { name: "語言" })).toHaveValue("zh-TW")
  })

  it("prevents duplicate finish actions and recovers from an opening error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const request = deferred<null>()
    state.invoke.mockImplementation((command: string) => command === "scan_onboarding_codex" ? Promise.resolve(scanResult) : command === "can_skip_onboarding" ? Promise.resolve(true) : request.promise)
    render(<OnboardingApp />)
    await enterResult()
    const open = screen.getByRole("button", { name: "Open Workspace" })
    await waitFor(() => expect(open).toBeEnabled())
    fireEvent.click(open)
    fireEvent.click(open)
    await waitFor(() => expect(finishCalls()).toHaveLength(1))
    expect(open).toBeDisabled()
    request.reject(new Error("finish failed"))
    expect(await screen.findByRole("alert")).toHaveTextContent("One More Prompt could not finish setup. Try again.")
    state.invoke.mockResolvedValue(null)
    await userEvent.click(open)
    expect(finishCalls()).toHaveLength(2)
  })

  it("reports a setup-mode read failure and allows retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const mode = deferred<boolean>()
    state.invoke.mockImplementation((command: string) => command === "can_skip_onboarding" ? mode.promise : Promise.resolve(scanResult))
    render(<OnboardingApp />)
    await enterResult()
    const open = screen.getByRole("button", { name: "Open Workspace" })
    expect(open).toBeDisabled()
    fireEvent.click(open)
    expect(finishCalls()).toHaveLength(0)
    await act(async () => { mode.reject(new Error("mode unavailable")); await mode.promise.catch(() => undefined) })
    expect(screen.getByRole("alert")).toHaveTextContent("One More Prompt could not finish setup. Try again.")
    state.invoke.mockImplementation((command: string) => command === "can_skip_onboarding" ? Promise.resolve(false) : Promise.resolve(scanResult))
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(open).toBeEnabled())
    await userEvent.click(open)
    expect(finishCalls()).toHaveLength(1)
  })
})
