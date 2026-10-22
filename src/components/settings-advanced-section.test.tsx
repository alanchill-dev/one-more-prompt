import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock, isTauriMock, revealItemInDirMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  revealItemInDirMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: revealItemInDirMock,
}))

import { SettingsAdvancedSection } from "@/components/settings-advanced-section"

describe("SettingsAdvancedSection", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    isTauriMock.mockReset().mockReturnValue(true)
    revealItemInDirMock.mockReset().mockResolvedValue(undefined)
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_diagnostic_logging") return Promise.resolve(false)
      if (command === "set_diagnostic_logging") return Promise.resolve(true)
      if (command === "get_log_path") return Promise.resolve("/tmp/one-more-prompt.log")
      return Promise.resolve(undefined)
    })
  })

  it("reads native state and starts session-only diagnostic logging", async () => {
    const user = userEvent.setup()
    render(<SettingsAdvancedSection />)
    await user.click(screen.getByText("Troubleshooting"))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_diagnostic_logging")
    })
    await user.click(screen.getByRole("button", { name: "Start Diagnostic Logging" }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("set_diagnostic_logging", { enabled: true })
      expect(screen.getByRole("button", { name: "Stop Diagnostic Logging" })).toBeInTheDocument()
    })
    expect(screen.getByText("Diagnostic logging started for this session.")).toBeInTheDocument()
  })

  it("loads an enabled native state and stops diagnostic logging", async () => {
    const user = userEvent.setup()
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_diagnostic_logging") return Promise.resolve(true)
      if (command === "set_diagnostic_logging") return Promise.resolve(false)
      return Promise.resolve(undefined)
    })
    render(<SettingsAdvancedSection />)
    await user.click(screen.getByText("Troubleshooting"))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_diagnostic_logging")
      expect(screen.getByRole("button", { name: "Stop Diagnostic Logging" })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: "Stop Diagnostic Logging" }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("set_diagnostic_logging", { enabled: false })
      expect(screen.getByRole("button", { name: "Start Diagnostic Logging" })).toBeInTheDocument()
    })
    expect(screen.getByText("Diagnostic logging stopped.")).toBeInTheDocument()
  })

  it("opens the native log location", async () => {
    const user = userEvent.setup()
    render(<SettingsAdvancedSection />)
    await user.click(screen.getByText("Troubleshooting"))
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_diagnostic_logging")
    })
    await user.click(screen.getByRole("button", { name: "Open Log Location" }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_log_path")
      expect(revealItemInDirMock).toHaveBeenCalledWith("/tmp/one-more-prompt.log")
    })
    expect(screen.getByText("Log location opened.")).toBeInTheDocument()
  })

  it("opens the independent Codex check through the native reset command", async () => {
    const user = userEvent.setup()
    render(<SettingsAdvancedSection />)
    await user.click(screen.getByText("Troubleshooting"))

    await user.click(screen.getByRole("button", { name: "Recheck Codex" }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("reset_onboarding")
    })
  })

  it("replays the workspace guide without reopening the Codex check", async () => {
    const user = userEvent.setup()
    render(<SettingsAdvancedSection />)
    await user.click(screen.getByText("Troubleshooting"))
    await user.click(screen.getByRole("button", { name: "Replay Guide" }))
    expect(invokeMock).toHaveBeenCalledWith("replay_contextual_guide")
    expect(invokeMock).not.toHaveBeenCalledWith("reset_onboarding")
    await waitFor(() => expect(screen.getByRole("button", { name: "Replay Guide" })).toBeEnabled())
  })

  it("shows a visible error when the guide cannot open", async () => {
    const user = userEvent.setup()
    invokeMock.mockImplementation((command: string) => command === "replay_contextual_guide"
      ? Promise.reject(new Error("failed")) : Promise.resolve(false))
    render(<SettingsAdvancedSection />)
    await user.click(screen.getByText("Troubleshooting"))
    await user.click(screen.getByRole("button", { name: "Replay Guide" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The guide could not be opened. Check the app log and try again.",
    )
  })

  it("shows a visible error when setup cannot be reopened", async () => {
    const user = userEvent.setup()
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_diagnostic_logging") return Promise.resolve(false)
      if (command === "reset_onboarding") return Promise.reject(new Error("failed"))
      return Promise.resolve(undefined)
    })
    render(<SettingsAdvancedSection />)
    await user.click(screen.getByText("Troubleshooting"))

    await user.click(screen.getByRole("button", { name: "Recheck Codex" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Codex could not be checked. Check the app log and try again.",
    )
  })
})
