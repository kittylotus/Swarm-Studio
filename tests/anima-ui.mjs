import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { openExpressionSettings, closeExpressionSettings } from './fixtures/expression-settings.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/></head><body><div id="host"></div><script type="module">
import '/src/styles.css'; import { ExpressionStudio } from '/src/expressions/studio.ts';import { defaultSheet } from '/src/expressions/pipeline.ts';import { schema } from '/tests/fixtures/anima-schema.mjs';
window.calls=[];window.notices=[];window.setupLogs=[];window.missing=false;window.probeFail=false;
const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const reference=canvas.toDataURL();
window.studio=new ExpressionStudio({models:()=>[{name:'portrait.safetensors',architecture:'sdxl'},{name:'anima-base.safetensors',architecture:'anima'},{name:'anima-turbo-v1.1',architecture:'anima'}],params:()=>[{id:'sampler',values:['euler']},{id:'scheduler',values:['normal']},{id:'useipadapter',values:['PLUS (high strength)']}],busy:()=>false,connected:()=>true,
 captureLoras:()=>[{id:'a',name:'detail.safetensors',enabled:true,weight:.5,useTrigger:true,triggerPhrase:'detail trigger'}],
 probe:async()=>{await new Promise(resolve=>setTimeout(resolve,180));if(window.probeFail)throw new Error('fixture disconnected');return window.missing?{...schema,AnimaRefAdapter:undefined}:schema;},save:async()=>{},notify:message=>notices.push(message),log:message=>setupLogs.push(message),
 generate:async(request,loras,progress)=>{calls.push({request,loras});progress(.5);await new Promise(resolve=>setTimeout(resolve,100));return {image:reference,path:'',seed:request.seed};}});
await studio.mount(document.querySelector('#host'));
if (!studio.project.reference) {
    const sheet = defaultSheet();
    sheet.refine.mode = sheet.backgroundRemoval.mode = 'off';
    studio.project = { ...sheet, reference, model: 'portrait.safetensors' };
}
studio.draw();window.ready=true;
</script></body></html>`;
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, plugins: [{ name: 'anima-fixture', configureServer(server) { server.middlewares.use('/__anima_contract', (_req, res) => { res.setHeader('content-type', 'text/html'); res.end(fixture); }); } }] });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  await mkdir('test-results/editor-anima', { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__anima_contract`); await page.waitForFunction(() => window.ready);
    await openExpressionSettings(page, 'Generate');
    const engine = page.locator('[data-setting="engine"]'); await engine.selectOption('anima');
    assert.equal(await page.locator('[data-setting="model"]').inputValue(), 'anima-base.safetensors');
    assert.equal(await page.locator('[data-pipeline-part="adapter"]').isVisible(), false);
    assert.equal(await page.locator('[data-pipeline-part="anima"]').isVisible(), true);
    assert.equal(await page.locator('[data-pipeline-part="style"]').isVisible(), false);
    await page.locator('[data-setting="model"]').selectOption('anima-turbo-v1.1');
    const setup = page.getByRole('button', { name: 'Check Anima setup', exact: true });
    const report = page.locator('[data-anima-report]');
    await setup.click();
    await page.locator('[data-anima-report][data-state="checking"]').waitFor();
    await page.waitForFunction(() => !window.studio.setupBusy);
    assert.match(await report.textContent(), /Files found.*checkpoint loader/);
    assert.match(await page.evaluate(() => setupLogs.at(-1)), /Anima setup.*anima-turbo-v1.1/);
    assert.match(await page.getByRole('link', { name: 'Installation guide' }).getAttribute('href'), /ArcAnima\/ComfyUI-Anima-Ref-Adapter\/blob\/main\/docs\/guide.en.md$/);
    await page.locator('[data-anima-files] summary').click();
    assert.equal(await page.getByLabel('Text encoder', { exact: true }).inputValue(), 'qwen_3_06b_base.safetensors');
    await page.locator('[data-anima-files] summary').click();
    await page.locator('[data-pipeline-part="anima"]').screenshot({ path: `test-results/editor-anima/anima-${viewport.width}.png` });
    assert.match(await page.locator('.expression-setup').textContent(), /Anima Ref Adapter: loaded/);
    assert.ok(await page.locator('[data-setting="animaAdapter"] option').count());
    await openExpressionSettings(page, 'Identity');
    await page.locator('[data-setting="useLoras"]').check();
    await closeExpressionSettings(page);
    const render = page.getByRole('button', { name: 'Render missing', exact: true }); await render.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !window.studio.busy && calls.length === 12);
    const first = await page.evaluate(() => calls[0]);
    const graph = JSON.parse(first.request.comfyworkflowraw);
    assert.equal(graph['1'].class_type, 'CheckpointLoaderSimple');
    assert.equal(graph['1'].inputs.ckpt_name, 'anima/anima-turbo-v1.1.safetensors');
    assert.deepEqual(graph['5'].inputs.model, ['lora-0', 0]); assert.match(graph['6'].inputs.text, /^detail trigger,/);
    assert.equal(first.request.useipadapter, undefined); assert.equal(first.request.batchsize, 1);
    assert.equal(await page.locator('.expression-card img').count(), 12);
    await openExpressionSettings(page, 'Identity');
    await page.locator('[data-setting="useLoras"]').uncheck();
    await openExpressionSettings(page, 'Generate');
    await page.locator('[data-setting="animaGuidance"]').fill('5.5');
    await page.locator('[data-setting="animaEnd"]').fill('0.6');
    await page.waitForTimeout(350); await page.reload(); await page.waitForFunction(() => window.ready);
    assert.equal(await engine.inputValue(), 'anima'); assert.equal(await page.locator('[data-setting="animaGuidance"]').inputValue(), '5.5');
    await page.evaluate(() => {window.missing=true;studio.project.tiles.forEach(tile=>tile.image='');studio.draw();});
    await render.click(); await page.waitForFunction(() => !window.studio.busy);
    assert.equal(await page.evaluate(() => calls.length), 0, 'missing nodes must prevent submission');
    assert.match(await page.locator('.expression-run-status').textContent(), /Anima Ref Adapter is missing from ComfyUI/);
    await page.evaluate(() => {window.missing=false;window.probeFail=true;});
    await render.click(); await page.waitForFunction(() => !window.studio.busy);
    assert.equal(await page.evaluate(() => calls.length), 0, 'failed node refresh must not reuse a stale schema');
    assert.match(await report.textContent(), /Check failed.*fixture disconnected/);
    await openExpressionSettings(page, 'Generate');
    await engine.selectOption('ipadapter'); assert.equal(await page.locator('[data-setting="model"]').inputValue(), 'portrait.safetensors');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await context.close();
  }
  console.log('Anima desktop/phone setup feedback, Turbo checkpoint queue, LoRA order and missing-node contracts: ok');
} finally { await browser?.close(); await server.close(); }
