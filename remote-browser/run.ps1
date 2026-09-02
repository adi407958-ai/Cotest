$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $root 'server.log'
if ([string]::IsNullOrWhiteSpace($env:REMOTE_BROWSER_TOKEN)) {
  $tokenFile = Join-Path (Split-Path -Parent $root) 'remote-browser-token.txt'
  if (Test-Path $tokenFile) { $env:REMOTE_BROWSER_TOKEN = (Get-Content $tokenFile -Raw).Trim() }
}
while ($true) {
  "[$(Get-Date -Format o)] Starting remote browser server" | Out-File -FilePath $log -Append -Encoding utf8
  node (Join-Path $root 'server.js') *>> $log
  "[$(Get-Date -Format o)] Server exited; restarting in 2 seconds" | Out-File -FilePath $log -Append -Encoding utf8
  Start-Sleep -Seconds 2
}
