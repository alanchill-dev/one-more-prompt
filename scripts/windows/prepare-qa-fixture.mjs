#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const stamp = (kind, seconds = 0) => "__" + kind + "_" + seconds + "__"
const cwd = "C:\\Synthetic QA\\Sample Project"
const usage = { input_tokens: 1200, cached_input_tokens: 400, output_tokens: 400, reasoning_output_tokens: 100, total_tokens: 1600 }
const event = (seconds, type, payload) => ({ timestamp: stamp("UTC", seconds), type, payload })

// Dates are resolved by the Windows clock at Prepare, so a copied pack never starts stale.
export function fixtureTemplate() {
  const sessions = [2, 1, 0].map((day) => {
    const seconds = -day * 86400 - 10
    const id = "synthetic-qa-" + day
    const turnId = id + "-turn"
    const records = [
      event(seconds, "session_meta", { id, cwd, thread_source: "user" }),
      event(seconds + 1, "event_msg", { type: "task_started", turn_id: turnId }),
      event(seconds + 2, "turn_context", { turn_id: turnId, model: "gpt-6-sol", cwd }),
      event(seconds + 3, "event_msg", { type: "user_message", message: "Synthetic Windows QA: inspect navigation, animation and tray numbers. Sample " + (day + 1) }),
      event(seconds + 4, "event_msg", { type: "token_count", info: { last_token_usage: usage, total_token_usage: usage } }),
    ]
    if (day) records.push(event(seconds + 5, "event_msg", { type: "task_complete", turn_id: turnId }))
    return { file: "qa-" + day + ".jsonl", turnId, records }
  })
  const point = (day, hourly) => ({
    label: stamp(hourly ? "HOUR_LABEL" : "DATE", -day * 86400 - 7),
    value: 1600, valueLabel: "1.6K tokens",
    startAt: stamp(hourly ? "HOUR" : "DATE", -day * 86400 - 7),
    modelUsage: [{ name: "gpt-6-sol", tokens: 1600, costUsd: null, estimationStatus: null }],
    costUsd: null, estimationStatus: null,
  })
  return {
    sessions,
    globalState: {
      "local-projects": { qa: { id: "qa", name: "Synthetic QA Sample Project", rootPaths: [cwd] } },
      "sidebar-project-thread-orders": { qa: { threadIds: sessions.map((session) => session.records[0].payload.id) } },
    },
    cache: {
      version: 1,
      snapshots: { codex: {
        providerId: "codex", displayName: "Codex", plan: "Synthetic Windows QA",
        fetchedAt: stamp("UTC"),
        lines: [
          { type: "progress", label: "Session", used: 25, limit: 100, format: { kind: "percent" }, resetsAt: stamp("UTC", 18000), periodDurationMs: 18000000, color: null },
          { type: "progress", label: "Weekly", used: 40, limit: 100, format: { kind: "percent" }, resetsAt: stamp("UTC", 604800), periodDurationMs: 604800000, color: null },
          ...["daily", "hourly"].map((granularity) => ({
            type: "barChart", label: granularity === "hourly" ? "Today Activity" : "Usage Trend", granularity,
            points: (granularity === "hourly" ? [0] : [2, 1, 0]).map((day) => point(day, granularity === "hourly")),
            note: "Synthetic Windows QA data", color: null,
          })),
        ],
      } },
    },
  }
}

export const powershell = String.raw`param(
  [ValidateSet('Prepare', 'Launch', 'Start', 'Complete', 'Restore')]
  [string]$Action,
  [string]$ExePath
)
$ErrorActionPreference = 'Stop'
$root = $env:OMP_QA_ROOT
$utf8 = New-Object System.Text.UTF8Encoding($false)
$manifestPath = Join-Path $root 'backup\manifest.json'
$homePath = Join-Path $root 'codex-home'
$statePath = Join-Path $root 'active-turn.json'
function Write-Json($path, $value) {
  [IO.File]::WriteAllText($path, ($value | ConvertTo-Json -Depth 40), $utf8)
}
function Assert-Stopped {
  if ([Diagnostics.Process]::GetProcessesByName('one-more-prompt').Length -ne 0) {
    throw 'Quit One More Prompt from its tray menu before Prepare, Launch or Restore.'
  }
}
function Read-Manifest {
  if (!(Test-Path -LiteralPath $manifestPath)) { throw 'Run Prepare first.' }
  return (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json)
}
function Append-Event($file, $type, $payload) {
  $record = @{ timestamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); type = $type; payload = $payload }
  [IO.File]::AppendAllText($file, ($record | ConvertTo-Json -Depth 10 -Compress) + [Environment]::NewLine, $utf8)
}
try {
  if (!$Action) { throw 'Use qa.cmd Prepare, Launch "path\one-more-prompt.exe", Start, Complete or Restore.' }
  if ($Action -eq 'Prepare') {
    Assert-Stopped
    if (Test-Path -LiteralPath $manifestPath) { throw 'This pack already has a backup. Restore it, then generate a new pack for another run.' }
    $appData = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'com.alanchill.onemoreprompt'
    $backup = Join-Path $root 'backup'
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    $paths = @('settings.json', 'usage-api-cache.json', 'plugins_data\codex', 'onboarding-complete', 'onboarding-setup-complete')
    $entries = @()
    foreach ($relative in $paths) {
      $source = Join-Path $appData $relative
      $exists = Test-Path -LiteralPath $source
      $entries += @{ path = $relative; existed = $exists }
      if ($exists) {
        $destination = Join-Path $backup $relative
        New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Recurse
      }
    }
    Write-Json $manifestPath @{ appData = $appData; entries = $entries; state = 'prepared' }
    New-Item -ItemType Directory -Path $appData -Force | Out-Null
    $settingsPath = Join-Path $appData 'settings.json'
    $settings = [pscustomobject]@{}
    if (Test-Path -LiteralPath $settingsPath) { $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json }
    $overrides = @{
      plugins = @{ order = @('codex'); disabled = @() }
      menubarIconStyle = 'dual'; menubarMetric = 'default'; displayMode = 'left'
      onboardingCompleted = $true; onboardingGuidePending = $true
    }
    foreach ($key in $overrides.Keys) { $settings | Add-Member -MemberType NoteProperty -Name $key -Value $overrides[$key] -Force }
    Write-Json $settingsPath $settings
    $oldIndex = Join-Path $appData 'plugins_data\codex'
    if (Test-Path -LiteralPath $oldIndex) { Move-Item -LiteralPath $oldIndex -Destination (Join-Path $backup 'original-plugin-index') }
    $now = [DateTime]::UtcNow
    $template = [IO.File]::ReadAllText((Join-Path $root 'fixture-template.json'))
    $json = [regex]::Replace($template, '__(UTC|DATE|HOUR|HOUR_LABEL)_(-?\d+)__', {
      param($match)
      $date = $now.AddSeconds([int]$match.Groups[2].Value)
      switch ($match.Groups[1].Value) {
        'UTC' { return $date.ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }
        'DATE' { return $date.ToLocalTime().ToString('yyyy-MM-dd') }
        'HOUR_LABEL' { return $date.ToLocalTime().ToString('HH:00') }
        'HOUR' { return $date.ToString("yyyy-MM-ddTHH':00:00.000Z'") }
      }
    })
    $fixture = $json | ConvertFrom-Json
    $sessionsPath = Join-Path $homePath 'sessions'
    New-Item -ItemType Directory -Path $sessionsPath -Force | Out-Null
    Write-Json (Join-Path $homePath '.codex-global-state.json') $fixture.globalState
    foreach ($session in $fixture.sessions) {
      $lines = @($session.records | ForEach-Object { $_ | ConvertTo-Json -Depth 20 -Compress })
      [IO.File]::WriteAllText((Join-Path $sessionsPath $session.file), ($lines -join [Environment]::NewLine) + [Environment]::NewLine, $utf8)
    }
    Write-Json (Join-Path $appData 'usage-api-cache.json') $fixture.cache
    Write-Json $statePath @{ file = (Join-Path $sessionsPath 'qa-0.jsonl'); turnId = 'synthetic-qa-0-turn'; active = $true }
    Write-Host 'Prepared synthetic data: 1 project, 3 sessions, 3 prompts, 4800 tokens.'
    Write-Host 'Expected remaining quota: Session 75%, Weekly 60%. Sign-in errors are expected.'
    Write-Host 'Launch with qa.cmd Launch "C:\path\one-more-prompt.exe".'
  } elseif ($Action -eq 'Restore') {
    Assert-Stopped
    $manifest = Read-Manifest
    if ($manifest.state -eq 'restored') { Write-Host 'Already restored.'; exit 0 }
    $archive = Join-Path $root ('test-state-' + [Guid]::NewGuid().ToString('N'))
    foreach ($entry in $manifest.entries) {
      $destination = Join-Path $manifest.appData $entry.path
      if (Test-Path -LiteralPath $destination) {
        $saved = Join-Path $archive $entry.path
        New-Item -ItemType Directory -Path (Split-Path $saved) -Force | Out-Null
        Move-Item -LiteralPath $destination -Destination $saved
      }
      if ($entry.existed) {
        New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path (Join-Path $root 'backup') $entry.path) -Destination $destination -Recurse
      }
    }
    $manifest.state = 'restored'
    Write-Json $manifestPath $manifest
    Write-Host ('Restored original settings, quota cache, prompt index and setup marker. Test output retained in ' + $archive)
  } else {
    $manifest = Read-Manifest
    if ($manifest.state -ne 'prepared') { throw 'This pack has been restored. Generate a new pack for another run.' }
    if ($Action -eq 'Launch') {
      Assert-Stopped
      if (!(Test-Path -LiteralPath $ExePath -PathType Leaf) -or [IO.Path]::GetFileName($ExePath) -ne 'one-more-prompt.exe') {
        throw 'Provide the extracted one-more-prompt.exe path.'
      }
      $env:CODEX_HOME = $homePath
      Start-Process -FilePath $ExePath -WorkingDirectory (Split-Path $ExePath)
      Write-Host 'Started the unchanged release app with this process-only synthetic CODEX_HOME.'
    } else {
      $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
      if ($Action -eq 'Complete') {
        if ($state.active) { Append-Event $state.file 'event_msg' @{ type = 'task_complete'; turn_id = $state.turnId } }
        $state.active = $false
      } else {
        if ($state.active) { Append-Event $state.file 'event_msg' @{ type = 'task_complete'; turn_id = $state.turnId } }
        $state.turnId = 'synthetic-qa-' + [Guid]::NewGuid().ToString('N')
        Append-Event $state.file 'event_msg' @{ type = 'task_started'; turn_id = $state.turnId }
        Append-Event $state.file 'turn_context' @{ turn_id = $state.turnId; model = 'gpt-6-sol'; cwd = 'C:\Synthetic QA\Sample Project' }
        Append-Event $state.file 'event_msg' @{ type = 'user_message'; message = 'Synthetic Windows QA: fresh running indicator check.' }
        $state.active = $true
      }
      Write-Json $statePath $state
      Write-Host ($Action + ' recorded. The local file watcher should update the running indicator.')
    }
  }
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  [Console]::Error.WriteLine('No processes were killed. If Prepare partly completed, quit the app and run Restore.')
  exit 1
}
`

export async function writePack(output) {
  await mkdir(output, { recursive: true })
  const files = {
    "fixture-template.json": JSON.stringify(fixtureTemplate(), null, 2) + "\n",
    "fixture.ps1": powershell.replace(/\n/g, "\r\n"),
    "qa.cmd": [
      "@echo off", "setlocal", 'set "OMP_QA_ROOT=%~dp0"', 'set "OMP_QA_ACTION=%~1"', 'set "OMP_QA_EXE=%~2"',
      'powershell.exe -NoLogo -NoProfile -NonInteractive -Command "& ([ScriptBlock]::Create([IO.File]::ReadAllText($env:OMP_QA_ROOT + \'fixture.ps1\'))) -Action $env:OMP_QA_ACTION -ExePath $env:OMP_QA_EXE"',
      "exit /b %errorlevel%", "",
    ].join("\r\n"),
    "README.txt": [
      "One More Prompt - Synthetic Windows QA", "",
      "Quit the app from its tray menu before Prepare, Launch or Restore.",
      "In cmd.exe from this folder:",
      "  qa.cmd Prepare",
      '  qa.cmd Launch "C:\\path\\one-more-prompt.exe"',
      "  qa.cmd Complete",
      "  qa.cmd Start",
      "  qa.cmd Restore", "",
      "The pack uses the Windows clock. No Codex installation or sign-in is needed.",
      "Session remaining: 75%. Weekly remaining: 60%. Total synthetic tokens: 4800.",
      "Start/Complete append real-format local records for the running indicator.",
      "Use Run Setup Again to retest setup; the seven-step guide has sample prompts.",
      "Missing Codex sign-in errors remain visible. Refresh does not provide real quota.",
      "Restore puts original app files back and retains test output beside this pack.",
      "Keep backup/ until Restore succeeds. Use a newly generated pack for another run.",
      "Do not distribute this pack with the release ZIP. Never use it as real-account acceptance.",
      "No registry, execution policy, persistent environment or credentials are changed by this helper.", "",
    ].join("\r\n"),
  }
  for (const [name, contents] of Object.entries(files)) await writeFile(resolve(output, name), contents, { flag: "wx" })
  return Object.keys(files)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/windows/prepare-qa-fixture.mjs <new-output-folder>")
  const output = resolve(process.argv[2])
  await writePack(output)
  console.log("Windows QA pack: " + output)
}
