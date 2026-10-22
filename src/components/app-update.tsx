import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { ArrowCircleDown, ArrowSquareOut, ArrowsClockwise, CheckCircle, WarningCircle, X } from "@phosphor-icons/react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/hooks/use-i18n"
import { useAppUpdateStore } from "@/stores/app-update-store"
import { version as packageVersion } from "../../package.json"
import "./app-update.css"

function AppUpdateContent({ appVersion }: { appVersion: string }) {
  const t = useI18n()
  const { result, checking, error, check } = useAppUpdateStore()
  const [openFailed, setOpenFailed] = useState(false)
  const available = result?.status === "available"
  const downloadUrl = result?.downloadUrl
  const releaseUrl = result?.releaseUrl
  const status = checking ? t("updates.checking")
    : error ? t("updates.failed")
      : available ? t("updates.available")
        : result?.status === "upToDate" ? t("updates.upToDate")
          : result?.status === "notPublished" ? t("updates.notPublished")
            : t("updates.idle")

  const openExternal = async (url: string) => {
    setOpenFailed(false)
    try {
      // The native checker only returns HTTPS URLs from the app's GitHub repository.
      await openUrl(url)
    } catch (error) {
      console.error("Failed to open app update link:", error)
      setOpenFailed(true)
    }
  }

  return <div className="app-update-content" aria-busy={checking}>
    <p className="app-update-status" role={error ? "alert" : "status"}>
      {checking ? <ArrowsClockwise aria-hidden="true" className="app-update-spinner" size={17} />
        : error ? <WarningCircle aria-hidden="true" size={17} />
          : result?.status === "upToDate" ? <CheckCircle aria-hidden="true" size={17} /> : null}
      <span>{status}</span>
    </p>
    <dl className="app-update-versions">
      <div><dt>{t("updates.current")}</dt><dd>{result?.currentVersion ?? (appVersion || packageVersion)}</dd></div>
      {result?.latestVersion && <div><dt>{t("updates.latest")}</dt><dd>{result.latestVersion}</dd></div>}
    </dl>
    <div className="app-update-controls">
      {available && downloadUrl && <Button className="app-update-download" onClick={() => void openExternal(downloadUrl)}>
        {t("updates.download")} <ArrowSquareOut aria-hidden="true" size={16} />
      </Button>}
      <Button variant="outline" disabled={checking} onClick={() => void check()} className="app-update-check">
        <ArrowsClockwise aria-hidden="true" size={16} className={checking ? "app-update-spinner" : undefined} />
        {checking ? t("updates.checking") : error ? t("updates.retry") : t("updates.check")}
      </Button>
      {releaseUrl && <Button variant="ghost" onClick={() => void openExternal(releaseUrl)}>
        {t("updates.notes")} <ArrowSquareOut aria-hidden="true" size={16} />
      </Button>}
    </div>
    {openFailed && <p role="alert" className="app-update-error">{t("updates.openFailed")}</p>}
    {available && <p className="app-update-instructions">{t("updates.replace")}</p>}
  </div>
}

export function AppUpdateButton({ appVersion = "" }: { appVersion?: string }) {
  const t = useI18n()
  const result = useAppUpdateStore((state) => state.result)
  if (result?.status !== "available") return null
  const label = t("updates.availableLabel", { version: result.latestVersion ?? "" })

  return <Popover.Root>
    <Popover.Trigger aria-label={label} title={label} className="header-nav-key app-update-trigger" data-has-update="true">
      <ArrowCircleDown aria-hidden="true" size={20} className="header-nav-key-icon" />
      <span className="app-update-dot" aria-hidden="true" data-testid="app-update-dot" />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner side="bottom" align="end" sideOffset={12} collisionPadding={16} className="z-[110]">
        <Popover.Popup className="app-update-popup">
          <div className="app-update-heading">
            <Popover.Title>{t("updates.title")}</Popover.Title>
            <Popover.Close aria-label={t("updates.close")} className="app-update-close"><X aria-hidden="true" size={17} /></Popover.Close>
          </div>
          <AppUpdateContent appVersion={appVersion} />
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
}

export function AppUpdateSettings({ appVersion = "" }: { appVersion?: string }) {
  return <div className="app-update-settings"><AppUpdateContent appVersion={appVersion} /></div>
}
