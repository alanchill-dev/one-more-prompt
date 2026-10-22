import type { Plugin } from "vite"

export function guideNativeBridge(): Plugin {
  return {
    name: "guide-native-bridge",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/node_modules/@tauri-apps/api/") || !id.split("?")[0].endsWith(".js")) return
      // WebView2 injects immutable native globals into iframes; the guide owns a separate bridge.
      // shortcut: matches SDK expressions; rerun guide isolation tests when upgrading Tauri.
      return code
        .replace(/window\.__TAURI_INTERNALS__/g, "(window.__OMP_GUIDE_RUNTIME__?.core ?? window.__TAURI_INTERNALS__)")
        .replace(/window\.__TAURI_EVENT_PLUGIN_INTERNALS__/g, "(window.__OMP_GUIDE_RUNTIME__?.events ?? window.__TAURI_EVENT_PLUGIN_INTERNALS__)")
        .replace("!!(globalThis || window).isTauri", "(!window.__OMP_GUIDE_RUNTIME__ && !!(globalThis || window).isTauri)")
    },
  }
}
