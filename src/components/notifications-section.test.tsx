import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  invokeMock: vi.fn().mockResolvedValue(undefined),
  isTauriMock: vi.fn().mockReturnValue(true),
  setToggleMock: vi.fn(),
  store: {
    settings: { underTenPercent: false, sessionReset: false },
    setToggle: (...args: unknown[]) => state.setToggleMock(...args),
    hydrate: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: state.isTauriMock, invoke: state.invokeMock }))
vi.mock("@/stores/app-notifications-store", () => ({
  useAppNotificationsStore: (selector: (s: typeof state.store) => unknown) => selector(state.store),
}))

import { NotificationsSection } from "./notifications-section"

async function openNotificationsDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Notifications" }))
}

describe("NotificationsSection", () => {
  beforeEach(() => {
    state.invokeMock.mockReset()
    state.invokeMock.mockResolvedValue(undefined)
    state.isTauriMock.mockReturnValue(true)
    state.setToggleMock.mockReset()
  })

  it("does not show the dialog or checkboxes just from rendering", () => {
    render(<NotificationsSection />)
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("opens a modal with the 2 actual-usage alert checkboxes on button click", async () => {
    render(<NotificationsSection />)
    await openNotificationsDialog()

    expect(screen.getByRole("dialog", { name: "Notifications" })).toHaveAttribute("aria-modal", "true")
    expect(screen.getAllByRole("checkbox")).toHaveLength(2)
    expect(screen.queryByText("Will Run Out")).not.toBeInTheDocument()
    expect(screen.queryByText("Cutting It Close")).not.toBeInTheDocument()
  })

  it("closes the notifications dialog on Escape", async () => {
    render(<NotificationsSection />)
    await openNotificationsDialog()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument()
  })

  it("persists the toggle and shows the allow-notifications modal when turned on", async () => {
    render(<NotificationsSection />)
    await openNotificationsDialog()
    await userEvent.click(screen.getAllByRole("checkbox")[0])
    expect(state.setToggleMock).toHaveBeenCalledWith("underTenPercent", true)
    expect(await screen.findByText(/Allow Notifications/i)).toBeTruthy()
  })

  it("opens the macOS notification settings from the modal and closes it", async () => {
    render(<NotificationsSection />)
    await openNotificationsDialog()
    await userEvent.click(screen.getAllByRole("checkbox")[0])
    const permissionModal = (await screen.findByText("Allow Notifications")).parentElement!
    await userEvent.click(within(permissionModal).getByRole("button", { name: "Open Settings" }))
    expect(state.invokeMock).toHaveBeenCalledWith("open_notification_settings")
    expect(screen.queryByText(/Allow Notifications/i)).toBeNull()
  })

  it("dismisses with Done without opening settings", async () => {
    render(<NotificationsSection />)
    await openNotificationsDialog()
    await userEvent.click(screen.getAllByRole("checkbox")[0])
    await userEvent.click(await screen.findByRole("button", { name: "Done" }))
    expect(state.invokeMock).not.toHaveBeenCalledWith("open_notification_settings")
    expect(screen.queryByText(/Allow Notifications/i)).toBeNull()
  })

  it("keeps the notifications dialog open when Escape is pressed while the permission modal is open", async () => {
    render(<NotificationsSection />)
    await openNotificationsDialog()
    await userEvent.click(screen.getAllByRole("checkbox")[0])
    expect(await screen.findByText(/Allow Notifications/i)).toBeTruthy()

    await userEvent.keyboard("{Escape}")

    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument()
  })

  it("submits a localized test through the same command as usage alerts", async () => {
    render(<NotificationsSection />)
    await openNotificationsDialog()
    await userEvent.click(screen.getByRole("button", { name: "Test Notification" }))

    expect(state.invokeMock).toHaveBeenCalledWith("send_pace_notification", {
      title: "One More Prompt Test",
      body: "Usage alerts can appear here while One More Prompt is running.",
    })
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Submitted to your operating system. If no notification appears, check notification settings and Do Not Disturb.",
    )
  })

  it("shows a friendly failure when the native notification command rejects", async () => {
    const error = new Error("Windows toast registration failed")
    state.invokeMock.mockRejectedValueOnce(error)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    render(<NotificationsSection />)
    await openNotificationsDialog()
    await userEvent.click(screen.getByRole("button", { name: "Test Notification" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not send the test notification. Check the app log and try again.",
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith("Failed to send test notification:", error)
    consoleError.mockRestore()
  })

  it("prevents repeated test notifications while submission is pending", async () => {
    let resolveSubmission!: () => void
    state.invokeMock.mockReturnValueOnce(new Promise<void>((resolve) => { resolveSubmission = resolve }))
    render(<NotificationsSection />)
    await openNotificationsDialog()
    await userEvent.click(screen.getByRole("button", { name: "Test Notification" }))

    const pendingButton = screen.getByRole("button", { name: "Sending…" })
    expect(pendingButton).toBeDisabled()
    await userEvent.click(pendingButton)
    expect(state.invokeMock).toHaveBeenCalledTimes(1)

    resolveSubmission()
    await waitFor(() => expect(screen.getByRole("button", { name: "Test Notification" })).toBeEnabled())
  })

  it("does not invoke the native backend from browser preview", async () => {
    state.isTauriMock.mockReturnValue(false)
    render(<NotificationsSection />)
    await openNotificationsDialog()
    const testButton = screen.getByRole("button", { name: "Test Notification" })
    expect(testButton).toBeDisabled()
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeDisabled()
    expect(screen.getByText("Open the desktop app to test system notifications.")).toBeInTheDocument()
    await userEvent.click(testButton)
    expect(state.invokeMock).not.toHaveBeenCalled()
  })

  it("includes the new actions in the keyboard focus trap", async () => {
    render(<NotificationsSection />)
    await openNotificationsDialog()
    const settingsButton = screen.getByRole("button", { name: "Open Settings" })
    settingsButton.focus()
    await userEvent.tab()
    expect(screen.getAllByRole("checkbox")[0]).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(settingsButton).toHaveFocus()
  })
})
