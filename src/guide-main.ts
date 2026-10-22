import { memoryStorage } from "./components/guide/memory-storage"
import type { GuideInit } from "./components/guide/isolation"

// This document keeps its stores in memory before importing any workspace component.
Object.defineProperty(window, "localStorage", { value: memoryStorage() })
Object.defineProperty(window, "sessionStorage", { value: memoryStorage() })

function reportGuideError(error: unknown) {
  console.error("Guide initialization failed", error)
  window.parent.postMessage({ type: "omp-guide-error", message: "Guide initialization failed" }, "*")
  const root = document.getElementById("root")!
  root.replaceChildren()
  const section = document.createElement("section")
  section.setAttribute("role", "alert")
  section.style.cssText = "padding:40px;font:16px system-ui;color:white;background:#242321;height:100vh"
  const message = document.createElement("p")
  message.textContent = "Unable to open the guide. Please retry or return to your workspace."
  const retry = document.createElement("button")
  retry.textContent = "Retry"
  retry.onclick = () => window.location.reload()
  const exit = document.createElement("button")
  exit.textContent = "Return To Workspace"
  exit.style.marginLeft = "20px"
  exit.onclick = () => window.parent.postMessage({ type: "omp-guide-exit", finished: false }, "*")
  section.append(message, retry, exit)
  root.append(section)
}

async function start(init: GuideInit) {
  const { guideInvoke } = await import("./components/guide/isolation")
  const { hourlyPoints, quotaFixture } = await import("./lib/guide-demo/fixtures")
  Object.defineProperty(window, "__OMP_GUIDE_RUNTIME__", {
    configurable: true,
    value: {
      core: {
        invoke: guideInvoke(quotaFixture, init.modelPalette, hourlyPoints),
        transformCallback: () => 1,
        unregisterCallback: () => {},
      },
      events: { unregisterListener: () => {} },
    },
  })
  const { renderGuide } = await import("./components/guide/workspace")
  renderGuide(init)
}

async function initialize() {
  const { readGuideInit } = await import("./components/guide/isolation")
  const receive = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const init = readGuideInit(event.data)
    if (!init) return
    window.removeEventListener("message", receive)
    void start(init).catch(reportGuideError)
  }
  window.addEventListener("message", receive)
  window.parent.postMessage({ type: "omp-guide-ready" }, "*")
}
void initialize().catch(reportGuideError)
