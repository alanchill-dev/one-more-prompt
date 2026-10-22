const { cpSync, existsSync, mkdirSync, rmSync } = require("fs")
const { join } = require("path")

const root = __dirname
const srcDir = join(root, "plugins")
const dstDir = join(root, "src-tauri", "resources", "bundled_plugins")
const plugins = ["codex"]
const runtimeFiles = ["plugin.json", "plugin.js", "icon.svg"]

rmSync(dstDir, { recursive: true, force: true })

for (const id of plugins) {
  const source = join(srcDir, id)
  if (!existsSync(source)) {
    throw new Error(`Required bundled plugin is missing: ${source}`)
  }

  const destination = join(dstDir, id)
  mkdirSync(destination, { recursive: true })
  for (const file of runtimeFiles) {
    const sourceFile = join(source, file)
    if (!existsSync(sourceFile)) {
      throw new Error(`Required bundled plugin file is missing: ${sourceFile}`)
    }
    cpSync(sourceFile, join(destination, file))
  }
}

console.log(`Bundled ${plugins.length} plugins: ${plugins.join(", ")}`)
