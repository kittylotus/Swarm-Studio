import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Normal starts (including older shortcuts and managed relaunches) must never
// touch the desktop. Keep the static contract active even on non-Windows CI.
const source = readFileSync('start.ps1', 'utf8').replace(/\r\n/g, '\n');
assert.match(source, /\[switch\]\$CreateShortcuts\b/);
assert.match(source, /\[switch\]\$NoShortcut\b/);
const shortcutBlock = source.match(/^if \(\$CreateShortcuts -and -not \$NoShortcut\) \{\n[\s\S]*?^\}/m)?.[0];
assert.ok(shortcutBlock, 'Desktop shortcut creation must be explicitly opted into');
assert.equal((shortcutBlock.match(/\.CreateShortcut\(/g) ?? []).length, 2);
assert.equal((shortcutBlock.match(/\.Save\(\)/g) ?? []).length, 2);
assert.doesNotMatch(source.replace(shortcutBlock, ''), /WScript\.Shell|\.CreateShortcut\(/i);
assert.match(shortcutBlock, /\$Shortcut\.Arguments = [^\n]* -NoShortcut"/);
assert.match(shortcutBlock, /\$EmergencyShortcut\.Arguments = [^\n]* -EmergencyStop -NoShortcut"/);
console.log('Desktop shortcut opt-in source contract: ok');

if (process.platform !== 'win32') {
  console.log('Standalone Windows startup fixture: skipped on non-Windows host');
} else {
  mkdirSync('test-results', {recursive:true});
  const root=mkdtempSync(resolve('test-results/standalone-startup-'));
  mkdirSync(join(root,'scripts'));mkdirSync(join(root,'Comfy install'));
  copyFileSync('scripts/start-standalone.ps1',join(root,'scripts/start-standalone.ps1'));
  writeFileSync(join(root,'Comfy install/main.py'),'# Fixture only; never executed\n');
  writeFileSync(join(root,'Comfy install/python.exe'),'Fixture only; Start-Process is mocked\n');
  writeFileSync(join(root,'start.ps1'),`param([switch]$WebOnly)\n$global:Events.Add('studio')\n`);
  const runner=join(root,'run.ps1');
  writeFileSync(runner,`param([string]$Scenario)
$ErrorActionPreference='Stop'
$global:Events=New-Object 'System.Collections.Generic.List[string]'
$global:Probes=0
function Invoke-RestMethod {
  param($Uri,$TimeoutSec)
  $global:Probes++
  if ($Scenario -eq 'existing' -or ($Scenario -eq 'ready' -and $global:Probes -ge 3)) {
    $global:Events.Add('ready')
    return @{system=@{comfyui_version='fixture'};devices=@()}
  }
  $global:Events.Add('waiting')
  throw 'Fixture not ready'
}
function Start-Process {
  param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError)
  if ($WindowStyle -ne 'Hidden') {throw 'Helper must launch a hidden background process'}
  if ($ArgumentList -notmatch '"[^"\\r\\n]+main.py"') {throw 'main.py path must be quoted'}
  $global:Events.Add('comfy')
  return [pscustomobject]@{HasExited=($Scenario -eq 'exit')}
}
$Comfy=Join-Path $PSScriptRoot 'Comfy install'
if ($Scenario -eq 'missing') {$Comfy=Join-Path $PSScriptRoot 'missing'}
$Message=''
try { & (Join-Path $PSScriptRoot 'scripts/start-standalone.ps1') -ComfyRoot $Comfy -ComfyPython (Join-Path $PSScriptRoot 'Comfy install/python.exe') -TimeoutSeconds 5 }
catch {$Message=$_.Exception.Message}
@{events=@($global:Events);message=$Message} | ConvertTo-Json -Compress
`);
  const run=scenario=>{
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',runner,scenario],{encoding:'utf8',windowsHide:true,timeout:20000});
    assert.equal(result.status,0,result.stderr||result.stdout);
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  };
  // Execute the exact shortcut branch from the production runner with a fake
  // WScript.Shell. No real shortcuts, backend processes or dependencies touched.
  const shortcutRunner = join(root, 'shortcuts.ps1');
  writeFileSync(shortcutRunner, `param([switch]$CreateShortcuts,[switch]$NoShortcut)
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$global:Saved=@()
$global:ShellCalls=0
function Write-Status {}
function Join-Path {
  param([AllowEmptyString()][string]$Path,[string]$ChildPath)
  if (-not $Path) { $Path=$PSScriptRoot }
  return [IO.Path]::Combine($Path,$ChildPath)
}
function New-Object {
  param([string]$ComObject)
  if ($ComObject -ne 'WScript.Shell') { throw 'Unexpected COM object' }
  $global:ShellCalls++
  $shell=[pscustomobject]@{}
  $shell | Add-Member ScriptMethod CreateShortcut {
    param($Path)
    $link=[pscustomobject]@{Path=$Path;TargetPath='';Arguments='';WorkingDirectory='';IconLocation='';Description=''}
    $link | Add-Member ScriptMethod Save { $global:Saved+=@{name=[IO.Path]::GetFileName($this.Path);args=$this.Arguments} }
    return $link
  }
  return $shell
}
${shortcutBlock}
@{calls=$global:ShellCalls;saved=@($global:Saved)} | ConvertTo-Json -Compress -Depth 4
`);
  const runShortcuts = (...flags) => {
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',shortcutRunner,...flags],{encoding:'utf8',windowsHide:true,timeout:20000});
    assert.equal(result.status,0,result.stderr||result.stdout);
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  };
  for (const flags of [[],['-NoShortcut'],['-CreateShortcuts','-NoShortcut']]) {
    assert.deepEqual(runShortcuts(...flags), {calls:0,saved:[]});
  }
  const shortcuts = runShortcuts('-CreateShortcuts');
  assert.equal(shortcuts.calls,1);
  assert.deepEqual(shortcuts.saved.map(link=>link.name),['Swarm Studio.lnk','Swarm Studio - Emergency Stop.lnk']);
  assert.match(shortcuts.saved[0].args,/ -NoShortcut$/);
  assert.match(shortcuts.saved[1].args,/ -EmergencyStop -NoShortcut$/);
  console.log('Desktop shortcut opt-in / legacy opt-out mocked Windows fixture: ok');
  const ready=run('ready');assert.equal(ready.message,'');assert.deepEqual(ready.events,['waiting','comfy','waiting','ready','studio']);
  const existing=run('existing');assert.equal(existing.message,'');assert.deepEqual(existing.events,['ready','studio']);
  const exited=run('exit');assert.match(exited.message,/exited before becoming ready/);assert.equal(exited.events.includes('studio'),false);
  const timeout=run('timeout');assert.match(timeout.message,/not ready within 5 seconds/);assert.equal(timeout.events.includes('studio'),false);
  const missing=run('missing');assert.match(missing.message,/Required file not found/);assert.deepEqual(missing.events,[]);
  console.log('Standalone startup order, reuse, early-exit, timeout and validation fixtures: ok');
}
