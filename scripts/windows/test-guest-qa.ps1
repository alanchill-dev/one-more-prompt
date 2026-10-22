# Parse and exercise the runner's trust-boundary statements without Windows UI or files.
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$runner = Join-Path $PSScriptRoot 'run-guest-qa.ps1'
$ast = [Management.Automation.Language.Parser]::ParseFile($runner, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
function Assert($condition, $message) { if (!$condition) { throw $message } }
function Boundary($needle) {
  $nodes = @($ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'Assert' -and $node.Extent.Text.Contains($needle)
  }, $true))
  Assert ($nodes.Count -eq 1) ('Expected one runner boundary: ' + $needle)
  return [ScriptBlock]::Create($nodes[0].Extent.Text)
}
$openSetup = $ast.Find({ param($node)
  $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Open-Setup'
}, $true)
$script:setupSelectors = @()
function Skip-Guide { }
function Ui($action, $selector) { if ($action -eq 'Invoke') { $script:setupSelectors += $selector } }
& ($openSetup.Body.GetScriptBlock())
Assert (@($script:setupSelectors | Where-Object { 'Recheck Codex' -match $_ -and '重新檢查 Codex' -match $_ -and 'Run Setup Again' -notmatch $_ }).Count -eq 1) 'Setup navigation must use the current Recheck Codex labels.'
$hashGuard = Boundary '$ExpectedZipSha256 -match'
foreach ($hashCase in @(
  @(('a' * 64), ('0' * 64), $true),
  @(('A' * 64), ('F' * 64), $true),
  @('', ('a' * 64), $false),
  @(('a' * 63), ('a' * 64), $false),
  @(('a' * 64), ('g' * 64), $false)
)) {
  $ExpectedZipSha256 = $hashCase[0]; $ExpectedExeSha256 = $hashCase[1]
  $accepted = $true
  try { & $hashGuard } catch { $accepted = $false }
  Assert ($accepted -eq $hashCase[2]) 'Candidate hash boundary mismatch.'
}
$manifestGuard = Boundary 'Unexpected fixture restoration targets.'
$fixtureSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'prepare-qa-fixture.mjs') -Raw
$fixturePaths = [regex]::Match($fixtureSource, '(?m)^    \$paths = (.+)$').Groups[1].Value
Assert ($fixturePaths.Length -gt 0) 'Expected the fixture restoration list.'
$paths = & ([ScriptBlock]::Create($fixturePaths))
$manifest = [PSCustomObject]@{ entries = @($paths | ForEach-Object { [PSCustomObject]@{ path = $_ } }) }
& $manifestGuard
$manifest.entries += [PSCustomObject]@{ path = 'unexpected-user-file' }
$accepted = $true
try { & $manifestGuard } catch { $accepted = $false }
Assert (!$accepted) 'Fixture guard must reject unexpected restoration targets.'
$processGuard = Boundary '$PreviousExe -and'
$process = [PSCustomObject]@{ MainModule = [PSCustomObject]@{ FileName = 'C:\qa\previous\one-more-prompt.exe' } }
foreach ($processCase in @(
  @('C:\QA\PREVIOUS\one-more-prompt.exe', $true),
  @('', $false),
  @('C:\qa\other\one-more-prompt.exe', $false)
)) {
  $PreviousExe = $processCase[0]; $accepted = $true
  try { & $processGuard } catch { $accepted = $false }
  Assert ($accepted -eq $processCase[1]) 'Known-process boundary mismatch.'
}
$receiver = $ast.Find({ param($node)
  $node -is [Management.Automation.Language.IfStatementAst] -and $node.Clauses[0].Item1.Extent.Text -eq '$ResultUrl'
}, $true)
Assert ($null -ne $receiver) 'Expected the optional evidence-upload block.'
$upload = [ScriptBlock]::Create($receiver.Extent.Text)
$archivePath = 'synthetic-evidence.zip'; $script:uploads = 0
function Invoke-WebRequest($Uri, $Method, $InFile, $ContentType, [switch]$UseBasicParsing, $TimeoutSec, $MaximumRedirection) {
  Assert ($Method -eq 'Post' -and $InFile -eq $archivePath -and $ContentType -eq 'application/zip') 'Unexpected evidence payload.'
  Assert ($UseBasicParsing -and $TimeoutSec -eq 30 -and $MaximumRedirection -eq 0) 'Evidence upload must stay bounded and refuse redirects.'
  $script:uploads++
}
$cases = @(
  @('', $false),
  @('http://127.0.0.1:8765/results', $true),
  @('http://10.0.0.1:8765/results', $true),
  @('http://172.16.0.1:8765/results', $true),
  @('http://172.31.255.254:8765/results', $true),
  @('http://192.168.1.1:8765/results', $true),
  @('http://172.32.0.1:8765/results', $false),
  @('http://8.8.8.8:8765/results', $false),
  @('http://169.254.1.1:8765/results', $false),
  @('http://localhost:8765/results', $false),
  @('https://127.0.0.1:8765/results', $false),
  @('http://user@127.0.0.1:8765/results', $false),
  @('http://127.0.0.1:8765/results?upload=1', $false),
  @('http://127.0.0.1:8765/results#fragment', $false),
  @('http://127.0.0.1:8765/other', $false)
)
foreach ($case in $cases) {
  $ResultUrl = $case[0]; $before = $script:uploads
  & $upload 3>$null 6>$null
  Assert (($script:uploads -gt $before) -eq $case[1]) ('Receiver boundary mismatch: ' + $ResultUrl)
}
Write-Host ('Guest runner: syntax, current setup labels and 25 boundary cases passed; no app, credentials, network or user files accessed.')
