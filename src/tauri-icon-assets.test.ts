import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

const SOURCE_ICON_PATH = "public/icon.png"
const SIGNAL_APERTURE_SOURCE_PATH = "public/signal-aperture.svg"
const TRAY_SIGNAL_APERTURE_SOURCE_PATH = "public/tray-signal-aperture.svg"
const BUNDLE_BASE_ICON_PATH = "src-tauri/icons/icon.png"
const ICON_COMPOSER_SOURCE_PATH = "src-tauri/icons/Icon.icon/icon.json"
const INDEX_PATH = "index.html"
const LEGACY_GREEN_FILL = "0.80265,0.99122,0.31665"

const appIconAssetPaths = [
  "src-tauri/icons/32x32.png",
  "src-tauri/icons/64x64.png",
  "src-tauri/icons/128x128.png",
  "src-tauri/icons/128x128@2x.png",
  "src-tauri/icons/icon.icns",
  "src-tauri/icons/icon.ico",
  "src-tauri/icons/icon.png",
  "src-tauri/icons/StoreLogo.png",
  "src-tauri/icons/Square30x30Logo.png",
  "src-tauri/icons/Square44x44Logo.png",
  "src-tauri/icons/Square71x71Logo.png",
  "src-tauri/icons/Square89x89Logo.png",
  "src-tauri/icons/Square107x107Logo.png",
  "src-tauri/icons/Square142x142Logo.png",
  "src-tauri/icons/Square150x150Logo.png",
  "src-tauri/icons/Square284x284Logo.png",
  "src-tauri/icons/Square310x310Logo.png",
] as const

const legacyIconHashes = new Set([
  "0f8ff51669fcd1fb331558eb250ae7b5dd8fded72931d383ffe734b799eed8eb",
  "1f4f50bdc131dbb03f90dce241623cc90d59f84bcad7405df838b80e0cec099d",
  "1fc4b857eb6a95240d690b5dea36d53243c520753778394b63452662c8816b9d",
  "2b87ffa92bfd4de5980d73bfcbd0ecbec9a9bc2781ae5a9974668d08ee6f1b5a",
  "2bdec1be263d1fd021a6b80578e95c1df87ac322d63ce8e42d5ae628b672afe2",
  "3837d539f6db7442de4003f339d75c9741b6b545efe1a609d6aa76852406d07e",
  "39d6d3aefd6421e470b266866d0b94f9b5453a573a169debcbead845549b188f",
  "47f409aebf3563163f5ac1cba4d4d917de840a1e343941052a005ae05450c655",
  "63a30956fddefc0747eec040e403e26674554b0e663abce9c270f9a5763f54e0",
  "6cbf523e5a19e29b21eeace2840934131f9fca74cb038b09f0055f9474311ffd",
  "6d416b133301aa072d843983b150b428fa138212106cf390fffb3d23a60ed87e",
  "75b94beb248b393ecf8da725830cf3d2585bd04f9fee383a17a78326a36ec290",
  "7bddce363ed3be0ced6fc3d219538bea7e0cdb4dab2aa8cbec3fb568648dc962",
  "835ff40891b94b0377f6f5c6f63d582d0633cc3ecc6d6e7d68afff31eee92e91",
  "8c9d6fea84d22755c4606cbba0803e32de2f53975a1b85aa33c3d71dc9e274d4",
  "e89ea0f7769d7ee33c2d24877b94f6dd62e867506926797337c3db27c859a467",
  "ffc2c4ba21ad923f11913aeda531b78cf339b5f76424a40068dc834f18e336e4",
])

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

describe("Tauri app icon assets", () => {
  it("uses the Signal Aperture source icon as the base bundle icon", () => {
    expect(sha256(BUNDLE_BASE_ICON_PATH)).toBe(sha256(SOURCE_ICON_PATH))
  })

  it("keeps the One Slot Left geometry and Wire prompt chevron in the app source", () => {
    const source = readFileSync(SIGNAL_APERTURE_SOURCE_PATH, "utf8")
    expect(source).toContain("M 205.6 86.6 A 88 88 0 1 0 205.6 169.4")
    expect(source).toContain("M 190 112 L 208 128 L 190 144")
    expect(source).toContain("#F5572F")
    expect(source).not.toContain("linearGradient")
    expect(source).not.toContain("radialGradient")
    expect(source).not.toContain("filter")
  })

  it("keeps the tray source monochrome and themeable", () => {
    const source = readFileSync(TRAY_SIGNAL_APERTURE_SOURCE_PATH, "utf8")
    expect(source).toContain("currentColor")
    expect(source).toContain("M 190 112 L 208 128 L 190 144")
    expect(source).not.toContain("#F5572F")
    expect(source).not.toContain("linearGradient")
    expect(source).not.toContain("radialGradient")
    expect(source).not.toContain("filter")
    expect(sha256("src-tauri/icons/tray-icon.png")).not.toBe(sha256(SOURCE_ICON_PATH))
  })

  it("uses the One More Prompt silhouette in the Icon Composer source", () => {
    const composer = readFileSync(ICON_COMPOSER_SOURCE_PATH, "utf8")
    const source = readFileSync("src-tauri/icons/Icon.icon/Assets/one-more-prompt.svg", "utf8")
    expect(composer).toContain('"image-name" : "one-more-prompt.svg"')
    expect(composer).not.toContain("dashboard-3-line")
    expect(source).toContain("currentColor")
    expect(source).toContain("M 205.6 86.6 A 88 88 0 1 0 205.6 169.4")
    expect(source).toContain("M 190 112 L 208 128 L 190 144")
    expect(source).not.toContain("#F5572F")
  })

  it("keeps the browser document title aligned with the public app name", () => {
    const index = readFileSync(INDEX_PATH, "utf8")
    expect(index).toContain("<title>One More Prompt</title>")
  })

  it("does not ship legacy app icons for platform bundles", () => {
    for (const assetPath of appIconAssetPaths) {
      expect(legacyIconHashes.has(sha256(assetPath)), assetPath).toBe(false)
    }
  })

  it("does not keep the legacy green fill in the Icon Composer source", () => {
    expect(readFileSync(ICON_COMPOSER_SOURCE_PATH, "utf8")).not.toContain(LEGACY_GREEN_FILL)
  })
})
