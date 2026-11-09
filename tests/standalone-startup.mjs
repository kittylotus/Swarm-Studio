import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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
  const ready=run('ready');assert.equal(ready.message,'');assert.deepEqual(ready.events,['waiting','comfy','waiting','ready','studio']);
  const existing=run('existing');assert.equal(existing.message,'');assert.deepEqual(existing.events,['ready','studio']);
  const exited=run('exit');assert.match(exited.message,/exited before becoming ready/);assert.equal(exited.events.includes('studio'),false);
  const timeout=run('timeout');assert.match(timeout.message,/not ready within 5 seconds/);assert.equal(timeout.events.includes('studio'),false);
  const missing=run('missing');assert.match(missing.message,/Required file not found/);assert.deepEqual(missing.events,[]);
  console.log('Standalone startup order, reuse, early-exit, timeout and validation fixtures: ok');
}
