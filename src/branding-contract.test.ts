import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { APP_LANGUAGES, createTranslator } from "@/lib/i18n"

const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as {
  productName: string
  identifier: string
  app: { windows: Array<{ title: string }> }
  bundle: { resources: string[] }
}

describe("One More Prompt branding contract", () => {
  it("keeps the public name and its own bundle identity", () => {
    expect(tauriConfig.productName).toBe("One More Prompt")
    expect(tauriConfig.app.windows[0]?.title).toBe("One More Prompt")
    expect(tauriConfig.identifier).toBe("com.alanchill.onemoreprompt")
    const packageMetadata = JSON.parse(readFileSync("package.json", "utf8"))
    expect(packageMetadata.description).toContain("Codex")
    expect(packageMetadata.description).toContain("macOS and Windows")
  })

  it("uses the renamed app bundle in local and release packaging paths", () => {
    expect(readFileSync("lutin.yml", "utf8")).toContain("One More Prompt.app")
    expect(readFileSync("scripts/build-release.sh", "utf8")).toContain("One More Prompt.app")
    expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain("/Applications/One More Prompt.app")
  })

  it("ships the complete license and attribution in both platform packages", () => {
    expect(tauriConfig.bundle.resources).toEqual(expect.arrayContaining(["../LICENSE", "../NOTICE"]))
    const portableScript = readFileSync("scripts/build-windows-portable.sh", "utf8")
    expect(portableScript).toContain("One More Prompt - Windows x64\n")
    expect(portableScript).not.toContain("Windows x64 Preview")
    for (const file of ["LICENSE", "NOTICE"]) {
      expect(readFileSync(file, "utf8").length).toBeGreaterThan(0)
      expect(portableScript).toContain(`cp ${file} "$package_dir/${file}.txt"`)
    }
  })

  it("uses the product executable and keeps build, packaging and version names aligned", () => {
    const manifest = readFileSync("src-tauri/Cargo.toml", "utf8")
    const lock = readFileSync("src-tauri/Cargo.lock", "utf8")
    expect(manifest).toContain('name = "one-more-prompt"')
    expect(manifest).toContain('name = "one_more_prompt_lib"')
    expect(lock).toContain('name = "one-more-prompt"')
    expect(readFileSync("src-tauri/src/main.rs", "utf8")).toContain("one_more_prompt_lib::run()")
    for (const file of ["scripts/build-windows-portable.sh", "README.md", "README.zh-TW.md"]) {
      const text = readFileSync(file, "utf8")
      expect(text).toContain("one-more-prompt.exe")
    }
    expect(readFileSync("scripts/bump-version.mjs", "utf8")).toContain('name = "one-more-prompt"')
    expect(readFileSync("scripts/windows/remove-notification-registration.cmd", "utf8")).toContain("GetProcessesByName('one-more-prompt')")
  })

  it("keeps the provider qualifier explicit in every supported locale", () => {
    for (const language of APP_LANGUAGES) {
      const t = createTranslator(language.value)
      expect(t("app.name")).toBe("One More Prompt")
      expect(t("app.tagline")).toContain("Codex")
      expect(t("about.attribution")).toContain("Nicolas Demanez")
    }
  })
})
