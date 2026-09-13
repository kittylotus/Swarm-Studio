param(
    [Parameter(Position = 0)]
    [ValidateSet("install", "uninstall", "start", "stop", "restart", "status", "swarm")]
    [string]$Command = "status",

    [Parameter(Position = 1)]
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "status",

    [string]$SwarmDirectory = "",
    [ValidateRange(1, 65535)]
    [int]$SwarmPort = 7801,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$TaskName = "Swarm Studio Remote Launch"
$StateRoot = Join-Path $env:LOCALAPPDATA "SwarmStudio"
$BinRoot = Join-Path $StateRoot "bin"
$CliPath = Join-Path $BinRoot "studio.cmd"
$RunnerPidFile = Join-Path ([IO.Path]::GetTempPath()) "swarm-studio-runner.pid"
$SwarmPidFile = Join-Path ([IO.Path]::GetTempPath()) "swarm-studio-owned-swarm.pid"
$HostSwarmLog = Join-Path $StateRoot "host-swarm.log"
$HostSwarmErrorLog = Join-Path $StateRoot "host-swarm-error.log"

function Test-ProcessAlive([int]$PidValue) {
    if ($PidValue -le 0) { return $false }
    try {
        $null = Get-Process -Id $PidValue -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Read-PidFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    $raw = (Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue).Trim()
    $value = 0
    if ([int]::TryParse($raw, [ref]$value) -and (Test-ProcessAlive $value)) { return $value }
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    return 0
}

function Test-TcpPort([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync("127.0.0.1", $Port)
        if (-not $task.Wait(450)) { return $false }
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Resolve-SwarmLauncher([string]$Hint) {
    $roots = New-Object System.Collections.Generic.List[string]
    if ($Hint.Trim()) { $roots.Add($Hint.Trim()) }
    if ($env:SWARM_STUDIO_SWARM_HOME) { $roots.Add($env:SWARM_STUDIO_SWARM_HOME.Trim()) }
    if ($env:USERPROFILE) {
        $roots.Add((Join-Path $env:USERPROFILE "SwarmUI"))
        $roots.Add((Join-Path $env:USERPROFILE "Documents\SwarmUI"))
        $roots.Add((Join-Path $env:USERPROFILE "Desktop\SwarmUI"))
    }
    $roots.Add("C:\SwarmUI")
    $roots.Add("C:\AI\SwarmUI")

    $seen = @{}
    $launchers = @("launch-windows.bat", "launch-windows.cmd", "launch-windows.ps1", "SwarmUI.exe")
    foreach ($rootValue in $roots) {
        if (-not $rootValue) { continue }
        foreach ($candidateRoot in @($rootValue, (Join-Path $rootValue "SwarmUI"))) {
            $fullRoot = [IO.Path]::GetFullPath($candidateRoot)
            if ($seen[$fullRoot]) { continue }
            $seen[$fullRoot] = $true
            foreach ($launcher in $launchers) {
                $candidate = Join-Path $fullRoot $launcher
                if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                    return [PSCustomObject]@{ Path = $candidate; WorkingDirectory = $fullRoot }
                }
            }
        }
    }
    return $null
}

function Stop-TreeFromPidFile([string]$Path, [string]$Label) {
    $pidValue = Read-PidFile $Path
    if (-not $pidValue) { return "$Label is not host-managed." }
    & taskkill.exe /PID $pidValue /T /F *> $null
    $exit = $LASTEXITCODE
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($exit -ne 0) { throw "taskkill failed for $Label PID $pidValue with exit code $exit." }
    return "Stopped $Label process tree $pidValue."
}

function Start-SwarmHost([string]$Hint, [int]$Port) {
    $existingPid = Read-PidFile $SwarmPidFile
    if ($existingPid) { return "Swarm is already host-managed as PID $existingPid." }
    if (Test-TcpPort $Port) { return "Swarm is already reachable on 127.0.0.1:$Port; no host launch needed." }

    $launcher = Resolve-SwarmLauncher $Hint
    if (-not $launcher) {
        throw "Could not discover a SwarmUI launcher. Configure Studio's Swarm working directory or set SWARM_STUDIO_SWARM_HOME."
    }

    New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
    $extension = [IO.Path]::GetExtension($launcher.Path).ToLowerInvariant()
    if ($extension -in @(".bat", ".cmd")) {
        $quoted = '"' + $launcher.Path.Replace('"', '""') + '"'
        $process = Start-Process -FilePath $env:ComSpec -ArgumentList @("/D", "/S", "/C", $quoted) -WorkingDirectory $launcher.WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $HostSwarmLog -RedirectStandardError $HostSwarmErrorLog -PassThru
    } elseif ($extension -eq ".ps1") {
        $process = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $launcher.Path) -WorkingDirectory $launcher.WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $HostSwarmLog -RedirectStandardError $HostSwarmErrorLog -PassThru
    } else {
        $process = Start-Process -FilePath $launcher.Path -WorkingDirectory $launcher.WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $HostSwarmLog -RedirectStandardError $HostSwarmErrorLog -PassThru
    }
    Set-Content -LiteralPath $SwarmPidFile -Value $process.Id -Encoding ASCII
    return "Launched Swarm host process $($process.Id) from $($launcher.Path)."
}

function Get-ControlStatus {
    $studioPid = Read-PidFile $RunnerPidFile
    $swarmPid = Read-PidFile $SwarmPidFile
    $taskInstalled = $false
    try { $taskInstalled = $null -ne (Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop) } catch {}
    $cliInstalled = Test-Path -LiteralPath $CliPath -PathType Leaf
    return [PSCustomObject]@{
        available = ($env:OS -eq "Windows_NT")
        installed = ($taskInstalled -and $cliInstalled)
        taskInstalled = $taskInstalled
        cliInstalled = $cliInstalled
        command = "studio start"
        studio = [PSCustomObject]@{ running = [bool]$studioPid; pid = if ($studioPid) { $studioPid } else { $null } }
        swarm = [PSCustomObject]@{ running = [bool]$swarmPid; pid = if ($swarmPid) { $swarmPid } else { $null } }
        message = if ($taskInstalled -and $cliInstalled) { "SSH launcher installed." } elseif ($env:OS -ne "Windows_NT") { "Host control currently targets Windows." } else { "SSH launcher is not installed yet." }
    }
}

function Install-Control {
    if ($env:OS -ne "Windows_NT") { throw "Host control currently targets Windows." }
    New-Item -ItemType Directory -Force -Path $BinRoot | Out-Null

    $escapedScript = $PSCommandPath.Replace('"', '""')
    $cmd = "@echo off`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$escapedScript`" %*`r`n"
    Set-Content -LiteralPath $CliPath -Value $cmd -Encoding ASCII

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @($userPath -split ';' | Where-Object { $_ -and $_.Trim() })
    if (-not ($parts | Where-Object { $_.TrimEnd('\\') -ieq $BinRoot.TrimEnd('\\') })) {
        $newPath = (($parts + $BinRoot) -join ';')
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    }

    $runner = Join-Path $Root "start.ps1"
    if (-not (Test-Path -LiteralPath $runner)) { throw "Could not find start.ps1 at $runner." }
    $taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$runner`" -NoShortcut"
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Principal $principal -Settings $settings -Force | Out-Null
    return Get-ControlStatus
}

function Uninstall-Control {
    try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch {}
    Remove-Item -LiteralPath $CliPath -Force -ErrorAction SilentlyContinue
    return Get-ControlStatus
}

function Start-StudioHost {
    $running = Read-PidFile $RunnerPidFile
    if ($running) { return "Swarm Studio is already running as PID $running." }
    try { $null = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch { throw "SSH launcher is not installed. Run .\\scripts\\host-control.ps1 install once from the desktop checkout." }
    Start-ScheduledTask -TaskName $TaskName
    return "Requested Swarm Studio launch in the logged-in desktop session."
}

function Invoke-StudioCommand([string]$Verb) {
    switch ($Verb) {
        "start" { return Start-StudioHost }
        "stop" { return Stop-TreeFromPidFile $RunnerPidFile "Swarm Studio" }
        "restart" {
            $null = Stop-TreeFromPidFile $RunnerPidFile "Swarm Studio"
            Start-Sleep -Milliseconds 600
            return Start-StudioHost
        }
        "status" { return (Get-ControlStatus).message }
    }
}

function Invoke-SwarmCommand([string]$Verb) {
    switch ($Verb) {
        "start" { return Start-SwarmHost $SwarmDirectory $SwarmPort }
        "stop" { return Stop-TreeFromPidFile $SwarmPidFile "Swarm" }
        "restart" {
            $null = Stop-TreeFromPidFile $SwarmPidFile "Swarm"
            Start-Sleep -Milliseconds 450
            return Start-SwarmHost $SwarmDirectory $SwarmPort
        }
        "status" {
            $status = Get-ControlStatus
            if ($status.swarm.running) { return "Swarm host process $($status.swarm.pid) is running." }
            if (Test-TcpPort $SwarmPort) { return "Swarm is reachable on 127.0.0.1:$SwarmPort but is not host-managed." }
            return "Swarm is not host-managed or reachable on port $SwarmPort."
        }
    }
}

try {
    switch ($Command) {
        "install" { $result = Install-Control }
        "uninstall" { $result = Uninstall-Control }
        "status" { $result = Get-ControlStatus }
        "start" { $message = Invoke-StudioCommand "start"; $result = Get-ControlStatus; $result | Add-Member -NotePropertyName actionMessage -NotePropertyValue $message }
        "stop" { $message = Invoke-StudioCommand "stop"; $result = Get-ControlStatus; $result | Add-Member -NotePropertyName actionMessage -NotePropertyValue $message }
        "restart" { $message = Invoke-StudioCommand "restart"; $result = Get-ControlStatus; $result | Add-Member -NotePropertyName actionMessage -NotePropertyValue $message }
        "swarm" { $message = Invoke-SwarmCommand $Action; $result = Get-ControlStatus; $result | Add-Member -NotePropertyName actionMessage -NotePropertyValue $message }
    }
    if ($Json) { $result | ConvertTo-Json -Depth 6 -Compress }
    else {
        if ($result.actionMessage) { Write-Host $result.actionMessage }
        Write-Host $result.message
        if ($result.installed) { Write-Host "SSH command: studio start" }
    }
} catch {
    if ($Json) {
        [PSCustomObject]@{ error = $_.Exception.Message } | ConvertTo-Json -Compress
        exit 1
    }
    Write-Error $_.Exception.Message
    exit 1
}
