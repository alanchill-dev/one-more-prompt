import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import type { AppUpdateCheck } from "@/bindings"
import { APP_LANGUAGES, createTranslator } from "@/lib/i18n"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUpdateStore } from "@/stores/app-update-store"
import { AppUpdateButton, AppUpdateSettings } from "./app-update"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }))
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }))

const available: AppUpdateCheck = {
  status: "available", currentVersion: "1.0.0", latestVersion: "1.0.1",
  downloadUrl: "https://github.com/alanchill-dev/one-more-prompt/releases/download/v1.0.1/One-More-Prompt-1.0.1.dmg",
  releaseUrl: "https://github.com/alanchill-dev/one-more-prompt/releases/tag/v1.0.1", publishedAt: "2026-10-22T00:00:00Z",
}

beforeEach(() => {
  useAppPreferencesStore.getState().resetState()
  useAppUpdateStore.setState({ result: null, checking: false, error: null, lastCheckedAt: null })
  vi.mocked(invoke).mockResolvedValue(available)
  vi.mocked(openUrl).mockResolvedValue(undefined)
})

describe("E update control", () => {
  it.each([
    ["idle", {}],
    ["checking", { checking: true }],
    ["up to date", { result: { ...available, status: "upToDate", downloadUrl: null } }],
    ["not published", { result: { ...available, status: "notPublished", latestVersion: null, downloadUrl: null } }],
    ["failed before finding an update", { error: "network unavailable" }],
  ] as const)("hides the header control when %s", (_, state) => {
    useAppUpdateStore.setState(state)
    render(<AppUpdateButton appVersion="1.0.0" />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByTestId("app-update-dot")).not.toBeInTheDocument()
  })

  it("shows an icon-only header control only after confirming a newer release", () => {
    useAppUpdateStore.setState({ result: available })
    render(<AppUpdateButton appVersion="1.0.0" />)
    expect(screen.getByRole("button", { name: "New Version Available: 1.0.1" })).toHaveTextContent("")
    expect(screen.getByTestId("app-update-dot")).toBeInTheDocument()
  })

  it("keeps a confirmed update reachable if a later refresh fails", () => {
    useAppUpdateStore.setState({ result: available, error: "network unavailable" })
    render(<AppUpdateButton appVersion="1.0.0" />)
    expect(screen.getByRole("button", { name: "New Version Available: 1.0.1" })).toBeInTheDocument()
  })

  it("opens below the icon, downloads externally, and returns focus after Escape", async () => {
    useAppUpdateStore.setState({ result: available })
    const user = userEvent.setup()
    render(<AppUpdateButton appVersion="1.0.0" />)
    const trigger = screen.getByRole("button", { name: "New Version Available: 1.0.1" })
    await user.click(trigger)
    expect(await screen.findByRole("dialog", { name: "App Updates" })).toBeVisible()
    expect(screen.getByText("Current Version")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Download New Version" }))
    expect(openUrl).toHaveBeenCalledWith(available.downloadUrl)
    await user.click(screen.getByRole("button", { name: "View Release Notes" }))
    expect(openUrl).toHaveBeenCalledWith(available.releaseUrl)
    expect(screen.getByText(/quit One More Prompt, then replace the app/)).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it("supports manual Settings checks and exposes an unpublished repository honestly", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...available, status: "notPublished", latestVersion: null, downloadUrl: null })
    render(<><AppUpdateButton appVersion="1.0.0" /><AppUpdateSettings appVersion="1.0.0" /></>)
    expect(screen.queryByRole("button", { name: "App Updates" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Check For Updates" }))
    expect(invoke).toHaveBeenCalledWith("check_app_update")
    expect(await screen.findByText("No public release is available yet.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check For Updates" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Download New Version" })).not.toBeInTheDocument()
  })

  it("shows an actual pending request then a recoverable failure", async () => {
    let reject!: (error: string) => void
    vi.mocked(invoke).mockImplementation(() => new Promise((_, fail) => { reject = fail }))
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<AppUpdateSettings appVersion="1.0.0" />)
    await userEvent.click(screen.getByRole("button", { name: "Check For Updates" }))
    expect(screen.getByRole("button", { name: "Checking for updates…" })).toBeDisabled()
    reject("network unavailable")
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not check for updates")
    expect(screen.getByRole("button", { name: "Try Again" })).toBeEnabled()
  })

  it("shows up-to-date state without a download or misleading notification", () => {
    useAppUpdateStore.setState({ result: { ...available, status: "upToDate", downloadUrl: null } })
    render(<AppUpdateSettings appVersion="1.0.0" />)
    expect(screen.getByText("You’re up to date.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Download New Version" })).not.toBeInTheDocument()
  })

  it("makes opener failures visible", async () => {
    useAppUpdateStore.setState({ result: available })
    vi.mocked(openUrl).mockRejectedValue("Cannot open browser")
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<AppUpdateSettings appVersion="1.0.0" />)
    await userEvent.click(screen.getByRole("button", { name: "Download New Version" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open the link")
  })

  it("has complete update copy in all nine languages", () => {
    for (const { value } of APP_LANGUAGES) {
      const t = createTranslator(value)
      expect(t("updates.title")).toBeTruthy()
      expect(t("updates.replace")).toContain("One More Prompt")
      expect(t("updates.availableLabel", { version: "1.2.3" })).toContain("1.2.3")
      expect(t("updates.check")).toBeTruthy()
      expect(t("updates.notPublished")).toBeTruthy()
    }
  })
})
