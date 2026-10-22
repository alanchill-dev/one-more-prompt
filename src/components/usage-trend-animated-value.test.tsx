import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UsageTrendAnimatedValue } from "@/components/usage-trend-animated-value"

describe("UsageTrendAnimatedValue", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("animates only the characters that changed", () => {
    const { container, rerender } = render(<UsageTrendAnimatedValue value="1234" />)

    rerender(<UsageTrendAnimatedValue value="1256" />)

    const stable = container.querySelectorAll('[data-trend-character-state="stable"]')
    const entering = container.querySelectorAll('[data-trend-character-state="enter"]')
    const exiting = container.querySelectorAll('[data-trend-character-state="exit"]')
    expect(Array.from(stable, (node) => node.textContent)).toEqual(["1", "2"])
    expect(Array.from(entering, (node) => node.textContent)).toEqual(["5", "6"])
    expect(Array.from(exiting, (node) => node.textContent)).toEqual(["3", "4"])
    expect(screen.getByTestId("usage-trend-live-number")).toHaveTextContent("1256")

    // jsdom exposes WebKit animation styles without AnimationEvent.
    fireEvent(entering[0], new Event("webkitAnimationEnd", { bubbles: true }))
    fireEvent(exiting[1], new Event("webkitAnimationEnd", { bubbles: true }))
    expect(container.querySelectorAll('[data-trend-character-state="exit"]')).toHaveLength(2)
    fireEvent(entering[1], new Event("webkitAnimationEnd", { bubbles: true }))
    expect(container.querySelector('[data-trend-character-state="exit"]')).not.toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('[data-trend-character-state="stable"]'), (node) => node.textContent)).toEqual(["1", "2", "5", "6"])
  })

  it("keeps a long amount transitioning after 720ms until its last entering character finishes", () => {
    vi.useFakeTimers()
    const amount = "$1,234,567.89"
    const { container, rerender } = render(<UsageTrendAnimatedValue value="3.4B" />)
    rerender(<UsageTrendAnimatedValue value={amount} />)
    const entering = container.querySelectorAll('[data-trend-character-state="enter"]')
    expect(entering).toHaveLength(amount.length)

    act(() => vi.advanceTimersByTime(720))
    expect(container.querySelectorAll('[data-trend-character-state="exit"]')).toHaveLength(4)
    expect(entering[entering.length - 1]).toBeInTheDocument()
    fireEvent(entering[entering.length - 1], new Event("webkitAnimationEnd", { bubbles: true }))

    expect(container.querySelector('[data-trend-character-state="exit"]')).not.toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('[data-trend-character-state="stable"]'), (node) => node.textContent).join("")).toBe(amount)
  })

  it("finishes a pure deletion when its last exiting character ends", () => {
    const { container, rerender } = render(<UsageTrendAnimatedValue value="1234" />)
    rerender(<UsageTrendAnimatedValue value="12" />)
    const exiting = container.querySelectorAll('[data-trend-character-state="exit"]')
    expect(container.querySelector('[data-trend-character-state="enter"]')).not.toBeInTheDocument()
    expect(Array.from(exiting, (node) => node.textContent)).toEqual(["3", "4"])

    fireEvent(exiting[0], new Event("webkitAnimationEnd", { bubbles: true }))
    expect(exiting[1]).toBeInTheDocument()
    fireEvent(exiting[1], new Event("webkitAnimationEnd", { bubbles: true }))
    expect(container.querySelector('[data-trend-character-state="exit"]')).not.toBeInTheDocument()
    expect(container.querySelectorAll("[data-character-index]")).toHaveLength(2)
  })

  it("keeps the latest value and transition when values change quickly", () => {
    const { container, rerender } = render(<UsageTrendAnimatedValue value="1234" />)
    rerender(<UsageTrendAnimatedValue value="1256" />)
    const previousLastEnter = container.querySelector('[data-character-index="3"] [data-trend-character-state="enter"]')!
    rerender(<UsageTrendAnimatedValue value="1289" />)
    fireEvent(previousLastEnter, new Event("webkitAnimationEnd", { bubbles: true }))

    expect(screen.getByTestId("usage-trend-live-number")).toHaveTextContent("1289")
    expect(Array.from(container.querySelectorAll('[data-trend-character-state="enter"]'), (node) => node.textContent)).toEqual(["8", "9"])
    expect(Array.from(container.querySelectorAll('[data-trend-character-state="exit"]'), (node) => node.textContent)).toEqual(["5", "6"])
    fireEvent(container.querySelector('[data-character-index="3"] [data-trend-character-state="enter"]')!, new Event("webkitAnimationEnd", { bubbles: true }))
    expect(container.querySelector('[data-trend-character-state="exit"]')).not.toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('[data-trend-character-state="stable"]'), (node) => node.textContent)).toEqual(["1", "2", "8", "9"])
  })

  it("stages the initial hero value one character at a time", () => {
    const { container } = render(<UsageTrendAnimatedValue value="7.53B" animateInitial />)

    const characters = Array.from(container.querySelectorAll('[data-trend-character-state="stable"]'))
    expect(characters).toHaveLength(5)
    expect(characters.every((character) => character.classList.contains("trend-live-number-character-enter"))).toBe(true)
    expect(characters.map((character) => character.getAttribute("style"))).toEqual([
      "animation-delay: 0ms;",
      "animation-delay: 24ms;",
      "animation-delay: 48ms;",
      "animation-delay: 72ms;",
      "animation-delay: 96ms;",
    ])
  })

  it("keeps the editorial magnitude spacing inside the stable number layout", () => {
    const { rerender } = render(<UsageTrendAnimatedValue value="7.51B" magnitudeSpacing />)

    expect(screen.getByTestId("usage-trend-primary-magnitude")).toHaveTextContent("B")
    expect(screen.getByTestId("usage-trend-primary-magnitude")).toHaveClass("ml-[0.06em]")
    rerender(<UsageTrendAnimatedValue value="$32.10" magnitudeSpacing />)
    expect(screen.queryByTestId("usage-trend-primary-magnitude")).not.toBeInTheDocument()
    rerender(<UsageTrendAnimatedValue value="3.4B" magnitudeSpacing />)
    expect(screen.getByTestId("usage-trend-primary-magnitude")).toHaveTextContent("B")
  })
})
