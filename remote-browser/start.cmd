@echo off
set REMOTE_BROWSER_PORT=5051
set CHROME_CDP_PORT=9222
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
