# Getting Started

One More Prompt opens a short setup window the first time you launch it on macOS or Windows.
The first three-screen setup must be completed before its replay can be skipped. After
completion, manually launching the app opens its main window, including when
it is already running in the tray. When a new version has release notes to show,
those appear first. Launch At Login keeps the completed app in the background;
use the menu-bar or taskbar icon to open it. Enabled startup entries refresh
to the current executable path whenever the release app opens. Paths with
spaces or non-ASCII characters are preserved; macOS also escapes characters
such as `&` in its login configuration. Reopening an enabled app repairs an older
malformed entry. A disabled startup setting stays disabled.
On Windows, a missing startup key or app entry is treated as disabled; enabling
Launch At Login creates the app's current-user entry when needed.

The tray menu's **Open One More Prompt** action always shows the window,
including when it is already open and pinned. Clicking the tray icon itself
keeps its normal show/hide behavior.

An upgrade copies older app data only when the new location does not exist.
If copying fails, the original data stays intact and the incomplete temporary
copy is removed. The app explains the startup problem instead of opening with
partial data. Check disk space and access to the app-data folder, then reopen it.

## First Launch

Setup starts with a dedicated language selection screen. Continue saves your
choice before opening the Codex-check welcome, followed by the local-record
results. The same language is used in setup, the workspace and the guide.
It reads aggregate Prompt and Session counts;
setup does not display or send Prompt text. Detecting a local sign-in file does
not prove that online account access is valid.

After the check finishes, **Open Workspace** completes first setup and offers
an optional hands-on guide in the main window. Choose **Start Guide** or explore
on your own. The guide uses separate demo data, so it works without Codex sign-in
or local history. An unavailable scan stays distinct from an empty history, and
**Retry** remains available.

All nine supported languages include localized demo projects, conversations,
Prompts and agent descriptions; the example usage totals stay the same.

The guide has three stages and 20 steps:

1. Read today's hourly activity and account limits, switch to 30 days, and try
   Model Palette and API Valuation. Identify a busy day, then use its Projects
   action.
2. Learn the three-column layout, select a Session and read the Project and
   Session summaries. Select a Prompt, then examine its original text, timing,
   Token totals and agent contributions separately.
3. Open Timeline, understand its layout, move and resize the orange time range,
   and select the same Prompt in its Session lane.

Reading steps use **Continue**. Action steps enable **Next** after you perform the
requested operation, with a checkmark inside **Next** or **Finish Guide** to show
completion instead of a separate status label. The Projects action begins that
page's introduction when navigation completes. **Back** keeps completed operations.
Each card gives one short instruction beside the highlighted control.
The required control and related detail card stay clear; other areas remain
dimmed while steps and pages change. During a drag, the instruction stays
still while the highlight follows the control. Move the frame or drag its right
triangle in either direction; the chart stays clear and the instruction card stays
out of the main plot so you can see the movement and zoom. Left and Right arrow
keys also work when the range or right handle has focus.
Unrelated hover previews stay closed during the peak-day introduction and
Timeline drag lessons. Model Palette is introduced with the 30-day chart visible.
Choose a color slot, adjust its color, and press **Apply** to complete that step.
Color changes preview on the chart immediately; Apply keeps them for the current
practice session, without changing your saved palette. Leaving this step closes
the palette and discards any changes you have not applied.
The Project introduction outlines the full visible three-column workspace.
Before Timeline's final selection step, the guide brings the example Prompt back
into view even if you moved or narrowed the time range away from it.
Switching to another app leaves the guide at its current step and keeps the
window available. **Skip Guide** in a card's upper-right corner, **Escape**, or
completing the guide returns to your unchanged workspace, including its filters,
selections and scroll position. Skipping exits directly without a confirmation.
Demo operations do not change Codex records, account limits or saved preferences.
On Windows, the guide uses its own demo connection without replacing the app's
native connection. Replaying it needs no sign-in, data reset or security change.

Overview starts with **Today**. You can change that range in the chart controls.
The guide begins with today's hourly chart and asks you to compare 30 days.
Its practice clock is set to 17:40 on the current day, with varied hourly and
monthly activity to explore even if your own history is empty. Timeline practice
records span the full day, so moving the range reveals activity beyond the middle
of the day.

First setup has no **Skip Setup**. Escape or closing its window cannot mark it
complete. Quitting before completing the results screen returns to setup on the
next launch. Setup completion does not require finishing the optional guide.

The check reports its real stages: waiting for another local scan, finding records,
checking record files, and organizing results. Once the file count is known, the
bar shows the checked-file percentage and the actual checked/total counts.
Files validated through the cache also count as checked. The percentage measures
files, not remaining time: a large file can take longer than a small one. After
all files are checked, organizing the results must still finish before opening
the workspace is enabled. No percentage advances on a timer. Elapsed time and a
message after 15 seconds explain longer waits. Returning to the Codex-check welcome
stops that display; a new check starts its progress and timer again.

Settings → Support → Troubleshooting provides two separate entries:

- **Replay Guide** opens the guide's introduction directly in the main window.
  Every replay starts from the introduction; there is no saved guide progress.
- **Recheck Codex** opens the local-record and sign-in configuration check.
  It does not start the guide. After first setup, **Skip Setup** is available.
  The check window opens before the main window hides; if opening it fails,
  Settings stays available and shows an error.

Records and preferences stay intact; no app-data reset is needed.

English is the default on a fresh install. English, Traditional Chinese,
Simplified Chinese, Japanese, Korean, Spanish, Brazilian Portuguese, German,
and French are available in both setup and Settings. Existing installs keep
their saved language. The window follows the saved light, dark, or system
appearance. Quota names, remaining values, and reset times
follow the same saved language. Notification permission and start-at-login are not requested during
first launch; both remain available later in Settings.

## Codex

Sign in to Codex and create at least one local session. One More Prompt detects the existing Codex data
automatically. There is no provider picker or API-key setup.

Codex reading is always enabled. One More Prompt checks on launch and continues
at your chosen update interval, including while its window is hidden. Older
disabled-source settings are repaired automatically. Missing sign-in or a
temporary connection failure does not turn off later checks; sign in through
Codex and the next check can use that sign-in. Local Prompt records are not
required to read available account limits.

Codex manages its own sign-in. One More Prompt reads those credentials without
changing them. If access expires, open Codex and sign in there; subsequent checks
can use the newer sign-in without replacing your local history.

You can open the app before Codex has any local records. Overview, Projects,
and Timeline explain how to start: open Codex in a terminal or editor on this
computer, start a session, and send a prompt. **Check For Records** checks again
so your usage, projects, and prompt history can appear. Your prompt history
stays on this computer.

When checking again from an empty Overview, the instructions stay visible and
the button shows **Checking For Records...** until the check finishes. Initial
loading, expired-session or connection errors, and filters with no matching
prompts keep their own messages. The expected initial Codex sign-in request
also shows preparation instructions when there are no records to display;
sign in through Codex, then check again. This does not confirm whether any
history exists. Available account limits and activity remain visible.

On Windows, the standard Codex sign-in stores everything One More Prompt needs
under your user profile. Extract the complete Windows ZIP and open `one-more-prompt.exe`;
there is no PowerShell, manual credential copy, or configuration step.

Keep the extracted files together. The ZIP makes the application folder easy to
move; settings and cache still use the normal per-user data location. Quit the
app before replacing its folder with a newer version. Turn off start-at-login
before moving that folder, then enable it again from the new location if needed.
To remove it, turn off start-at-login, quit from the tray, and run
`remove-notification-registration.cmd` before deleting the extracted folder.
The cleanup tool leaves app data and Codex records intact.

Windows needs the [Microsoft WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/#download-section).
It is not bundled or installed automatically. If it is missing, install it from
Microsoft and reopen the app. The app registers its notification name and icon
for the current user without an installer. In **Settings → Menu Bar & Quick Open
→ Usage Alerts**, use **Test Notification** to check delivery. See
[Usage Alerts](notifications.md) for permissions and Windows notification limits.

If you deliberately changed Codex from its standard file-based credential
storage to Windows Credential Manager, switch it back to the standard setting
before using this app. Automatic Credential Manager support is still in
progress.

## Useful Details

- Above the Overview total, switch **Tokens / API Valuation** to compare
  recorded volume and its API-equivalent value. The selected period and model
  colors stay the same. The total, average, peak, chart, model shares and hover
  readout change together. A dash means a price is unavailable. Hover or focus a
  day/hour to see whether its estimate is partial. These amounts are references,
  not your bill.

- Hover usage labels, warnings, and reset information to see extra detail.
- Click reset times to switch between countdown and exact time.
- Click the available count under **Rate Limit Resets** to see each available reset and its expiration. **History** shows resets received and used over the past 30 days, using Codex's recorded event times. Dates follow your app language and local time zone. If Codex cannot provide details or history, the dialog says so; opening it does not use a reset.
- When Codex reports both account-level limits, macOS Settings offers the default Dual Line menu-bar style with `5H` above `7D`. Weekly-only accounts keep the compact single-line styles.
- Use the centered **Overview**, **Projects**, and **Timeline** navigation to switch workspaces. Projects browses projects, sessions, and prompt details; Timeline explores the same records by time. The newest session is selected initially, but prompt details stay closed until you open one. New local prompts appear without replacing your current selection. Returning from another page restores your search, sort, selection, open details, and scroll position. Running Codex work rotates the Header Logo and, on macOS, the menu-bar glyph and shows an activity indicator on its project or expanded session; Activity Rotation can be set to Slow, Standard, or Fast. System animation preferences do not stop these signals.
- Open a prompt to read its full text with its original line breaks, lists, code, and links. Automatically supplied Codex browser/Page context is hidden; skill and plugin references appear by name. Copy Prompt includes the complete authored text.
- In Settings → General, click the next-update countdown when you need to refresh before the scheduled update.
- On Windows, Settings offers Numbers, Donut and Bars. Numbers shows the selected Primary Metric as an orange integer, using a darker orange on a light taskbar and a brighter orange on a dark taskbar. The icon omits the percent sign to keep the digits large; hover it to read complete percentages for both account limits. The number stays still and visible while work runs, and running indicators continue inside the app. Use the tray icon beside the taskbar to open the panel. See the
  [Windows maintainer test checklist](windows-portable-test.md) only when validating a release.
- Use **Pin Window** in the header when you want the panel to behave like a movable normal window. Other apps can cover it, and **Unpin Window** restores the usual click-outside-to-hide tray behavior.

If a frontend view fails to render, the app displays **Reload App** instead of an
empty view. Logs record the error category and component location without adding
Prompt text or credentials. A native process crash is a separate failure.

## App Updates

The small update icon immediately left of **Settings** shows a dot when a newer
stable release is ready for your platform. Activate it to see the version and
open its download or release notes. **Check for Updates** in Settings checks
manually; automatic checks run when the app is first visible, every six hours
while visible, and on focus or resume when a check is due.

Checking does not send Codex sign-in data or local history. A missing public
release says it has not been published yet; network failures can be retried.
Download externally, quit, then replace the app or complete Windows folder.
Preferences and local product data are retained. See [Update Help](updates.md).
