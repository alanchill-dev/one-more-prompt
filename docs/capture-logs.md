# How to Capture Logs for a Bug Report

Use this when One More Prompt is not working and you need to share debug info.

- Audience: non-technical users
- Time: ~2 minutes
- Platform: macOS or Windows

## 1) Start Diagnostic Logging

1. Open One More Prompt from the macOS menu bar or Windows system tray.
2. Select **Settings** in the header.
3. Scroll to **Support** and expand **Troubleshooting**.
4. Under **Diagnostic Logging**, select **Start Diagnostic Logging**.

If One More Prompt does not open at all, skip this step and continue.

## 2) Reproduce the issue once

1. Do the action that fails.
2. Wait for the failure to happen.
3. Stop after 1-2 attempts (enough data, less noise).

## 3) Open the log folder

1. Return to **Settings → Support → Troubleshooting**.
2. Select **Open Log Location**.
3. Finder or File Explorer opens the folder containing the current app log.

## 4) Attach log files to your GitHub issue

1. Attach `one-more-prompt.log`.
2. If you also see files like `one-more-prompt.log.1`, attach those too.
3. Drag the files directly into your issue/comment on GitHub.

Older log files stay in the same folder after an upgrade. Share the current
`one-more-prompt` logs for a problem in the new version.

## 5) Add this context in the same issue comment

Copy/paste and fill:

```text
What I expected:
What happened instead:
When it happened (local time + timezone):
Which Codex page or session was affected:
One More Prompt version:
```

## Privacy note

Logs are redacted for common secrets, but still review before sharing in public.
Supported local path masking includes Windows drive and network-share paths,
and Mac or Linux paths containing spaces. Sensitive response fields are masked
as complete JSON strings, including names containing quotes or backslashes.
This does not make a log fully anonymous; remove any remaining personal context
before attaching it.

## 6) Stop Diagnostic Logging

After sending logs, return to **Settings → Support → Troubleshooting** and select
**Stop Diagnostic Logging**. If the app closes first, the next launch starts at the normal
Error level automatically.
