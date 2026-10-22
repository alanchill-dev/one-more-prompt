import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ModelColorInspector } from "@/components/model-color-inspector"
import { DEFAULT_MODEL_COLOR_PREFERENCES } from "@/lib/model-colors"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const { saveModelColorPreferencesMock } = vi.hoisted(() => ({
  saveModelColorPreferencesMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings")>()
  return {
    ...actual,
    saveModelColorPreferences: saveModelColorPreferencesMock,
  }
})

describe("ModelColorInspector", () => {
  beforeEach(() => {
    saveModelColorPreferencesMock.mockClear()
    useAppPreferencesStore.getState().resetState()
    useAppPreferencesStore.getState().setModelColors(DEFAULT_MODEL_COLOR_PREFERENCES)
    useAppPreferencesStore.getState().setModelColorsHydrated(true)
  })

  it("shows a concise fixed palette without model details, drag controls, or Light/Dark overrides", () => {
    render(
      <ModelColorInspector
        open
        onClose={() => {}}
        activeSlotIndex={0}
        onActiveSlotIndexChange={() => {}}
      />,
    )

    const inspector = screen.getByRole("complementary", { name: "Model Palette" })
    expect(inspector).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Slots 1 → 5 follow Token usage/i })).toBeInTheDocument()
    expect(screen.getAllByTestId(/model-palette-slot-/)).toHaveLength(5)
    expect(screen.getAllByTestId(/model-palette-reset-/)).toHaveLength(5)
    expect(screen.queryByText(/GPT-/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Drag the circles/i)).not.toBeInTheDocument()
    expect(screen.queryByText("Advanced · Light / Dark")).not.toBeInTheDocument()
    expect(screen.queryByText("Recommended colors")).not.toBeInTheDocument()
    const controls = screen.getByTestId("model-palette-color-controls")
    expect(controls).toContainElement(screen.getByTestId("model-color-wheel"))
    expect(controls).toContainElement(screen.getByLabelText("Lightness"))
    expect(controls).toContainElement(screen.getByLabelText("HEX"))
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument()
    expect(screen.getByTestId("model-palette-layer")).toHaveAttribute("data-state", "open")
    expect(inspector).toHaveStyle({ height: "350px" })
    expect(inspector).toHaveAttribute("data-layout", "focused-palette-card")
  })

  it("previews resetting an individual palette slot to its default", async () => {
    const user = userEvent.setup()
    const customized = {
      slots: DEFAULT_MODEL_COLOR_PREFERENCES.slots.map((slot, index) => index === 1 ? { base: "#123456" } : { ...slot }),
    }
    useAppPreferencesStore.getState().setModelColors(customized)

    render(
      <ModelColorInspector
        open
        onClose={() => {}}
        activeSlotIndex={1}
        onActiveSlotIndexChange={() => {}}
      />,
    )

    const reset = screen.getByTestId("model-palette-reset-2")
    expect(reset).not.toBeDisabled()
    await user.click(reset)
    expect(useAppPreferencesStore.getState().modelColors.slots[1]).toEqual(DEFAULT_MODEL_COLOR_PREFERENCES.slots[1])
    expect(saveModelColorPreferencesMock).not.toHaveBeenCalled()
  })

  it("opens the rank explanation when the info button is clicked", async () => {
    const user = userEvent.setup()
    render(
      <ModelColorInspector
        open
        onClose={() => {}}
        activeSlotIndex={0}
        onActiveSlotIndexChange={() => {}}
      />,
    )

    const info = screen.getByRole("button", { name: /Slots 1 → 5 follow Token usage/i })
    expect(screen.queryByTestId("model-palette-rank-info")).not.toBeInTheDocument()
    await user.click(info)
    expect(screen.getByTestId("model-palette-rank-info")).toHaveTextContent(/Token usage/i)
    await user.click(info)
    expect(screen.queryByTestId("model-palette-rank-info")).not.toBeInTheDocument()
  })

  it("clips the blur backdrop to the real rounded app surface", () => {
    const surface = document.createElement("div")
    surface.className = "app-panel-surface"
    surface.style.borderRadius = "16px"
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      x: 8, y: 4, left: 8, top: 4, right: 1008, bottom: 704, width: 1000, height: 700, toJSON: () => ({}),
    })
    document.body.appendChild(surface)

    render(
      <ModelColorInspector
        open
        onClose={() => {}}
        activeSlotIndex={0}
        onActiveSlotIndexChange={() => {}}
      />,
    )

    expect(screen.getByTestId("model-palette-backdrop")).toHaveStyle({
      left: "8px",
      top: "4px",
      width: "1000px",
      height: "700px",
      borderRadius: "16px",
    })
    surface.remove()
  })

  it("uses the palette button geometry as the panel morph origin", () => {
    render(
      <ModelColorInspector
        open
        onClose={() => {}}
        activeSlotIndex={0}
        onActiveSlotIndexChange={() => {}}
        anchorRect={{ left: 900, top: 180, width: 44, height: 44 }}
      />,
    )

    const morph = screen.getByTestId("model-palette-shared-morph")
    const inspector = screen.getByRole("complementary", { name: "Model Palette" })
    expect(morph.style.getPropertyValue("--shared-source-left")).toBe("900px")
    expect(morph.style.getPropertyValue("--shared-source-top")).toBe("180px")
    expect(morph.style.getPropertyValue("--shared-source-width")).toBe("44px")
    expect(morph.style.getPropertyValue("--shared-source-height")).toBe("44px")
    expect(morph.style.getPropertyValue("--shared-destination-left")).not.toBe("")
    expect(morph.style.getPropertyValue("--shared-destination-top")).not.toBe("")
    expect(morph.style.getPropertyValue("--shared-destination-width")).toBe("470px")
    expect(morph.style.getPropertyValue("--shared-destination-height")).toBe("350px")
    expect(inspector).toHaveStyle({ top: "24px", right: "138px" })
  })

  it("keeps the colored stacked bars on a sharp layer above the blurred backdrop", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("viewBox", "0 0 100 100")
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 10, y: 20, left: 10, top: 20, right: 210, bottom: 220, width: 200, height: 200, toJSON: () => ({}),
    })
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g")
    group.setAttribute("data-testid", "usage-trend-daily-stacked-columns")
    const segment = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    segment.setAttribute("data-segment-kind", "model")
    segment.setAttribute("x", "10")
    segment.setAttribute("y", "20")
    segment.setAttribute("width", "12")
    segment.setAttribute("height", "70")
    segment.setAttribute("fill", "#EB8C76")
    group.appendChild(segment)
    svg.appendChild(group)
    document.body.appendChild(svg)

    render(
      <ModelColorInspector
        open
        onClose={() => {}}
        activeSlotIndex={0}
        onActiveSlotIndexChange={() => {}}
      />,
    )

    const sharpLayer = screen.getByTestId("model-palette-sharp-bars")
    expect(sharpLayer).toHaveAttribute("data-state", "open")
    expect(sharpLayer.querySelector('[data-segment-kind="model"]')).toBeInTheDocument()
    svg.remove()
  })

  it("previews color changes immediately but cancels them when the panel closes without Apply", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onApply = vi.fn()
    render(
      <ModelColorInspector
        open
        onClose={onClose}
        onApply={onApply}
        activeSlotIndex={0}
        onActiveSlotIndexChange={() => {}}
      />,
    )

    const original = DEFAULT_MODEL_COLOR_PREFERENCES.slots[0].base
    const hex = screen.getByLabelText("HEX")
    await user.clear(hex)
    await user.type(hex, "#EB8C76")
    expect(useAppPreferencesStore.getState().modelColors.slots[0].base).toBe("#EB8C76")
    expect(saveModelColorPreferencesMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Close model palette" }))
    expect(useAppPreferencesStore.getState().modelColors.slots[0].base).toBe(original)
    expect(saveModelColorPreferencesMock).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })

  it("cancels an unapplied preview when its owner closes the panel", () => {
    const props = { onClose: vi.fn(), activeSlotIndex: 0, onActiveSlotIndexChange: vi.fn() }
    const { rerender } = render(<ModelColorInspector {...props} open />)
    const original = useAppPreferencesStore.getState().modelColors
    fireEvent.change(screen.getByLabelText("HEX"), { target: { value: "#123456" } })
    expect(useAppPreferencesStore.getState().modelColors).not.toEqual(original)
    rerender(<ModelColorInspector {...props} open={false} />)
    expect(useAppPreferencesStore.getState().modelColors).toEqual(original)
    expect(saveModelColorPreferencesMock).not.toHaveBeenCalled()
  })

  it("persists the preview only when Apply is pressed", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onApply = vi.fn()
    render(
      <ModelColorInspector
        open
        onClose={onClose}
        onApply={onApply}
        activeSlotIndex={0}
        onActiveSlotIndexChange={() => {}}
      />,
    )

    const hex = screen.getByLabelText("HEX")
    await user.clear(hex)
    await user.type(hex, "#EB8C76")
    expect(onApply).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Apply" }))

    expect(useAppPreferencesStore.getState().modelColors.slots[0].base).toBe("#EB8C76")
    expect(saveModelColorPreferencesMock).toHaveBeenCalledTimes(1)
    expect(saveModelColorPreferencesMock).toHaveBeenCalledWith(expect.objectContaining({
      slots: expect.arrayContaining([expect.objectContaining({ base: "#EB8C76" })]),
    }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledOnce()
  })

  it("clicking outside cancels the draft and invalid HEX cannot be applied", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ModelColorInspector
        open
        onClose={onClose}
        activeSlotIndex={0}
        onActiveSlotIndexChange={() => {}}
      />,
    )

    const original = DEFAULT_MODEL_COLOR_PREFERENCES.slots[0].base
    const hex = screen.getByLabelText("HEX")
    await user.clear(hex)
    await user.type(hex, "#123")
    fireEvent.blur(hex)
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 6-digit HEX color")
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled()

    await user.clear(hex)
    await user.type(hex, "#D56F61")
    expect(useAppPreferencesStore.getState().modelColors.slots[0].base).toBe("#D56F61")
    fireEvent.pointerDown(screen.getByTestId("model-palette-layer"))

    expect(useAppPreferencesStore.getState().modelColors.slots[0].base).toBe(original)
    expect(saveModelColorPreferencesMock).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
