param(
    [Parameter(Mandatory = $true)][string]$ComfyRoot,
    [Parameter(Mandatory = $true)][string]$ComfyPython,
    [ValidateRange(1, 65535)][int]$ComfyPort = 8188,
    [string]$ComfyArguments = "",
    [ValidateRange(5, 900)][int]$TimeoutSeconds = 180,
    [switch]$WebOnly
)

$ErrorActionPreference = "Stop"
$StudioRoot = Split-Path -Parent $PSScriptRoot
$StudioLauncher = Join-Path $StudioRoot "start.ps1"
$ComfyMain = Join-Path $ComfyRoot "main.py"
foreach ($RequiredFile in @($ComfyMain, $ComfyPython, $StudioLauncher)) {
    if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
        throw "Required file not found: $RequiredFile"
    }
}
$ComfyRoot = (Resolve-Path -LiteralPath $ComfyRoot).Path
$ComfyPython = (Resolve-Path -LiteralPath $ComfyPython).Path
$ComfyMain = (Resolve-Path -LiteralPath $ComfyMain).Path
$ReadyUrl = "http://127.0.0.1:$ComfyPort/system_stats"
$ComfyStdout = Join-Path $StudioRoot ".swarm-studio-comfy.stdout.log"
$ComfyStderr = Join-Path $StudioRoot ".swarm-studio-comfy.stderr.log"

function Test-ComfyReady {
    try {
        $Stats = Invoke-RestMethod -Uri $ReadyUrl -TimeoutSec 2
        return ($null -ne $Stats.system -and $null -ne $Stats.devices)
    } catch { return $false }
}

$ComfyProcess = $null
if (-not (Test-ComfyReady)) {
    Write-Host "Starting ComfyUI on port $ComfyPort..."
    # ArgumentList is deliberately a single Windows argument string. Quote main.py for paths
    # containing spaces; optional ComfyArguments use the same quoting as a Python command line.
    $PythonArgs = "-u `"$ComfyMain`" --listen 127.0.0.1 --port $ComfyPort $ComfyArguments"
    $ComfyProcess = Start-Process -FilePath $ComfyPython -ArgumentList $PythonArgs -WorkingDirectory $ComfyRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $ComfyStdout -RedirectStandardError $ComfyStderr
    $Deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while (-not (Test-ComfyReady)) {
        if ($ComfyProcess.HasExited) { throw "ComfyUI exited before becoming ready. See $ComfyStderr" }
        if ([DateTime]::UtcNow -ge $Deadline) { throw "ComfyUI was not ready within $TimeoutSeconds seconds. Studio was not started. See $ComfyStdout and $ComfyStderr" }
        Start-Sleep -Milliseconds 500
    }
}

Write-Host "ComfyUI is ready. Starting Studio; its saved Auto-start local Swarm setting starts SwarmUI."
& $StudioLauncher -WebOnly:$WebOnly
