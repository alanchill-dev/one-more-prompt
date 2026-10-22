import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LanguagePicker } from "@/components/language-picker"

describe("LanguagePicker", () => {
  it("shows every supported language by its native name", () => {
    render(
      <LanguagePicker
        label="Language"
        value="en"
        onValueChange={vi.fn()}
      />,
    )

    const picker = screen.getByRole("combobox", { name: "Language" })
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "English",
      "繁體中文",
      "简体中文",
      "日本語",
      "한국어",
      "Español",
      "Português (Brasil)",
      "Deutsch",
      "Français",
    ])
    expect(picker).toHaveValue("en")
  })

  it("reports a valid selected language", async () => {
    const onValueChange = vi.fn()
    render(
      <LanguagePicker
        label="Language"
        value="en"
        onValueChange={onValueChange}
      />,
    )

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Language" }),
      "fr",
    )

    expect(onValueChange).toHaveBeenCalledWith("fr")
  })
})
