param(
  [string]$FixtureRoot,
  [string]$CandidateZip,
  [string]$ExpectedZipSha256,
  [string]$ExpectedExeSha256,
  [string]$PreviousExe,
  [string]$OutputDir,
  [string]$ResultUrl,
  [switch]$Worker
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-Json($path, $value) { [IO.File]::WriteAllText($path, ($value | ConvertTo-Json -Depth 12), $utf8) }
function Assert($condition, $message) { if (!$condition) { throw $message } }

# UIA providers can hang. Each job runs in a child process that the runner can time out.
if ($Worker) {
  $job = Get-Content -LiteralPath $env:OMP_GUEST_JOB -Raw -Encoding UTF8 | ConvertFrom-Json
  try {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing, System.Windows.Forms
    Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class GuestWindow {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  public struct Rect { public int Left, Top, Right, Bottom; }
  public struct Point { public int X, Y; }
}
'@
    [GuestWindow]::SetProcessDPIAware() | Out-Null
    function Save-Crop($rect, $path) {
      $width = [int]$rect.Width; $height = [int]$rect.Height
      Assert ($width -gt 0 -and $height -gt 0 -and $width -le 4096 -and $height -le 4096) 'Invalid capture bounds.'
      $screen = [Windows.Forms.SystemInformation]::VirtualScreen
      Assert ($rect.Left -ge $screen.Left -and $rect.Top -ge $screen.Top -and $rect.Right -le $screen.Right -and $rect.Bottom -le $screen.Bottom) 'Target crop extends outside the guest display.'
      $bitmap = New-Object Drawing.Bitmap($width, $height)
      $graphics = [Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CopyFromScreen([int]$rect.Left, [int]$rect.Top, 0, 0, $bitmap.Size)
        $bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Png)
      } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
    function Send-GuestKeys($element, $keys) {
      $element.SetFocus()
      $foregroundPid = [uint32]0
      [GuestWindow]::GetWindowThreadProcessId([GuestWindow]::GetForegroundWindow(), [ref]$foregroundPid) | Out-Null
      Assert ($foregroundPid -eq $job.pid) 'Guest keyboard focus left the target app.'
      if ($keys) { [Windows.Forms.SendKeys]::SendWait($keys) }
    }
    function Click-GuestControl($element) {
      $element.SetFocus()
      $window = [GuestWindow]::GetForegroundWindow(); $foregroundPid = [uint32]0
      [GuestWindow]::GetWindowThreadProcessId($window, [ref]$foregroundPid) | Out-Null
      Assert ($foregroundPid -eq $job.pid) 'Guest click focus left the target app.'
      $bounds = $element.Current.BoundingRectangle
      Assert (!$element.Current.IsOffscreen -and $bounds.Width -gt 0 -and $bounds.Height -gt 0) 'Guest click target has no visible bounds.'
      $x = [int][Math]::Floor($bounds.Left + $bounds.Width / 2); $y = [int][Math]::Floor($bounds.Top + $bounds.Height / 2)
      $rect = New-Object GuestWindow+Rect
      Assert ([GuestWindow]::GetWindowRect($window, [ref]$rect)) 'Cannot measure foreground app window for click.'
      $screen = [Windows.Forms.SystemInformation]::VirtualScreen
      Assert ($x -ge $rect.Left -and $x -lt $rect.Right -and $y -ge $rect.Top -and $y -lt $rect.Bottom) 'Guest click target is outside the owned app window.'
      Assert ($x -ge $screen.Left -and $x -lt $screen.Right -and $y -ge $screen.Top -and $y -lt $screen.Bottom) 'Guest click target is outside the guest display.'
      Assert ([GuestWindow]::SetCursorPos($x, $y)) 'Guest pointer could not reach the measured target.'
      $actual = New-Object GuestWindow+Point
      Assert ([GuestWindow]::GetCursorPos([ref]$actual) -and $actual.X -eq $x -and $actual.Y -eq $y) 'Guest pointer differs from the measured target.'
      [GuestWindow]::GetWindowThreadProcessId([GuestWindow]::GetForegroundWindow(), [ref]$foregroundPid) | Out-Null
      Assert ($foregroundPid -eq $job.pid) 'Guest click focus changed before activation.'
      [GuestWindow]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
      [GuestWindow]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    }
    function Activate($element) {
      Assert $element.Current.IsEnabled 'Target control is disabled.'
      $pattern = $null
      if ($element.TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) { $pattern.Select() }
      elseif ($element.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke() }
      else { Click-GuestControl $element }
    }
    function Capture-App($handle, $count, $label) {
      for ($frame = 0; $frame -lt $count; $frame++) {
        $foregroundPid = [uint32]0
        [GuestWindow]::GetWindowThreadProcessId([GuestWindow]::GetForegroundWindow(), [ref]$foregroundPid) | Out-Null
        Assert ($foregroundPid -eq $job.pid) 'App crop refused because another app is foreground.'
        $rect = New-Object GuestWindow+Rect
        Assert ([GuestWindow]::GetWindowRect($handle, [ref]$rect)) 'Cannot measure app window.'
        $bounds = New-Object Drawing.Rectangle($rect.Left, $rect.Top, ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top))
        Save-Crop $bounds (Join-Path $job.evidence ($label + ('-{0:00}.png' -f $frame)))
        if ($count -gt 1) { Start-Sleep -Milliseconds 120 }
      }
    }
    function Shell-Targets {
      $tops = [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
      $elements = @(); $explorerRoots = @(); $trayControls = @()
      foreach ($top in $tops) {
        $owner = Get-Process -Id $top.Current.ProcessId -ErrorAction SilentlyContinue
        if (!$owner -or $owner.ProcessName -ne 'explorer') { continue }
        if ($explorerRoots.Count -lt 100) { $explorerRoots += @{ className = $top.Current.ClassName; type = $top.Current.ControlType.ProgrammaticName } }
        if ($top.Current.ClassName -notmatch '^(Shell_TrayWnd|NotifyIconOverflowWindow|TopLevelWindowForOverflowXamlIsland|Xaml_WindowedPopupClass)$') { continue }
        foreach ($item in $top.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)) {
          $name = $item.Current.Name
          if ($trayControls.Count -lt 200) {
            $safeName = $name
            if ($safeName -match '@|[A-Za-z]:\\|(?:sk-|Bearer |access_token|refresh_token)') { $safeName = '[Redacted]' }
            if ($safeName.Length -gt 180) { $safeName = $safeName.Substring(0, 180) }
            $trayControls += @{ name = $safeName; type = $item.Current.ControlType.ProgrammaticName; offscreen = $item.Current.IsOffscreen }
          }
          if ($name -match '^One More Prompt(?:\s|$)|^(Show hidden icons|Hidden icon menu|Notification Chevron|顯示隱藏圖示|顯示隱藏的圖示)$') { $elements += $item }
        }
      }
      if ($elements.Count -eq 0) {
        Write-Json (Join-Path $job.evidence ($job.label + '-tray-uia.json')) @{ targets = @(); explorerRoots = $explorerRoots; trayControls = $trayControls }
      }
      return $elements
    }
    if ($job.action -eq 'Tray') {
      $targets = @(Shell-Targets)
      if ($targets.Count -gt 0) {
        Write-Json (Join-Path $job.evidence ($job.label + '-tray-uia.json')) @($targets | ForEach-Object { @{ name = $_.Current.Name; type = $_.Current.ControlType.ProgrammaticName; offscreen = $_.Current.IsOffscreen } })
      }
      $icon = $targets | Where-Object { $_.Current.Name -match '^One More Prompt(?:\s|$)' -and !$_.Current.IsOffscreen } | Select-Object -First 1
      if (!$icon) {
        $chevron = $targets | Where-Object { $_.Current.Name -notmatch '^One More Prompt' -and !$_.Current.IsOffscreen } | Select-Object -First 1
        Assert ($null -ne $chevron) 'Own tray icon and hidden-icons control are unavailable through UIA.'
        $pattern = $null
        Assert ($chevron.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) 'Hidden-icons control has no InvokePattern.'
        $pattern.Invoke(); Start-Sleep -Milliseconds 600
        $targets = @(Shell-Targets)
        $icon = $targets | Where-Object { $_.Current.Name -match '^One More Prompt(?:\s|$)' -and !$_.Current.IsOffscreen } | Select-Object -First 1
      }
      if ($targets.Count -gt 0) {
        Write-Json (Join-Path $job.evidence ($job.label + '-tray-uia.json')) @($targets | ForEach-Object { @{ name = $_.Current.Name; type = $_.Current.ControlType.ProgrammaticName; offscreen = $_.Current.IsOffscreen } })
      }
      Assert ($null -ne $icon) 'One More Prompt tray icon is unavailable through UIA.'
      $bounds = $icon.Current.BoundingRectangle
      Assert ($bounds.Width -le 128 -and $bounds.Height -le 128) 'Tray bounds are too large for an own-icon crop.'
      $icon.SetFocus(); Start-Sleep -Milliseconds 500
      Save-Crop $bounds (Join-Path $job.evidence ($job.label + '-tray.png'))
      $answer = @{ name = $icon.Current.Name; crop = $job.label + '-tray.png'; glyph = 'Requires image review' }
    } else {
      $handles = New-Object 'System.Collections.Generic.List[System.IntPtr]'
      $callback = [GuestWindow+EnumProc]{ param($handle, $unused)
        $windowPid = [uint32]0
        [GuestWindow]::GetWindowThreadProcessId($handle, [ref]$windowPid) | Out-Null
        if ($windowPid -eq $job.pid) {
          $title = New-Object Text.StringBuilder 256
          [GuestWindow]::GetWindowText($handle, $title, 256) | Out-Null
          if ($title.ToString() -match '^One More Prompt(?: Setup)?$') { $handles.Add($handle) }
        }
        return $true
      }
      [GuestWindow]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
      Assert ($handles.Count -gt 0) 'Target app has no native window.'
      $handle = $handles | Sort-Object {
        $title = New-Object Text.StringBuilder 256
        [GuestWindow]::GetWindowText($_, $title, 256) | Out-Null
        if ([GuestWindow]::IsWindowVisible($_) -and $title.ToString() -eq 'One More Prompt Setup') { 0 }
        elseif ([GuestWindow]::IsWindowVisible($_)) { 1 } else { 2 }
      } | Select-Object -First 1
      [GuestWindow]::ShowWindow($handle, 9) | Out-Null
      [GuestWindow]::SetForegroundWindow($handle) | Out-Null
      $root = [Windows.Automation.AutomationElement]::FromHandle($handle)
      if ($job.action -in @('Capture', 'Frames')) {
        $count = 1; if ($job.action -eq 'Frames') { $count = 8 }
        Capture-App $handle $count $job.label
        $answer = @{ frames = $count; intervalMs = 120; capturedAt = [DateTime]::UtcNow.ToString('o') }
      } elseif ($job.action -eq 'Dump') {
        $tree = @(); $items = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
        foreach ($item in $items) {
          if ($tree.Count -ge 1000) { break }
          $name = $item.Current.Name
          if ($name -match '@|[A-Za-z]:\\|(?:sk-|Bearer |access_token|refresh_token)') { $name = '[Redacted]' }
          if ($name.Length -gt 180) { $name = $name.Substring(0, 180) }
          $tree += @{ type = $item.Current.ControlType.ProgrammaticName; name = $name; enabled = $item.Current.IsEnabled; offscreen = $item.Current.IsOffscreen }
        }
        Write-Json (Join-Path $job.evidence ($job.label + '-app-uia.json')) $tree
        $answer = @{ controls = $tree.Count }
      } else {
        $deadline = [DateTime]::UtcNow.AddSeconds($job.wait)
        do {
          $scope = $root
          if ($job.scope) {
            $scope = $null
            foreach ($item in $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)) {
              if ($item.Current.Name -match $job.scope -and $item.Current.ControlType.ProgrammaticName -eq 'ControlType.Group') { $scope = $item; break }
            }
          }
          $foundControls = @()
          if ($scope) {
            foreach ($item in $scope.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)) {
              if ($item.Current.Name -match $job.selector -and (!$job.type -or $item.Current.ControlType.ProgrammaticName -eq ('ControlType.' + $job.type))) { $foundControls += $item }
            }
          }
          if ($foundControls.Count -gt 0 -or $job.wait -eq 0) { break }
          Start-Sleep -Milliseconds 250
        } while ([DateTime]::UtcNow -lt $deadline)
        if ($job.action -eq 'Count') { $answer = @{ count = $foundControls.Count } }
        else {
          Assert ($foundControls.Count -gt 0) ('UIA selector unavailable: ' + $job.selector)
          $element = $foundControls | Where-Object { !$_.Current.IsOffscreen } | Select-Object -First 1
          if (!$element) { $element = $foundControls[0] }
          $answer = @{ enabled = $element.Current.IsEnabled; name = $element.Current.Name }
          if ($job.action -in @('Invoke', 'InvokeFrames')) {
            Activate $element
            if ($job.action -eq 'InvokeFrames') { Capture-App $handle 8 $job.label }
          }
          elseif ($job.action -eq 'Focus') { Send-GuestKeys $element '' }
          elseif ($job.action -eq 'English') { Send-GuestKeys $element '{HOME}{ENTER}' }
          elseif ($job.action -eq 'Selected') {
            $selection = $null
            Assert ($element.TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selection)) 'Selected-state UIA pattern unavailable.'
            Assert $selection.Current.IsSelected 'Requested option is not selected.'
          }
        }
      }
    }
    Write-Json $job.result @{ ok = $true; data = $answer }
    exit 0
  } catch { Write-Json $job.result @{ ok = $false; error = $_.Exception.Message }; exit 1 }
}

Assert ($env:OS -eq 'Windows_NT' -and $PSVersionTable.PSVersion.Major -ge 5) 'Run this once inside the Windows guest with Windows PowerShell 5.1.'
$scriptPath = $env:OMP_GUEST_SCRIPT
if (!$scriptPath) { $scriptPath = $PSCommandPath }
Assert ($scriptPath -and (Test-Path -LiteralPath $scriptPath)) 'Launch through run-guest-qa.cmd or provide OMP_GUEST_SCRIPT.'
$scriptPath = [IO.Path]::GetFullPath($scriptPath)
if (!$FixtureRoot) { $FixtureRoot = Join-Path (Split-Path $scriptPath) 'fixture' }
if (!$CandidateZip) { $CandidateZip = Join-Path (Split-Path $scriptPath) 'app.zip' }
Assert ($ExpectedZipSha256 -match '^[a-fA-F0-9]{64}$' -and $ExpectedExeSha256 -match '^[a-fA-F0-9]{64}$') 'Provide the reviewed ZIP and executable SHA-256 values.'
if ($PreviousExe) { $PreviousExe = [IO.Path]::GetFullPath($PreviousExe) }
if (!$OutputDir) { $OutputDir = Join-Path (Split-Path $scriptPath) ('guest-results-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 6)) }
Assert (!(Test-Path -LiteralPath $OutputDir)) 'OutputDir must be a new folder; previous QA files are retained.'
$OutputDir = [IO.Path]::GetFullPath($OutputDir)
$evidence = Join-Path $OutputDir 'evidence'; $work = Join-Path $OutputDir 'work'
New-Item -ItemType Directory -Path $evidence, $work | Out-Null
$manifestPath = Join-Path $FixtureRoot 'backup\manifest.json'
$report = @{ startedAt = [DateTime]::UtcNow.ToString('o'); status = 'running'; tests = @(); restore = 'not_attempted'; motionReview = 'Pending'; trayGlyphReview = 'Pending' }
$script:appProcess = $null; $exePath = $null; $mayRestore = $false
function Record($name, $status, $detail) { $report.tests += @{ name = $name; status = $status; detail = $detail }; Write-Host ($status.ToUpper() + ': ' + $name) }
function Ui($action, $selector = '', $label = '', $scope = '', $type = '', $wait = 12) {
  Assert ($script:appProcess -and !$script:appProcess.HasExited) 'Owned test app is not running.'
  $id = [Guid]::NewGuid().ToString('N'); $jobPath = Join-Path $work ($id + '.json'); $resultPath = Join-Path $work ($id + '-result.json')
  Write-Json $jobPath @{ action = $action; pid = $script:appProcess.Id; selector = $selector; label = $label; scope = $scope; type = $type; wait = $wait; result = $resultPath; evidence = $evidence }
  $info = New-Object Diagnostics.ProcessStartInfo 'powershell.exe'
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.Arguments = '-NoLogo -NoProfile -NonInteractive -Command "& ([ScriptBlock]::Create([IO.File]::ReadAllText($env:OMP_GUEST_SCRIPT))) -Worker"'
  $info.EnvironmentVariables['OMP_GUEST_SCRIPT'] = $scriptPath; $info.EnvironmentVariables['OMP_GUEST_JOB'] = $jobPath
  $child = [Diagnostics.Process]::Start($info)
  try { if (!$child.WaitForExit(($wait + 15) * 1000)) { $child.Kill(); throw ('UI Automation timed out during ' + $action + '.') } }
  finally { $child.Dispose() }
  Assert (Test-Path -LiteralPath $resultPath) 'UI Automation worker returned no result.'
  $result = Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert $result.ok $result.error
  return $result.data
}
function Fixture($action) {
  $fixtureInfo = New-Object Diagnostics.ProcessStartInfo $env:ComSpec
  $fixtureInfo.UseShellExecute = $false; $fixtureInfo.CreateNoWindow = $true
  $fixtureInfo.Arguments = '/d /s /c ""' + (Join-Path $FixtureRoot 'qa.cmd') + '" ' + $action + '"'
  $fixtureProcess = [Diagnostics.Process]::Start($fixtureInfo)
  try {
    if (!$fixtureProcess.WaitForExit(45000)) { $fixtureProcess.Kill(); throw ('Fixture ' + $action + ' timed out; backup retained.') }
    Assert ($fixtureProcess.ExitCode -eq 0) ('Fixture ' + $action + ' failed; inspect the retained fixture locally.')
  } finally { $fixtureProcess.Dispose() }
}
function Stop-Owned {
  if (!$script:appProcess -or $script:appProcess.HasExited) { return }
  Assert ($script:appProcess.MainModule.FileName -ieq $exePath) 'Refused to stop a process outside the owned candidate.'
  $script:appProcess.Kill(); Assert ($script:appProcess.WaitForExit(10000)) 'Owned candidate did not exit.'
}
function Fingerprint($path) {
  if (!(Test-Path -LiteralPath $path)) { return 'absent' }
  if (Test-Path -LiteralPath $path -PathType Leaf) { return 'file:' + (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
  $base = [IO.Path]::GetFullPath($path).TrimEnd('\') + '\'
  return 'directory:' + ((@(Get-ChildItem -LiteralPath $path -Recurse -Force) | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($base.Length)
    if ($_.PSIsContainer) { 'directory:' + $relative } else { 'file:' + $relative + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  }) -join '|')
}
function Case($name, $body, $status = 'passed') {
  try { & $body; Record $name $status 'Actions and explicit assertions completed; image appearance requires review.' }
  catch {
    $status = 'blocked'
    if ($_.Exception.Message -match 'did not stop|is not selected|restoration differs') { $status = 'failed' }
    Record $name $status $_.Exception.Message
    try { Ui 'Capture' '' ($name + '-blocked') | Out-Null } catch { }
    try { Ui 'Dump' '' ($name + '-blocked') | Out-Null } catch { }
  }
}
function Skip-Guide {
  if ((Ui 'Count' '^(Skip Guide|略過導引)$' '' '' 'Button' 0).count -gt 0) { Ui 'Invoke' '^(Skip Guide|略過導引)$' '' '' 'Button' | Out-Null }
}
function Open-Setup {
  Skip-Guide
  Ui 'Invoke' '^(Settings|設定)$' '' '' 'Button' | Out-Null
  Ui 'Invoke' '^(Troubleshooting|疑難排解)(\s|$)' '' '' 'Button' | Out-Null
  Ui 'Invoke' '^(Recheck Codex|重新檢查 Codex)$' '' '' 'Button' | Out-Null
  Ui 'Find' '^(Check Local Records|檢查本機紀錄)$' '' '' 'Button' | Out-Null
}
function Set-English {
  Ui 'English' '^(Language|語言)$' '' '' 'ComboBox' | Out-Null
  Ui 'Find' '^Check Local Records$' '' '' 'Button' | Out-Null
}
try {
  Assert (Test-Path -LiteralPath $manifestPath) 'The prepared fixture manifest is missing. This runner never runs Prepare.'
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert ($manifest.state -eq 'prepared') 'This fixture is not prepared. Do not reuse a restored pack.'
  Assert ($manifest.appData -ieq (Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'com.alanchill.onemoreprompt')) 'Fixture app-data location does not match this account.'
  Assert ((@($manifest.entries.path | Sort-Object) -join '|') -eq 'onboarding-complete|onboarding-setup-complete|plugins_data\codex|settings.json|usage-api-cache.json') 'Unexpected fixture restoration targets.'
  $expected = @{}
  foreach ($entry in $manifest.entries) {
    $backupPath = Join-Path (Join-Path $FixtureRoot 'backup') $entry.path
    Assert (!$entry.existed -or (Test-Path -LiteralPath $backupPath)) 'An original fixture backup is missing.'
    $expected[$entry.path] = 'absent'; if ($entry.existed) { $expected[$entry.path] = Fingerprint $backupPath }
  }
  $mayRestore = $true
  $existing = @(Get-Process -Name 'one-more-prompt' -ErrorAction SilentlyContinue)
  foreach ($process in $existing) { Assert ($PreviousExe -and $process.MainModule.FileName -ieq $PreviousExe) 'Quit One More Prompt or explicitly provide its PreviousExe path; no other process was stopped.' }
  foreach ($process in $existing) { $process.Kill(); Assert ($process.WaitForExit(10000)) 'The known old test app did not exit.' }
  $report.zipSha256 = (Get-FileHash -LiteralPath $CandidateZip -Algorithm SHA256).Hash.ToLowerInvariant()
  Assert ($report.zipSha256 -eq $ExpectedZipSha256) 'Candidate ZIP checksum differs from the reviewed build.'
  $candidate = Join-Path $OutputDir 'candidate'
  Expand-Archive -LiteralPath $CandidateZip -DestinationPath $candidate
  $executables = @(Get-ChildItem -LiteralPath $candidate -Recurse -Filter 'one-more-prompt.exe')
  Assert ($executables.Count -eq 1) 'Candidate must contain one app executable.'
  $exePath = $executables[0].FullName
  $report.exeSha256 = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
  Assert ($report.exeSha256 -eq $ExpectedExeSha256) 'App executable checksum differs from the reviewed build.'
  $info = New-Object Diagnostics.ProcessStartInfo $exePath
  $info.UseShellExecute = $false; $info.WorkingDirectory = Split-Path $exePath
  $info.EnvironmentVariables['CODEX_HOME'] = Join-Path $FixtureRoot 'codex-home'
  $info.EnvironmentVariables['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--force-renderer-accessibility'
  $script:appProcess = [Diagnostics.Process]::Start($info)
  Start-Sleep -Seconds 3
  Case 'setup-initial' {
    if ((Ui 'Count' '^(Check Local Records|檢查本機紀錄)$' '' '' 'Button' 0).count -eq 0) { Open-Setup }
    Set-English
    Ui 'Capture' '' 'setup-initial' | Out-Null
    Ui 'Invoke' '^Check Local Records$' '' '' 'Button' | Out-Null
    Ui 'Find' '^Start Guide$' '' '' 'Button' 25 | Out-Null
    Ui 'Capture' '' 'setup-records' | Out-Null
    Ui 'Invoke' '^Back$' '' '' 'Button' | Out-Null
    Ui 'Find' '^Check Local Records$' '' '' 'Button' | Out-Null
    Ui 'Invoke' '^Skip Setup$' '' '' 'Button' | Out-Null
    Ui 'Find' '^Overview$' '' '' 'Button' | Out-Null
  }
  foreach ($cycle in 1..2) {
    Case ('setup-reset-' + $cycle) {
      Open-Setup; Set-English
      Ui 'Capture' '' ('setup-reset-' + $cycle) | Out-Null
      Ui 'Invoke' '^Check Local Records$' '' '' 'Button' | Out-Null
      Ui 'Find' '^Start Guide$' '' '' 'Button' 25 | Out-Null
      Ui 'Invoke' '^Start Guide$' '' '' 'Button' | Out-Null
      Ui 'Find' '^Skip Guide$' '' '' 'Button' 20 | Out-Null
      Ui 'Capture' '' ('setup-main-' + $cycle) | Out-Null
      Skip-Guide
      Ui 'Invoke' '^Overview$' '' '' 'Button' | Out-Null
    }
  }
  Case 'navigation' {
    Skip-Guide
    Ui 'Invoke' '^Overview$' '' '' 'Button' | Out-Null
    Ui 'Capture' '' 'overview' | Out-Null
    Ui 'Invoke' '^Projects$' '' '' 'Button' | Out-Null
    if ((Ui 'Count' '^Open Session .*Synthetic Windows QA' '' '' 'Button' 0).count -eq 0) { Ui 'Invoke' '^Open Project .*Synthetic QA' '' '' 'Button' | Out-Null }
    Ui 'Invoke' '^Open Session .*Synthetic Windows QA' '' '' 'Button' | Out-Null
    Ui 'Invoke' '^Open Prompt: Synthetic Windows QA' '' '' 'Button' | Out-Null
    Ui 'Capture' '' 'projects-prompt' | Out-Null
    Ui 'InvokeFrames' '^Timeline$' 'timeline-transition' '' 'Button' | Out-Null
    Ui 'Find' '^Bars Mark Prompt Send Times; Height Reflects Tokens .*Synthetic Windows QA' '' '' 'Button' | Out-Null
    Ui 'Invoke' '^Overview$' '' '' 'Button' | Out-Null
    Ui 'Invoke' '^7 Days$' '' '^Time Range$' 'Button' | Out-Null
    $day = Ui 'Invoke' '\. Day \d+ of \d+\.$' '' '' 'Button'
    $report.chartDate = $day.name.Split(':')[0]
    Ui 'Find' '^View In Timeline$' '' '' 'Button' | Out-Null
    Ui 'Capture' '' 'chart-detail' | Out-Null
    Ui 'InvokeFrames' '^View In Timeline$' 'chart-drilldown' '' 'Button' | Out-Null
    Ui 'Find' '^Bars Mark Prompt Send Times; Height Reflects Tokens .*Synthetic Windows QA' '' '' 'Button' | Out-Null
    Ui 'Find' '^Clear time filter$' '' '' 'Button' | Out-Null
    $dateParts = $report.chartDate.Split('-')
    Assert ($dateParts.Length -eq 3) 'Chart date label is unavailable for the filter assertion.'
    $filterDate = $dateParts[0] + '/' + [int]$dateParts[1] + '/' + [int]$dateParts[2]
    Ui 'Find' ('^' + [regex]::Escape($filterDate) + '$') | Out-Null
    Ui 'Capture' '' 'chart-filtered-timeline' | Out-Null
  }
  Case 'running-watcher' {
    if ((Ui 'Count' '^Clear time filter$' '' '' 'Button' 0).count -gt 0) { Ui 'Invoke' '^Clear time filter$' '' '' 'Button' | Out-Null }
    Ui 'Invoke' '^Projects$' '' '' 'Button' | Out-Null
    Ui 'Find' '^Open Project .*Synthetic QA.*Running' '' '' 'Button' | Out-Null
    Ui 'Frames' '' 'running-before-complete' | Out-Null
    Fixture 'Complete'
    $stopped = $false
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
      if ((Ui 'Count' '(^Open (Project|Session)|^(Open|Collapse) Prompt:).*Running' '' '' 'Button' 0).count -eq 0) { $stopped = $true; break }
      Start-Sleep -Milliseconds 500
    }
    Assert $stopped 'Running labels did not stop after Complete.'
    Ui 'Frames' '' 'stopped-after-complete' | Out-Null
    Fixture 'Start'
    Ui 'Find' '^Open Project .*Synthetic QA.*Running' '' '' 'Button' 20 | Out-Null
    Ui 'Frames' '' 'running-after-start' | Out-Null
  }
  Case 'tray-numbers' {
    Ui 'Invoke' '^Settings$' '' '' 'Button' | Out-Null
    Ui 'Invoke' '^Numbers$' '' '^Menubar icon style$' | Out-Null
    Ui 'Selected' '^Numbers$' '' '^Menubar icon style$' | Out-Null
    Ui 'Invoke' '^Default$' '' '^Menubar metric$' | Out-Null
    Ui 'Selected' '^Default$' '' '^Menubar metric$' | Out-Null
    Start-Sleep -Seconds 1
    Ui 'Capture' '' 'numbers-default-settings' | Out-Null
    Ui 'Tray' '' 'numbers-default-75' | Out-Null
    Ui 'Invoke' '^Weekly$' '' '^Menubar metric$' | Out-Null
    Ui 'Selected' '^Weekly$' '' '^Menubar metric$' | Out-Null
    Start-Sleep -Seconds 1
    Ui 'Capture' '' 'numbers-weekly-settings' | Out-Null
    Ui 'Tray' '' 'numbers-weekly-60' | Out-Null
  } 'evidence'
} catch { Record 'runner' 'failed' $_.Exception.Message }
finally {
  try {
    Stop-Owned
    if ($mayRestore) {
      Fixture 'Restore'
      $restoredManifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
      Assert ($restoredManifest.state -eq 'restored') 'Fixture did not record restoration.'
      foreach ($entry in $manifest.entries) { Assert ((Fingerprint (Join-Path $manifest.appData $entry.path)) -eq $expected[$entry.path]) ('Original file restoration differs: ' + $entry.path) }
      $report.restore = 'passed'; Record 'restore-original-files' 'passed' 'Original existence and SHA-256 fingerprints match the preserved backup.'
      Case 'restored-no-data-overview' {
        $settings = Get-Content -LiteralPath (Join-Path $manifest.appData 'settings.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        Assert (@($settings.plugins.disabled) -contains 'codex') 'Restored Codex provider is enabled; empty-state capture was not attempted.'
        $normalCodex = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex'
        Assert (!(Test-Path -LiteralPath (Join-Path $normalCodex 'auth.json'))) 'Normal Codex credentials exist; empty-state capture was not attempted.'
        Assert (@(Get-ChildItem -LiteralPath (Join-Path $normalCodex 'sessions') -Recurse -Filter '*.jsonl' -ErrorAction SilentlyContinue).Count -eq 0) 'Normal Codex records exist; empty-state capture was not attempted.'
        $normalInfo = New-Object Diagnostics.ProcessStartInfo $exePath
        $normalInfo.UseShellExecute = $false; $normalInfo.WorkingDirectory = Split-Path $exePath
        $normalInfo.EnvironmentVariables.Remove('CODEX_HOME')
        $normalInfo.EnvironmentVariables['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--force-renderer-accessibility'
        $script:appProcess = [Diagnostics.Process]::Start($normalInfo)
        Start-Sleep -Seconds 3
        Ui 'Invoke' '^(Overview|總覽)$' '' '' 'Button' | Out-Null
        Ui 'Find' '^(Codex Data Is Not Available|目前沒有 Codex 資料)$' | Out-Null
        Ui 'Capture' '' 'restored-empty-overview' | Out-Null
      }
      Stop-Owned
      # The normal launch may backfill settings or its marker; retain those changes before restoring exact bytes.
      $normalArchive = Join-Path $FixtureRoot ('test-state-normal-' + [Guid]::NewGuid().ToString('N'))
      foreach ($entry in $manifest.entries) {
        $destination = Join-Path $manifest.appData $entry.path
        if ((Fingerprint $destination) -ne $expected[$entry.path]) {
          if (Test-Path -LiteralPath $destination) { $saved = Join-Path $normalArchive $entry.path; New-Item -ItemType Directory -Path (Split-Path $saved) -Force | Out-Null; Move-Item -LiteralPath $destination -Destination $saved }
          if ($entry.existed) { New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null; Copy-Item -LiteralPath (Join-Path (Join-Path $FixtureRoot 'backup') $entry.path) -Destination $destination -Recurse }
        }
        Assert ((Fingerprint $destination) -eq $expected[$entry.path]) ('Final restoration differs: ' + $entry.path)
      }
      Record 'final-original-files' 'passed' 'Exact original files remain restored after the no-data check.'
    }
  } catch { $report.restore = 'failed'; Record 'restore-original-files' 'failed' $_.Exception.Message }
  $report.finishedAt = [DateTime]::UtcNow.ToString('o')
  $report.status = 'needs_visual_review'
  if (@($report.tests | Where-Object { $_.status -in @('blocked', 'failed') }).Count -gt 0 -or $report.restore -ne 'passed') { $report.status = 'incomplete' }
  Write-Json (Join-Path $evidence 'results.json') $report
  [IO.File]::WriteAllText((Join-Path $evidence 'README.txt'), "Only target-app crops, own tray-icon crops, filtered UIA trees and this report are included. Motion, appearance and actual tray digits require image review. No credentials, settings, session files or executable are exported.\r\n", $utf8)
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  $archivePath = Join-Path $OutputDir 'guest-results.zip'
  $archive = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in Get-ChildItem -LiteralPath $evidence -File) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $file.Name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null }
  } finally { $archive.Dispose() }
  if ($ResultUrl) {
    try {
      $uri = [Uri]$ResultUrl
      $address = $null
      Assert ([Net.IPAddress]::TryParse($uri.Host, [ref]$address)) 'ResultUrl must use an explicit local receiver IP address.'
      $bytes = $address.GetAddressBytes()
      $privateV4 = $bytes.Length -eq 4 -and ($bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168))
      Assert ($uri.Scheme -eq 'http' -and ([Net.IPAddress]::IsLoopback($address) -or $privateV4) -and !$uri.UserInfo -and !$uri.Query -and !$uri.Fragment -and $uri.AbsolutePath -eq '/results') 'ResultUrl must be an HTTP loopback or private-network receiver at /results.'
      Invoke-WebRequest -Uri $uri -Method Post -InFile $archivePath -ContentType 'application/zip' -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 0 | Out-Null
      Write-Host 'Uploaded the evidence ZIP to the requested local receiver.'
    } catch { Write-Warning ('Evidence upload failed; the local ZIP is retained. ' + $_.Exception.Message) }
  }
  Write-Host ('Evidence saved to ' + $archivePath)
  Write-Host ('Result: ' + $report.status + '. Restore: ' + $report.restore + '.')
}
if ($report.status -eq 'incomplete') { exit 1 }
exit 0
