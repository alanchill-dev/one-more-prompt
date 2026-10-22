# App Updates

One More Prompt tells you when a newer stable version is available. You download
and replace the app yourself; it never installs an update automatically.

## Check for a New Version

- Automatic checks run when the main panel first becomes visible and every six
  hours while it stays visible. When the panel is hidden, checks wait until it
  returns to the foreground; a due check then runs immediately.
- Open **Settings** and choose **Check for Updates** to check immediately.
- The compact update icon and its small dot appear directly left of **Settings**
  only after a newer version is confirmed. Activate it to see the new version,
  download, or notes. Otherwise the header has no update button; manual checks
  remain available in **Settings**.

The comparison uses numeric semantic versions: for example, 1.10.0 is newer than
1.9.0. Drafts, prereleases, equal versions, and older versions are not offered.
The release must include the package for the current platform:

| Platform | Required Asset |
| --- | --- |
| macOS Apple Silicon | `One-More-Prompt-<version>.dmg` |
| Windows x64 | `One-More-Prompt-<version>-windows-x64-portable.zip` |

A missing public release is reported as **Not Published Yet**, rather than
**Up to Date**. Offline, rate-limit, and other check failures remain visible
and can be retried without interrupting local usage or history browsing.

## Download and Replace

**macOS:** Download the DMG, quit One More Prompt fully from its menu-bar menu,
open the DMG, and replace One More Prompt in Applications. Launch the new app.
Use the signed, notarized package; do not disable macOS security checks.

**Windows:** Download the ZIP, quit One More Prompt from the tray, and extract
the entire package. Replace the complete old application folder, keeping the
new executable, icons, and supporting files together. Do not replace only the
EXE. If moving the app to another path, disable Launch At Login first and enable
it again after starting from the new location. The ZIP is unsigned and needs
Microsoft WebView2; Windows security policy may warn or block execution.

Preferences, pins, read markers, and other product data stay in the normal
per-user data location; they are not stored in the download folder. Replacing
the app does not remove your Codex records. See [Windows Portable Testing](windows-portable-test.md)
for the maintainer's upgrade, notification-registration, and removal checklist.

## Network and Privacy

The app makes an anonymous GET request to:

```text
https://api.github.com/repos/alanchill-dev/one-more-prompt/releases/latest
```

No GitHub account or token is required. The request includes ordinary HTTP
metadata, such as the app's User-Agent, but no Codex credentials, prompt text,
project names, conversation history, or local records. GitHub can see normal
connection metadata, such as your IP address. Quota refreshes are a separate
connection to OpenAI using your existing local Codex sign-in.

Downloads open the matching asset on the project's trusted GitHub release;
release notes open that release page. There is no update feed, updater signature,
automatic installation, or code execution from release notes.

## Public Releases

Stable releases are published in
[alanchill-dev/one-more-prompt](https://github.com/alanchill-dev/one-more-prompt/releases).
Version 1.0.0 is the first stable public release. A successful check against the
published endpoint reports Up to Date when no newer compatible release exists.
Local fixture tests cover comparisons, errors, and link handling; live endpoint
and download checks are recorded separately after publication.
