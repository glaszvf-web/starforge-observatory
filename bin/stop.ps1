# Starforge Observatory - stop
$ErrorActionPreference = "SilentlyContinue"
try {
    Invoke-RestMethod "http://127.0.0.1:8900/api/shutdown" -TimeoutSec 3 | Out-Null
} catch { }
Start-Sleep -Milliseconds 300
