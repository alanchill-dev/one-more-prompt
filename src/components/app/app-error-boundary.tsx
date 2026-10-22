import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/hooks/use-i18n"

export function reportFrontendError(error: unknown, info?: { componentStack?: string | null }) {
  // Error messages and causes can contain Prompt text or credentials.
  console.error("Frontend Error", {
    type: error instanceof Error || error instanceof DOMException ? error.name : "NonErrorThrow",
    componentStack: info?.componentStack ?? null,
  })
}

function AppErrorFallback() {
  const t = useI18n()
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-10 text-foreground">
      <section role="alert" className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">{t("appError.title")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("appError.description")}</p>
        <Button type="button" autoFocus className="mt-6 min-h-11 cursor-pointer" onClick={() => window.location.reload()}>
          {t("appError.reload")}
        </Button>
      </section>
    </main>
  )
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <AppErrorFallback /> : this.props.children
  }
}
