import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { openExpressionSettings, closeExpressionSettings } from './fixtures/expression-settings.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const workflow = {
    '1': { class_type: 'LoadImage', inputs: { image: 'example.png' } },
    '2': { class_type: 'SaveImage', inputs: { images: ['1', 0], filename_prefix: 'example' } },
};
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="app"></div><script type="module">
import '/src/styles.css';
import { StudioApp } from '/src/app.ts';
import { runtime } from '/src/runtime/index.ts';
import { normalizeSheet } from '/src/expressions/pipeline.ts';
window.calls = [];
window.files = {};
window.requestedOriginals = [];
window.failBackground = true;
window.interrupts = [];
const picture = (width, height, cutout) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!cutout) { ctx.fillStyle = '#131d38'; ctx.fillRect(0, 0, width, height); }
    ctx.fillStyle = '#b77bf0'; ctx.fillRect(width / 4, height / 4, width / 2, height / 2);
    return canvas.toDataURL('image/png');
};
runtime.postJson = async (url, body) => {
    if (url.endsWith('GetNewSession')) return { session_id: 'mock-session' };
    if (url.endsWith('InterruptAll')) { interrupts.push(body); return {}; }
    if (url.endsWith('ComfyListWorkflows')) return { workflows: [{ name: 'Saved/cutout' }] };
    if (url.endsWith('ComfyReadWorkflow')) return { result: { custom_params: JSON.stringify({
        source: { id: 'comfyrawworkflowinputimage0', type: 'image', name: 'Foreground source' },
        optional: { id: 'comfyrawworkflowinputimage1', type: 'image', name: 'Optional matte' },
    }) } };
    return {};
};
runtime.getText = async url => {
    if (!new URL(url).pathname.endsWith('ComfyBackendDirect/object_info')) throw new Error('Unexpected inspection route');
    return JSON.stringify({
        SwarmLoadImageB64: {}, SwarmSaveImageWS: {},
        UpscaleModelLoader: { input: { required: { model_name: [['detail.pth']] } } },
        LoadBackgroundRemovalModel: { input: { required: { bg_removal_name: ['COMBO', { options: ['birefnet.safetensors'] }] } } },
        RemoveBackground: {}, InvertMask: {}, JoinImageWithAlpha: {},
    });
};
runtime.fetchDataUrl = async url => {
    requestedOriginals.push(url);
    const file = files[new URL(url).pathname.split('/').pop()];
    if (!file) throw new Error('Unknown fixture image ' + url);
    return file;
};
runtime.streamJson = async (url, request, count, emit, token, signal) => {
    if (!url.endsWith('GenerateText2ImageWS')) throw new Error('Unexpected generation route');
    const graph = JSON.parse(request.comfyworkflowraw || '{}');
    const classes = Object.values(graph).map(node => node.class_type);
    const stage = classes.includes('RemoveBackground') ? 'background'
        : classes.includes('UpscaleModelLoader') ? 'refine'
        : request.comfyuicustomworkflow ? 'saved'
        : request.maskimage ? 'inpaint' : classes.length ? 'json' : 'generate';
    const name = stage + '-' + (Object.keys(files).length + 1) + '.png';
    emit({ gen_progress: { current_percent: .2, overall_percent: .55, preview: picture(32, 32, false) } });
    calls.push({ stage, request, graph });
    if (window.holdPreview) {
        window.holdPreview = false;
        await new Promise(resolve => {
            window.finishHeldPreview = resolve;
            signal?.addEventListener('abort', resolve, { once: true });
        });
    }
    await new Promise(resolve => setTimeout(resolve, 130));
    if (stage === 'background' && failBackground) { emit({ error: 'fixture background failed' }); return; }
    const width = stage === 'refine' || stage === 'background' ? 192 : 96;
    files[name] = picture(width, width, stage === 'background' || stage === 'saved');
    emit({ image: { image: request.donotsave ? files[name] : 'Output/' + name, seed: 42 } });
};
window.app = new StudioApp(document.querySelector('#app'));
app.connected = true;
app.libraryAutoSyncStarted = true;
app.models = [{ name: 'portrait.safetensors', architecture: 'sdxl' }];
app.store.updateDraft({ model: 'portrait.safetensors' });
app.navigateToView('expressions');
window.ready = true;
window.loadLegacyProject = () => {
    const project = app.expressionStudio.project;
    app.expressionStudio.project = normalizeSheet({
        ...project, version: 1, tiles: project.tiles.slice(0, 1),
        refine: { mode: 'off' }, backgroundRemoval: { mode: 'off' },
    });
    app.expressionStudio.draw();
};
window.seedPickerLibrary = () => {
    for (let i = 0; i < 52; i++) {
        const folder = app.store.createFolder('Fixture folder ' + i);
        const name = 'archive-' + i + '.png';
        const date = new Date(Date.UTC(2026, 10, 18 + i)).toISOString().slice(0, 10);
        files[name] = picture(80, 112, false);
        const output = app.store.addOutput({
            url: 'Output/' + date + '/' + name, swarmPath: 'Output/' + date + '/' + name, swarmSourcePath: date + '/' + name,
            model: 'portrait.safetensors', prompt: 'Archive portrait ' + i, sentPrompt: '', negativePrompt: '',
            width: 80, height: 112, seed: i, metadata: '', request: {}, loras: [], presets: [],
        });
        app.store.updateOutput(output.id, { folderId: folder.id });
        if (i === 3) window.targetImage = output.id;
        if (i === 3) window.targetFolder = folder.id;
    }
};
</script></body></html>`;

const server = await createServer({
    cacheDir: 'test-results/image-tools-vite-cache',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    plugins: [{ name: 'image-tools-fixture', configureServer(vite) {
        vite.middlewares.use('/__image_tools', (_req, res) => {
            res.setHeader('Content-Type', 'text/html');
            res.end(fixture);
        });
    } }],
});
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    await mkdir('test-results/image-tools', { recursive: true });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
        if (viewport.width < 500) await context.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__image_tools`);
        await page.waitForFunction(() => window.ready && document.querySelector('[data-setting="engine"]'));
        const thumbnails = (await page.evaluate(() => Array.from({ length: 6 }, (_, index) => {
            const canvas = document.createElement('canvas');
            canvas.width = 48;
            canvas.height = 64;
            const context = canvas.getContext('2d');
            const gradient = context.createLinearGradient(0, 0, 48, 64);
            gradient.addColorStop(0, `hsl(${45 + index * 55} 33% 53%)`);
            gradient.addColorStop(1, `hsl(${80 + index * 55} 48% 21%)`);
            context.fillStyle = gradient;
            context.fillRect(0, 0, 48, 64);
            context.fillStyle = 'rgba(255,255,255,.3)';
            context.beginPath();
            context.ellipse(24, 29, 11, 17, 0, 0, Math.PI * 2);
            context.fill();
            return canvas.toDataURL('image/jpeg').split(',')[1];
        }))).map(image => Buffer.from(image, 'base64'));
        await page.route('**/__swarm/**', route => {
            const index = Number(/archive-(\d+)/.exec(route.request().url())?.[1] ?? 0) % thumbnails.length;
            return route.fulfill({ contentType: 'image/jpeg', body: thumbnails[index] });
        });
        await page.evaluate(() => loadLegacyProject());
        const generateTab = page.getByRole('tab', { name: 'Generate', exact: true });
        const refineTab = page.getByRole('tab', { name: 'Refine', exact: true });
        const backgroundTab = page.getByRole('tab', { name: 'Remove background', exact: true });
        assert.equal(await generateTab.getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('[data-processing-stage]').count(), 0);
        if (viewport.width === 1024) {
            assert.equal(await page.locator('[data-expression-settings-open]').isVisible(), false);
            await page.setViewportSize({ width: 720, height: 680 });
            await openExpressionSettings(page, 'Layout');
            const drawer = page.locator('.expression-settings-drawer');
            assert.equal(await drawer.isVisible(), true);
            await page.setViewportSize(viewport);
            await drawer.waitFor({ state: 'hidden' });
            assert.equal(await page.locator('.expression-controls').isVisible(), true);
        }
        if (viewport.width <= 760) {
            const controls = page.locator('.expression-controls');
            const settings = page.locator('[data-expression-settings-open]');
            assert.ok(await settings.evaluate(button => {
                const label = document.createRange();
                label.selectNodeContents(button);
                const box = button.getBoundingClientRect(), text = label.getBoundingClientRect();
                return Math.abs((box.top + box.bottom) / 2 - (text.top + text.bottom) / 2) < 2;
            }), 'settings button label is vertically centered');
            assert.equal(await controls.isVisible(), false);
            assert.equal(await page.locator('.expression-board').evaluate(node =>
                Math.abs(node.getBoundingClientRect().top - node.parentElement.getBoundingClientRect().top) < 1), true);
            await openExpressionSettings(page, 'Identity');
            const drawer = page.locator('.expression-settings-drawer');
            assert.equal(await drawer.getByRole('tab', { name: 'Identity' }).getAttribute('aria-selected'), 'true');
            await page.keyboard.press('End');
            assert.equal(await drawer.getByRole('tab', { name: 'Layout' }).getAttribute('aria-selected'), 'true');
            assert.equal(await drawer.locator('[data-settings-group="identity"]').isVisible(), false);
            assert.equal(await drawer.locator('[data-settings-group="layout"]').isVisible(), true);
            await page.screenshot({ path: `test-results/image-tools/expression-settings-${viewport.width}.png` });
            const cdp = await context.newCDPSession(page);
            await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.8 });
            await page.waitForFunction(() => {
                const viewport = window.visualViewport;
                const rect = document.querySelector('.expression-settings-drawer').getBoundingClientRect();
                return viewport.scale > 1.5 && Math.abs(rect.top - viewport.offsetTop) < 2
                    && Math.abs(rect.right - viewport.offsetLeft - viewport.width) < 2
                    && Math.abs(rect.height - viewport.height) < 2
                    && Math.abs(rect.width - viewport.width) < 2;
            });
            await page.screenshot({ path: `test-results/image-tools/expression-settings-zoom-${viewport.width}.png` });
            await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
            await cdp.detach();
            await page.keyboard.press('Escape');
            await drawer.waitFor({ state: 'hidden' });
            await page.waitForFunction(() => document.activeElement?.hasAttribute('data-expression-settings-open'));
        }
        await openExpressionSettings(page, 'Generate');
        await page.getByLabel('Render method').selectOption('text');
        const sampling = page.locator('summary').filter({ hasText: 'Sampling & resolution' });
        await sampling.focus();
        await page.keyboard.press('Enter');
        assert.equal(await sampling.evaluate(node => getComputedStyle(node).listStyleType), 'none');
        await closeExpressionSettings(page);
        await page.getByRole('button', { name: 'Options', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Keep final results only' }).check();
        await page.keyboard.press('Escape');
        await page.evaluate(() => { window.holdPreview = true; });
        await page.getByRole('button', { name: 'Render missing', exact: true }).click();
        const livePreview = page.locator('[data-expression-live-preview]');
        await livePreview.waitFor();
        await page.waitForFunction(() => document.querySelector('[data-expression-live-preview]')?.naturalWidth === 32);
        assert.equal(await page.getByRole('button', { name: 'Stop Neutral', exact: true }).count(), 1);
        await page.locator('.expression-card.is-rendering').screenshot({ path: `test-results/image-tools/expression-preview-${viewport.width}.png` });
        await page.evaluate(() => finishHeldPreview());
        await page.waitForFunction(() => !app.expressionStudio.busy && calls.length === 1);
        assert.equal(await livePreview.count(), 0);
        assert.equal(await page.locator('.expression-card-image img').count(), 1);
        await generateTab.focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await refineTab.getAttribute('aria-selected'), 'true');
        assert.equal(await refineTab.evaluate(tab => tab === document.activeElement), true);
        assert.equal(await page.getByLabel('Expression direction').count(), 0);
        const refine = page.locator('[data-processing-stage="refine"]');
        await openExpressionSettings(page);
        await refine.getByRole('button', { name: 'Refresh backend options' }).click();
        await refine.getByLabel('Upscale model', { exact: true }).selectOption('detail.pth');
        await closeExpressionSettings(page);
        assert.match(await page.locator('.expression-processing-meta').textContent(), /Source ready/);
        await page.getByRole('button', { name: 'Refine selected' }).click();
        await page.waitForFunction(() => !app.expressionStudio.busy && calls.length === 2);
        assert.match(await page.locator('.expression-card-image img').getAttribute('alt'), /Refine/);
        await page.screenshot({ path: `test-results/image-tools/refine-${viewport.width}.png` });
        await backgroundTab.click();
        const background = page.locator('[data-processing-stage="background"]');
        assert.equal(await background.getByLabel('Remove background method').inputValue(), 'builtin');
        assert.equal(await refine.count(), 0);
        await page.getByRole('button', { name: 'Remove backgrounds' }).click();
        await page.waitForFunction(() => !app.expressionStudio.busy && calls.length === 3);
        assert.deepEqual(await page.evaluate(() => calls.map(call => call.stage)), ['generate', 'refine', 'background']);
        assert.deepEqual(await page.evaluate(() => calls.map(call => call.request.donotsave ?? false)), [true, true, false]);
        assert.equal(await page.evaluate(() => app.store.state.outputs.length), 0, 'transient steps must stay out of Library');
        assert.match(await page.locator('.expression-card').textContent(), /fixture background failed/);
        assert.equal(await page.evaluate(() => app.expressionStudio.project.tiles[0].stage), 'refine');
        assert.equal(await page.evaluate(() => calls[2].graph['1'].inputs.image_base64), await page.evaluate(() => files['refine-2.png'].split(',')[1]));
        await page.evaluate(() => {
            window.failBackground = false;
            const tile = app.expressionStudio.project.tiles[0];
            tile.variants = [{ image: tile.image, path: '', seed: tile.seed }];
        });
        await page.getByRole('button', { name: 'Run pipeline', exact: true }).click();
        await page.waitForFunction(() => !app.expressionStudio.busy && calls.length === 4);
        assert.equal(await page.evaluate(() => app.expressionStudio.project.tiles[0].stage), 'background');
        assert.equal(await page.evaluate(() => app.expressionStudio.project.tiles[0].variants.length), 0);
        assert.equal(await page.evaluate(() => app.store.state.outputs.length), 1);
        assert.equal(await page.locator('[data-cutout]').count(), 1);
        await generateTab.click();
        assert.equal(await sampling.evaluate(node => node.parentElement.open), true);
        await page.getByRole('button', { name: 'View latest result' }).click();
        assert.equal(await backgroundTab.getAttribute('aria-selected'), 'true');
        await page.screenshot({ path: `test-results/image-tools/pipeline-${viewport.width}.png`, fullPage: true });

        await page.locator('[data-nav="editor"]:visible').click();
        const editor = page.locator('#image-editor-host');
        await editor.getByRole('heading', { name: 'Image editor' }).waitFor();
        const uploadBox = await editor.getByRole('button', { name: 'Upload image' }).boundingBox();
        const browseBox = await editor.getByRole('button', { name: 'Browse Library' }).boundingBox();
        assert.equal(Math.round(uploadBox.y), Math.round(browseBox.y));
        assert.ok(uploadBox.x + uploadBox.width <= browseBox.x);
        await page.evaluate(() => seedPickerLibrary());
        await editor.getByRole('button', { name: 'Browse Library' }).click();
        await page.getByRole('heading', { name: 'Choose an image for Editor' }).waitFor();
        const { id, folder } = await page.evaluate(() => ({ id: targetImage, folder: targetFolder }));
        const pick = page.locator(`[data-pick-library-output="${id}"]`);
        assert.match(await pick.locator('img').getAttribute('src'), /preview=true.*noanim=true/);
        await page.waitForFunction(() => document.querySelector('.image-grid img')?.naturalWidth === 48);
        await page.screenshot({ path: `test-results/image-tools/picker-${viewport.width}.png` });
        await page.getByRole('button', { name: 'Browse', exact: true }).click();
        if (viewport.width > 760) {
            await page.getByRole('button', { name: 'Dock Browse to the right' }).click();
        }
        const browse = page.locator('.library-browse-modal');
        const scroller = browse.locator('.library-browse-scroll');
        const dates = browse.locator('.library-date-folders');
        const dateChips = dates.locator('[data-library-date-folder]');
        assert.equal(await dateChips.count(), 52);
        assert.ok(await dateChips.evaluateAll(chips => chips.every(chip => {
            const [date, count] = chip.children;
            return date.getBoundingClientRect().right <= count.getBoundingClientRect().left;
        })), 'date labels and counts fit side by side');
        if (viewport.width === 1440) {
            const presetRows = await browse.locator('[data-library-date-preset]').evaluateAll(chips =>
                new Set(chips.map(chip => chip.offsetTop)).size);
            assert.equal(presetRows, 1, 'all date presets fit on one line in the desktop dock');
        }
        const lastDate = dateChips.last();
        await lastDate.scrollIntoViewIfNeeded();
        assert.ok(await dates.evaluate(node => node.scrollTop) > 0);
        for (const dateChip of [lastDate, dateChips.nth(48)]) {
            await dateChip.scrollIntoViewIfNeeded();
            const outerBefore = await scroller.evaluate(node => node.scrollTop);
            const datesBefore = await dates.evaluate(node => node.scrollTop);
            assert.ok(outerBefore > 0 && datesBefore > 0);
            await dateChip.click();
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.ok(Math.abs(await dates.evaluate(node => node.scrollTop) - datesBefore) <= 1, 'date folder grid retains its scroll position');
            assert.ok(Math.abs(await scroller.evaluate(node => node.scrollTop) - outerBefore) <= 1, 'Browse body retains its scroll position when a date is selected');
            assert.equal(await dateChip.evaluate(node => document.activeElement === node && node.classList.contains('is-active')), true);
            assert.equal(await page.locator('.image-grid .image-card').filter({ hasText: 'Archive portrait' }).count(), 1);
        }
        const panelGutters = await browse.evaluate(panel => {
            const bounds = panel.getBoundingClientRect();
            const search = panel.querySelector('.library-search--modal').getBoundingClientRect();
            const footer = panel.querySelector('[data-action="apply-library-filters"]').getBoundingClientRect();
            return { left: search.left - bounds.left, right: bounds.right - search.right, footer: bounds.right - footer.right, viewport: innerWidth - bounds.right };
        });
        assert.ok(panelGutters.left >= 12 && panelGutters.right >= 12 && panelGutters.footer >= 12 && panelGutters.viewport >= 7);
        await page.screenshot({ path: `test-results/image-tools/browse-${viewport.width}.png` });
        await browse.getByRole('button', { name: 'All time', exact: true }).click();
        if (viewport.width > 760) {
            const lastFolder = page.locator('[data-library-modal-folder]').last();
            await lastFolder.scrollIntoViewIfNeeded();
            const before = await scroller.evaluate(node => node.scrollTop);
            assert.ok(before > 0);
            await lastFolder.click();
            assert.ok(Math.abs(await scroller.evaluate(node => node.scrollTop) - before) <= 1, 'docked Browse retains scroll position');
            assert.equal(await lastFolder.evaluate(node => document.activeElement === node), true);
        }
        const folderTile = browse.locator(`[data-library-modal-folder="${folder}"]`);
        await folderTile.click();
        const deleteFolder = browse.getByRole('button', { name: 'Delete folder Fixture folder 3', exact: true });
        page.once('dialog', dialog => dialog.dismiss());
        await deleteFolder.click();
        assert.equal(await folderTile.count(), 1, 'cancel keeps the folder');
        page.once('dialog', dialog => dialog.accept());
        await deleteFolder.click();
        assert.equal(await folderTile.count(), 0);
        assert.equal(await browse.locator('[data-delete-library-folder]').count(), 0, 'built-in folders have no delete action');
        assert.equal(await browse.locator('[data-library-modal-folder="all"]').evaluate(node =>
            node.classList.contains('is-active') && document.activeElement === node), true);
        assert.deepEqual(await page.evaluate(({ id, folder }) => {
            const saved = JSON.parse(localStorage.getItem('swarm-studio-state-v8'));
            return {
                selected: saved.ui.libraryFolder,
                folderExists: saved.folders.some(item => item.id === folder),
                imageFolder: saved.outputs.find(output => output.id === id)?.folderId,
            };
        }, { id, folder }), { selected: 'all', folderExists: false, imageFolder: 'folder-unfiled' });
        if (viewport.width <= 760) {
            await browse.locator('button[data-action="close-library-filters"]').click();
        }
        await pick.click();
        await editor.getByRole('img', { name: 'archive-3.png' }).waitFor();
        assert.doesNotMatch(await page.evaluate(() => requestedOriginals.at(-1)), /preview=true/);
        await page.evaluate(() => app.navigateToView('library'));
        await page.locator(`[data-inspect-output="${id}"]`).click();
        await page.getByRole('dialog', { name: 'Output inspector' }).getByRole('button', { name: 'Open in Editor' }).click();
        await editor.getByRole('img', { name: 'archive-3.png' }).waitFor();
        await page.evaluate(() => app.navigateToView('identities'));
        await page.getByRole('button', { name: 'New identity', exact: false }).click();
        const identityForm = page.locator('#identity-form');
        const identityBrowse = identityForm.getByRole('button', { name: 'Browse Library', exact: true });
        await identityForm.getByLabel('Name', { exact: true }).fill('Library identity');
        assert.ok(await identityForm.getByRole('button', { name: 'Upload picture' }).isVisible());
        await identityBrowse.click();
        await page.getByRole('heading', { name: 'Choose an identity picture' }).waitFor();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(await identityForm.getByLabel('Name', { exact: true }).inputValue(), 'Library identity');
        await identityBrowse.click();
        await pick.click();
        await identityForm.locator('.identity-editor-avatar > img').waitFor();
        assert.equal(await identityForm.getByLabel('Name', { exact: true }).inputValue(), 'Library identity');
        assert.doesNotMatch(await page.evaluate(() => requestedOriginals.at(-1)), /preview=true/);
        await identityForm.getByRole('button', { name: /Save identity/ }).click();
        await page.waitForFunction(() => app.store.state.identities[0]?.avatarKey);
        await page.evaluate(() => app.navigateToView('expressions'));
        await generateTab.click();
        await openExpressionSettings(page, 'Identity');
        assert.ok(await page.getByRole('button', { name: 'Upload portrait', exact: true }).isVisible());
        await page.locator('[data-reference]').setInputFiles({ name: 'reference-upload.png', mimeType: 'image/png', buffer: thumbnails[3] });
        await page.waitForFunction(() => app.expressionStudio.project.referenceName === 'reference-upload.png');
        await page.getByRole('button', { name: 'Browse Library', exact: true }).click();
        await page.getByRole('heading', { name: 'Choose an expression reference' }).waitFor();
        await pick.click();
        await page.waitForFunction(() => app.expressionStudio.project.referenceName === 'archive-3.png');
        await page.getByRole('img', { name: 'Character reference' }).waitFor();
        assert.equal(await page.evaluate(() => app.expressionStudio.project.referenceName), 'archive-3.png');
        assert.doesNotMatch(await page.evaluate(() => requestedOriginals.at(-1)), /preview=true/);
        await closeExpressionSettings(page);
        await page.evaluate(() => app.navigateToView('editor'));
        await editor.getByRole('button', { name: 'Generate', exact: true }).click();
        await editor.getByLabel('Prompt', { exact: true }).fill('A purple portrait');
        await editor.locator('[data-editor-run]').click();
        await page.waitForFunction(() => calls.length === 5 && !app.imageEditor?.busy);
        assert.equal(await page.evaluate(() => calls[4].request.prompt), 'A purple portrait');
        const upload = await page.evaluate(() => Object.values(files)[0].split(',')[1]);
        await editor.locator('[data-editor-upload]').setInputFiles({ name: 'source.png', mimeType: 'image/png', buffer: Buffer.from(upload, 'base64') });
        await editor.getByRole('img', { name: 'source.png' }).waitFor();
        await editor.getByRole('button', { name: 'Remove background', exact: true }).first().click();
        await editor.getByLabel('Remove background method').selectOption('json');
        await editor.locator('[data-recipe-file]').setInputFiles({ name: 'graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(workflow)) });
        await editor.getByText('Studio replaces image input #1 and reads image output #2.').waitFor();
        await editor.locator('[data-editor-run]').click();
        await page.waitForFunction(() => calls.length === 6 && !app.imageEditor?.busy);
        assert.equal(await page.evaluate(() => calls[5].graph['2'].class_type), 'SwarmSaveImageWS');
        await editor.getByLabel('Remove background method').selectOption('saved');
        await editor.getByLabel('Saved workflow').selectOption('Saved/cutout');
        await editor.getByLabel('Source image input').selectOption('comfyrawworkflowinputimage0');
        await editor.locator('[data-editor-run]').click();
        await page.waitForFunction(() => calls.length === 7 && !app.imageEditor?.busy);
        assert.match(await page.evaluate(() => calls[6].request.comfyrawworkflowinputimage0), /^data:image\/png;base64,/);
        assert.equal(await page.evaluate(() => Object.hasOwn(app.store.state.outputs[0].request, 'comfyrawworkflowinputimage0')), false);
        assert.equal(await editor.getByLabel('Source image input').locator('option:checked').textContent(), 'Foreground source');
        await page.screenshot({ path: `test-results/image-tools/editor-${viewport.width}.png`, fullPage: true });
        const sidebar = editor.getByRole('complementary', { name: 'Editor tools' });
        const sidebarBefore = await sidebar.boundingBox();
        await editor.getByRole('button', { name: 'Inpaint', exact: true }).click();
        const dialog = editor.locator('[data-editor-inpaint-slot] [data-inpaint-panel]');
        await dialog.waitFor();
        await page.waitForFunction(() => app.inpaintImageElement?.naturalWidth === 96);
        const sidebarAfter = await sidebar.boundingBox();
        assert.ok(Math.abs(sidebarBefore.width - sidebarAfter.width) <= 1, 'Inpaint preserves the tools sidebar width');
        if (viewport.width > 760) assert.ok(sidebarAfter.x + sidebarAfter.width <= (await dialog.boundingBox()).x);
        assert.equal(await page.getByRole('dialog', { name: 'Inpaint editor' }).count(), 0);
        const inpaintHeader = dialog.locator('.inpaint-header');
        assert.equal(await inpaintHeader.getByRole('heading', { name: 'Inpaint', exact: true }).count(), 1);
        assert.equal(await editor.locator('.editor-board .expression-toolbar').count(), 0);
        assert.equal(await inpaintHeader.getByRole('button', { name: 'Download image', exact: true }).count(), 1);
        assert.ok((await inpaintHeader.boundingBox()).height <= (viewport.width > 760 ? 44 : 82));
        const panels = await dialog.evaluate(panel => {
            const inset = (owner, child) => {
                const box = panel.querySelector(owner).getBoundingClientRect();
                const inner = panel.querySelector(child).getBoundingClientRect();
                return [inner.left - box.left, box.right - inner.right, inner.top - box.top];
            };
            return [
                ...inset('.inpaint-stage-shell', '.inpaint-canvas-shell'),
                ...inset('.inpaint-sidebar', '.inpaint-control-group'),
            ];
        });
        assert.ok(panels.every(value => value >= 12), 'Inpaint panels keep canvas and controls inset from the edges');
        await editor.locator('.editor-layout').screenshot({ path: `test-results/image-tools/inpaint-${viewport.width}.png` });
        assert.equal(await page.evaluate(() => app.inpaintConfigSteps), await page.evaluate(() => app.store.state.draft.steps));
        const canvas = dialog.locator('#inpaint-canvas');
        await canvas.scrollIntoViewIfNeeded();
        const box = await canvas.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, { steps: 3 });
        await page.mouse.up();
        await dialog.getByLabel('Inpaint prompt', { exact: true }).fill('A lighter purple');
        await dialog.locator('[data-action="generate-inpaint"]:visible').last().click();
        await dialog.getByRole('button', { name: /Use edit/ }).click();
        await page.waitForFunction(() => app.imageEditor.source.id === app.store.state.outputs[0].id && calls.length === 8);
        assert.match(await page.evaluate(() => calls[7].request.maskimage), /^data:image\/png;base64,/);
        assert.equal(await page.evaluate(() => calls[7].request.comfyuicustomworkflow), undefined);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => app.navigateToView('expressions'));
        await generateTab.click();
        await page.getByRole('button', { name: 'Options', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Keep final results only' }).uncheck();
        await page.getByRole('button', { name: /Render unlocked/ }).click();
        await page.waitForFunction(() => !app.expressionStudio.busy && calls.length === 11);
        assert.deepEqual(await page.evaluate(() => calls.slice(-3).map(call => call.stage)), ['generate', 'refine', 'background']);
        const generatedImage = await page.locator('.expression-card-image img').getAttribute('src');
        await refineTab.click();
        const refinedImage = await page.locator('.expression-card-image img').getAttribute('src');
        assert.notEqual(generatedImage, refinedImage);
        await backgroundTab.click();
        assert.equal(await page.locator('[data-cutout]').count(), 1);
        await generateTab.click();
        const outputCount = await page.evaluate(() => app.store.state.outputs.length);
        const previousSeed = await page.evaluate(() => app.expressionStudio.project.tiles[0].seedOffset);
        await page.evaluate(() => { window.holdPreview = true; });
        await page.locator('[data-tile-command="render"]').click();
        await livePreview.waitFor();
        await page.getByRole('button', { name: 'Stop Neutral', exact: true }).click();
        await page.waitForFunction(() => interrupts.length === 1 && !app.expressionStudio.busy);
        assert.deepEqual(await page.evaluate(() => interrupts[0]), { other_sessions: false, session_id: 'mock-session' });
        assert.equal(await livePreview.count(), 0);
        assert.equal(await page.locator('.expression-card-image img').getAttribute('src'), generatedImage);
        assert.equal(await page.evaluate(() => app.store.state.outputs.length), outputCount);
        assert.equal(await page.evaluate(() => app.expressionStudio.project.tiles[0].seedOffset), previousSeed);
        assert.match(await page.locator('.expression-run-status').textContent(), /Stopped · 0 complete/);
        assert.deepEqual(errors, []);
        await page.reload();
        await page.waitForFunction(() => app.expressionStudio?.project.tiles[0]?.stage === 'background');
        assert.equal(await page.evaluate(() => app.expressionStudio.project.refine.model), 'detail.pth');
        await refineTab.click();
        assert.equal(await page.locator('.expression-card-image img').getAttribute('src'), refinedImage);
        await context.close();
    }
    console.log('Image tools desktop/mobile UI: shared Library picker and uploads, live expression preview and interrupt, mobile settings, final-only renders, workflow import and inline Inpaint passed.');
} finally {
    await browser?.close();
    await server.close();
}
