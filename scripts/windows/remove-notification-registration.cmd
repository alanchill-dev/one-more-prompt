@echo off
setlocal
echo One More Prompt - Remove Notification Registration
echo Quit the app and turn off Launch At Login before removing its folder.
echo This tool preserves app data, Codex records, and startup settings.
echo.
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference = 'Stop'; try { if ([System.Diagnostics.Process]::GetProcessesByName('one-more-prompt').Length -ne 0) { throw 'One More Prompt is still running. Quit it from the tray, then run this tool again.' }; [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree('SOFTWARE\Classes\AppUserModelId\com.alanchill.onemoreprompt', $false); Write-Host 'Notification registration removed (or already absent).'; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"
if errorlevel 1 (
  echo Cleanup failed. The message above explains why.
  echo Press any key to close.
  pause >nul
  exit /b 1
)
echo You can now delete the extracted app folder.
echo Press any key to close.
pause >nul
exit /b 0
