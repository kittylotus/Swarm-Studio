import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { openExpressionSettings, closeExpressionSettings } from './fixtures/expression-settings.mjs';

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
if (!window.studio.project.reference) {
    const sheet = defaultSheet();
    sheet.refine.mode = sheet.backgroundRemoval.mode = 'off';
    window.studio.project={...sheet,model:'portrait.safetensors',reference:canvas.toDataURL()};
}
window.studio.draw();window.ready=true;
</script></body></html>`;
const server = await createServer({ cacheDir:'test-results/expressions-vite-cache',server: { host: '127.0.0.1', port: 0,strictPort:false }, plugins: [{ name: 'expression-contract-fixture', configureServer(server) {
    server.middlewares.use('/__expression_contract', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fixture); });
} }] });
let browser;
try {
    await server.listen();
    const port = server.httpServer.address().port;
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context = await browser.newContext({ viewport, hasTouch: viewport.width <= 760 });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}/__expression_contract`);
        await page.waitForFunction(() => window.ready);
        assert.equal(await page.locator('h1').count(),1);
        assert.ok(parseFloat(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontSize))<=22);
        if (viewport.width <= 760) {
            const trigger = page.locator('[data-expression-settings-open]');
            await trigger.scrollIntoViewIfNeeded();
            await page.evaluate(() => window.scrollBy(0, 48));
            await openExpressionSettings(page, 'Character');
            const drawer = page.locator('.expression-settings-drawer');
            const lockedTop = await page.evaluate(() => document.body.getBoundingClientRect().top);
            assert.ok(lockedTop < 0, 'test opens the drawer on a scrolled board');
            const fields = await drawer.locator('[data-setting="subject"], [data-setting="negative"]').all();
            assert.equal(fields.length, 2);
            for (const field of fields) {
                await field.tap();
                assert.equal(await field.evaluate(node => getComputedStyle(node).fontSize), '16px');
                await page.evaluate(() => window.scrollTo(0, 400));
                assert.equal(await page.evaluate(() => document.body.getBoundingClientRect().top), lockedTop);
            }
            await closeExpressionSettings(page);
            await page.waitForFunction(() => !document.body.hasAttribute('data-expression-page-locked'));
            assert.equal(await page.evaluate(() => window.scrollY), -lockedTop);
        }
        await openExpressionSettings(page, 'Character');
        const subject = page.getByLabel('Character & framing', { exact: true });
        const originalSubject = await subject.inputValue();
        const expandSubject = page.getByRole('button', { name: 'Expand character & framing', exact: true });
        const expanded = page.getByRole('dialog', { name: 'Character & framing', exact: true });
        const visibility = button => button.evaluate(el => getComputedStyle(el).opacity);
        if (viewport.width > 760) {
            assert.equal(await visibility(expandSubject), '0');
            await subject.hover();
            assert.equal(await visibility(expandSubject), '1');
            await page.mouse.move(0, 0);
            assert.equal(await visibility(expandSubject), '0');
            await subject.focus();
            await page.keyboard.press('Tab');
            assert.equal(await visibility(expandSubject), '1');
            await page.keyboard.press('Enter');
        } else {
            assert.equal(await visibility(expandSubject), '1');
            await expandSubject.tap();
        }
        const subjectEditor = expanded.getByRole('textbox', { name: 'Character & framing', exact: true });
        assert.equal(await subjectEditor.inputValue(), originalSubject);
        await page.keyboard.press('Escape');
        await expanded.waitFor({ state: 'detached' });
        assert.ok(await expandSubject.isVisible(), 'closing the editor leaves the Identity settings open');
        assert.equal(await expandSubject.evaluate(el => el === document.activeElement), true);
        await expandSubject.click();
        await subjectEditor.fill('A close-up with side lighting');
        await expanded.getByRole('button', { name: 'Done', exact: true }).click();
        await expanded.waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => studio.project.subject), 'A close-up with side lighting');
        assert.equal(await page.getByRole('button', { name: 'Expand avoid', exact: true }).count(), 1);
        await closeExpressionSettings(page);
        await openExpressionSettings(page, 'Rendering');
        const sampling = page.locator('details').filter({has:page.locator('summary', {hasText:'Sampling & resolution'})});
        await sampling.locator('summary').click();
        assert.equal(await sampling.locator('summary .expression-settings-icon').count(),1);
        const reference = page.locator('[data-generate-disclosure="reference"]');
        await reference.locator(':scope > summary').click();
        assert.equal(await page.locator('[data-setting="engine"]').isVisible(),false);
        await reference.locator(':scope > summary').click();
        const grid = sampling.locator('.expression-sampling-fields');
        assert.ok(await grid.evaluate(node => {
            const fields = [...node.children].map(child => child.getBoundingClientRect());
            const [seed, steps, cfg, sampler, scheduler] = fields;
            return seed.width > steps.width && steps.top === cfg.top && sampler.top === scheduler.top
                && seed.bottom <= steps.top && steps.bottom <= sampler.top;
        }), 'seed, steps/CFG, and sampler/scheduler have the requested rows');
        if (viewport.width > 760) {
            const controls=page.locator('.expression-controls');
            assert.equal(await controls.evaluate(node=>getComputedStyle(node).position),'sticky');
            assert.equal(await controls.evaluate(node=>getComputedStyle(node).scrollbarGutter),'stable');
            const before=await controls.boundingBox();
            await controls.hover();
            assert.equal((await controls.boundingBox()).width,before.width);
            await controls.screenshot({path:'test-results/actions/expression-desktop-settings.png'});
        }
        const width = page.getByRole('spinbutton', { name: 'Width (px)' });
        const height = page.getByRole('spinbutton', { name: 'Height (px)' });
        const widthSlider = page.getByRole('slider', { name: 'Width slider' });
        const link = page.getByRole('button', { name: 'Link dimensions' });
        await page.getByLabel('Aspect ratio', { exact: true }).selectOption('2:3');
        assert.equal(await link.getAttribute('aria-pressed'), 'true');
        assert.deepEqual([await width.inputValue(), await height.inputValue()], ['512', '768']);
        assert.equal(await widthSlider.isVisible(),false);
        await page.getByRole('slider',{name:'Size slider'}).press('End');
        assert.deepEqual([await width.inputValue(), await height.inputValue()], ['1024', '1536']);
        await link.click();
        await widthSlider.press('ArrowLeft');
        assert.deepEqual([await width.inputValue(), await height.inputValue()], ['960', '1536']);
        await link.click();
        assert.equal(await link.getAttribute('aria-pressed'), 'true');
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
        assert.equal(await page.locator('[data-pipeline-part="motion"]').first().getAttribute('hidden'),null);
        await page.locator('[data-setting="engine"]').selectOption('text');
        assert.ok((await page.locator('[data-setting="model"] option').allTextContents()).includes('anima.safetensors'));
        await page.locator('[data-setting="model"]').selectOption('anima.safetensors');
        await page.locator('[data-setting="engine"]').selectOption('ipadapter');
        assert.equal(await page.locator('[data-setting="model"]').inputValue(),'portrait.safetensors');
        assert.equal(await page.evaluate(()=>window.originalSampler===document.querySelector('[data-setting="sampler"]')),true);
        await page.locator('[data-setting="sampler"]').focus();
        await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');
        assert.equal(await sampling.getAttribute('open'),'');
        await closeExpressionSettings(page);
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
        await openExpressionSettings(page, 'Rendering');
        await sampling.locator('summary').click();
        assert.equal(await page.locator('[data-setting="scheduler"]').inputValue(),'beta57');
        assert.equal(await page.locator('[data-setting="style"]').inputValue(),'realistic');
        assert.equal(await link.getAttribute('aria-pressed'), 'true');
        assert.deepEqual([await width.inputValue(), await height.inputValue()], ['960', '1536']);
        assert.equal(await page.locator('.expression-error').count(),0,'restoring a project clears transient render errors');
        await context.close();
    }
    console.log('expression desktop/mobile UI contracts: ok');
} finally {
    await browser?.close();
    await server.close();
}
