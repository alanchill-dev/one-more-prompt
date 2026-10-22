# Windows Portable Maintainer Testing

This is the maintainer acceptance checklist. The normal user path is to download
the x64 ZIP, extract the complete folder, and open the app.

## Selected Release Policy

The selected distribution is an unsigned x64 portable ZIP, with no installer
or self-signing. Settings and cache stay in normal per-user app data, rather
than travelling with the ZIP. Build and verify locally; manually upload only
after final publication approval. GitHub Actions is not used.

Public packages are hosted in `alanchill-dev/one-more-prompt`; v1.0.0 is the
first formal release. Record native results against each package checksum.
A Windows ARM virtual-machine smoke check does not prove Windows x64 acceptance.

Disclose unsigned status and possible SmartScreen warnings. Some Windows
security policies can block unsigned apps; record the observed result rather
than claiming that every machine will launch it.

## Prepare the Candidate

- Use a clean Windows x64 account without the repository, Rust, Bun, or build tools.
- Record the Windows edition, version, architecture, and WebView2 availability.
  Test each Windows version advertised in the Release notes.
- Use the locally verified `One-More-Prompt-<version>-windows-x64-portable.zip`
  and `SHA256SUMS-windows.txt`. After publication, repeat checks with downloads
  from the same GitHub Release.
- Inspect the ZIP for the app, icons, Codex plugin, unchanged `LICENSE` and
  `NOTICE`, and `remove-notification-registration.cmd`. Reject
  private paths, credentials, session records, logs, developer source, or build tools.

Verify the candidate in PowerShell from its download folder:

```powershell
Get-FileHash .\One-More-Prompt-*-windows-x64-portable.zip -Algorithm SHA256
Get-Content .\SHA256SUMS-windows.txt
```

The ZIP's SHA-256 must match the manifest. Record the result without attaching
Codex session files, Prompt text, or credentials.

## Extract and Launch

1. Extract the complete ZIP into a stable folder writable by the current user.
   Test a path containing spaces and non-ASCII characters.
2. Keep the runtime files and bundled plugin beside `one-more-prompt.exe`. Run that app
   from the extracted folder, rather than from inside the archive.
3. Record any unknown-publisher, SmartScreen, WebView2, or missing-runtime message.
   A missing DLL or blank window is a failure. No administrator access should be
   needed for the app folder; record any separate runtime installation requirement.
   WebView2 is not bundled or installed automatically. When missing, use the
   [official Microsoft download](https://developer.microsoft.com/microsoft-edge/webview2/#download-section)
   and relaunch; do not change global security settings to pass this check.
4. Test both an account with no Codex records and one using standard file-based
   Codex sign-in. With no records, Overview, Projects, and Timeline show
   **Ready For Your First Codex Session** and **Check For Records**. Verify the
   action checks again; empty Overview keeps its instructions visible with a
   disabled **Checking For Records...** button while checking. Initial loading
   and parsing, expired-session, network, or read errors stay separate. The
   expected initial Codex sign-in request shows the same preparation instructions
   only when no records can be displayed; existing records keep their sign-in
   warning. Real local records must appear without manual credential copying.

5. Upgrade an existing test profile whose saved Codex source was disabled.
   Without changing its sign-in or deleting its data, confirm the app restores
   Codex reading on launch, shows the next-update countdown instead of Paused,
   and displays the real account quota in the tray after a successful check.
   Close and reopen the panel and relaunch the app to confirm it stays active.
   A profile without sign-in must keep its normal sign-in message and continue
   checking at the selected interval; do not treat that message as a passed
   account-quota check.

## Setup Completion Without Guide Completion

With only legacy setup or guide completion records, replace the app folder and
launch normally. The three-screen setup must open without a reset helper and has
no Skip. Complete the local check with no records and choose Open Workspace:
setup completes and offers the optional three-stage, 20-step demo guide.
Start Guide works without sign-in or real history; exploring on your own opens
the empty workspace. Relaunch and confirm setup does not repeat, regardless of
guide completion. In Settings → Support → Troubleshooting, Recheck Codex can
Skip Setup and never starts the guide; Replay Guide starts at its introduction.
Compare existing records and preferences; neither should be reset.

## Synthetic UI Testing Without Codex

For UI checks, Windows only needs the extracted app and WebView2. Prepare the
synthetic pack on the Mac; do not install Codex or copy any real account data:

```sh
node scripts/windows/prepare-qa-fixture.mjs /path/to/new-fixture-folder
```

Copy that folder to Windows separately from the release ZIP. Quit One More Prompt
from its tray menu, then open Command Prompt in the fixture folder:

```bat
qa.cmd Prepare
qa.cmd Launch "C:\path\one-more-prompt.exe"
```

Prepare uses the Windows clock to create one sample project, three sessions and
three prompts over three days (4,800 tokens total, 1,600 today). It backs up the
existing settings, quota cache, Codex prompt index and both setup markers before
changing them. The sample quota has 75% Session and 60% Weekly remaining. Numbers
mode starts with the Session value; selecting Weekly should show `60` in the icon and `60%` in its tooltip.

Check Prompt selection, running circles, Overview chart drill-down, and page
transitions using the fixture. **Recheck Codex** checks the sample records;
**Replay Guide** opens the separate built-in 20-step demo guide. With the app open,
these commands exercise its local file watcher:

```bat
qa.cmd Complete
qa.cmd Start
```

Complete ends the current sample turn. Start appends a fresh sample turn without
inventing additional token usage. Check the circles stop and restart while the
tray keeps its quota number. Record screenshots and the exact candidate checksum;
the fixture does not alter the executable.

After testing, quit the app and restore the original files:

```bat
qa.cmd Restore
```

Prepare, Launch and Restore refuse while the app is running. Restore retains test
output beside the pack instead of deleting it. Keep the backup until restoration
succeeds, and generate a new pack for another test run. The helper changes no
credentials, registry keys, execution policy or permanent environment variables.
Its synthetic `CODEX_HOME` is inherited only by the launched app. The app's normal
per-user notification registration still runs as usual.

Missing Codex sign-in errors remain visible, and the saved refresh interval is
preserved. These checks prove UI behavior with synthetic data; they do not prove
real account limits, Codex sign-in, or live Codex process detection. Test the empty
state separately before Prepare or after Restore.

## Optional Automated Guest Runner

The maintainer-only `scripts/windows/run-guest-qa.cmd` runner records app crops,
bounded UI Automation results, and fixture restoration checks. Copy the `.cmd`
and matching `.ps1` together beside the prepared fixture pack. It uses the
current account's `fixture` folder and `app.zip` beside the runner by default;
provide other locations explicitly. Run `qa.cmd Prepare` first and quit the app.

Pass the candidate's reviewed ZIP SHA-256 and the executable SHA-256 from the
verified extracted package. The runner refuses missing or malformed hashes:

```bat
run-guest-qa.cmd -FixtureRoot "C:\qa\fixture" -CandidateZip "C:\qa\app.zip" -ExpectedZipSha256 "<64 hex digits>" -ExpectedExeSha256 "<64 hex digits>"
```

Windows PowerShell 5.1 and the account's normal permission to run local scripts
are required; the launcher does not change execution policy. The runner never
stops an unrelated running copy. To permit stopping a known test copy, provide
its exact executable path with `-PreviousExe "C:\qa\previous\one-more-prompt.exe"`.

Evidence stays in a new `guest-results-*` folder beside the runner unless
`-OutputDir` names another new folder. It includes app/tray images, so review
those images before sharing. No evidence is uploaded by default. A maintainer
may explicitly supply `-ResultUrl "http://127.0.0.1:8765/results"` for a trusted
local receiver. Only literal loopback/private-network IPs are accepted, and
redirects are refused; the ZIP remains available locally if the upload fails.
A report requiring image review does not count as visual or native acceptance.
Run `pwsh -NoProfile -File scripts/windows/test-guest-qa.ps1` from the repository
to check the script syntax, candidate checksums, known-process protection, and
local-receiver restrictions without opening an app or sending evidence.

## Native Acceptance Checklist

- From Settings, open **Replay Guide**, start its introduction, then exit and
  replay it again. It must load its demo workspace without an initialization
  error. Try Model Palette and a Prompt detail, then return to Settings and
  confirm real records, navigation and saved preferences remain unchanged.
- First launch opens language selection before the Codex-check page. Select a
  language, continue through the three-screen setup, and open the guide. Its
  interface, projects, Sessions, Prompts and agent descriptions must use the same
  language. Repeat with all nine languages; a language-save error must block
  progression and allow retry. First setup has no Skip Setup.
  Escape and the native close action cannot bypass it. Verify waiting, discovery,
  file checking, and result organization. Once known, real checked/total counts
  include cache-validated files, and the percentage never advances on a timer.
  Open Workspace stays disabled until organization finishes, even when every
  file is checked. Empty history and scan failure remain distinct; Retry is available.
  Open Workspace completes setup and offers the optional demo guide in either case.
- Complete all 20 guide steps across Overview, Projects, and Timeline, including
  without Codex sign-in or real records. Reading steps use Continue; action steps
  enable Next or Finish Guide after the requested demo operation. Back retains
  completed operations. Skip Guide, Escape, and completion restore the workspace's
  filters, selections, and scroll position without changing real data or saved
  preferences. Overview starts with Today. With Windows
  Animation Effects turned off, the guide, chart, page transitions and running
  indicators still animate; every guide step still waits for user input.
- Supported languages, light/dark appearance, keyboard navigation and Retry
  work without showing Prompt text in setup. Quit before completing its result
  screen and relaunch: setup remains required. Completing that screen prevents
  setup from repeating, independently of guide completion. Recheck Codex opens
  a check with Skip Setup and never starts the guide. Replay Guide opens the
  introduction every time, with no saved guide progress. Repeat both entries
  once to check for a blank or frozen window.
- After setup and release notes have been dismissed, quit fully and manually
  launch the app from its extracted folder. The main window appears immediately,
  without a tray click. Start the executable again while it is running: the
  existing window appears and there remains one process and tray icon. Check
  both a hidden and already visible window; reopening never hides it. Clicking
  outside still hides an unpinned panel, and the tray reopens it. After the three-screen
  setup is complete, Launch At Login keeps the main window hidden.
- With the main window pinned and already visible, choose **Open One More Prompt**
  from the tray menu: it must remain visible. From a hidden state, the same action
  shows it. The tray icon's ordinary left-click keeps its show/hide behavior.
- Check Launch At Login from an initially disabled state, enable it, then disable
  it twice. An absent app entry is disabled rather than an error. Isolated registry
  tests cover a missing Run key; do not delete a shared Windows startup key to
  perform this manual check. Access-denied failures must remain visible.
- Numbers, Donut and Bars render inside the Windows square notification icon.
  Numbers uses bright orange on a dark Windows taskbar and deep orange on a light
  taskbar, following the Windows system appearance rather than the app theme.
  Change the Windows system appearance while the app is running and confirm the
  next tray refresh updates the text color. It shows the selected
  Primary Metric as a large integer, including 0 and 100. The percent sign remains
  in the tooltip and panel. Digits keep their natural proportions and have no outline.
  Rendering uses the Windows 16-pixel base size scaled for the display. Numbers stay
  visible during running work. The tooltip includes both available account limits.
  Check light/dark taskbars and display scaling for legibility. Running indicators
  still rotate inside the app.
- Left-clicking the tray icon opens the panel beside the taskbar. Clicking outside
  hides it, and clicking the icon opens it again. Check the taskbar positions and
  display scaling that will be advertised.
- Windows disables the extra system shadow and border on its transparent windows.
  Check the main panel, Setup and What's New against both light and dark desktop
  backgrounds: no second rectangular or translucent frame should surround the
  app's rounded surface. The main panel keeps its own rounded corners and shadow;
  the shared app shell omits the arrow on both Windows and macOS. Check reopening,
  pin/unpin and display scaling. Only Windows disables the extra native shadow
  and border; macOS retains its separate native window implementation.
- **Pin Window** keeps the panel open, permits moving it from the header, and lets
  other apps cover it. **Unpin Window** restores transient tray behavior.
- Overview shows available Codex limits, first-use instructions when there is
  no activity, or a clear credential/data error. Tokens/API
  Valuation preserves dates and model colors while updating the entire chart.
  Verify missing-price labels and saved currency.
- First-step guide target discovery works on older WebView2 without `:has()`.
  A frontend render error shows Reload App and produces sanitized diagnostics;
  a native WebView2 process crash remains a separate failure.
- Prompt Usage reads real local projects and sessions.
- The global shortcut opens and hides the panel.
- **Open Settings** opens Windows notification settings.
- Start-on-login follows the saved setting after signing out and back in.
  When enabled, opening the release app refreshes the registered executable path
  after a rename or move. Test a folder with spaces and non-ASCII characters:
  its Run value must quote the executable, retain `--background`, and start only
  this app at login. Disabling the setting must remove its registration.
- Quit exits the tray process; relaunch starts one copy.

## Notification Acceptance

1. In **Settings → Menu Bar & Quick Open → Usage Alerts**, use **Test Notification**
   with alert triggers off. Confirm the request is reported clearly without
   changing the saved trigger choices. A successful API request alone is not
   delivery evidence: inspect the toast or Notification Center.
2. Confirm the notification uses **One More Prompt** and the app's icon. Check the
   per-user `HKCU\SOFTWARE\Classes\AppUserModelId\com.alanchill.onemoreprompt`
   entry uses the current extracted icon path. No administrator access or
   installer should be needed. Clicking the notification is not a launch action.
3. Test notification permission disabled and Do Not Disturb enabled separately.
   Record whether Windows blocks, suppresses, or routes the toast to Notification
   Center. Confirm the app does not promise visible delivery when Windows accepted
   the request. Restore permission and turn Do Not Disturb off; test again.
4. With real Codex usage, verify each enabled alert trigger and that no alert is
   emitted simply by launching the app or refreshing the same low quota repeatedly.
   Alerts must still be evaluated when the panel is closed and the tray app runs.
5. Using a disposable account, make only this app's registration key read-only
   and relaunch to exercise registration failure. Confirm logs and
   **Test Notification** report the problem, then restore permissions and retest.
   Do not attach Prompt text or credentials to failure evidence.

## Release Check Acceptance

- When the app is first visible, verify an anonymous stable-release check.
  Repeat when six hours become due while visible, or on focus/resume if due,
  and use **Check for Updates** in Settings. Hidden windows do not continuously
  check in the background.
- Check equal, older, and newer semantic versions. Only a newer stable release
  with `One-More-Prompt-<version>-windows-x64-portable.zip` is offered.
- Confirm the compact icon directly left of Settings shows a status dot for an
  available update. Hover/focus and keyboard activation must work in all nine
  languages without moving the workspace tabs.
- A missing public release reports that nothing has been published yet; it must
  not say Up to Date. Offline, failed, and rate-limited checks remain explicit,
  and manual Retry can recover. No error may prevent local browsing.
- Download opens the trusted project-owned GitHub asset externally; release
  notes open its GitHub release page. No update installs itself or exits the app.
- Confirm requests contain no credentials, Prompt text, project/session names,
  or local records. Complete the live public-release path only after publication;
  mocks and local response tests do not prove that the public download exists.

## Upgrade and Removal

1. Record saved language, appearance, startup preference, and representative local
   product state. Quit the prior version fully.
2. Replace its application folder with the complete new extracted folder at the
   same location. Confirm settings and user data remain and one copy launches.
   For the application-identity migration, begin with a real prior-version test
   profile. Verify settings, pins, read markers, setup completion, caches, and
   startup behavior. Existing destination data takes priority; a failed copy
   must remain retryable and must never delete either source. Failed retries must
   not accumulate temporary app-data copies. A startup error must explain that
   the original data remains intact; normal setup must not open on partial data.
3. For a location change, turn off start-at-login before moving the folder, launch
   from the new location, then enable it again if needed. Sign out and back in to
   confirm the new path starts one copy. Confirm the registered icon path updates
   and **Test Notification** still uses the correct product name and icon.
4. To remove the app, first try `remove-notification-registration.cmd` while it
   runs: cleanup must refuse with a clear message and nonzero exit code. Turn off
   start-at-login, quit, run cleanup again, and confirm only the app's notification
   registration is removed. Repeating cleanup with the key absent must succeed.
   Move the extracted folder to the Recycle Bin only after successful cleanup.
   There is no installer entry to uninstall from Windows Settings. Confirm no
   startup entry points to the removed executable.
5. Confirm removal leaves normal per-user app data and Codex source records
   intact. Deleting user data is a separate action, not part of this checklist.

## Record the Result

Record candidate filename, checksum, Windows version, WebView2 state, extraction
path, security warnings, and each failed item. Native launch, tray, notification
delivery, startup, upgrade, and removal must pass before claiming supported
Windows distribution. Cleanup must leave other notification registrations and
operating-system settings unchanged.

Known boundaries:

- The selected package is unsigned Windows x64 only.
- Windows requires the WebView2 runtime. Verify its availability or the documented
  installation requirement on each tested machine.
- Native acceptance is specific to the tested package checksum. Record unfinished
  checks and any explicit owner-accepted limitation; never treat either as a pass.
  Notification permission and Do Not Disturb can prevent visible delivery.
  Click-to-launch is not supported.
- Custom Windows Credential Manager storage is not yet supported; this candidate
  relies on standard file-based Codex sign-in.
- Build and archive verification do not complete native Windows acceptance.
- macOS releases still require local Developer ID signing and Apple notarization.

References: [Microsoft notifications for unpackaged apps](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/modernize-packaged-apps)
and [Microsoft WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).

## Timeline And Project Time Checks

Before these checks, include both ordinary `.jsonl` and archived `.jsonl.zst`
history. Compare matching fixed records for dates, Prompt text, Token/model
totals, estimates and agent details; compression must not change Prompt IDs or
read markers. Real scan progress must count compressed sources too. A corrupt
archive must report a read error rather than a successful scan with fewer records.

Pin both a Project folder and a Session in Projects. Change dates, including a
date without activity: the folder and Session stay pinned, but no out-of-range
Prompts appear. Folder expansion must not select another conversation. Check
dragging, Alt+Up/Down, saved order after relaunch, and shared Session pins with
Timeline. Search and Project filters still apply without deleting hidden pins.

1. With several Sessions, scroll over the left Session names and use the left vertical scrollbar. Names and chart rows must move together. Scroll over the right chart and use its bottom horizontal scrollbar to move time without changing the date filter or vertical row position.
2. Drag blank chart space, then drag the orange navigator grip. Resize either orange edge and use Alt plus wheel. Verify the grip below the orange frame remains visible and shows the current span at both narrow and wide ranges, with no separate zoom toolbar. The visible span must agree across controls, including a long date period with a small orange frame. Ordinary record clicks must still open Prompt details.
3. Select a Project and Session. Both summaries must show Tokens, API Valuation, weekly allowance, and total execution time. Narrow the date/search filter: the list changes, but overall summary totals stay the same.
4. Inspect a completed, active, and missing-end Prompt. Confirm recorded duration, updating elapsed time, and an explicit unrecorded state. A partly recorded or still-running Project/Session total shows `>`; a fully recorded finished total does not. Duration values and metric headings must stay on one line in English and Chinese. Hover, focus or activate an execution-time value to see recorded and missing Prompt counts in its detail. This checklist also applies to macOS; a passing source test does not count as native Windows acceptance.

5. Compare Project columns and Prompt reader scrollbars with Timeline’s vertical and horizontal bars in both themes. Tracks, thumb thickness, hover feedback, and gutter should follow the same styling. Keep native vertical scrolling and Timeline’s shared row alignment.
6. At a 14–30 day view with dense activity, verify summary counts remain readable and all records can be opened. Pan slightly: group membership and Token height must stay stable at the same zoom. Compare views just below and above 24 hours: single Prompts must remain lines and every multi-Prompt group must keep its count visible, including at the plot edges. Zoom in and inspect the original Prompt times. Mixed-model summaries must not claim the first Prompt’s model for the whole group. Open a group with at least 20 records and directly select one near the end; the list must remain available beside details on wide windows and preserve its position when returning from details on narrow windows.
7. Create unread completions in more than one Project. Apply a search/date filter, then Mark All As Read. The action must hide when no unread results remain, and bottom feedback must not move the list. All current unread dots should clear. Undo must preserve new unread results; work running during the action must still become unread when it finishes. Repeating a Prompt must invalidate the older completion’s Undo state.

8. Load a Project whose official response mixes available, partial, and unavailable Sessions. Numeric values, including zero, must remain visible. Open the Project's weekly-value detail to check included and missing Session counts; a single Session detail must omit the redundant 1/1 count. Execution-time details use Prompt counts. Coverage stays out of the summary rows. Parent/child Sessions must not be counted twice, and unqueryable Sessions must remain in the denominator. Partial values remain visible without a summary warning badge; the Weekly Allowance help must not show an incomplete-data warning section. A partial null value must stay unknown, never zero; loading and failure must not invent coverage. Left Session rows must omit quota values.
9. Click each Weekly Allowance, Time and Timeline question mark, then repeat with keyboard activation. Hover alone must not open help. Check expansion from the source, delayed text, blur clipped to the app frame, readable scrolling at a small window size, X/Escape/background close, and focus returning after the closing animation. Opening help must preserve the underlying Prompt selection, filters and scroll positions.

## Currency Display Checks

Select TWD, then inspect Overview, Projects and Timeline. API amounts must show
`NT$`; the Overview total also shows `TWD`. Project/Session summary amounts omit
the code and stay to the right of the Token total without wrapping or pushing
other metrics; a long amount shrinks to fit and grows back when space returns.
Open a calculation: its total uses a small orange `TWD` label. Confirm its category unit prices,
fees, model subtotals and total all use TWD with the same reference rate. Repeat
with USD, EUR and JPY; missing rates remain unavailable. Switching currencies
must not alter source Tokens or stored USD prices.
