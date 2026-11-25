# Standalone Studio source exporter. Windows PowerShell 5.1 / PowerShell 7.
# Run from the Studio checkout, or pass -Root. -Preview performs no writes.
[CmdletBinding()]
param(
    [string]$Root = (Get-Location).Path,
    [string]$Output = '',
    [switch]$Preview
)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root).TrimEnd([char]'\',[char]'/')
if (-not (Test-Path -LiteralPath $Root -PathType Container)) { throw "Repository not found: $Root" }
if (-not $Output) { $Output = Join-Path (Split-Path $Root -Parent) 'standalone-studio-source.zip' }
$Output = [IO.Path]::GetFullPath($Output)
$prefix = $Root + [IO.Path]::DirectorySeparatorChar
if ($Output.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output must be outside the checkout.' }
if ([IO.Path]::GetExtension($Output) -ne '.zip') { throw 'Output must be a .zip file.' }
$required = @('package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','src-tauri/Cargo.toml')
foreach ($rel in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root $rel) -PathType Leaf)) { throw "Missing expected Studio build input: $rel. No archive written." }
}
foreach ($dir in @('src','src-tauri/src')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root $dir) -PathType Container)) { throw "Missing Studio source directory: $dir" }
}
# Read NUL-separated Git paths without PowerShell's line-oriented native output
# conversion. Include current working-tree edits and non-ignored untracked files.
$git = (Get-Command git -CommandType Application | Select-Object -First 1).Source
function Invoke-GitText([string]$arguments) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $git
    $psi.Arguments = $arguments
    $psi.WorkingDirectory = $Root
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $psi
    try {
        if (-not $p.Start()) { throw 'Could not start Git.' }
        $stderr = $p.StandardError.ReadToEndAsync()
        $out = $p.StandardOutput.ReadToEnd()
        $p.WaitForExit()
        if ($p.ExitCode -ne 0) { throw ('Git failed: ' + $stderr.GetAwaiter().GetResult()) }
        return $out
    } finally { $p.Dispose() }
}
if ((Invoke-GitText 'rev-parse --show-prefix').Trim().Length -ne 0) { throw 'Root must be the Git checkout root.' }
$raw = Invoke-GitText 'ls-files --cached --others --exclude-standard -z'
$includeDirs = @('src','src-tauri','public','scripts','tests','docs','prototypes','types','shared','config','workflows','assets','icons','.github','.cargo')
$skipDirs = @('.git','node_modules','target','dist','user-data','userdata','user_data','appdata','localappdata','generated-images','credentials','secrets','coverage','test-results','playwright-report','.playwright','.cache','.vite','.turbo','tmp','temp','__pycache__')
$skipExt = @('.pem','.p12','.pfx','.p8','.key','.keystore','.jks','.sqlite','.sqlite3','.db','.db-wal','.db-shm','.log','.bak','.tmp','.safetensors','.ckpt','.gguf','.pt','.pth','.onnx','.zip','.7z','.rar','.exe','.msi','.dmg','.appimage')
$rootNames = @('package.json','package-lock.json','bun.lock','bun.lockb','pnpm-lock.yaml','yarn.lock','index.html','license','license.md','license.txt','readme','readme.md','start.ps1','.gitignore','.gitattributes','.editorconfig','rust-toolchain.toml','rust-toolchain','biome.json','biome.jsonc','.prettierrc','.eslintrc')
$sourceFiles = New-Object 'System.Collections.Generic.List[string]'
$seen = @{}
$skipped = 0
foreach ($rel in $raw.Split([char]0)) {
    if (-not $rel) { continue }
    $parts = $rel.Split('/')
    if ($parts -contains '..' -or $parts -contains '.' -or $rel.Contains('\') -or [IO.Path]::IsPathRooted($rel)) { throw 'Unsafe Git path detected.' }
    $name = $parts[$parts.Length - 1]
    if ($parts.Length -eq 1) {
        if (($rootNames -notcontains $name) -and ($name -notmatch '^(?:changelog(?:[-.][\w.-]+)?\.md|tsconfig(?:\.[\w.-]+)?\.json|(?:vite|vitest|playwright|eslint|prettier|postcss|tailwind|rollup|webpack)\.config\.[\w.]+)$')) { $skipped++; continue }
    } elseif ($includeDirs -notcontains $parts[0]) { $skipped++; continue }
    $blocked = $false
    # Do not filter generic source module names such as history, projects, output or build.
    for ($i = 0; $i -lt $parts.Length - 1; $i++) { if ($skipDirs -contains $parts[$i]) { $blocked = $true; break } }
    if ($blocked -or ($skipExt -contains [IO.Path]::GetExtension($name)) -or
        $name -match '^(?:\.env(?:\.|$)|\.swarm-studio-runner(?:\.|$)|\.npmrc$|id_(?:rsa|ed25519)(?:\.|$))' -or
        $name -match '^(?:credentials?|secrets?|tokens?|auth[-_.]?tokens?|cookies?|sessions?|local[-_.]?(?:settings|config)|(?:settings|config)[-_.]?(?:local|private)|user[-_.]?(?:settings|config|data)|connections(?:[-_.]local)?|api[-_.]?keys?)(?:\.local)?\.(?:jsonc?|toml|ya?ml|ini|txt)$') { $skipped++; continue }
    $full = [IO.Path]::GetFullPath((Join-Path $Root $rel))
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes checkout: $rel" }
    # Deleted tracked files should not be resurrected from Git's index.
    if (-not (Test-Path -LiteralPath $full)) { $skipped++; continue }
    $current = $Root
    foreach ($part in $parts) {
        $current = Join-Path $current $part
        $item = Get-Item -LiteralPath $current -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing symlink/junction in candidate path: $rel" }
    }
    if ($item.PSIsContainer) { throw "Nested repository or non-file candidate: $rel" }
    if ($seen.ContainsKey($rel)) { continue }
    $seen[$rel] = $true
    $sourceFiles.Add($rel)
}
foreach ($rel in $required) { if (-not $seen.ContainsKey($rel)) { throw "Required build input excluded: $rel" } }
foreach ($dir in @('src/','src-tauri/src/')) {
    if (@($sourceFiles | Where-Object { $_.StartsWith($dir,[StringComparison]::OrdinalIgnoreCase) }).Count -eq 0) { throw "No source files found under $dir" }
}
# Check literal Rust include! inputs. Dynamic macro paths still require review.
foreach ($rel in $sourceFiles) {
    if ([IO.Path]::GetExtension($rel) -ne '.rs') { continue }
    $full = Join-Path $Root $rel
    $body = [IO.File]::ReadAllText($full)
    foreach ($m in [regex]::Matches($body, 'include(?:_str|_bytes)?!\s*\(\s*"([^"]+)"\s*\)')) {
        $target = [IO.Path]::GetFullPath((Join-Path (Split-Path $full -Parent) $m.Groups[1].Value))
        if (-not $target.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw "External Rust include in $rel" }
        $targetRel = $target.Substring($prefix.Length).Replace('\','/')
        if (-not $seen.ContainsKey($targetRel)) { throw "Missing literal Rust include: $rel -> $targetRel" }
    }
}
# Conservative high-confidence credential scan; never print matched values.
# This is a guardrail, not a comprehensive secret scanner.
$secretPattern = '(?i)-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{32,}|AIza[0-9A-Za-z_-]{35}|AKIA[A-Z0-9]{16})\b'
$textExt = @('.json','.jsonc','.ts','.tsx','.js','.jsx','.mjs','.cjs','.rs','.toml','.yaml','.yml','.md','.txt','.html','.css','.svg','.ps1','.sh','.ini','.xml','.lock','.py','.bat','.cmd','.properties')
function Assert-NoKnownSecret([string]$path,[string]$rel) {
    if (($textExt -contains [IO.Path]::GetExtension($rel)) -and ([IO.File]::ReadAllText($path) -match $secretPattern)) {
        throw "Possible credential in $rel. Review locally before exporting. No secret value printed."
    }
}
$ordered = @($sourceFiles | Sort-Object)
foreach ($rel in $ordered) { Assert-NoKnownSecret (Join-Path $Root $rel) $rel }
Write-Host "Selected $($ordered.Count) files; skipped $skipped Git-listed paths. Ignored untracked files are not enumerated."
if ($Preview) {
    $ordered | Write-Output
    Write-Host 'Preview only. No files written.' -ForegroundColor Green
    return
}
$parent = Split-Path $Output -Parent
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw "Output folder does not exist: $parent" }
if ($seen.ContainsKey('SOURCE-EXPORT-MANIFEST.json')) { throw 'Manifest name collision.' }
$stage = Join-Path ([IO.Path]::GetTempPath()) ('studio-source-' + [guid]::NewGuid().ToString('N'))
$tempZip = Join-Path $parent ('studio-source-' + [guid]::NewGuid().ToString('N') + '.zip')
$utf8 = New-Object Text.UTF8Encoding($false)
try {
    New-Item -ItemType Directory -Path $stage | Out-Null
    $records = foreach ($rel in $ordered) {
        $dest = Join-Path $stage $rel
        New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $Root $rel) -Destination $dest
        Assert-NoKnownSecret $dest $rel
        [ordered]@{ path = $rel; bytes = (Get-Item -LiteralPath $dest).Length; sha256 = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $manifest = [ordered]@{ format = 1; application = 'Standalone Studio'; sourceFiles = @($records); policy = 'Working-tree tracked and non-ignored untracked source allowlist; no source rewriting.' }
    [IO.File]::WriteAllText((Join-Path $stage 'SOURCE-EXPORT-MANIFEST.json'),(($manifest | ConvertTo-Json -Depth 8) + "`n"),$utf8)
    Add-Type -AssemblyName System.IO.Compression -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
    [IO.Compression.ZipFile]::CreateFromDirectory($stage,$tempZip,[IO.Compression.CompressionLevel]::Optimal,$false)
    $zip = [IO.Compression.ZipFile]::OpenRead($tempZip)
    try {
        $entries = @{}
        foreach ($entry in $zip.Entries) {
            $key = $entry.FullName.Replace('\','/')
            if ($entries.ContainsKey($key)) { throw "Duplicate archive entry: $key" }
            $entries[$key] = $entry
        }
        if ($entries.Count -ne ($ordered.Count + 1) -or -not $entries.ContainsKey('SOURCE-EXPORT-MANIFEST.json')) { throw 'ZIP entry count/manifest verification failed.' }
        foreach ($record in $records) {
            if (-not $entries.ContainsKey($record.path)) { throw "Missing ZIP entry: $($record.path)" }
            $stream = $entries[$record.path].Open()
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
            finally { $stream.Dispose(); $sha.Dispose() }
            if ($hash -ne $record.sha256 -or $entries[$record.path].Length -ne $record.bytes) { throw "ZIP verification failed: $($record.path)" }
        }
    } finally { $zip.Dispose() }
    if (Test-Path -LiteralPath $Output) {
        $backup = "$Output.$([guid]::NewGuid().ToString('N')).bak"
        [IO.File]::Replace($tempZip,$Output,$backup)
        Write-Host "Previous archive backed up: $backup"
    } else { [IO.File]::Move($tempZip,$Output) }
    Write-Host "Verified source ZIP: $Output" -ForegroundColor Green
    Write-Host "SHA256: $((Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash)"
    Write-Warning 'Review ZIP contents before sharing. Tracked source, docs, fixtures and assets can still contain personal information or hardcoded secrets. No original files were modified.'
} finally {
    if (Test-Path -LiteralPath $tempZip) { Remove-Item -LiteralPath $tempZip -Force }
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
