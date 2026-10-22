@echo off
setlocal
set "OMP_GUEST_SCRIPT=%~dp0run-guest-qa.ps1"
powershell.exe -NoLogo -NoProfile -File "%OMP_GUEST_SCRIPT%" %*
exit /b %errorlevel%
