import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FocusTrapDialog } from "@/components/ui/focus-trap-dialog"
import { MILESTONE_META, PACE_MILESTONES } from "@/lib/pace-notifications"
import type { PaceNotificationSettings } from "@/lib/settings"
import { useAppNotificationsStore } from "@/stores/app-notifications-store"
import { useI18n } from "@/hooks/use-i18n"

// The toggles map 1:1 onto the milestone keys, in urgency order.
const MILESTONE_KEYS: (keyof PaceNotificationSettings)[] = PACE_MILESTONES

type NotificationsSectionProps = {
  triggerLabel?: string
}

export function NotificationsSection({ triggerLabel }: NotificationsSectionProps = {}) {
  const t = useI18n()
  const settings = useAppNotificationsStore((s) => s.settings)
  const setToggle = useAppNotificationsStore((s) => s.setToggle)
  const hydrate = useAppNotificationsStore((s) => s.hydrate)
  const [showNotificationsDialog, setShowNotificationsDialog] = useState(false)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<"submitted" | "failed" | "settingsFailed" | null>(null)
  const nativeNotifications = isTauri()

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const handleToggle = (key: keyof PaceNotificationSettings, checked: boolean) => {
    setToggle(key, checked)
    // macOS never shows a permission prompt for Tauri apps, and notifications can default to off — so
    // remind the user to allow them in System Settings when they turn a trigger on.
    if (checked && isTauri()) {
      setShowPermissionModal(true)
    }
  }

  const handleTestNotification = async () => {
    if (!nativeNotifications || isTesting) return
    setIsTesting(true)
    setTestStatus(null)
    try {
      await invoke("send_pace_notification", {
        title: t("notifications.testTitle"),
        body: t("notifications.testBody"),
      })
      setTestStatus("submitted")
    } catch (error) {
      console.error("Failed to send test notification:", error)
      setTestStatus("failed")
    } finally {
      setIsTesting(false)
    }
  }

  const handleOpenSettings = async () => {
    if (!nativeNotifications) return
    try {
      await invoke("open_notification_settings")
    } catch (error) {
      console.error("Failed to open notification settings:", error)
      setTestStatus("settingsFailed")
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10 cursor-pointer rounded-[10px] bg-background/70 px-3"
        onClick={() => setShowNotificationsDialog(true)}
      >
        {triggerLabel ?? t("notifications.title")}
      </Button>

      {showNotificationsDialog && (
        <FocusTrapDialog
          label={t("notifications.title")}
          focusableSelector={'[role="checkbox"], button:not(:disabled)'}
          onClose={() => {
            if (!showPermissionModal) setShowNotificationsDialog(false)
          }}
        >
          <h2 className="text-lg font-semibold mb-3">{t("notifications.title")}</h2>
          <div className="space-y-3">
            {MILESTONE_KEYS.map((key) => {
              const meta = MILESTONE_META[key]
              return (
                <div key={key}>
                  <label className="flex items-center gap-2 text-sm select-none text-foreground">
                    <Checkbox
                      key={`notif-${key}-${settings[key]}`}
                      checked={settings[key]}
                      onCheckedChange={(checked) => handleToggle(key, checked === true)}
                    />
                    {meta.label}
                  </label>
                  <p className="pl-6 text-xs text-muted-foreground">{meta.tooltip}</p>
                </div>
              )
            })}
          </div>
          <div className="mt-4 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!nativeNotifications || isTesting}
                onClick={() => void handleTestNotification()}
              >
                {t(isTesting ? "notifications.testing" : "notifications.test")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!nativeNotifications}
                onClick={() => void handleOpenSettings()}
              >
                {t("notifications.openSettings")}
              </Button>
            </div>
            {!nativeNotifications && (
              <p className="mt-2 text-xs text-muted-foreground">{t("notifications.nativeOnly")}</p>
            )}
            {testStatus && (
              <p
                role={testStatus === "submitted" ? "status" : "alert"}
                className={`mt-2 text-xs ${testStatus === "submitted" ? "text-muted-foreground" : "text-destructive"}`}
              >
                {t(testStatus === "submitted" ? "notifications.testSubmitted" : testStatus === "failed" ? "notifications.testFailed" : "notifications.settingsFailed")}
              </p>
            )}
          </div>
        </FocusTrapDialog>
      )}

      {showPermissionModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPermissionModal(false)
          }}
        >
          <div className="bg-card rounded-lg border shadow-xl p-5 max-w-xs w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-base font-semibold mb-1">{t("notifications.allowTitle")}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t("notifications.allowDescription")}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowPermissionModal(false)}>
                {t("notifications.done")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  void handleOpenSettings()
                  setShowPermissionModal(false)
                }}
              >
                {t("notifications.openSettings")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
