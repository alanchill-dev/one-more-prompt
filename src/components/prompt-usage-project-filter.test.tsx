import { useState } from "react"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { ProjectFilterControl } from "./prompt-usage-timeline-filters"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

function Filter() {
  const [selected, setSelected] = useState<string[]>([])
  return <ProjectFilterControl selected={selected} options={[{ key: "a", label: "Project Alpha" }, { key: "b", label: "Project Beta" }]} onChange={setSelected} />
}

describe("Timeline Project Filter", () => {
  beforeEach(() => {
    window.localStorage.clear()
    useAppPreferencesStore.getState().resetState()
  })

  it("keeps multi-selection open and resets to all projects", async () => {
    const user = userEvent.setup()
    render(<Filter />)
    await user.click(screen.getByRole("button", { expanded: false }))
    await user.click(screen.getByRole("checkbox", { name: "Project Alpha" }))
    await user.click(screen.getByRole("checkbox", { name: "Project Beta" }))
    expect(screen.getByRole("checkbox", { name: "Project Alpha" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Project Beta" })).toBeChecked()
    await user.click(screen.getByRole("checkbox", { name: "Project Alpha" }))
    expect(screen.getByRole("checkbox", { name: "Project Alpha" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Project Beta" })).toBeChecked()
    await user.click(screen.getByRole("button", { name: "All Projects", exact: true }))
    expect(screen.getByRole("checkbox", { name: "Project Beta" })).not.toBeChecked()
    expect(screen.getByRole("button", { name: "All Projects", exact: true })).toHaveAttribute("aria-pressed", "true")
  })

  it("supports keyboard selection and restores trigger focus on Escape", async () => {
    const user = userEvent.setup()
    render(<Filter />)
    const trigger = screen.getByRole("button", { expanded: false })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("button", { name: "All Projects", exact: true })).toHaveFocus())
    await user.tab()
    expect(screen.getByRole("checkbox", { name: "Project Alpha" })).toHaveFocus()
    await user.keyboard(" ")
    expect(screen.getByRole("checkbox", { name: "Project Alpha" })).toBeChecked()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(trigger).toHaveAttribute("aria-expanded", "false")
  })
})
