# Starforge Observatory - launcher (3D memory cortex build)
# Flow: build graph data -> probe -> start node server if absent -> open browser.
# Keep ASCII-only: Windows PowerShell 5.1 reads .ps1 as ANSI without a BOM.
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

$root = "E:\21289\DSH\observatory\agent-ops"
$data = Join-Path $root "data"
$port = 8900

function Test-Port([int]$p) {
    # A port with nothing listening gets silently DROPPED here, so a plain
    # Connect blocks ~2s. Bound it explicitly.
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $ar = $c.BeginConnect("127.0.0.1", $p, $null, $null)
        if (-not $ar.AsyncWaitHandle.WaitOne(200, $false)) { return $false }
        $c.EndConnect($ar)
        return $true
    } catch { return $false }
    finally { try { $c.Close() } catch { } }
}

function Test-Health([int]$p) {
    if (-not (Test-Port $p)) { return $false }
    try {
        $r = Invoke-RestMethod "http://127.0.0.1:$p/api/health" -TimeoutSec 2
        return ($r.ok -eq $true)
    } catch { return $false }
}

$alive = Test-Health $port

if (-not $alive) {
    if (-not (Test-Path (Join-Path $root "bin\server.mjs"))) {
        try { [System.Windows.Forms.MessageBox]::Show("server.mjs not found:`n$root\bin\server.mjs", "Starforge") | Out-Null } catch { }
        exit 1
    }

    # Rebuild the graph from the live memory layers first, so partitions and
    # edges are never stale. Takes a few hundred ms.
    $env:DSH_MEMORY_DIR = $data
    Start-Process -FilePath "node" -ArgumentList "`"$root\bin\build-graph.mjs`"" `
        -WorkingDirectory $root -WindowStyle Hidden -Wait

    Start-Process -FilePath "node" `
        -ArgumentList "`"$root\bin\server.mjs`"", "--port", "$port", "--no-open" `
        -WorkingDirectory $root -WindowStyle Hidden

    # 端口通了就够了，别在这个循环里等 HTTP —— 每次 Test-Health 都带着
    # 2 秒的 HTTP 超时，服务刚 listen 的那几毫秒会被判成失败，白等十几秒。
    for ($i = 0; $i -lt 80; $i++) {
        Start-Sleep -Milliseconds 120
        if (Test-Port $port) { $alive = $true; break }
    }
}

if ($alive) {
    Start-Process "http://127.0.0.1:$port/"
} else {
    $msg = "Starforge did not come up within 15s.`n`nTry manually:`n  cd $root`n  node bin\server.mjs --port $port"
    try { [System.Windows.Forms.MessageBox]::Show($msg, "Starforge") | Out-Null } catch { }
    exit 1
}
