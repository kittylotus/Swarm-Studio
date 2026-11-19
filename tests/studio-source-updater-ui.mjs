import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/></head><body><div id="app"></div><script type="module">
import '/src/styles.css';import {StudioApp} from '/src/app.ts';import {runtime,reportStudioActivity} from '/src/runtime/index.ts';
window.runtime=runtime;window.reportStudioActivity=reportStudioActivity;window.app=new StudioApp(document.querySelector('#app'));
app.view='settings';app.store.updateUi({settingsPane:'backend'});app.render();window.ready=true;
</script></body></html>`;
const server = await createServer({ cacheDir: 'test-results/source-updater-vite-cache', server: { host: '127.0.0.1', port: 0, strictPort: false }, plugins: [{ name: 'source-updater-fixture', configureServer(server) { server.middlewares.use('/__source_fixture', (_req, res) => { res.setHeader('content-type', 'text/html'); res.end(fixture); }); } }] });
let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  // Test the real host bridge gate, without ever invoking a live source update.
  let response = await fetch(base + '/__studio/host-control/studio-source/apply', { method: 'POST', headers: { origin: base } });
  assert.equal(response.status, 401);
  const session = await fetch(base + '/__studio/host-control/session');
  const cookie = session.headers.get('set-cookie').split(';')[0];
  for (const action of ['check', 'apply', 'activity']) {
    response = await fetch(base + '/__studio/host-control/studio-source/' + action, { method: 'POST', headers: { cookie, origin: 'https://unrelated.invalid' } });
    assert.equal(response.status, 403, `foreign origin must not reach ${action}`);
    response = await fetch(base + '/__studio/host-control/studio-source/' + action, { method: 'POST', headers: { cookie } });
    assert.equal(response.status, 403, `absent origin must not reach ${action}`);
  }
  response = await fetch(base + '/__studio/host-control/studio-source/command', { method: 'POST', headers: { cookie, origin: base } });
  assert.equal(response.status, 404);
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  await mkdir('test-results/source-updater', { recursive: true });
  const target = 'b'.repeat(40), before = 'a'.repeat(40);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 900, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 900, hasTouch: viewport.width < 900 });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(60000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let checkCalls = 0, applyCalls = 0, polls = 0, activities = [], outcome = 'failure', sessions = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/__studio/host-control/session') sessions++; });
    let status = { supported: true, available: true, canApply: true, dirty: false, repoPath: 'C:\\fixture-host\\Studio', currentVersion: '1.0.0', latestVersion: '1.1.0', currentCommit: before, latestCommit: target, commitsBehind: 1, branch: 'main', origin: 'fixture', message: 'A Studio source update is ready on the host.', highlights: ['A useful update'] };
    const job = { jobId: 'fixture-job', phase: 'scheduled', message: 'Waiting for host restart', targetCommit: target, serverPid: 1 };
    await context.route('**/__studio/host-control/studio-source/**', async route => {
      const action = new URL(route.request().url()).pathname.split('/').at(-1);
      const send = (body, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
      if (action === 'check') { checkCalls++; return send(status); }
      if (action === 'activity') { activities.push(route.request().postDataJSON()); return send({}); }
      if (action === 'apply') { applyCalls++; polls = 0; return send(job, 202); }
      if (action === 'status') {
        polls++;
        if (polls === 1) return route.abort('connectionrefused');
        if (polls === 2) return send({ error: 'Expired host session after restart' }, 401);
        if (outcome === 'failure') return send({ job: { ...job, phase: 'failed', message: 'Fixture restart was blocked safely.' }, currentCommit: before, serverPid: 1 });
        // A successful response from the OLD server must not trigger a reload.
        if (polls === 3) return send({ job: { ...job, phase: 'complete' }, currentCommit: target, serverPid: 1 });
        return send({ job: { ...job, phase: 'complete' }, currentCommit: target, serverPid: 2 });
      }
      throw new Error(`Unexpected source route: ${action}`);
    });
    await page.goto(base + '/__source_fixture'); await page.waitForFunction(() => window.ready, { timeout: 60000 });
    const card = page.getByRole('region', { name: 'Studio source updates', exact: true });
    assert.equal(await card.isVisible(), true);
    assert.match(await card.textContent(), /computer serving this remote/);
    const check = card.getByRole('button', { name: 'Check for updates', exact: true });
    await check.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !app.studioUpdateChecking && app.studioUpdateStatus?.available);
    assert.equal(checkCalls, 1); assert.equal(await check.evaluate(el => el === document.activeElement), true);
    const popup = page.getByRole('complementary', { name: 'Studio source update', exact: true });
    assert.equal(await popup.isVisible(), true);
    if (viewport.width < 900) {
      const bounds = await popup.boundingBox(); assert.ok(bounds.y >= 0, 'update notice remains inside mobile safe viewport');
      assert.equal(await popup.getByRole('button', { name: 'Later', exact: true }).isVisible(), true);
    }
    await popup.getByRole('button', { name: 'Later', exact: true }).click();
    assert.equal(await popup.count(), 0);
    await page.evaluate(() => { app.generating = true; app.render(); });
    assert.equal(await card.getByRole('button', { name: 'Finish current work', exact: true }).isDisabled(), true);
    await page.evaluate(() => app.applyStudioUpdate()); assert.equal(applyCalls, 0);
    await page.evaluate(() => { app.generating = false; app.expressionStudio = { busy: true }; app.render(); });
    assert.equal(await card.getByRole('button', { name: 'Finish current work', exact: true }).isDisabled(), true);
    await page.evaluate(() => { app.expressionStudio = null; app.render(); });
    status = { ...status, canApply: false, dirty: true, message: 'Local host edits block this update.' };
    await check.click(); await page.waitForFunction(() => app.studioUpdateStatus?.dirty && !app.studioUpdateChecking);
    assert.equal(await card.getByRole('button', { name: 'Update blocked', exact: true }).isDisabled(), true);
    assert.match(await card.textContent(), /Local host edits/);
    status = { ...status, canApply: true, dirty: false, message: 'A Studio source update is ready on the host.' };
    await check.click(); await page.waitForFunction(() => app.studioUpdateStatus?.canApply && !app.studioUpdateChecking);
    await card.screenshot({ path: `test-results/source-updater/card-${viewport.width}.png` });
    await page.evaluate(() => { window.heartbeat = () => reportStudioActivity(true); });
    await page.evaluate(() => heartbeat()); assert.equal(activities.at(-1).active, true);
    await page.evaluate(() => reportStudioActivity(false)); assert.equal(activities.at(-1).active, false);
    const update = card.getByRole('button', { name: 'Update & restart', exact: true });
    await update.focus(); await page.keyboard.press('Enter');
    assert.equal(await card.getByRole('button', { name: 'Updating…', exact: true }).isDisabled(), true);
    assert.match(await card.textContent(), /Keep this page open/);
    await page.waitForFunction(() => !app.studioUpdateApplying);
    assert.equal(applyCalls, 1); assert.ok(polls >= 3);
    assert.ok(sessions >= 2, 'expired host cookie triggers a fresh session handshake');
    assert.match(await page.locator('.toast-host').textContent(), /Fixture restart was blocked safely/);
    assert.equal(await update.isEnabled(), true, 'failed handoff permits a retry');
    assert.equal(await update.evaluate(el => el === document.activeElement), true, 'failed handoff restores keyboard focus');
    outcome = 'success';
    const navigation = page.waitForEvent('domcontentloaded');
    await update.click(); await navigation; await page.waitForFunction(() => window.ready);
    assert.ok(polls >= 4, 'reload waits for the replacement host process');
    assert.equal(applyCalls, 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id)); assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(errors, []); await context.close();
  }
  const native = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await native.addInitScript(() => { window.nativeCalls = []; window.__TAURI_INTERNALS__ = { invoke: async command => { nativeCalls.push(command); throw new Error('Legacy updater must not be invoked'); } }; });
  await native.route('**/__studio/host-control/studio-source/check', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ supported: true, available: true, canApply: true, dirty: false, currentVersion: '1.0.0', latestVersion: '1.1.0', latestCommit: target, currentCommit: before, commitsBehind: 1, repoPath: 'fixture', branch: 'main', origin: 'fixture', highlights: [], message: 'Ready' }) }));
  await native.route('**/__studio/host-control/studio-source/activity', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await native.route('**/__studio/host-control/studio-source/apply', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Cannot schedule the verified helper' }) }));
  const nativePage = await native.newPage(); nativePage.setDefaultNavigationTimeout(60000); await nativePage.goto(base + '/__source_fixture'); await nativePage.waitForFunction(() => window.ready);
  const nativeCard = nativePage.getByRole('region', { name: 'Studio source updates', exact: true });
  await nativeCard.getByRole('button', { name: 'Check for updates', exact: true }).click(); await nativePage.waitForFunction(() => app.studioUpdateStatus?.canApply);
  await nativeCard.getByRole('button', { name: 'Update & restart', exact: true }).click(); await nativePage.waitForFunction(() => !app.studioUpdateApplying);
  assert.deepEqual(await nativePage.evaluate(() => nativeCalls), [], 'HTTP desktop must bypass the old updater in an existing native binary');
  assert.match(await nativePage.locator('.toast-host').textContent(), /Cannot schedule the verified helper/);
  assert.equal(nativePage.isClosed(), false, 'failed scheduling must leave the desktop window open');
  await native.close();
  console.log('Studio source UI: desktop, tablet, phone and landscape; host-origin guards, pending work, session rotation, reconnect failure/retry and successful reload passed.');
} finally { if (browser) await browser.close(); await server.close(); }
