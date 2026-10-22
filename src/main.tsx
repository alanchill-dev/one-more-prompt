import React from "react";
import ReactDOM from "react-dom/client";
import { error as logError, warn as logWarn } from "@tauri-apps/plugin-log";
import { App } from "./App";
import { AppErrorBoundary, reportFrontendError } from "./components/app/app-error-boundary";
import "./index.css";

// Forward console.error and console.warn to Tauri log file
function stringify(arg: unknown): string {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

const originalError = console.error;
console.error = (...args: unknown[]) => {
  originalError(...args);
  logError(args.map(stringify).join(" ")).catch(() => {});
};

const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  originalWarn(...args);
  logWarn(args.map(stringify).join(" ")).catch(() => {});
};

window.addEventListener("error", event => reportFrontendError(event.error));
window.addEventListener("unhandledrejection", event => reportFrontendError(event.reason));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement, {
  onCaughtError: reportFrontendError,
  onUncaughtError: reportFrontendError,
  onRecoverableError: reportFrontendError,
}).render(
  <React.StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>,
);
