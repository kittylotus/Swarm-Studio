param(
    [switch]$WebOnly,
    [switch]$NoShortcut,
    [switch]$SetupFirewall,
    [switch]$VerboseRunner,
    [switch]$EmergencyStop
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$RunnerLog = Join-Path $Root ".swarm-studio-runner.log"
$SwarmPidFile = Join-Path ([IO.Path]::GetTempPath()) "swarm-studio-owned-swarm.pid"
$env:SWARM_STUDIO_SWARM_PID_FILE = $SwarmPidFile
$env:SWARM_STUDIO_RUNNER_LOG = $RunnerLog

function Test-StudioTrueColor {
    if ($env:NO_COLOR) { return $false }
    $SupportsVirtualTerminal = $false
    try {
        if ($Host.UI -and $Host.UI.PSObject.Properties.Name -contains "SupportsVirtualTerminal") {
            $SupportsVirtualTerminal = [bool]$Host.UI.SupportsVirtualTerminal
        }
    } catch {}
    return [bool]($SupportsVirtualTerminal -or $env:WT_SESSION -or $env:TERM_PROGRAM -eq "vscode")
}

function Get-StudioGradientColor([double]$Position) {
    $Pink = @(255, 77, 184)
    $Purple = @(168, 85, 247)
    $BabyBlue = @(125, 211, 252)

    if ($Position -le 0.5) {
        $Mix = $Position * 2
        $From = $Pink
        $To = $Purple
    } else {
        $Mix = ($Position - 0.5) * 2
        $From = $Purple
        $To = $BabyBlue
    }

    return @(
        [int][Math]::Round($From[0] + (($To[0] - $From[0]) * $Mix)),
        [int][Math]::Round($From[1] + (($To[1] - $From[1]) * $Mix)),
        [int][Math]::Round($From[2] + (($To[2] - $From[2]) * $Mix))
    )
}

function Write-StudioGradientLine([string]$Line, [ConsoleColor]$FallbackColor) {
    if (-not $script:StudioTrueColor) {
        Write-Host $Line -ForegroundColor $FallbackColor
        return
    }

    $Escape = [char]27
    $Builder = New-Object System.Text.StringBuilder
    $Denominator = [Math]::Max(1, $Line.Length - 1)
    for ($Index = 0; $Index -lt $Line.Length; $Index += 1) {
        $Rgb = Get-StudioGradientColor ($Index / $Denominator)
        [void]$Builder.Append("${Escape}[38;2;$($Rgb[0]);$($Rgb[1]);$($Rgb[2])m")
        [void]$Builder.Append($Line[$Index])
    }
    [void]$Builder.Append("${Escape}[0m")
    Write-Host $Builder.ToString()
}

function Write-StudioBanner {
    try { $Host.UI.RawUI.WindowTitle = "Swarm Studio // Runner" } catch {}
    try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}
    $script:StudioTrueColor = Test-StudioTrueColor

    $Banner = @(
        '▄▀▀▀▀▀█ ░     ░ ▄▀▀▀▀▀▄ ░▀▀▀▀▀▄ ░▀▀▄▀▀▄      ▄▀▀▀▀▀█ ▀▀▀░▀▀▀ ░     ░ ░▀▀▀▀▀▄ ░ ▄▀▀▀▀▀▄',
        '▀▄▄▄▄▄  ▒  ▒  ▒ ▒▄▄▄▄▄▒ ▒▄▄▄▄▄▀ ▒  ▒  ▒      ▀▄▄▄▄▄     ▒    ▒     ▒ ▒     ▒ ▒ ▒     ▒',
        '▄     ▓ ▓  ▓  ▓ ▓     ▓ ▓     ▓ ▓  ▓  ▓      ▄     ▓    ▓    ▓     ▓ ▓     ▓ ▓ ▓     ▓',
        '▀▀▀▀▀▀   ▀▀ ▀▀  ▀     ▀ ▀     ▀ ▀     ▀      ▀▀▀▀▀▀     ▀     ▀▀▀▀▀  ▀▀▀▀▀▀  ▀  ▀▀▀▀▀ ',
        '▒▀▀▀▀▀▄ ▄▀▀▄▀▀▄ ▒     ▒ ▒     ▒ ▒  ▄  ▒      ▒▀▀▀▀▀▄    ▒    ▄▀▀▀▀▀▄ ▒▀▀▀▀▀▄ ▒ ▄▀▀▀▀▀▄',
        ' ▄▄▄▄▄▀ ▓  ▓  ▓ ▓▄▄▄▄▄▓ ▓▄▄▄▄▄▀ ▓  ▓  ▓       ▄▄▄▄▄▀    ▓    ▓     ▓ ▓     ▓ ▓ ▓     ▓',
        '▓     ▄ ▓  ▓  ▓ ▓     ▓ ▓     ▓ ▓  ▓  ▓      ▓     ▄    ▓    ▓     ▓ ▓     ▓ ▓ ▓     ▓',
        ' ▀▀▀▀▀▀ ▀     ▀  ▀▀▀▀▀  ▀▀▀▀▀▀  ▀▀▀ ▀▀        ▀▀▀▀▀▀ ▀▀▀▀▀▀▀ ▀     ▀ ▀▀▀▀▀▀  ▀  ▀▀▀▀▀ '
    )
    $Fallback = @(
        [ConsoleColor]::Magenta,
        [ConsoleColor]::Magenta,
        [ConsoleColor]::DarkMagenta,
        [ConsoleColor]::DarkMagenta,
        [ConsoleColor]::DarkCyan,
        [ConsoleColor]::Cyan,
        [ConsoleColor]::Cyan,
        [ConsoleColor]::Cyan
    )

    Write-Host ""
    for ($LineIndex = 0; $LineIndex -lt $Banner.Count; $LineIndex += 1) {
        Write-StudioGradientLine $Banner[$LineIndex] $Fallback[$LineIndex]
    }
    Write-Host ""
    Write-Host '                         local creative workstation' -ForegroundColor DarkGray
    Write-Host '                     desktop  //  browser  //  mobile' -ForegroundColor DarkGray
    Write-Host ""
}

function Write-Status([string]$Label, [string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Cyan) {
    Write-Host ("  [{0,-8}] " -f $Label.ToUpperInvariant()) -NoNewline -ForegroundColor DarkGray
    Write-Host $Message -ForegroundColor $Color
}

function Remove-Ansi([string]$Value) {
    return [regex]::Replace($Value, "`e\[[0-9;?]*[ -/]*[@-~]", "")
}

function Stop-StudioOwnedBackendTree {
    if ($env:OS -ne "Windows_NT") {
        Write-Status "PANIC" "Emergency process-tree stop currently targets Windows managed launches." Yellow
        return $false
    }
    if (-not (Test-Path -LiteralPath $SwarmPidFile)) {
        Write-Status "PANIC" "No Studio-owned Swarm PID is recorded. Nothing to kill." DarkGray
        return $true
    }

    $RawPid = [string](Get-Content -LiteralPath $SwarmPidFile -Raw -ErrorAction SilentlyContinue)
    $RawPid = $RawPid.Trim()
    $PidValue = 0
    if (-not [int]::TryParse($RawPid, [ref]$PidValue) -or $PidValue -le 0) {
        Remove-Item -LiteralPath $SwarmPidFile -Force -ErrorAction SilentlyContinue
        Write-Status "PANIC" "The recorded backend PID was invalid; stale marker removed." Yellow
        return $false
    }

    $Target = Get-CimInstance Win32_Process -Filter "ProcessId = $PidValue" -ErrorAction SilentlyContinue
    if (-not $Target) {
        Remove-Item -LiteralPath $SwarmPidFile -Force -ErrorAction SilentlyContinue
        Write-Status "PANIC" "PID $PidValue is no longer running; stale marker removed." DarkGray
        return $true
    }

    $Identity = "$($Target.Name) $($Target.ExecutablePath) $($Target.CommandLine)"
    if ($Identity -notmatch '(?i)(swarm|launch-windows)') {
        Write-Status "REFUSE" "PID $PidValue no longer looks like Studio's Swarm launcher. Not killing a recycled PID." Red
        Write-Status "TARGET" $Identity Yellow
        return $false
    }

    Write-Status "PANIC" "Killing Studio-owned Swarm + child Comfy process tree (PID $PidValue)..." Red
    & taskkill.exe /PID $PidValue /T /F | Out-Null
    $Killed = ($LASTEXITCODE -eq 0)
    if ($Killed) {
        Remove-Item -LiteralPath $SwarmPidFile -Force -ErrorAction SilentlyContinue
        Write-Status "STOPPED" "Backend process tree is down." Green
    } else {
        Write-Status "ERROR" "taskkill exited with code $LASTEXITCODE." Red
    }
    return $Killed
}

function Invoke-StudioProcess([string[]]$Arguments) {
    $Seen = @{}
    # Route the full npm/Tauri descendant tree through cmd's redirected stdout handle. Calling
    # npm.cmd directly from a PowerShell pipeline lets some inherited Cargo/Tauri console writes
    # bypass the pipeline entirely, which made the forensic runner log misleadingly incomplete.
    $QuotedArguments = $Arguments | ForEach-Object {
        if ($_ -match '[\s"&|<>^]') { '"' + $_.Replace('"', '""') + '"' } else { $_ }
    }
    $CommandLine = "npm " + ($QuotedArguments -join " ") + " 2>&1"
    & $env:ComSpec /D /S /C $CommandLine | ForEach-Object {
        $RawLine = $_.ToString()
        # Managed Swarm lines are written directly by the Tauri bridge so they remain forensic
        # even when inherited child console output bypasses PowerShell. Avoid double-writing them
        # when cmd redirection successfully captures the same line too.
        if ($RawLine -notmatch '^\s*\[Swarm\]') {
            Add-Content -LiteralPath $RunnerLog -Value $RawLine -Encoding UTF8
        }

        if ($VerboseRunner) {
            Write-Host $RawLine
        } else {
            $Line = (Remove-Ansi $RawLine).TrimEnd()
            if (-not [string]::IsNullOrWhiteSpace($Line)) {
                if ($Line -match '^>\s') {
                    # npm script headers are preserved in the raw log only.
                } elseif ($Line -match 'VITE v[0-9.]+' -and -not $Seen.ContainsKey('vite')) {
                    $Seen['vite'] = $true
                    Write-Status "WEB" "Frontend is ready on port 1420." Green
                } elseif ($Line -match '^\s*[>-]\s*(Local|Network):\s') {
                    # Vite repeats addresses already shown by the runner.
                } elseif ($Line -match 'Running BeforeDevCommand' -or $Line -match 'Running DevCommand' -or $Line -match 'Info Watching') {
                    # Tauri lifecycle boilerplate stays in the raw log.
                } elseif ($Line -match '^\s*Compiling swarm-studio' -and -not $Seen.ContainsKey('compile')) {
                    $Seen['compile'] = $true
                    Write-Status "DESKTOP" "Compiling native shell..." Cyan
                } elseif ($Line -match '^\s*Finished .* target' -and -not $Seen.ContainsKey('finished')) {
                    $Seen['finished'] = $true
                    Write-Status "DESKTOP" "Native shell is ready." Green
                } elseif ($Line -match '^\s*Running [`'']?target[\/].*swarm-studio' -and -not $Seen.ContainsKey('window')) {
                    $Seen['window'] = $true
                    Write-Status "WINDOW" "Swarm Studio launched." Green
                } elseif ($Line -match '^\[Swarm\] Launched SwarmUI as process ([0-9]+)') {
                    Write-Status "SWARM" "Backend process launched (PID $($Matches[1]))." Green
                } elseif ($Line -match '^\[Swarm\] Pulling latest changes') {
                    Write-Status "SWARM" "Checking backend updates..." Cyan
                } elseif ($Line -match '^\[Swarm\] Already up to date') {
                    Write-Status "SWARM" "Backend source is current." Green
                } elseif ($Line -match '^\[Swarm\].*SwarmUI v.*Starting' -and -not $Seen.ContainsKey('swarm-start')) {
                    $Seen['swarm-start'] = $true
                    Write-Status "SWARM" "SwarmUI is starting." Cyan
                } elseif ($Line -match '^\[Swarm\].*Local is now running' -and -not $Seen.ContainsKey('swarm-online')) {
                    $Seen['swarm-online'] = $true
                    Write-Status "SWARM" "SwarmUI is online." Green
                } elseif ($Line -match '^\[Swarm\].*(BUILD FAILED|Restoring backup)' -and -not $Seen.ContainsKey('swarm-build-failed')) {
                    $Seen['swarm-build-failed'] = $true
                    Write-Status "SWARM" "Backend update build failed; previous source is being restored. See runner log." Red
                } elseif ($Line -match '^\[Swarm\].*Self-Start ComfyUI.*unexpectedly exited' -and -not $Seen.ContainsKey('comfy-exit')) {
                    $Seen['comfy-exit'] = $true
                    Write-Status "COMFY" "Backend exited unexpectedly; Swarm may restart it. See Studio Logs." Red
                } elseif ($Line -match '^\[Swarm\].*(Windows fatal exception|access violation|MemoryError|hostbuf_file_reader_read)' -and -not $Seen.ContainsKey('comfy-crash')) {
                    $Seen['comfy-crash'] = $true
                    Write-Status "COMFY" "Model/backend process crashed. Full traceback is in the runner log." Red
                } elseif ($Line -match '^\[Swarm\].*No backends are available' -and -not $Seen.ContainsKey('no-backend')) {
                    $Seen['no-backend'] = $true
                    Write-Status "COMFY" "No generation backend is currently available." Red
                } elseif ($Line -match '^\[Swarm\].*rate limit exceeded' -and -not $Seen.ContainsKey('github-rate')) {
                    $Seen['github-rate'] = $true
                    Write-Status "COMFY" "GitHub API rate limit hit while checking frontend assets; cached/default frontend may be used." Yellow
                } elseif ($Line -match '^\[Swarm\].*new version of SwarmUI is available' -and -not $Seen.ContainsKey('swarm-update')) {
                    $Seen['swarm-update'] = $true
                    Write-Status "SWARM" "A backend update is available. Use Settings > Backends when you want it." Yellow
                } elseif ($Line -match '^\[Swarm\].*Invalid value for parameter' -and -not $Seen.ContainsKey('request-reject')) {
                    $Seen['request-reject'] = $true
                    Write-Status "REQUEST" "Swarm rejected a generation parameter. See Studio Logs for the exact field/value." Red
                } elseif ($Line -match '^\[Swarm\]') {
                    # Swarm/Comfy owns a very noisy stderr stream (compiler diagnostics, optional
                    # acceleration warnings, Python tracebacks, etc.). Native Studio writes every
                    # raw line to the forensic runner log and the Logs tab mirrors backend events.
                    # Pretty mode only surfaces the curated operational summaries above.
                } elseif ($Line -match '(?i)\b(error|failed|failure|panic|exception|fatal)\b') {
                    $Preview = if ($Line.Length -gt 180) { $Line.Substring(0, 177) + "..." } else { $Line }
                    Write-Status "ERROR" $Preview Red
                } elseif ($Line -match '(?i)\bwarn(ing)?\b') {
                    $Preview = if ($Line.Length -gt 180) { $Line.Substring(0, 177) + "..." } else { $Line }
                    Write-Status "WARN" $Preview Yellow
                }
            }
        }
    }
    return $LASTEXITCODE
}

function Install-StudioFirewallRule {
    if ($env:OS -ne "Windows_NT") {
        Write-Status "SKIP" "Firewall setup is only needed on Windows." DarkGray
        return
    }

    $RuleName = "Swarm Studio Mobile 1420"
    $RemoteRanges = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10,fc00::/7,fd7a:115c:a1e0::/48"
    $Command = "Get-NetFirewallRule -DisplayName '$RuleName' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName '$RuleName' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 1420 -Profile Any -RemoteAddress $RemoteRanges | Out-Null"
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
    $IsAdmin = $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    Write-Status "FIREWALL" "Installing the optional LAN/Tailscale rule for port 1420..." Yellow
    try {
        if ($IsAdmin) {
            Invoke-Expression $Command
        } else {
            Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList "-NoProfile", "-Command", $Command
        }
        Write-Status "FIREWALL" "Rule ready. Normal launches will not elevate again." Green
    } catch {
        Write-Warning "Could not configure the optional port 1420 firewall rule. Desktop still works; Windows Firewall may block phone/LAN access."
    }
}

function Get-StudioAddresses {
    try {
        return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -notlike "127.*" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.PrefixOrigin -ne "WellKnown"
            } |
            ForEach-Object {
                $Kind = if ($_.IPAddress -like "100.*") { "Tailscale" }
                    elseif ($_.IPAddress -like "10.*" -or $_.IPAddress -like "192.168.*" -or $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[01])\.') { "LAN" }
                    else { "Other" }
                [PSCustomObject]@{
                    Address = $_.IPAddress
                    Kind = $Kind
                    Interface = $_.InterfaceAlias
                    Metric = $_.InterfaceMetric
                }
            } |
            Sort-Object @{Expression={ if ($_.Kind -eq "LAN") { 0 } elseif ($_.Kind -eq "Tailscale") { 1 } else { 2 } }}, Metric, Address
    } catch {
        return @()
    }
}

Write-StudioBanner
if ($EmergencyStop) {
    Write-Status "PANIC" "Emergency backend stop requested." Red
    $Stopped = Stop-StudioOwnedBackendTree
    Write-Host ""
    if ($Stopped) { exit 0 }
    exit 1
}

Write-Status "BOOT" "Preparing Swarm Studio runner."
Set-Content -LiteralPath $RunnerLog -Value ("Swarm Studio runner log - " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) -Encoding UTF8

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Install Node.js 20+ and reopen PowerShell."
}

if (-not (Test-Path (Join-Path $Root "node_modules\@tauri-apps\api"))) {
    Write-Status "DEPS" "Installing JavaScript dependencies..." Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
} else {
    Write-Status "DEPS" "JavaScript dependencies are ready." Green
}

# Firewall configuration is opt-in now. The old every-launch elevation was a workaround for
# LAN failures that were ultimately caused by crypto.randomUUID() being unavailable on plain
# private-network HTTP. The ID fallback fixed that root cause, so normal startup stays unelevated.
if ($SetupFirewall) {
    Install-StudioFirewallRule
}

if (-not $NoShortcut) {
    $Desktop = [Environment]::GetFolderPath("Desktop")
    $ShortcutPath = Join-Path $Desktop "Swarm Studio.lnk"
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = "powershell.exe"
    $Shortcut.Arguments = "-NoLogo -ExecutionPolicy Bypass -File `"$Root\start.ps1`""
    $Shortcut.WorkingDirectory = $Root
    $Icon = Join-Path $Root "src-tauri\icons\icon.ico"
    if (Test-Path $Icon) { $Shortcut.IconLocation = $Icon }
    $Shortcut.Description = "Start Swarm Studio for desktop and mobile"
    $Shortcut.Save()

    $EmergencyShortcutPath = Join-Path $Desktop "Swarm Studio - Emergency Stop.lnk"
    $EmergencyShortcut = $Shell.CreateShortcut($EmergencyShortcutPath)
    $EmergencyShortcut.TargetPath = "powershell.exe"
    $EmergencyShortcut.Arguments = "-NoLogo -ExecutionPolicy Bypass -File `"$Root\start.ps1`" -EmergencyStop -NoShortcut"
    $EmergencyShortcut.WorkingDirectory = $Root
    if (Test-Path $Icon) { $EmergencyShortcut.IconLocation = $Icon }
    $EmergencyShortcut.Description = "Emergency stop the Studio-owned Swarm and Comfy process tree"
    $EmergencyShortcut.Save()
    Write-Status "SHORTCUT" "Desktop launcher + Emergency Stop are ready." Green
}

$env:SWARM_STUDIO_RELAY_TARGET = if ($env:SWARM_STUDIO_RELAY_TARGET) { $env:SWARM_STUDIO_RELAY_TARGET } else { "http://127.0.0.1:7801" }
$StudioAddresses = @(Get-StudioAddresses)

Write-Host ""
Write-Status "READY" "Studio will listen on port 1420." Green
Write-Host ("  {0,-18} {1}" -f "Local", "http://127.0.0.1:1420") -ForegroundColor Cyan
foreach ($Item in $StudioAddresses) {
    $Label = if ($Item.Kind -eq "Tailscale") { "Tailscale" } elseif ($Item.Kind -eq "LAN") { "LAN" } else { "Network" }
    Write-Host ("  {0,-18} http://{1}:1420  [{2}]" -f $Label, $Item.Address, $Item.Interface) -ForegroundColor Cyan
}
if (-not $StudioAddresses) {
    Write-Status "NETWORK" "No non-loopback IPv4 address detected; desktop access is still available." Yellow
}
Write-Host ""
if (-not $SetupFirewall) {
    Write-Status "NETWORK" "Firewall unchanged. Use -SetupFirewall only if LAN access is blocked." DarkGray
}
Write-Status "LOG" ".swarm-studio-runner.log keeps captured dev + backend output." DarkGray
Write-Status "PANIC" "Emergency Stop shortcut or .\start.ps1 -EmergencyStop kills the owned Swarm + Comfy tree." DarkGray
if (-not $VerboseRunner) {
    Write-Status "TIP" "Use -VerboseRunner to show the raw dev stream live." DarkGray
}
Write-Host ""
Write-Host '  ------------------------------------------------------------' -ForegroundColor DarkGray
Write-Host ""

if ($WebOnly) {
    Write-Status "MODE" "Starting browser/PWA mode." Cyan
    $ExitCode = Invoke-StudioProcess @("run", "dev", "--", "--host", "0.0.0.0", "--port", "1420")
    Write-Host ""
    Write-Status "EXIT" "Browser runner stopped with code $ExitCode." $(if ($ExitCode -eq 0) { [ConsoleColor]::DarkGray } else { [ConsoleColor]::Red })
    exit $ExitCode
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Status "MODE" "Rust/Cargo was not found; falling back to browser/PWA mode." Yellow
    $ExitCode = Invoke-StudioProcess @("run", "dev", "--", "--host", "0.0.0.0", "--port", "1420")
    Write-Host ""
    Write-Status "EXIT" "Browser runner stopped with code $ExitCode." $(if ($ExitCode -eq 0) { [ConsoleColor]::DarkGray } else { [ConsoleColor]::Red })
    exit $ExitCode
}

Write-Status "MODE" "Starting Tauri desktop development window." Cyan
$ExitCode = Invoke-StudioProcess @("run", "tauri:dev")
Write-Host ""
Write-Status "EXIT" "Swarm Studio stopped with code $ExitCode." $(if ($ExitCode -eq 0) { [ConsoleColor]::DarkGray } else { [ConsoleColor]::Red })
exit $ExitCode
