# Usage Alerts

One More Prompt can send a desktop notification when a usage limit drops below 10% remaining or a used session returns to 0% used. Alerts
are optional and are configured in **Settings → Menu Bar & Quick Open → Usage Alerts**.
First-run setup does not request notification permission or turn alerts on.
One More Prompt registers with the operating system notification service at startup. **Open Settings**
opens the matching macOS or Windows notification settings page.

The unsigned Windows portable ZIP registers its notification name and icon for
the current user; no installer is needed. The owner waived native Windows testing
for the 2026-10-08 candidate; actual toast delivery has not been observed on a
Windows machine. Clicking a notification does not launch the app.

Use **Test Notification** in Usage Alerts to check delivery without waiting for a
quota change or enabling an alert trigger. A successful send means the operating
system accepted the request, not that a notification appeared on screen.
Check One More Prompt's notification permission and Do Not Disturb if it does
not appear. Registration or send failures are reported instead of being hidden.
An alert whose send request fails is logged and retried on the next scheduled
refresh. A request accepted by Windows but hidden by its settings is not a
detectable send failure and is not repeatedly sent.

## The Triggers

| Trigger | Fires when |
|---|---|
| **Almost Out** | A limit drops below 10% remaining for the current window. |
| **Session Reset** | A session meter returns to 0% used after previous usage. |

Each trigger is independent — enable any combination. Turning all triggers off silences alerts entirely.

## How It Behaves

- **No repeated alerts.** A limit sitting at the same low remaining level does not re-alert on every
  refresh. A new reset window or a recovery followed by another drop re-arms the alert.
- **No launch spam.** The first reading after the app starts is recorded as a baseline without firing,
  so a limit that's already high when you open the app doesn't immediately alert.
- **Exhausted limits stay quiet.** The existing alert rules suppress alerts once a metric reaches 99-100% used.
- **Recovery re-arms.** If remaining quota recovers to 10% or more, a later drop below 10% can alert again.
- **Session reset alerts only fire at 0%.** A session reset alert fires when the session goes back to
  0% used, not when it partially recovers.
- **Every Codex limit.** "Almost Out" also applies to meters without a reset window, such as a remaining credit balance.
- **Actual readings only.** Exhaustion forecasts, pace indicators, and prediction-based alerts are no longer available.

Evaluation runs on each scheduled refresh, so alerts fire even while the panel is closed.

## Notes

- Alerts are best-effort: notification permission, Do Not Disturb, or operating
  system policy can block or suppress delivery. Grant permission in system settings.
- Open **Settings → Menu Bar & Quick Open → Usage Alerts** in One More Prompt and enable the alerts you want.
  If the operating system still blocks delivery, use **Open Settings** and allow One More Prompt.
- Trigger choices persist across restarts. The per-metric "already alerted this window" memory is
  in-memory and resets when the app restarts (which is why the first post-launch reading only baselines).
- On Windows, keep the extracted `icons` folder beside `one-more-prompt.exe`. Moving or
  replacing the complete folder refreshes the icon path on the next launch.
  An enabled **Launch At Login** registration also refreshes to the current
  executable path when the release app opens; its saved setting is preserved.
  Disable **Launch At Login** before moving it, then enable it from the new path.
- To remove the Windows app, disable **Launch At Login**, quit from the tray,
  run `remove-notification-registration.cmd` from the extracted folder, and delete
  that folder after cleanup succeeds. The tool refuses while `one-more-prompt.exe` is
  running and removes only this app's current-user notification registration.
  Settings, cache, Codex records, and startup settings are preserved.
