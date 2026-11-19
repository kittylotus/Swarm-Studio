import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { createStudioSourceUpdater, handleStudioSourceRequest } from '../scripts/studio-source-updater.mjs';

const exec = promisify(execFile);
const temp = await mkdtemp(path.join(tmpdir(), 'studio source tést-'));
const git = async (cwd, ...args) => (await exec('git', ['-C', cwd, ...args], { windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let server;
try {
  const remote = path.join(temp, 'remote.git'), seed = path.join(temp, 'seed'), root = path.join(temp, 'host');
  await exec('git', ['init', '--bare', remote]);
  await exec('git', ['clone', remote, seed]);
  await git(seed, 'config', 'user.name', 'Updater Fixture');
  await git(seed, 'config', 'user.email', 'fixture@example.invalid');
  await writeFile(path.join(seed, '.gitignore'), '.swarm-studio-*.log\n');
  await writeFile(path.join(seed, '.gitattributes'), '* text eol=lf\n');
  await mkdir(path.join(seed, 'scripts'));
  await copyFile(new URL('../scripts/studio-source-worker.ps1', import.meta.url), path.join(seed, 'scripts', 'studio-source-worker.ps1'));
  await writeFile(path.join(seed, 'package.json'), JSON.stringify({ name: 'swarm-studio-standalone', version: '1.0.0', dependencies: { 'fixture-dependency': '1.0.0' } }));
  await writeFile(path.join(seed, 'start.ps1'), '[IO.File]::WriteAllText((Join-Path $PSScriptRoot ".swarm-studio-restarted.log"), (@{arguments=($args -join " ");sessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId}|ConvertTo-Json -Compress))\n');
  await git(seed, 'add', '.'); await git(seed, 'commit', '-m', 'initial Studio fixture');
  await git(seed, 'branch', '-M', 'main'); await git(seed, 'push', '-u', 'origin', 'main');
  await git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  await exec('git', ['clone', remote, root]);
  await git(root, 'config', 'user.name', 'Updater Fixture'); await git(root, 'config', 'user.email', 'fixture@example.invalid');
  const initial = await git(root, 'rev-parse', 'HEAD');
  await writeFile(path.join(seed, 'package.json'), JSON.stringify({ name: 'swarm-studio-standalone', version: '1.1.0', dependencies: { 'fixture-dependency': '1.1.0' } }));
  await git(seed, 'add', '.'); await git(seed, 'commit', '-m', 'remote update'); await git(seed, 'push');
  const target = await git(seed, 'rev-parse', 'HEAD');
  let scheduled;
  const updater = createStudioSourceUpdater({ root, stateDirectory: path.join(temp, 'state'), inspectHost: async () => ({ supported: true, mode: 'web' }), launchWorker: async details => { scheduled = details; } });
  const status = await updater.check();
  assert.equal(status.currentVersion, '1.0.0'); assert.equal(status.latestVersion, '1.1.0');
  assert.equal(status.available, true); assert.equal(status.canApply, true); assert.equal(status.latestCommit, target);
  assert.deepEqual(status.highlights, ['remote update']);
  await writeFile(path.join(root, 'local-note.txt'), 'preserve me');
  assert.equal((await updater.check()).canApply, false); await assert.rejects(updater.apply(), /untracked/);
  assert.equal(await readFile(path.join(root, 'local-note.txt'), 'utf8'), 'preserve me');
  await rm(path.join(root, 'local-note.txt'));
  await writeFile(path.join(root, 'start.ps1'), 'local change');
  await assert.rejects(updater.apply(), /local host changes/);
  await writeFile(path.join(root, 'start.ps1'), await readFile(path.join(seed, 'start.ps1')));
  assert.equal(await git(root, 'status', '--porcelain'), '', 'fixture restores the original tracked bytes');
  await git(root, 'switch', '-c', 'feature'); assert.equal((await updater.check()).canApply, false);
  await git(root, 'switch', 'main');
  await updater.activity('other-client', true); await assert.rejects(updater.apply(), /Another Studio session/);
  await updater.activity('other-client', false);
  await assert.rejects(updater.activity('../path', true), /Invalid/);
  // Exercise the exact HTTP dispatcher: accept before acknowledging shutdown.
  server = createServer(async (req, res) => {
    try { await handleStudioSourceRequest(updater, new URL(req.url, 'http://fixture').pathname, req, res); }
    catch (error) { res.statusCode = 409; res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/__studio/host-control/studio-source/`;
  const response = await fetch(base + 'apply', { method: 'POST', body: JSON.stringify({ root: 'ignored', command: 'ignored' }) });
  assert.equal(response.status, 202); const job = await response.json();
  assert.equal(scheduled.manifest.root, root); assert.equal(scheduled.manifest.targetCommit, target);
  assert.equal(scheduled.manifest.expectedCommit, initial);
  for (let i = 0; i < 30; i++) { try { await readFile(scheduled.manifest.acknowledgementFile); break; } catch { await sleep(20); } }
  assert.equal(await readFile(scheduled.manifest.acknowledgementFile, 'utf8'), 'ready');
  assert.equal((await (await fetch(base + 'status')).json()).job.jobId, job.jobId);
  await assert.rejects(updater.apply(), /already running/);
  assert.equal(await git(root, 'rev-parse', 'HEAD'), initial, 'scheduling must not modify the checkout');
  await writeFile(path.join(root, 'local-commit.txt'), 'local history'); await git(root, 'add', '.'); await git(root, 'commit', '-m', 'local history');
  const diverged = await updater.check(); assert.equal(diverged.canApply, false); assert.match(diverged.message, /diverged/);
  const unmanaged = createStudioSourceUpdater({ root: seed, stateDirectory: path.join(temp, 'unmanaged'), inspectHost: async () => ({ supported: false, message: 'Start with start.ps1' }) });
  assert.equal((await unmanaged.check()).canApply, false);
  await git(seed, 'remote', 'set-url', 'origin', path.join(temp, 'missing.git'));
  const failedCheck = await unmanaged.check();
  assert.equal(failedCheck.supported, false); assert.equal(failedCheck.available, false); assert.equal(failedCheck.canApply, false);
  await git(seed, 'remote', 'set-url', 'origin', remote);
  const zip = path.join(temp, 'zip'); await mkdir(zip); await copyFile(path.join(seed, 'package.json'), path.join(zip, 'package.json'));
  assert.equal((await createStudioSourceUpdater({ root: zip }).check()).supported, false);
  console.log('Studio source updater: Git safeguards, fixed HTTP actions, activity guard, scheduling and duplicate-job protection passed.');

  if (process.platform === 'win32') {
    // Real Windows handoff, with only disposable processes/repositories. The
    // replacement start.ps1 writes a marker instead of launching live Studio.
    const fakeVite = path.join(temp, 'fixture-vite.mjs');
    await writeFile(fakeVite, 'setInterval(() => {}, 1000);\n');
    const runnerScript = path.join(temp, 'fixture-runner.ps1');
    await writeFile(runnerScript, `param([string]$Mode,[string]$FixtureDirectory,[string]$NodeProgram,[string]$ViteScript)
$ErrorActionPreference='Stop'
function Identity([int]$Number) {
 $Info=Get-CimInstance Win32_Process -Filter "ProcessId = $Number"
 return @{processId=[int]$Info.ProcessId;parentId=[int]$Info.ParentProcessId;created=$Info.CreationDate.ToUniversalTime().ToString('o');name=$Info.Name;commandLine=$Info.CommandLine;sessionId=[int]$Info.SessionId}
}
$Child=Start-Process -FilePath $NodeProgram -ArgumentList ('"'+$ViteScript+'"') -WindowStyle Hidden -PassThru
$Window=$null; $WindowIdentity=$null
if($Mode -eq 'desktop'){$Window=Start-Process -FilePath $NodeProgram -ArgumentList ('"'+$ViteScript+'"') -WindowStyle Hidden -PassThru;$WindowIdentity=Identity $Window.Id}
$Mailbox=Join-Path $FixtureDirectory 'command.txt'
@{supported=$true;mode=$Mode;runner=(Identity $PID);branch=(Identity $Child.Id);server=(Identity $Child.Id);desktop=$WindowIdentity;commandFile=$Mailbox}|ConvertTo-Json -Depth 5 -Compress|Set-Content -Encoding UTF8 (Join-Path $FixtureDirectory 'identities.json')
if($Mode -eq 'web'){Wait-Process -Id $Child.Id -ErrorAction SilentlyContinue}
else {while($true){if((Test-Path -LiteralPath $Mailbox) -and (Get-Content -LiteralPath $Mailbox -Raw).Trim() -eq 'Q' -and -not (Get-Process -Id $Window.Id -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 100}}
`);
    for (const mode of ['web', 'desktop', 'changed-after-check']) {
      const fixtureRoot = path.join(temp, `worker-${mode}`), state = path.join(temp, `state-${mode}`);
      await exec('git', ['clone', remote, fixtureRoot]);
      // Pin this fresh, disposable clone to the earlier revision to test updating.
      await git(fixtureRoot, 'checkout', '--detach', initial);
      await git(fixtureRoot, 'branch', '-f', 'main', initial); await git(fixtureRoot, 'switch', 'main');
      await mkdir(state);
      const runner = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runnerScript,
        '-Mode', mode === 'desktop' ? 'desktop' : 'web', '-FixtureDirectory', state, '-NodeProgram', process.execPath, '-ViteScript', fakeVite], { windowsHide: true, stdio: 'ignore' });
      let managed;
      try {
        for (let i = 0; i < 150; i++) {
          try { managed = JSON.parse((await readFile(path.join(state, 'identities.json'), 'utf8')).replace(/^\uFEFF/, '')); break; } catch { await sleep(100); }
        }
        assert.ok(managed, 'isolated launcher publishes process identities');
        const worker = createStudioSourceUpdater({ root: fixtureRoot, stateDirectory: state, serverPid: managed.server.processId, inspectHost: async () => managed });
        const operation = await worker.apply();
        if (mode === 'changed-after-check') await writeFile(path.join(fixtureRoot, 'keep-this.txt'), 'untouched');
        await operation.acknowledge();
        let result;
        for (let i = 0; i < 300; i++) {
          result = (await worker.status()).job;
          if (['failed', 'complete'].includes(result?.phase)) break;
          await sleep(100);
        }
        if (mode === 'changed-after-check') {
          assert.equal(result.phase, 'failed', result.message); assert.match(result.message, /Local host changes/);
          assert.equal(await git(fixtureRoot, 'rev-parse', 'HEAD'), initial);
          assert.equal(await readFile(path.join(fixtureRoot, 'keep-this.txt'), 'utf8'), 'untouched');
          assert.equal(runner.exitCode, null, 'failed precondition must leave the old launcher running');
        } else {
          assert.equal(result.phase, 'complete', result.message);
          assert.equal(await git(fixtureRoot, 'rev-parse', 'HEAD'), target);
          let restarted;
          for (let i = 0; i < 100; i++) {
            try { restarted = await readFile(path.join(fixtureRoot, '.swarm-studio-restarted.log'), 'utf8'); break; } catch { await sleep(100); }
          }
          assert.ok(restarted?.includes('-NoShortcut'), 'detached helper relaunches through start.ps1');
          assert.equal(JSON.parse(restarted).sessionId, managed.runner.sessionId, 'restart must remain in the interactive Windows session');
          assert.equal(restarted.includes('-WebOnly'), mode === 'web', 'relaunch preserves browser/desktop mode');
          assert.ok(restarted.includes('-RefreshDependencies'));
          assert.notEqual(runner.exitCode, null, 'old runner must exit before restarting');
        }
        console.log(`Windows Studio updater handoff (${mode}) passed.`);
      } finally {
        // Only these fixture-owned PID trees may be stopped, never a port owner.
        if (runner.exitCode === null) await exec('taskkill.exe', ['/PID', String(runner.pid), '/T', '/F']).catch(() => {});
      }
    }
  }
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(temp, { recursive: true, force: true });
}
