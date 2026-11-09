import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
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
const expressions=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body><div id="app"></div><script type="module">
import '/src/styles.css';import { ExpressionStudio } from '/src/expressions/studio.ts';import { defaultSheet } from '/src/expressions/pipeline.ts';
window.commands=[];window.studio=new ExpressionStudio({models:()=>[{name:'portrait.safetensors',architecture:'sdxl'}],params:()=>[],busy:()=>false,connected:()=>false,captureLoras:()=>[],generate:async()=>{throw new Error('No live rendering in fixture');},probe:async()=>({}),save:async()=>{},notify:()=>{}});
await studio.mount(document.querySelector('#app'));studio.project=defaultSheet();studio.draw();
const command=studio.command.bind(studio);studio.command=async name=>{commands.push(name);if(['project-open','add-card'].includes(name))await command(name);};window.ready=true;
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
  const chooser=page.waitForEvent('filechooser');await project.getByRole('button',{name:/Open project/}).click();await (await chooser).setFiles([]);
  await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('region',{name:'Export portraits',exact:true}).getByRole('button',{name:/Export sheet PNG/}).click();assert.ok((await page.evaluate(()=>commands)).includes('sheet-export'));
  await page.getByRole('button',{name:'Add expressions',exact:true}).click();const add=page.getByRole('region',{name:'Build the sheet',exact:true});await add.getByRole('combobox',{name:'Preset set',exact:true}).selectOption('24');
  await add.getByRole('button',{name:/Add custom expression/}).click();await page.waitForFunction(()=>studio.project.tiles.length===13);
  await page.getByRole('button',{name:'Options',exact:true}).click();await page.getByRole('region',{name:'Render options',exact:true}).getByRole('button',{name:/Render unlocked/}).click();assert.ok((await page.evaluate(()=>commands)).includes('run-all'));
  assert.equal(await page.getByRole('button',{name:'Render missing',exact:true}).isVisible(),true);
  await page.locator('.expression-hero').screenshot({path:`test-results/actions/expression-project-${viewport.width}.png`});
  await page.locator('.expression-toolbar').screenshot({path:`test-results/actions/expression-toolbar-${viewport.width}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('LoRA, Library and Expressions action hierarchy desktop/tablet/mobile: ok');
} finally {await browser?.close();await server.close();}
