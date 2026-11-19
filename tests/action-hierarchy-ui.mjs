import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expressionProjects } from '../scripts/expression-projects.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/></head><body><div id="app"></div><script type="module">
import '/src/styles.css';import { StudioApp } from '/src/app.ts';import { builtInThemes } from '/src/theme.ts';
window.app=new StudioApp(document.querySelector('#app'));window.actions=[];
app.models=[{name:'anima.safetensors',architecture:'anima'},{name:'sdxl.safetensors',architecture:'sdxl'}];
app.loras=[{name:'smile.safetensors',architecture:'anima',author:'Alice',tags:['cute','expression']},{name:'pose.safetensors',architecture:'anima',author:'Bob',tags:['expression']},{name:'paint.safetensors',architecture:'sdxl',author:'Alice',tags:['style']}];
app.store.updateDraft({model:'anima.safetensors'});app.enrichLoraFacets=async mode=>actions.push(mode);
window.theme=id=>{app.store.state.theme=structuredClone(builtInThemes.find(t=>t.id===id).theme);app.applyTheme();};
window.library=()=>{const image=document.createElement('canvas').toDataURL();app.store.state.outputs=[false,true].map((starred,i)=>({id:String(i),url:image,swarmPath:'2026-11-09/'+i+'.png',swarmSourcePath:'2026-11-09/'+i+'.png',folderId:'folder-unfiled',prompt:'A portrait',sentPrompt:'A portrait',negativePrompt:'',model:'anima.safetensors',width:512,height:512,seed:i,starred,createdAt:Date.now(),metadata:'',request:{},loras:[],presets:[]}));app.connected=true;app.libraryAutoSyncStarted=true;app.syncSwarmHistory=async()=>actions.push('sync');app.deleteNonFavoriteOutputs=async()=>actions.push('delete');app.view='library';app.render();};
app.view='models';app.render();window.ready=true;
</script></body></html>`;
const expressions=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body><div class="app-shell"><header class="utility-bar">Swarm Studio</header><main class="main-area"><div class="content" id="app"></div></main></div><script type="module">
import '/src/styles.css';import { ExpressionStudio } from '/src/expressions/studio.ts';import { defaultSheet } from '/src/expressions/pipeline.ts';
window.commands=[];window.studio=new ExpressionStudio({models:()=>[{name:'portrait.safetensors',architecture:'sdxl'}],processing:{},params:()=>[],busy:()=>false,connected:()=>false,captureLoras:()=>[],generate:async()=>{throw new Error('No live rendering in fixture');},probe:async()=>({}),save:async()=>{},notify:()=>{}});
await studio.mount(document.querySelector('#app'));studio.project=defaultSheet();studio.draw();
const command=studio.command.bind(studio);studio.command=async (name,trigger)=>{commands.push(name);if(['project-open','project-import','project-new','project-folder','project-save','add-card','open-bank','pack-export'].includes(name))await command(name,trigger);};window.ready=true;
</script></body></html>`;
const server=await createServer({cacheDir:'test-results/actions-vite-cache',server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'action-hierarchy-fixture',configureServer(server){server.middlewares.use('/__actions',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(fixture);});server.middlewares.use('/__expression_actions',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(expressions);});}}]});
let browser;
try {
 await server.listen();browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});await mkdir('test-results/actions',{recursive:true});
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 for(const viewport of [{width:1440,height:1000},{width:900,height:900},{width:390,height:844}]) {
  const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);
  await page.goto(base+'/__actions');await page.waitForFunction(()=>window.ready);
  const toolbar=page.locator('.lora-library-toolbar');
  assert.equal(await toolbar.getByRole('combobox').count(),0);assert.equal(await toolbar.getByRole('spinbutton').count(),0);
  assert.equal(await toolbar.getByRole('button',{name:'Filters',exact:true}).isVisible(),true);
  assert.equal(await page.locator('#lora-library-grid [data-lora-model]').count(),2);
  await page.getByRole('textbox',{name:'Search LoRAs'}).fill('smile');assert.match(await page.locator('[data-lora-result-count]').textContent(),/^1 /);
  await page.getByRole('textbox',{name:'Search LoRAs'}).fill('');
  await toolbar.getByRole('button',{name:'Folders',exact:true}).click();
  assert.equal(await page.getByRole('navigation',{name:'LoRA folders',exact:true}).isVisible(),true);
  await toolbar.getByRole('button',{name:'Manage',exact:true}).click();
  assert.equal(await page.getByRole('navigation',{name:'LoRA folders',exact:true}).isVisible(),false,'only one action surface opens at a time');
  const manage=page.getByRole('region',{name:'LoRA collection',exact:true});assert.equal(await manage.isVisible(),true);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#lora-tools-menu').matches(':popover-open'));
  assert.equal(await toolbar.getByRole('button',{name:'Manage',exact:true}).evaluate(el=>el===document.activeElement),true);
  await toolbar.getByRole('button',{name:'Manage',exact:true}).click();await manage.getByRole('button',{name:/Switch to grid view/}).click();
  assert.equal(await page.evaluate(()=>app.loraMobileGrid),true);assert.equal(await toolbar.getByRole('button',{name:'Manage',exact:true}).evaluate(el=>el===document.activeElement),true);
  await toolbar.getByRole('button',{name:'Add',exact:true}).click();
  assert.equal(await page.getByRole('region',{name:'Add LoRAs',exact:true}).getByRole('button',{name:/Download from URL/}).isDisabled(),true);
  await toolbar.getByRole('textbox',{name:'Search LoRAs'}).click();assert.equal(await page.locator('#lora-add-menu').isVisible(),false);

  const filters=toolbar.getByRole('button',{name:'Filters',exact:true});await filters.click();
  let dialog=page.getByRole('dialog',{name:'Filter & sort LoRAs'});await dialog.waitFor();
  await dialog.getByRole('combobox',{name:'Creator',exact:true}).selectOption('Alice');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(()=>app.loraFacetCreator),'');
  assert.equal(await filters.evaluate(el=>el===document.activeElement),true);
  await filters.click();dialog=page.getByRole('dialog',{name:'Filter & sort LoRAs'});
  await dialog.getByLabel('Show non-matching LoRAs',{exact:false}).check();await dialog.getByRole('combobox',{name:'Creator',exact:true}).selectOption('Alice');
  await dialog.getByRole('combobox',{name:'Sort by',exact:true}).selectOption('tag-count');
  await dialog.getByRole('searchbox',{name:'Search tags',exact:true}).fill('cute');await dialog.getByRole('checkbox',{name:/^cute/}).check();
  assert.equal(await dialog.getByRole('button',{name:'Show 1 LoRA',exact:true}).isVisible(),true);
  assert.equal(await page.evaluate(()=>app.loraFacetCreator),'','pending changes do not mutate the grid');
  for(let i=0;i<12;i++){
   await page.keyboard.press('Tab');
   const focus=await dialog.evaluate(el=>({inside:el.contains(document.activeElement),body:document.activeElement===document.body,active:document.activeElement?.outerHTML.slice(0,160),modal:el.matches(':modal')}));
   assert.equal(focus.modal,true);assert.ok(focus.inside||focus.body,`modal focus must not reach a background control: ${focus.active}`);
  }
  await dialog.screenshot({path:`test-results/actions/lora-filters-${viewport.width}.png`});
  await dialog.getByRole('button',{name:'Show 1 LoRA',exact:true}).click();assert.equal(await page.locator('#lora-library-grid [data-lora-model]').count(),1);
  assert.equal(await page.evaluate(()=>app.loraFacetCreator),'Alice');
  await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>app.loraFacetCreator),'Alice');
  await toolbar.screenshot({path:`test-results/actions/lora-toolbar-${viewport.width}.png`});
  await toolbar.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal(await page.locator('#lora-library-grid [data-lora-model]').count(),2);
  await page.evaluate(()=>theme('minimal'));
  await toolbar.screenshot({path:`test-results/actions/lora-toolbar-light-${viewport.width}.png`});
  await filters.click();await dialog.screenshot({path:`test-results/actions/lora-filters-light-${viewport.width}.png`});await page.keyboard.press('Escape');
  await page.evaluate(()=>theme('studio'));
  await filters.click();await dialog.getByRole('button',{name:'Reset filters',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
  await toolbar.getByRole('button',{name:'Manage',exact:true}).click();await manage.getByRole('button',{name:/Organize LoRAs/}).click();
  assert.equal(await toolbar.getByRole('button',{name:/Done organizing/}).isVisible(),true);await toolbar.getByRole('button',{name:/Done organizing/}).click();
  await toolbar.getByRole('button',{name:'Manage',exact:true}).click();assert.equal(await manage.getByRole('button',{name:/Enrich unclassified/}).isDisabled(),true);await manage.getByRole('button',{name:/Fetch CivitAI stats/}).click();assert.deepEqual(await page.evaluate(()=>actions),['stats']);

  await page.evaluate(()=>library());
  const library=page.locator('.library-toolbar');assert.equal(await library.getByRole('button',{name:/Delete all non-favorited/}).isVisible(),false);
  await library.screenshot({path:`test-results/actions/library-toolbar-${viewport.width}.png`});
  await library.getByRole('button',{name:'Tools',exact:true}).click();
  const tools=page.getByRole('region',{name:'Library tools',exact:true});await tools.screenshot({path:`test-results/actions/library-tools-${viewport.width}.png`});
  await tools.getByRole('button',{name:/Sync Swarm history/}).click();assert.ok((await page.evaluate(()=>actions)).includes('sync'));
  await library.getByRole('button',{name:'Tools',exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(await library.getByRole('button',{name:'Tools',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'Batch select outputs',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Exit batch selection',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Exit batch selection',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(ids.length,new Set(ids).size);

  await page.goto(base+'/__expression_actions');await page.waitForFunction(()=>window.ready);
  await page.getByRole('button',{name:'Project',exact:true}).click();
  const project=page.getByRole('region',{name:'Project files',exact:true});
  const chooser=page.waitForEvent('filechooser');await project.getByRole('button',{name:/Import file/}).click();await (await chooser).setFiles([]);
  await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('region',{name:'Export portraits',exact:true}).getByRole('button',{name:/Export sheet PNG/}).click();assert.ok((await page.evaluate(()=>commands)).includes('sheet-export'));
  await page.getByRole('button',{name:'Add expressions',exact:true}).click();const add=page.getByRole('region',{name:'Build the sheet',exact:true});await add.getByRole('combobox',{name:'Preset set',exact:true}).selectOption('24');
  await add.getByRole('button',{name:/Add custom expression/}).click();
  const custom=page.getByRole('dialog',{name:'Add custom expression'});
  await custom.getByRole('button',{name:'Cancel',exact:true}).click();
  const addCard=page.locator('.expression-grid > .expression-add-card:last-child');
  assert.equal(await addCard.evaluate(card=>getComputedStyle(card).borderStyle),'dashed');
  await addCard.click();
  await page.keyboard.press('Escape');
  await custom.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.matches('.expression-add-card'));
  await addCard.screenshot({path:`test-results/actions/expression-add-card-${viewport.width}.png`});
  await addCard.click();
  await custom.getByLabel('Expression name').fill('Wistful');
  await custom.getByLabel('Prompt direction').fill('Distant gaze, subdued smile');
  await custom.getByRole('button',{name:'Add expression',exact:true}).click();
  await page.waitForFunction(()=>studio.project.tiles.length===13);
  await page.getByRole('button',{name:'Add expressions',exact:true}).click();
  await add.getByRole('button',{name:'Custom expression bank',exact:true}).click();
  const bank=page.getByRole('dialog',{name:'Custom expression bank',exact:true});
  await bank.getByText('Wistful',{exact:true}).waitFor();
  await bank.screenshot({path:`test-results/actions/expression-bank-${viewport.width}.png`});
  await bank.getByRole('button',{name:'Edit',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Edit template',exact:true});
  await edit.getByLabel('Prompt direction').fill('Distant gaze, soft eyes');
  await edit.getByRole('button',{name:'Save template',exact:true}).click();
  assert.equal(await page.evaluate(()=>studio.project.tiles.at(-1).prompt),'Distant gaze, subdued smile');
  await bank.getByRole('searchbox',{name:'Search templates'}).fill('soft eyes');
  await bank.getByRole('button',{name:'Use',exact:true}).click();
  await page.waitForFunction(()=>studio.project.tiles.length===14);
  assert.equal(await page.evaluate(()=>studio.project.tiles.at(-1).prompt),'Distant gaze, soft eyes');
  await page.getByRole('button',{name:'Options',exact:true}).click();await page.getByRole('region',{name:'Render options',exact:true}).getByRole('button',{name:/Render unlocked/}).click();assert.ok((await page.evaluate(()=>commands)).includes('run-all'));
  assert.equal(await page.getByRole('button',{name:'Render missing',exact:true}).isVisible(),true);
  await page.locator('.expression-hero').screenshot({path:`test-results/actions/expression-project-${viewport.width}.png`});
  const headerRow=await page.locator('.expression-hero').evaluate(header=>{
    const title=header.querySelector('.expression-heading').getBoundingClientRect();
    const actions=header.querySelector('.expression-hero-actions').getBoundingClientRect();
    return actions.left>=title.right && actions.top<title.bottom && actions.bottom>title.top;
  });
  assert.equal(headerRow,true,'Project and Export stay beside the title');
  const expressionTools=page.getByRole('group',{name:'Expression tools',exact:true});
  if(viewport.width <= 760) {
    await page.evaluate(()=>window.scrollTo(0,650));
    await page.waitForFunction(()=>{
      const tools=document.querySelector('.expression-board-tools').getBoundingClientRect();
      const header=document.querySelector('.utility-bar').getBoundingClientRect();
      return scrollY > 400 && Math.abs(tools.top-header.bottom) < 1;
    });
    await expressionTools.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('dialog',{name:'Expression settings',exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>scrollY > 400);
    for(const width of [320,viewport.width]) {
      await page.setViewportSize({...viewport,width});
      assert.ok(await expressionTools.evaluate(toolbar=>{
        const bounds=toolbar.getBoundingClientRect();
        const [settings,add,render,pipeline]=Array.from(toolbar.children,node=>node.getBoundingClientRect());
        const centered=Math.abs(bounds.left+bounds.right-settings.left-add.right)<2;
        return centered && Math.abs(settings.top-add.top)<1 && Math.abs(render.top-pipeline.top)<1
          && render.top>settings.bottom && toolbar.scrollWidth<=toolbar.clientWidth+1;
      }), `toolbar remains centered in two rows at ${width}px`);
      assert.ok(await page.locator('.expression-pipeline').evaluate(pipeline => {
        const tabs = [...pipeline.querySelectorAll('button')];
        return tabs.length === 3 && pipeline.textContent.includes('Remove BG')
          && getComputedStyle(pipeline.querySelector('.expression-stage-full')).display === 'none'
          && tabs.every(tab => {
            const label = tab.querySelector('b').getBoundingClientRect();
            const pill = tab.querySelector('.expression-stage-badge');
            return Boolean(pill.dataset.state) && pill.getBoundingClientRect().top > label.bottom
              && getComputedStyle(pill).borderRadius === '999px';
          });
      }), `stage titles stay above their status pills at ${width}px`);
    }
    await page.locator('.expression-pipeline').screenshot({path:`test-results/actions/expression-stages-${viewport.width}.png`});
  }
  await expressionTools.screenshot({path:`test-results/actions/expression-toolbar-${viewport.width}.png`});
  const cards=page.locator('.expression-card');
  const firstId=await cards.first().getAttribute('data-card');
  await cards.first().getByRole('button',{name:'Card actions',exact:true}).click();
  const cardMenu=page.locator('.expression-card .studio-action-menu:popover-open');
  assert.ok(await cardMenu.getByRole('button',{name:'Move earlier'}).isDisabled());
  const menuBounds=await cardMenu.boundingBox();
  await cardMenu.screenshot({path:`test-results/actions/expression-card-actions-${viewport.width}.png`});
  assert.ok(menuBounds.width <= 193 && menuBounds.height <= 195, `card menu stays compact (${menuBounds.width} × ${menuBounds.height})`);
  await cardMenu.getByRole('button',{name:'Move later'}).click();
  assert.equal(await cards.nth(1).getAttribute('data-card'),firstId);
  await cards.nth(1).getByRole('button',{name:'Card actions',exact:true}).click();
  await cardMenu.getByRole('button',{name:'Remove expression'}).click();
  assert.equal(await cards.count(),13);
  assert.equal(await cards.getByRole('button',{name:'PNG',exact:true}).count(),0);
  await page.reload();await page.waitForFunction(()=>window.ready);
  await page.getByRole('button',{name:'Add expressions',exact:true}).click();
  await add.getByRole('button',{name:'Custom expression bank',exact:true}).click();
  await bank.getByText('Distant gaze, soft eyes',{exact:true}).waitFor();
  await bank.locator('input[type="file"]').setInputFiles({
    name:'templates.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({version:1,templates:[{name:'Stoic',prompt:'Still posture'}]})),
  });
  await bank.getByText('Stoic',{exact:true}).waitFor();
  const exported=page.waitForEvent('download');
  await bank.getByRole('button',{name:'Export',exact:true}).click();
  assert.equal((await exported).suggestedFilename(),'expression-bank.json');
  await bank.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
    const image=canvas.toDataURL();
    studio.project.width=studio.project.height=256;
    canvas.width=canvas.height=1024;
    const paint=canvas.getContext('2d');
    const gradient=paint.createLinearGradient(0,0,1024,1024);
    gradient.addColorStop(0,'#9063bd');gradient.addColorStop(1,'#273b5b');
    paint.fillStyle=gradient;paint.fillRect(0,0,1024,1024);
    paint.fillStyle='#d5b8e8';paint.beginPath();paint.ellipse(512,430,180,235,0,0,Math.PI*2);paint.fill();
    studio.project.reference=canvas.toDataURL();
    studio.project.tiles=studio.project.tiles.slice(0,2).map(tile=>({...tile,name:'Neutral',image}));
    studio.draw();
  });
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByRole('button',{name:/Export portrait pack/}).click();
  const pack=page.getByRole('dialog',{name:'Export portrait pack'});
  await pack.getByText('01-neutral.png',{exact:true}).waitFor();
  await pack.getByLabel('Character name (optional)').fill('Lior');
  const filenames=['Lior-Neutral.png','Lior-Neutral-2.png','Lior-expression-sheet.png','Lior-project.expressions.json'];
  assert.deepEqual(await pack.getByRole('listitem').allTextContents(),filenames);
  await pack.screenshot({path:`test-results/actions/expression-pack-${viewport.width}.png`});
  const archive=page.waitForEvent('download');
  await pack.getByRole('button',{name:'Export ZIP',exact:true}).click();
  const downloaded=await archive;
  assert.equal(downloaded.suggestedFilename(),'Lior.zip');
  const zip=await readFile(await downloaded.path());
  const entries=[];
  for(let offset=0;zip.readUInt32LE(offset)===0x04034b50;) {
    const size=zip.readUInt32LE(offset+18),nameLength=zip.readUInt16LE(offset+26),extraLength=zip.readUInt16LE(offset+28);
    entries.push(zip.toString('utf8',offset+30,offset+30+nameLength));
    offset+=30+nameLength+extraLength+size;
  }
  assert.deepEqual(entries.sort(),filenames.sort());
  const diskProjects=expressionProjects(await mkdir(`test-results/actions/projects-${viewport.width}-${Date.now()}`,{recursive:true}));
  await assert.rejects(()=>diskProjects({action:'list',folder:'../outside'}));
  const legacy=await diskProjects({action:'mkdir',folder:'Legacy'});
  await writeFile(legacy.root+'/Legacy/legacy.expressions.json','{ invalid project data');
  const lazyListing=await diskProjects({action:'list',folder:'Legacy'});
  assert.equal(lazyListing.projects[0].needsIndex,true,'listing does not parse legacy portrait payloads');
  await page.route('**/__studio/host-control/session',route=>route.fulfill({json:{available:true}}));
  let failNextRename=true;
  let delayProjectAction='';
  const projectRequests=[];
  await page.route('**/__studio/host-control/expression-projects',async route=>{
    projectRequests.push(route.request().postDataJSON().action);
    if(route.request().postDataJSON().action===delayProjectAction) {
      delayProjectAction='';
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    if(route.request().postDataJSON().action==='rename' && failNextRename) {
      failNextRename=false;
      await route.fulfill({status:503,json:{error:'Fixture disk unavailable'}});
      return;
    }
    try { await route.fulfill({json:await diskProjects(route.request().postDataJSON())}); }
    catch(error) { await route.fulfill({status:400,json:{error:error.message}}); }
  });
  await page.evaluate(()=>window.boardBeforeProjects=document.querySelector('.expression-board'));
  await page.getByRole('button',{name:'Project',exact:true}).click();
  await project.getByRole('button',{name:/Open projects/}).click();
  const projectsDialog=page.getByRole('dialog',{name:'Expression projects',exact:true});
  await projectsDialog.getByRole('button',{name:'Save current project here'}).waitFor();
  if(viewport.width<=600) assert.equal(Math.round((await projectsDialog.boundingBox()).width),viewport.width,'mobile project manager uses the full viewport');
  assert.equal(projectRequests.includes('save'),false,'opening the browser does not save the active portrait payload');
  await projectsDialog.getByRole('button',{name:'Close projects',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.boardBeforeProjects===document.querySelector('.expression-board')),true,'closing without a project change preserves the existing portrait DOM');
  await page.getByRole('button',{name:'Project',exact:true}).click();
  await project.getByRole('button',{name:/Open projects/}).click();
  await projectsDialog.getByRole('button',{name:'Save current project here'}).waitFor();
  if(viewport.width<=600) await projectsDialog.getByRole('button',{name:'Folders',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept('Characters'));
  await projectsDialog.getByRole('button',{name:'New folder'}).click();
  await projectsDialog.getByRole('button',{name:'Characters',exact:true}).waitFor();
  delayProjectAction='save';
  await projectsDialog.getByRole('button',{name:'Save current project here'}).click();
  await projectsDialog.getByRole('status').filter({hasText:'Saving project…'}).waitFor();
  assert.equal(await projectsDialog.getByRole('button',{name:'Close projects'}).isDisabled(),true);
  await projectsDialog.screenshot({path:`test-results/actions/project-saving-${viewport.width}.png`});
  await page.waitForFunction(()=>studio.projectFolder==='Characters');
  await projectsDialog.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Project',exact:true}).click();
  delayProjectAction='save';
  await project.getByRole('button',{name:'Save now',exact:true}).click();
  const savingProject=page.getByRole('dialog',{name:'Saving project…',exact:true});
  await savingProject.waitFor();
  await savingProject.screenshot({path:`test-results/actions/project-save-progress-${viewport.width}.png`});
  await savingProject.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Project',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept('New character'));
  await project.getByRole('button',{name:'Start new project',exact:true}).click();
  await page.waitForFunction(()=>studio.project.name==='New character');
  await page.getByRole('button',{name:'Project',exact:true}).click();
  await project.getByRole('button',{name:/Open projects/}).click();
  await projectsDialog.getByRole('button',{name:'Open Character expressions',exact:true}).waitFor();
  const existingProject=projectsDialog.locator('article').filter({has:page.getByRole('button',{name:'Open Character expressions',exact:true})});
  await existingProject.locator('.project-file-cover img').waitFor();
  await page.waitForFunction(()=>document.querySelector('.project-file-cover img')?.naturalWidth===256);
  await existingProject.getByRole('button',{name:'Rename',exact:true}).click();
  await existingProject.getByLabel('Project name',{exact:true}).fill('Lior');
  await existingProject.getByRole('button',{name:'Save name',exact:true}).click();
  await projectsDialog.getByRole('alert').filter({hasText:'Fixture disk unavailable'}).waitFor();
  assert.equal(await existingProject.getByLabel('Project name',{exact:true}).inputValue(),'Lior');
  await existingProject.getByRole('button',{name:'Save name',exact:true}).click();
  await projectsDialog.getByRole('button',{name:'Open Lior',exact:true}).waitFor();
  await projectsDialog.screenshot({path:`test-results/actions/project-folders-${viewport.width}.png`});
  delayProjectAction='open';
  await projectsDialog.getByRole('button',{name:'Open Lior',exact:true}).click();
  await projectsDialog.getByRole('status').filter({hasText:'Opening project…'}).waitFor();
  assert.equal(await projectsDialog.getByRole('button',{name:'Open Lior',exact:true}).isDisabled(),true);
  await page.waitForFunction(()=>studio.project.tiles.length===2);
  await projectsDialog.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>studio.project.name),'Lior');
  await page.getByRole('button',{name:'Project',exact:true}).click();
  await project.getByRole('button',{name:/Open projects/}).click();
  const activeProject=projectsDialog.locator('article').filter({has:page.getByRole('button',{name:'Open Lior',exact:true})});
  page.once('dialog',dialog=>dialog.dismiss());
  await activeProject.getByRole('button',{name:'Delete',exact:true}).click();
  assert.equal(await activeProject.count(),1);
  page.once('dialog',dialog=>dialog.accept());
  await activeProject.getByRole('button',{name:'Delete',exact:true}).click();
  await activeProject.waitFor({state:'detached'});
  assert.equal(await projectsDialog.getByRole('button',{name:'Open Lior',exact:true}).count(),0);
  await projectsDialog.getByRole('button',{name:'Close projects',exact:true}).click();
  await page.waitForFunction(()=>studio.projectFolderSelected===false);
  assert.equal((await diskProjects({action:'list',folder:'Characters'})).projects.some(item=>item.name==='Lior'),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('LoRA, Library and Expressions action hierarchy desktop/tablet/mobile: ok');
} finally {await browser?.close();await server.close();}
