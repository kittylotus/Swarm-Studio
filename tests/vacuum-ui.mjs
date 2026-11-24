import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const fixture = `<!doctype html><html><body><div id="fixture"></div><script type="module">
import '/src/styles.css';
import { StudioApp } from '/src/app.ts';
import { newStudioMetadata } from '/src/library/provenance.ts';
const scope=JSON.stringify(['https://swarm.test','fixture-user',true]);
const draft=newStudioMetadata('expression_draft');draft.studio_created_at=String(Date.now()-8*86400000);
const final=newStudioMetadata('upscale_result',draft);
const meta=tag=>JSON.stringify({sui_extra_data:tag});
window.deleted=[];window.notices=[];window.slow=false;window.capped=false;
window.snapshot={schema:1,generatedAt:Date.now(),complete:true,claims:[],coverage:['mock-reference-source'],activeJobs:false};
window.incompleteSnapshot={...window.snapshot,complete:false,claims:Array.from({length:5},(_,index)=>{const metadata=newStudioMetadata('expression_draft');return {assetId:metadata.studio_asset_id,imageId:'fixture-'+index,scope,swarmPath:'day/claim-'+index+'.png',swarmPathVerified:true,persisted:true,usableCopyVerified:false,references:[],protected:false,metadata};})};
window.app=Object.assign(Object.create(StudioApp.prototype),{
 root:document.querySelector('#fixture'),connected:true,generating:false,expressionStudio:null,imageEditor:null,librarySyncing:false,libraryBatchBusy:false,
 vacuumOpen:false,vacuumPage:0,vacuumRows:[],vacuumSnapshot:null,vacuumScan:null,vacuumExclusions:new Set(),vacuumMessage:'Preview only.',vacuumHistory:[],vacuumFiles:[],vacuumFavorites:new Set(),vacuumScope:'',
 store:{state:{outputs:[],draft:{initImage:''},identities:[]}},
 client:{historyScope:scope,imageHistoryLimit:async()=>window.capped?1:1000,listImageDirectory:async path=>{
   if(window.slow)await new Promise(resolve=>setTimeout(resolve,150));
   return path===''?{folders:['day'],files:[]}:{folders:[],files:[{src:'draft.png',metadata:meta(draft),size:4800000},{src:'final.png',metadata:meta(final),size:6400000}]};
 },deleteImage:async path=>window.deleted.push(path)},
 auditStandaloneReferences:async()=>({paths:new Set(),checkedAt:Date.now(),complete:true,checks:[{source:'mock-projects',status:'complete'}]}),
 refreshLumiConnection:async()=>{},
 outputMutationPath:output=>output.swarmSourcePath,
 joinSwarmHistoryPath:(parent,child)=>parent?parent+'/'+child:child,
 notify:message=>window.notices.push(message),yieldLibrarySync:async()=>{},
 render(){this.root.innerHTML=this.vacuumOpen?this.renderVacuum():'<button data-action="open-vacuum">Vacuum preview</button><button data-action="delete-nonfavorite-outputs">Review non-favorited</button>';this.bindVacuumEvents();this.root.querySelector("[data-action=delete-nonfavorite-outputs]")?.addEventListener("click",()=>this.deleteNonFavoriteOutputs());}
});app.render();window.ready=true;
</script></body></html>`;
const server = await createServer({ cacheDir: 'test-results/vacuum-vite-cache', server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'vacuum-fixture', configureServer(server) { server.middlewares.use('/__vacuum', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fixture); }); } }] });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    await mkdir('test-results', { recursive: true });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 782, height: 893 }, { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 1024, height: 600 }]) {
        const context = await browser.newContext({ viewport, acceptDownloads: true });
        const page = await context.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__vacuum`);
        await page.waitForFunction(() => window.ready);
        await page.getByRole('button', { name: 'Review non-favorited', exact: true }).click();
        assert.match(await page.locator('[role="status"]').textContent(), /Bulk deletion requires review/);
        assert.equal(await page.locator('.vacuum-empty').count(), 1);
        assert.equal(await page.locator('[data-vacuum-policy="basis"]').inputValue(),'lineage');
        assert.equal(await page.getByRole('tab',{name:/What to keep/}).getAttribute('aria-selected'),'true');
        await page.locator('[data-vacuum-policy="lumi.expressionUpscale"]').uncheck();
        assert.equal(await page.evaluate(()=>app.readVacuumPolicy().lumi.expressionUpscale),false);
        await page.locator('[data-vacuum-policy="lumi.mode"]').selectOption('stages');
        assert.equal(await page.locator('.vacuum-policy > .vacuum-policy-references .vacuum-source').count(),1);
        await page.locator('[data-policy-origin="lumi"][data-vacuum-stage-preset="all"]').click();
        assert.equal(await page.evaluate(()=>app.readVacuumPolicy().lumi.stages.length),11);
        assert.equal(await page.locator('[data-vacuum-policy="standalone.mode"]').inputValue(),'chains');
        await page.locator('[data-policy-origin="lumi"][data-vacuum-stage-preset="none"]').click();
        await page.locator('[data-policy-origin="lumi"][data-vacuum-stage="inline_illustration"]').check();
        assert.equal(await page.locator('[data-vacuum-policy="standalone.mode"]').inputValue(),'chains');
        assert.deepEqual(await page.evaluate(()=>app.readVacuumPolicy().lumi.stages),['inline_illustration']);
        await page.getByRole('button',{name:'About Vacuum',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#vacuum-help').matches(':popover-open'));
        await page.keyboard.press('Escape');assert.equal(await page.locator('[data-vacuum-dialog]').isVisible(),true);
        await page.screenshot({path:`test-results/vacuum-origin-policy-${viewport.width}.png`,fullPage:true});
        await page.locator('[data-vacuum-policy="lumi.mode"]').selectOption('chains');
        await page.locator('[data-vacuum-policy="basis"]').selectOption('references');
        assert.equal(await page.evaluate(()=>app.readVacuumPolicy().basis),'references');

        assert.equal(await page.locator('input[type=file]').isVisible(), false);
        await page.screenshot({ path: `test-results/vacuum-empty-${viewport.width}.png`, fullPage: true });
        await page.locator('[data-vacuum-import]').setInputFiles({name:'incomplete.json',mimeType:'application/json',buffer:Buffer.from(await page.evaluate(()=>JSON.stringify(incompleteSnapshot)))});
        await page.getByText('Lumi references imported', {exact:true}).waitFor();
        assert.match(await page.locator('.vacuum-source').textContent(), /5 asset claims/);
        assert.equal(await page.locator('.vacuum-coverage').count(), 1);
        await page.screenshot({ path: `test-results/vacuum-imported-${viewport.width}.png`, fullPage: true });
        await page.locator('[data-vacuum-history]').click();
        assert.equal(await page.locator('#vacuum-history').isVisible(), true);
        assert.equal(await page.locator('[data-vacuum-history]').getAttribute('aria-expanded'), 'true');
        await page.locator('[data-vacuum-history]').click();
        assert.equal(await page.locator('#vacuum-history').isVisible(), false);
        assert.equal(await page.locator('details').count(), 0);

        await page.getByRole('button', { name: /^Scan Swarm history/ }).click();
        await page.waitForFunction(() => app.vacuumRows.length === 2);
        assert.equal(await page.locator('[data-status="review"]').count(), 2, 'missing Lumi protects preview');
        await page.getByRole('tab',{name:/What to keep/}).click();
        await page.locator('[data-vacuum-import]').setInputFiles({ name: 'references.json', mimeType: 'application/json', buffer: Buffer.from(await page.evaluate(() => JSON.stringify(snapshot))) });
        await page.waitForFunction(() => app.vacuumRows[0].status === 'candidate');
        await page.getByRole('tab',{name:/Select files/}).click();
        await page.locator('[data-vacuum-status]').selectOption('candidate');
        assert.equal(await page.locator('.vacuum-row').count(),1);
        await page.locator('[data-vacuum-search]').fill('not-a-real-file');
        assert.equal(await page.locator('.vacuum-row').count(),0);
        assert.match(await page.locator('.vacuum-no-matches').textContent(), /No files match/);
        await page.locator('[data-vacuum-reset]').click();
        await page.locator('[data-vacuum-sort]').selectOption('oldest');
        assert.equal(await page.locator('[data-vacuum-sort]').inputValue(), 'oldest');
        await page.locator('[data-vacuum-origin]').selectOption('standalone');
        assert.equal(await page.locator('.vacuum-row').count(),2);
        await page.locator('[data-vacuum-origin]').selectOption('lumiswarm');
        assert.equal(await page.locator('.vacuum-row').count(),0);
        await page.locator('[data-vacuum-reset]').click();
        assert.equal(await page.locator('[data-vacuum-sort]').inputValue(),'newest');

        await page.locator('[data-vacuum-exclude="0"]').check();
        assert.equal(await page.locator('[data-status="protected"]').count(),1,'exclusions stay hard-protected while policy-retained versions are manually reviewable');
        assert.equal(await page.locator('[data-vacuum-select="0"]').isDisabled(),true);
        assert.equal(await page.locator('[data-vacuum-select="1"]').isEnabled(),true);
        await page.getByRole('button', { name: /^Scan Swarm history/ }).click();
        await page.waitForFunction(() => !app.vacuumScan);
        assert.equal(await page.locator('[data-vacuum-exclude="0"]').isChecked(), true, 'exclusion persists across scans');
        await page.locator('[data-vacuum-exclude="0"]').uncheck();
        await page.screenshot({ path: `test-results/vacuum-${viewport.width}.png`, fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await page.locator('dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
        const download = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export preview', exact: true }).click()]).then(([download]) => download);
        const report = JSON.parse(await readFile(await download.path(), 'utf8'));
        assert.equal(report.dryRun, true); assert.equal(report.rows.length, 2);
        await page.evaluate(() => { app.vacuumSnapshot.claims=[{assetId:app.vacuumRows[0].assetId,imageId:'lumi',scope:app.client.historyScope,swarmPath:'day/draft.png',swarmPathVerified:true,persisted:true,usableCopyVerified:false,references:['chat'],protected:true}];app.refreshVacuumRows();app.render(); });
        assert.equal(await page.locator('[data-status="candidate"]').count(), 0, 'changed reference blocks old candidate');
        await page.evaluate(() => {window.capped=true;});
        await page.getByRole('button', { name: /^Scan Swarm history/ }).click();
        await page.waitForFunction(() => !app.vacuumScan);
        assert.match(await page.locator('[role="status"]').textContent(), /capped/);
        assert.equal(await page.locator('.vacuum-row').count(), 0);
        await page.evaluate(() => {window.capped=false;window.slow=true;});
        await page.getByRole('button', { name: /^Scan Swarm history/ }).click();
        await page.getByRole('button', { name: 'Cancel scan', exact: true }).click();
        await page.waitForFunction(() => !app.vacuumScan);
        assert.match(await page.locator('[role="status"]').textContent(), /cancelled/);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog').count(), 0);
        assert.deepEqual(await page.evaluate(() => deleted), [], 'preview never invokes deletion');
        assert.deepEqual(errors, []);
        await page.evaluate(() => {
          const metadata = {...incompleteSnapshot.claims[0].metadata,studio_origin:'lumiswarm'};
          const records = [{id:'lumi',metadata:JSON.stringify({sui_extra_data:metadata}),swarmSourcePath:'raw/2026-11-23/1818002-final.png',folderId:'kept-folder',prompt:'portrait',model:'fixture',createdAt:0},
            {id:'historical',metadata:'{}',swarmSourcePath:'raw/2026-05-28/100000-old.png',folderId:'kept-folder',prompt:'old',model:'fixture',createdAt:0}];
          window.collection = Object.assign(Object.create(Object.getPrototypeOf(app)), {
            root:app.root,view:'library',libraryFiltersOpen:true,libraryFiltersDocked:false,libraryFolder:'all',librarySearch:'',libraryDateFrom:'',libraryDateTo:'',libraryModelFilter:'',libraryStarFilter:'all',
            client:{historyScope:''},store:{state:{outputs:records,folders:[],ui:{selectedOutputId:''}},updateUi(value){Object.assign(this.state.ui,value);}},
            render(){this.root.innerHTML=this.renderLibraryFiltersModal()+'<output id="collection-count">'+this.libraryVisibleOutputs().length+'</output>';this.bindLibraryEvents();}
          });collection.render();
        });
        assert.equal(await page.locator('[data-library-modal-folder="virtual:lumiswarm"]').count(),1);
        await page.locator('[data-library-modal-folder="virtual:lumiswarm"]').click();
        assert.equal(await page.locator('#collection-count').textContent(),'1');
        assert.equal(await page.evaluate(()=>collection.store.state.ui.libraryFolder),'virtual:lumiswarm');
        assert.deepEqual(await page.evaluate(()=>collection.store.state.outputs.map(x=>x.folderId)),['kept-folder','kept-folder']);
        assert.equal(await page.locator('[data-delete-library-folder]').count(),0);
        assert.ok((await page.locator('[data-library-filter-dialog]').boundingBox()).y >= 0, 'Browse header remains on screen');
        await page.screenshot({path:`test-results/library-lumiswarm-${viewport.width}.png`,fullPage:true});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.deepEqual(errors,[]);
        await context.close();
    }
    console.log('Vacuum UI desktop/mobile: import, full scan, scope, exclusions, export, reference changes, caps, cancel, Escape, overflow, zero deletes: PASS');
} finally { await browser?.close(); await server.close(); }
