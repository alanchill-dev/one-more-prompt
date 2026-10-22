import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/app/main-app", () => ({
  MainApp: () => <main data-testid="main-app">One More Prompt for Codex</main>,
}))

vi.mock("@/components/onboarding/onboarding-app", () => ({
  OnboardingApp: () => <main data-testid="onboarding-app">Onboarding</main>,
}))

vi.mock("@/components/whats-new/whats-new-app", () => ({
  WhatsNewApp: () => <main data-testid="whats-new-app">What&apos;s New</main>,
}))

import { App } from "@/App"

describe("App routes", () => {
  beforeEach(() => {
    window.location.hash = ""
  })

  it("opens the Codex analytics app by default", () => {
    render(<App />)

    expect(screen.getByTestId("main-app")).toHaveTextContent("One More Prompt for Codex")
  })

  it("opens onboarding from the setup route", async () => {
    window.location.hash = "#/setup"
    render(<App />)

    expect(await screen.findByTestId("onboarding-app")).toBeInTheDocument()
  })

  it("opens the release notes route", async () => {
    window.location.hash = "#/whats-new"
    render(<App />)

    expect(await screen.findByTestId("whats-new-app")).toBeInTheDocument()
  })

  it("falls back safely for unknown routes", () => {
    window.location.hash = "#/unknown"
    render(<App />)

    expect(screen.getByTestId("main-app")).toBeInTheDocument()
  })
})
