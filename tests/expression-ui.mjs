import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';

// Use a developer's existing Playwright installation; no personal Studio state or backend.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const mismatch = 'Error(s) in loading state_dict for Resampler: size mismatch for proj_in.weight: copying a param with shape torch.Size([1280, 1280]) from checkpoint, the shape in current model is torch.Size([1280, 1664]).';
const fixture = `<!doctype html><html><body><div id="expression-studio-host"></div><script type="module">
import '/src/styles.css';
import { ExpressionStudio } from '/src/expressions/studio.ts';
import { defaultSheet } from '/src/expressions/pipeline.ts';
window.calls = 0;
window.studio = new ExpressionStudio({
 models:()=>[{name:'portrait.safetensors',architecture:'sdxl'},{name:'other.safetensors',architecture:'sdxl'},{name:'anima.safetensors',architecture:'anima'}],
 params:()=>[{id:'sampler',values:['euler','er_sde']},{id:'scheduler',values:['normal','beta57']},{id:'useipadapter',values:['PLUS (high strength)','PLUS FACE (portraits)']}],
 busy:()=>false,connected:()=>true,captureLoras:()=>[],
 generate:async()=>{window.calls++;throw new Error(${JSON.stringify(mismatch)});},
 probe:async()=>({IPAdapterUnifiedLoader:{},SwarmLoadImageB64:{},SwarmSaveImageWS:{}}),save:async()=>{},notify:()=>{}
});
await window.studio.mount(document.querySelector('#expression-studio-host'));
const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
if (!window.studio.project.reference) window.studio.project={...defaultSheet(),model:'portrait.safetensors',reference:canvas.toDataURL()};
window.studio.draw();window.ready=true;
</script></body></html>`;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'expression-contract-fixture', configureServer(server) {
    server.middlewares.use('/__expression_contract', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fixture); });
} }] });
let browser;
try {
    await server.listen();
    const port = server.httpServer.address().port;
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}/__expression_contract`);
        await page.waitForFunction(() => window.ready);
        assert.equal(await page.locator('h1').count(),1);
        assert.ok(parseFloat(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontSize))<=22);
        const sampling = page.locator('details').filter({has:page.locator('summary', {hasText:'Sampling & resolution'})});
        await sampling.locator('summary').click();
        await page.evaluate(()=>{window.originalSampler=document.querySelector('[data-setting="sampler"]');});
        for (const [key,value] of [['sampler','er_sde'],['scheduler','beta57'],['style','realistic'],['model','other.safetensors'],['adapter','PLUS FACE (portraits)']]) {
            const select=page.locator(`[data-setting="${key}"]`);
            await select.focus();
            const scroll = await page.evaluate(()=>window.scrollY);
            await select.selectOption(value);
            assert.equal(await page.evaluate(()=>window.scrollY),scroll);
            assert.equal(await select.inputValue(),value);
            assert.equal(await sampling.getAttribute('open'),'');
            assert.equal(await page.evaluate(()=>window.originalSampler===document.querySelector('[data-setting="sampler"]')),true);
            assert.equal(await select.evaluate(el=>document.activeElement===el),true);
        }
        await page.locator('[data-setting="engine"]').selectOption('liveportrait');
        assert.equal(await page.locator('[data-pipeline-part="checkpoint"]').isVisible(),false);
        assert.equal(await page.locator('[data-pipeline-part="motion"]').first().isVisible(),true);
        await page.locator('[data-setting="engine"]').selectOption('text');
        assert.ok((await page.locator('[data-setting="model"] option').allTextContents()).includes('anima.safetensors'));
        await page.locator('[data-setting="model"]').selectOption('anima.safetensors');
        await page.locator('[data-setting="engine"]').selectOption('ipadapter');
        assert.equal(await page.locator('[data-setting="model"]').inputValue(),'portrait.safetensors');
        assert.equal(await page.evaluate(()=>window.originalSampler===document.querySelector('[data-setting="sampler"]')),true);
        await page.locator('[data-setting="sampler"]').focus();
        await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');
        assert.equal(await sampling.getAttribute('open'),'');
        for (let i=0;i<2;i++) {
            await page.getByRole('button',{name:'Expression sheet usage guide',exact:true}).click();
            await page.getByRole('dialog').waitFor();
            await page.keyboard.press('Escape');
            assert.equal(await page.getByRole('dialog').count(),0);
        }
        await page.getByRole('button',{name:'Render missing',exact:true}).click();
        await page.waitForFunction(()=>!window.studio.busy && window.calls>0);
        assert.equal(await page.evaluate(()=>window.calls),1,'incompatible encoder must stop the queue');
        assert.match(await page.locator('.expression-error').first().textContent(),/Renaming bigG to ViT-H will not work/);
        await page.locator('.expression-error-details summary').click();
        assert.match(await page.locator('.expression-error-details').textContent(),/torch.Size/);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal mobile overflow');
        await page.waitForTimeout(400);
        await page.reload();await page.waitForFunction(()=>window.ready);
        assert.equal(await page.locator('[data-setting="scheduler"]').inputValue(),'beta57');
        assert.equal(await page.locator('[data-setting="style"]').inputValue(),'realistic');
        assert.equal(await page.locator('.expression-error').count(),0,'restoring a project clears transient render errors');
        await context.close();
    }
    console.log('expression desktop/mobile UI contracts: ok');
} finally {
    await browser?.close();
    await server.close();
}
