param(
    [switch]$Inspect,
    [switch]$Detach,
    [string]$Root,
    [int]$ServerProcessId,
    [string]$ManifestFile
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

function Read-ProcessIdentity([int]$ProcessNumber) {
    $ProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessNumber" -ErrorAction Stop
    if (-not $ProcessInfo) { return $null }
    return [pscustomobject]@{
        processId = [int]$ProcessInfo.ProcessId
        parentId = [int]$ProcessInfo.ParentProcessId
        created = $ProcessInfo.CreationDate.ToUniversalTime().ToString("o")
        name = [string]$ProcessInfo.Name
        sessionId = [int]$ProcessInfo.SessionId
        commandLine = [string]$ProcessInfo.CommandLine
    }
}

function Test-ProcessIdentity($Identity) {
    if (-not $Identity) { return $false }
    $Current = Read-ProcessIdentity $Identity.processId
    return $Current -and $Current.created -eq $Identity.created -and $Current.name -eq $Identity.name
}

function Get-ManagedHost {
    if (-not $env:SWARM_STUDIO_ROOT -or [IO.Path]::GetFullPath($env:SWARM_STUDIO_ROOT) -ne [IO.Path]::GetFullPath($Root)) {
        throw "Start this Studio checkout with start.ps1 before using remote source updates."
    }
    if ($env:SWARM_STUDIO_LAUNCH_MODE -notin @("web", "desktop")) {
        throw "Restart Studio with the updated start.ps1 once to enable remote source updates."
    }
    $RunnerFile = Join-Path ([IO.Path]::GetTempPath()) "swarm-studio-runner.pid"
    $CommandFile = Join-Path ([IO.Path]::GetTempPath()) "swarm-studio-runner-command.txt"
    $DesktopFile = Join-Path ([IO.Path]::GetTempPath()) "swarm-studio-desktop.pid"
    $RunnerNumber = [int]([string](Get-Content -LiteralPath $RunnerFile -Raw)).Trim()
    $Runner = Read-ProcessIdentity $RunnerNumber
    if (-not $Runner -or $Runner.name -notmatch '^(powershell|pwsh)\.exe$') { throw "The Studio launcher is no longer running." }
    $Server = Read-ProcessIdentity $ServerProcessId
    if (-not $Server -or $Server.name -ne "node.exe" -or $Server.commandLine -notmatch 'vite') { throw "The Studio web server could not be verified." }
    $Branch = $Server
    $Found = $false
    for ($Step = 0; $Step -lt 24; $Step++) {
        if ($Branch.parentId -eq $RunnerNumber) { $Found = $true; break }
        $Branch = Read-ProcessIdentity $Branch.parentId
        if (-not $Branch) { break }
    }
    if (-not $Found) { throw "This web server is not owned by the Studio launcher. Restart it with start.ps1." }
    $Desktop = $null
    if (Test-Path -LiteralPath $DesktopFile -PathType Leaf) {
        $Candidate = Read-ProcessIdentity ([int]([string](Get-Content -LiteralPath $DesktopFile -Raw)).Trim())
        if ($Candidate) {
            if ($Candidate.name -notmatch '^swarm[-_ ]studio\.exe$') { throw "The desktop PID marker does not identify Studio." }
            $Ancestor = $Candidate
            $Owned = $false
            for ($Step = 0; $Step -lt 24; $Step++) {
                if ($Ancestor.parentId -eq $RunnerNumber) { $Owned = $true; break }
                $Ancestor = Read-ProcessIdentity $Ancestor.parentId
                if (-not $Ancestor) { break }
            }
            if (-not $Owned) { throw "The desktop window is not owned by this Studio launcher." }
            $Desktop = $Candidate
        }
    }
    return @{ supported = $true; mode = $env:SWARM_STUDIO_LAUNCH_MODE; runner = $Runner; branch = $Branch; server = $Server; desktop = $Desktop; commandFile = $CommandFile }
}

if ($Inspect) {
    try { Get-ManagedHost | ConvertTo-Json -Depth 5 -Compress }
    catch { @{ supported = $false; message = $_.Exception.Message } | ConvertTo-Json -Compress }
    exit 0
}

if ($Detach) {
    # WMI creates an independent process: stopping Vite's verified child tree must
    # not kill the updater along with the HTTP server that launched it.
    $Worker = $MyInvocation.MyCommand.Path
    $PowerShell = Join-Path $PSHOME "powershell.exe"
    $Startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
    $CommandLine = '"{0}" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "{1}" -ManifestFile "{2}"' -f $PowerShell, $Worker, $ManifestFile
    $Result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = $CommandLine; CurrentDirectory = (Split-Path -Parent $Worker); ProcessStartupInformation = $Startup
    }
    if ($Result.ReturnValue -ne 0) { throw "Could not detach Studio updater (Windows error $($Result.ReturnValue))." }
    @{ processId = $Result.ProcessId } | ConvertTo-Json -Compress
    exit 0
}

$Job = Get-Content -LiteralPath $ManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
$Root = [string]$Job.root
$env:PATH = $Job.pathEnvironment
$env:GIT_TERMINAL_PROMPT = "0"
$LogFile = Join-Path $Root ".swarm-studio-update.log"
$Stopped = $false
$Started = $false

function Write-UpdateState([string]$Phase, [string]$Message) {
    $State = @{ jobId = $Job.jobId; phase = $Phase; message = $Message; startedAt = $Job.startedAt; targetCommit = $Job.targetCommit; serverPid = $Job.serverPid }
    # Readers may catch the short write window and retry; no partial state is acted on.
    [IO.File]::WriteAllText($Job.jobFile, ($State | ConvertTo-Json -Compress))
    Add-Content -LiteralPath $LogFile -Value ("[{0}] {1}: {2}" -f (Get-Date -Format o), $Phase, $Message)
}

function Invoke-SourceGit([string[]]$Arguments) {
    $Output = & git -C $Root @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Git failed: $($Output -join ' ')" }
    return ($Output -join "`n").Trim()
}

function Assert-Checkout {
    if ((Invoke-SourceGit -Arguments @("rev-parse", "--show-toplevel")) -ne ($Root -replace '\\', '/')) { throw "The Studio repository root changed." }
    if (Invoke-SourceGit -Arguments @("status", "--porcelain", "--untracked-files=normal")) { throw "Local host changes appeared; Studio source update was cancelled." }
    if ((Invoke-SourceGit -Arguments @("rev-parse", "HEAD")) -ne $Job.expectedCommit) { throw "The host commit changed after checking. Check for updates again." }
    if ((Invoke-SourceGit -Arguments @("branch", "--show-current")) -ne $Job.branch) { throw "The host branch changed after checking." }
    $null = Invoke-SourceGit -Arguments @("merge-base", "--is-ancestor", $Job.expectedCommit, $Job.targetCommit)
}

function Stop-VerifiedTree($Identity) {
    if (-not $Identity) { return }
    if (-not (Test-ProcessIdentity $Identity)) {
        if (Read-ProcessIdentity $Identity.processId) { throw "A Studio process identity changed; refusing to stop it." }
        return
    }
    & taskkill.exe /PID $Identity.processId /T /F 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -and (Test-ProcessIdentity $Identity)) { throw "Could not stop a Studio-owned process." }
}

function Start-UpdatedHost {
    $Arguments = @("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"{0}"' -f (Join-Path $Root "start.ps1")), "-NoShortcut")
    if ($Job.managed.mode -eq "web") { $Arguments += "-WebOnly" }
    $BeforePackage = (Invoke-SourceGit -Arguments @("show", "$($Job.expectedCommit):package.json")) | ConvertFrom-Json
    $AfterPackage = Get-Content -LiteralPath (Join-Path $Root "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $BeforeDeps = [ordered]@{ dependencies = $BeforePackage.dependencies; devDependencies = $BeforePackage.devDependencies } | ConvertTo-Json -Compress -Depth 20
    $AfterDeps = [ordered]@{ dependencies = $AfterPackage.dependencies; devDependencies = $AfterPackage.devDependencies } | ConvertTo-Json -Compress -Depth 20
    $LockChanged = Invoke-SourceGit -Arguments @("diff", "--name-only", $Job.expectedCommit, "HEAD", "--", "package-lock.json")
    if ($LockChanged -or $BeforeDeps -ne $AfterDeps) { $Arguments += "-RefreshDependencies" }
    $null = Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") -ArgumentList $Arguments -WorkingDirectory $Root -WindowStyle Hidden -PassThru
    $script:Started = $true
}

try {
    $Deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-Path -LiteralPath $Job.acknowledgementFile -PathType Leaf)) {
        if ((Get-Date) -gt $Deadline) { throw "The mobile request disconnected before the update was acknowledged. Nothing was stopped." }
        Start-Sleep -Milliseconds 100
    }
    Assert-Checkout
    foreach ($Identity in @($Job.managed.runner, $Job.managed.branch, $Job.managed.server)) {
        if (-not (Test-ProcessIdentity $Identity)) { throw "The Studio launcher changed. Check for updates again." }
    }
    # Allow activity heartbeats from the other open Studio sessions to arrive.
    Start-Sleep -Seconds 2
    if (Test-Path -LiteralPath $Job.activityFile) {
        $Active = @(Get-Content -LiteralPath $Job.activityFile -Raw | ConvertFrom-Json)
        $Now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        if ($Active | Where-Object { $_.active -and $Now - $_.at -lt 30000 }) { throw "Another Studio session is generating or has unsaved results. Nothing was stopped." }
    }
    Write-UpdateState "stopping" "Restarting the Studio host. Remote clients will reconnect shortly."
    $Stopped = $true
    Stop-VerifiedTree $Job.managed.desktop
    Stop-VerifiedTree $Job.managed.branch
    if ($Job.managed.mode -eq "desktop" -and (Test-ProcessIdentity $Job.managed.runner)) {
        # Close the outer control loop normally; never kill its whole tree (it
        # can be an interactive PowerShell with unrelated child processes).
        [IO.File]::WriteAllText($Job.managed.commandFile, "Q")
    }
    $Deadline = (Get-Date).AddSeconds(20)
    while (Test-ProcessIdentity $Job.managed.runner) {
        if ((Get-Date) -gt $Deadline) { throw "The old Studio launcher did not exit; source files were left untouched." }
        Start-Sleep -Milliseconds 200
    }
    Assert-Checkout
    Write-UpdateState "updating" "Fast-forwarding the host Studio checkout."
    $null = Invoke-SourceGit -Arguments @("merge", "--ff-only", $Job.targetCommit)
    Write-UpdateState "restarting" "Starting Studio again; waiting for the host connection."
    Start-UpdatedHost
    Write-UpdateState "complete" "Studio source updated. Reconnecting to the host."
} catch {
    $Failure = $_.Exception.Message
    if ($Stopped -and -not $Started -and -not (Test-ProcessIdentity $Job.managed.runner)) {
        try { Start-UpdatedHost } catch { $Failure += " Restart failed: $($_.Exception.Message)" }
    }
    Write-UpdateState "failed" $Failure
} finally {
    Remove-Item -LiteralPath $Job.lockFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Job.acknowledgementFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $ManifestFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
}
