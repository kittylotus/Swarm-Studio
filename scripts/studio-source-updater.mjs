import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const baseStatus = {
  supported: false, available: false, canApply: false, dirty: false, repoPath: '',
  currentVersion: '', latestVersion: '', currentCommit: '', latestCommit: '',
  commitsBehind: 0, branch: '', origin: '', message: '', highlights: [],
};

// The repository and executable are host configuration, never request parameters.
export function createStudioSourceUpdater({ root, stateDirectory, inspectHost, launchWorker, serverPid = process.pid } = {}) {
  root = path.resolve(root);
  const workerScript = path.join(root, 'scripts', 'studio-source-worker.ps1');
  const directory = stateDirectory || path.join(tmpdir(), `swarm-studio-source-${createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 20)}`);
  const jobFile = path.join(directory, 'job.json');
  const lockFile = path.join(directory, 'update.lock');
  const activityFile = path.join(directory, 'activity.json');
  const clients = new Map();
  let activityWrite = Promise.resolve();
  let preparing = false;
  let checking;
  async function git(args) {
    const { stdout } = await exec('git', ['-C', root, ...args], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, windowsHide: true,
      timeout: 45_000, maxBuffer: 512 * 1024,
    });
    return stdout.trim();
  }
  async function powershell(args) {
    const { stdout } = await exec('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ...args], {
      cwd: root, windowsHide: true, timeout: 20_000, maxBuffer: 256 * 1024,
    });
    return JSON.parse(stdout.trim());
  }
  async function host() {
    if (inspectHost) return inspectHost();
    if (process.platform !== 'win32') return { supported: false, message: 'Remote source updates currently require the Windows Studio launcher.' };
    return powershell([workerScript, '-Inspect', '-Root', root, '-ServerProcessId', String(serverPid)]);
  }
  async function checkNow() {
    const status = { ...baseStatus, highlights: [] };
    try {
      const repository = await git(['rev-parse', '--show-toplevel']);
      if ((await realpath(repository)).toLowerCase() !== (await realpath(root)).toLowerCase()) throw new Error('Studio must be served from its own Git checkout.');
      const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
      if (pkg.name !== 'swarm-studio-standalone') throw new Error('This is not a Studio source checkout.');
      status.supported = true;
      status.repoPath = root;
      status.currentVersion = pkg.version;
      status.origin = await git(['remote', 'get-url', 'origin']);
      await git(['fetch', '--prune', 'origin']);
      const defaultRef = await git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).catch(() => '');
      if (!defaultRef.startsWith('origin/')) throw new Error('The origin default branch is unknown; set origin/HEAD on the host before updating.');
      status.branch = defaultRef.slice(7);
      const remoteRef = `refs/remotes/origin/${status.branch}`;
      const head = await git(['rev-parse', 'HEAD']);
      const target = await git(['rev-parse', remoteRef]);
      status.currentCommit = head;
      status.latestCommit = target;
      status.dirty = Boolean(await git(['status', '--porcelain', '--untracked-files=normal']));
      status.commitsBehind = Number(await git(['rev-list', '--count', `HEAD..${remoteRef}`]));
      status.available = status.commitsBehind > 0;
      status.latestVersion = JSON.parse(await git(['show', `${remoteRef}:package.json`])).version || '';
      status.highlights = status.available ? (await git(['log', '-4', '--format=%s', `HEAD..${remoteRef}`])).split('\n').filter(Boolean) : [];
      const branch = await git(['branch', '--show-current']);
      const fastForward = await git(['merge-base', '--is-ancestor', head, target]).then(() => true, () => false);
      const managed = await host();
      status.canApply = status.available && !status.dirty && fastForward && branch === status.branch && managed.supported;
      status.message = status.dirty ? 'Save or commit local host changes before updating Studio; untracked files also block updates.'
        : branch !== status.branch ? `The host must be on ${status.branch} to update. Its current branch is preserved.`
        : !fastForward ? 'The host checkout has local commits or has diverged. Resolve it on the host before updating.'
        : !managed.supported ? managed.message
        : status.available ? 'A Studio source update is ready on the host. Update & restart briefly disconnects every remote client.'
        : 'The host Studio source is up to date.';
      return status;
    } catch (error) {
      status.supported = false;
      status.available = false;
      status.canApply = false;
      status.message = `Studio source check failed: ${error.message}`;
      return status;
    }
  }
  function check() {
    // Several connected clients may check at once; share the fetch.
    if (!checking) checking = checkNow().finally(() => { checking = undefined; });
    return checking;
  }
  async function activity(clientId, active) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(clientId) || typeof active !== 'boolean') throw new Error('Invalid Studio activity report.');
    const now = Date.now();
    for (const [id, value] of clients) if (now - value.at > 30_000) clients.delete(id);
    if (!clients.has(clientId) && clients.size >= 128) throw new Error('Too many Studio activity sessions.');
    clients.set(clientId, { active, at: now });
    activityWrite = activityWrite.catch(() => {}).then(async () => {
      await mkdir(directory, { recursive: true });
      // Serialize different clients too, so an older snapshot cannot overwrite
      // a newer active lease. No prompts, images or client identifiers persist.
      await writeFile(activityFile, JSON.stringify([...clients.values()].filter(value => value.active)));
    });
    await activityWrite;
  }
  async function status() {
    let job = null;
    try { job = JSON.parse(await readFile(jobFile, 'utf8')); } catch { /* No operation yet. */ }
    const currentCommit = await git(['rev-parse', 'HEAD']).catch(() => '');
    return { job, currentCommit, serverPid };
  }
  async function apply() {
    if (preparing) throw new Error('A Studio source update is already being prepared.');
    preparing = true;
    let locked = false;
    try {
      const previous = (await status()).job;
      if (previous && !['failed', 'complete'].includes(previous.phase) && Date.now() - previous.startedAt < 15 * 60_000) throw new Error('A Studio source update is already running.');
      const current = await check();
      if (!current.canApply) throw new Error(current.message);
      if ([...clients.values()].some(value => value.active && Date.now() - value.at < 30_000)) throw new Error('Another Studio session is generating or has unsaved results. Finish that work before updating.');
      try {
        const leases = JSON.parse(await readFile(activityFile, 'utf8'));
        if (leases.some(value => value.active && Date.now() - value.at < 30_000)) throw new Error('Another Studio session is generating or has unsaved results. Finish that work before updating.');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const managed = await host();
      if (!managed.supported) throw new Error(managed.message);
      await mkdir(directory, { recursive: true });
      // A previous worker releases this lock. Never schedule two restart helpers.
      try { await writeFile(lockFile, String(Date.now()), { flag: 'wx' }); }
      catch (error) {
        if (error.code === 'EEXIST') throw new Error(`The host update lock is still present. Check .swarm-studio-update.log and ${lockFile} on the host before retrying.`);
        throw error;
      }
      locked = true;
      const jobId = randomUUID();
      const manifestFile = path.join(directory, `${jobId}.json`);
      const scriptFile = path.join(directory, `${jobId}.ps1`);
      const acknowledgementFile = path.join(directory, `${jobId}.ack`);
      const job = { jobId, phase: 'scheduled', message: 'Updating the host; waiting for Studio to restart…', startedAt: Date.now(), targetCommit: current.latestCommit, serverPid };
      const manifest = { ...job, root, branch: current.branch, expectedCommit: current.currentCommit, managed,
        jobFile, lockFile, activityFile, acknowledgementFile, pathEnvironment: process.env.PATH };
      await copyFile(workerScript, scriptFile);
      await writeFile(manifestFile, JSON.stringify(manifest));
      await writeFile(jobFile, JSON.stringify(job));
      try {
        if (launchWorker) await launchWorker({ scriptFile, manifestFile, manifest });
        else await powershell([scriptFile, '-Detach', '-ManifestFile', manifestFile]);
      } catch (error) {
        await writeFile(jobFile, JSON.stringify({ ...job, phase: 'failed', message: `Could not start the update helper: ${error.message}` }));
        await Promise.allSettled([rm(manifestFile, { force: true }), rm(scriptFile, { force: true })]);
        throw error;
      }
      return { job, acknowledge: () => writeFile(acknowledgementFile, 'ready') };
    } catch (error) {
      if (locked) await rm(lockFile, { force: true });
      throw error;
    } finally { preparing = false; }
  }
  return { check, apply, status, activity };
}

// Called only after the host bridge's cookie and same-origin checks.
export async function handleStudioSourceRequest(updater, pathname, req, res) {
  if (!pathname.startsWith('/__studio/host-control/studio-source/')) return false;
  const action = pathname.split('/').at(-1);
  if (action === 'check' && req.method === 'POST') res.end(JSON.stringify(await updater.check()));
  else if (action === 'status' && req.method === 'GET') res.end(JSON.stringify(await updater.status()));
  else if (action === 'apply' && req.method === 'POST') {
    const { job, acknowledge } = await updater.apply();
    // Only permit shutdown after the acknowledgement has left the HTTP server.
    res.once('finish', () => void acknowledge().catch(() => {}));
    res.statusCode = 202;
    res.end(JSON.stringify(job));
  } else if (action === 'activity' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 512) throw new Error('Studio activity report is too large.');
    }
    const { clientId, active } = JSON.parse(body);
    await updater.activity(clientId, active);
    res.end('{}');
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Unknown Studio source action.' }));
  }
  return true;
}

// Native Studio uses the identical updater, including process verification and
// detached restart. It must not exit its window before scheduling succeeds.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, root] = process.argv.slice(2);
    if (!['--check', '--apply'].includes(action) || !root) throw new Error('Expected --check or --apply and the host checkout.');
    const { stdout } = await exec('powershell.exe', ['-NoLogo', '-NoProfile', '-Command',
      '$ErrorActionPreference="Stop"; $Owners=@(Get-NetTCPConnection -LocalPort 1420 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique); if($Owners.Count -ne 1){throw "Studio must be running through start.ps1 on port 1420."}; $Owners[0]'],
    { windowsHide: true, timeout: 15_000 });
    const updater = createStudioSourceUpdater({ root, serverPid: Number(stdout.trim()) });
    if (action === '--check') process.stdout.write(JSON.stringify(await updater.check()));
    else {
      const { job, acknowledge } = await updater.apply();
      process.stdout.write(JSON.stringify(job));
      await acknowledge();
    }
  } catch (error) {
    process.stderr.write(error.message);
    process.exitCode = 1;
  }
}
