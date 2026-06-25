$ErrorActionPreference = "Stop"
$port = 4175
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
Write-Host "Starting C172 Trainer preview on http://127.0.0.1:$port/index.html"
python -m http.server $port --bind 127.0.0.1
