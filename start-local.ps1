$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$address = 'http://127.0.0.1:8095/'

try {
  $status = Invoke-RestMethod -Uri ($address + 'api/status') -TimeoutSec 2
  if ($null -ne $status.aiReady) {
    Write-Host "Spatial editor running: $address"
    exit 0
  }
} catch {
  # No service is listening yet.
}

$nodeExe = (Get-Command node -ErrorAction Stop).Source
$stdoutPath = Join-Path $env:TEMP 'spatial-editor-next-stdout.log'
$stderrPath = Join-Path $env:TEMP 'spatial-editor-next-stderr.log'
Start-Process -FilePath $nodeExe -ArgumentList 'server.mjs' -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath | Out-Null

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 250
  try {
    $status = Invoke-RestMethod -Uri ($address + 'api/status') -TimeoutSec 2
    if ($null -ne $status.aiReady) {
      Write-Host "Spatial editor started: $address"
      exit 0
    }
  } catch {}
}
throw "Spatial editor failed to start. See $stderrPath"
