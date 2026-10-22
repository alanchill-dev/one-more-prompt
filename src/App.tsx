import { lazy, Suspense, type ReactNode } from "react"
import { MainApp } from "@/components/app/main-app"
import { useI18n } from "@/hooks/use-i18n"

const OnboardingApp = lazy(() =>
  import("@/components/onboarding/onboarding-app").then((module) => ({ default: module.OnboardingApp }))
)
const WhatsNewApp = lazy(() =>
  import("@/components/whats-new/whats-new-app").then((module) => ({ default: module.WhatsNewApp }))
)

function DeferredRoute({ children }: { children: ReactNode }) {
  const t = useI18n()
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center">{t("common.loadingView")}</main>}>
      {children}
    </Suspense>
  )
}

function App() {
  const hash = window.location.hash
  if (hash === "#/setup") return <DeferredRoute><OnboardingApp /></DeferredRoute>
  if (hash === "#/whats-new") return <DeferredRoute><WhatsNewApp /></DeferredRoute>
  return <MainApp />
}

export { App }
