import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/></head><body><div id="app"></div><script type="module">
import '/src/styles.css'; import { StudioApp } from '/src/app.ts'; import { StudioStore } from '/src/library/store.ts';
import { builtInThemes } from '/src/theme.ts';
window.notices=[]; window.app=new StudioApp(document.querySelector('#app'));window.StudioStore=StudioStore;
app.notify=(message,kind)=>notices.push({message,kind});app.addLog=()=>{};
app.models=[{name:'root.safetensors'},{name:'anime/one.safetensors'},{name:'anime/deep/two.safetensors'},{name:'anime2/other.safetensors'}];
app.loras=[{name:'root-lora.safetensors'},{name:'anime/one-lora.safetensors'},{name:'anime/deep/two-lora.safetensors'}];
app.loraShowNonMatching=true;
window.show=view=>{app.view=view;app.render();};
window.fixtureTheme=id=>{app.store.state.theme=structuredClone(builtInThemes.find(theme=>theme.id===id).theme);app.applyTheme();};
window.newIdentity=()=>{app.identityEditingId='';app.identityFormDraft=null;app.identityEditorEpoch++;app.store.updateUi({identityEditorOpen:true});show('identities');};
window.makePicture=()=>{const c=document.createElement('canvas');c.width=c.height=1024;const x=c.getContext('2d'),im=x.createImageData(1024,1024);let seed=123;for(let i=0;i<im.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;im.data[i]=seed&255;im.data[i+1]=(seed>>>8)&255;im.data[i+2]=(seed>>>16)&255;im.data[i+3]=255;}x.putImageData(im,0,0);return c.toDataURL('image/png');};
window.record=(name,avatarUrl='')=>({name,folderId:'folder-unfiled',positivePrompt:'subject',negativePrompt:'avoid',model:'root.safetensors',notes:'notes',loraStack:[],avatarUrl});
window.reopen=async()=>{app.store=new StudioStore();window.warning=await app.store.initializeIdentityAvatars();show('identities');};
await app.store.initializeIdentityAvatars();show('identities');window.ready=true;
</script></body></html>`;
const server = await createServer({cacheDir:'test-results/studio-fixes-vite-cache',server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'studio-fixes-fixture',configureServer(server){server.middlewares.use('/__studio_fixes',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(fixture);});}}]});
let browser;
try {
  await server.listen(); browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
  const url=`http://127.0.0.1:${server.httpServer.address().port}/__studio_fixes`;
  await mkdir('test-results/studio-fixes',{recursive:true});
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);await page.waitForFunction(()=>window.ready);
    assert.deepEqual(await page.evaluate(()=>{
      const timing=app.outputTiming({metadata:JSON.stringify({sui_extra_data:{generation_time:'3.70 min'}}),generationTimeMs:3700});
      return {ms:timing.generationTimeMs,label:app.formatDuration(timing.generationTimeMs)};
    }),{ms:222000,label:'3m 42.0s'},'Inspector must repair old cached timing from authoritative units');
    await page.evaluate(()=>newIdentity());
    const form=page.locator('#identity-form');
    await form.getByLabel('Name',{exact:true}).fill('Unfinished subject');
    await form.getByLabel('Base positive').fill('smiling, red coat');
    await form.getByLabel('Base negative').fill('blurry');
    await form.getByLabel('Notes').fill('Keep my notes');
    await form.getByLabel('Default checkpoint').selectOption('anime/one.safetensors');
    const picture=await page.evaluate(()=>makePicture());
    assert.ok(picture.length>1_000_000,'fixture must reproduce large uncompressed avatars');
    const file={name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(picture.split(',')[1],'base64')};
    await page.locator('#identity-picture-input').setInputFiles(file);
    await page.waitForFunction(()=>Boolean(app.identityFormDraft?.avatarDirty));
    assert.equal(await form.getByLabel('Name',{exact:true}).inputValue(),'Unfinished subject');
    assert.equal(await form.getByLabel('Notes').inputValue(),'Keep my notes');
    await page.evaluate(()=>app.render());
    assert.equal(await form.getByLabel('Base positive').inputValue(),'smiling, red coat');
    assert.equal(await form.getByLabel('Default checkpoint').inputValue(),'anime/one.safetensors');
    await form.getByRole('button',{name:'Remove picture',exact:true}).click();
    assert.equal(await form.getByLabel('Name',{exact:true}).inputValue(),'Unfinished subject');
    await page.locator('#identity-picture-input').setInputFiles(file);
    await page.waitForFunction(()=>Boolean(app.identityFormDraft?.avatarUrl));
    await page.screenshot({path:`test-results/studio-fixes/identity-${viewport.width}.png`});
    await form.getByRole('button',{name:'Save identity',exact:false}).click();
    await page.waitForFunction(()=>app.store.state.identities.length===1&&!app.store.state.ui.identityEditorOpen);
    assert.equal(await page.evaluate(()=>app.store.state.identities[0].notes),'Keep my notes');
    const shape=await page.evaluate(async()=>{const i=app.store.state.identities[0];const image=new Image();image.src=i.avatarUrl;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight,key:i.avatarKey,snapshot:JSON.parse(localStorage.getItem('swarm-studio-state-v8')).identities[0]};});
    assert.ok(shape.key);assert.equal(shape.snapshot.avatarUrl,'');assert.ok(shape.width<=384&&shape.height<=384);
    await page.getByLabel('Actions for Unfinished subject',{exact:true}).click();
    await page.getByRole('button',{name:'Edit identity Unfinished subject',exact:true}).click();
    await form.getByLabel('Name',{exact:true}).fill('Edited subject');
    await form.getByLabel('Notes').fill('Unsaved edit');
    await page.locator('#identity-picture-input').setInputFiles(file);
    await page.waitForFunction(()=>app.identityFormDraft?.avatarDirty&&!app.identityPictureReading);
    assert.equal(await form.getByLabel('Notes').inputValue(),'Unsaved edit');
    assert.equal(await page.evaluate(()=>app.store.state.identities[0].name),'Unfinished subject','picking a picture must not save an unfinished edit');
    await page.getByRole('button',{name:'New identity',exact:false}).click();
    assert.equal(await page.evaluate(()=>app.store.state.identities[0].avatarKey),shape.key,'discarding an edit keeps its original asset');

    // Asset-write failures must also stay visible without adding in-memory-only identities.
    await form.getByLabel('Name',{exact:true}).fill('Asset retry');
    await page.locator('#identity-picture-input').setInputFiles(file);
    await page.waitForFunction(()=>app.identityFormDraft?.avatarDirty&&!app.identityPictureReading);
    await page.evaluate(()=>{window.originalTransaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(){throw new Error('fixture asset write rejected');};});
    await form.getByRole('button',{name:'Save identity',exact:false}).click();
    await page.waitForFunction(()=>notices.some(n=>n.kind==='error'&&n.message.includes('fixture asset write rejected')));
    assert.equal(await form.getByLabel('Name',{exact:true}).inputValue(),'Asset retry');
    assert.equal(await page.evaluate(()=>app.store.state.identities.length),1);
    await page.evaluate(()=>IDBDatabase.prototype.transaction=originalTransaction);
    await page.getByRole('button',{name:'New identity',exact:false}).click();
    await page.evaluate(async picture=>{for(let i=0;i<30;i++)await app.store.saveIdentity(record('Subject '+i,picture));},picture);
    assert.ok(await page.evaluate(()=>localStorage.getItem('swarm-studio-state-v8').length<100_000));
    await page.reload();await page.waitForFunction(()=>window.ready);
    assert.equal(await page.evaluate(()=>app.store.state.identities.length),31);
    assert.equal(await page.evaluate(()=>app.store.state.identities.every(i=>i.avatarKey&&i.avatarUrl.startsWith('blob:'))),true);

    // Quota failure must retain the form and must not create a ghost identity.
    await page.evaluate(()=>{newIdentity();window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='swarm-studio-state-v8')throw new DOMException('fixture quota','QuotaExceededError');return originalSet.call(this,key,value);};});
    await form.getByLabel('Name',{exact:true}).fill('Retry me');
    await form.getByRole('button',{name:'Save identity',exact:false}).click();
    await page.waitForFunction(()=>notices.some(n=>n.kind==='error'&&n.message.includes('not saved')));
    assert.equal(await form.getByLabel('Name',{exact:true}).inputValue(),'Retry me');
    assert.equal(await page.evaluate(()=>app.store.state.identities.length),31);
    await page.evaluate(()=>Storage.prototype.setItem=originalSet);
    await form.getByRole('button',{name:'Save identity',exact:false}).click();
    await page.waitForFunction(()=>app.store.state.identities.length===32);

    await page.evaluate(()=>show('models'));
    const checkpoints=page.locator('.checkpoint-section'),loras=page.locator('.lora-library-section');
    await checkpoints.getByRole('spinbutton',{name:'Checkpoint folder depth'}).fill('0');
    await checkpoints.getByRole('spinbutton',{name:'Checkpoint folder depth'}).press('Tab');
    await page.waitForFunction(()=>document.querySelectorAll('.checkpoint-section .model-card:not(.orphan-model-card)').length===1);
    assert.equal(await checkpoints.getByRole('spinbutton',{name:'Checkpoint folder depth'}).evaluate(el=>el===document.activeElement),false,'Tab must leave the changed depth field');
    assert.equal(await checkpoints.locator('.model-card:not(.orphan-model-card)').count(),1);
    await checkpoints.getByRole('button',{name:'Folders',exact:true}).click();
    let navigator=page.getByRole('navigation',{name:'Checkpoint folders',exact:true});
    await navigator.getByRole('button',{name:'Collapse checkpoint folder anime',exact:true}).click();
    assert.equal(await navigator.locator('[data-checkpoint-folder="anime/deep"]').isVisible(),false);
    await navigator.getByRole('button',{name:'Expand checkpoint folder anime',exact:true}).focus();await page.keyboard.press('Enter');
    assert.equal(await navigator.locator('[data-checkpoint-folder="anime/deep"]').isVisible(),true);
    await page.screenshot({path:`test-results/studio-fixes/models-${viewport.width}.png`});
    for (const theme of ['studio','mint','bubblegum','minimal']) {
      await page.evaluate(theme=>fixtureTheme(theme),theme);
      await navigator.screenshot({path:`test-results/studio-fixes/folders-${theme}-${viewport.width}.png`});
      const bounds=await navigator.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width,'folder picker stays inside the viewport');
    }
    await page.evaluate(()=>fixtureTheme('studio'));
    await page.keyboard.press('Escape');
    assert.equal(await checkpoints.getByRole('button',{name:'Folders',exact:true}).getAttribute('aria-expanded'),'false');
    assert.equal(await checkpoints.getByRole('button',{name:'Folders',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Enter');
    await navigator.locator('[data-checkpoint-folder="anime"]').click();
    assert.equal(await checkpoints.locator('.model-card:not(.orphan-model-card)').count(),1);
    await checkpoints.getByRole('spinbutton',{name:'Checkpoint folder depth'}).fill('1');
    await checkpoints.getByRole('spinbutton',{name:'Checkpoint folder depth'}).press('Tab');
    await page.waitForFunction(()=>document.querySelectorAll('.checkpoint-section .model-card:not(.orphan-model-card)').length===2);
    assert.equal(await checkpoints.locator('.model-card:not(.orphan-model-card)').count(),2);
    await loras.getByRole('button',{name:'Folders',exact:true}).click();
    await page.getByRole('navigation',{name:'LoRA folders',exact:true}).locator('[data-lora-folder="anime"]').click();
    assert.equal(await loras.locator('[data-lora-model]').count(),1);
    await loras.getByRole('button',{name:'Folders',exact:true}).click();
    await loras.getByRole('spinbutton',{name:'LoRA folder depth'}).fill('1');
    await loras.getByRole('spinbutton',{name:'LoRA folder depth'}).press('Tab');
    await page.waitForFunction(()=>document.querySelectorAll('.lora-library-section [data-lora-model]').length===2);
    assert.equal(await loras.locator('[data-lora-model]').count(),2);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length,'new controls must not duplicate IDs');
    await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>show('models'));
    assert.equal(await checkpoints.getByRole('spinbutton',{name:'Checkpoint folder depth'}).inputValue(),'1');
    await loras.getByRole('button',{name:'Folders',exact:true}).click();
    assert.equal(await loras.getByRole('spinbutton',{name:'LoRA folder depth'}).inputValue(),'1');
    const sync=await page.evaluate(async()=>{
      const day='2026-11-09',noon=new Date(2026,10,9,12).getTime();
      const metadata=JSON.stringify({sui_extra_data:{date:day,prep_time:'2 sec',generation_time:'3.70 min'}});
      const path=day+'/0950-first.png';
      app.store.state.outputs=[{id:'old-noon',createdAt:noon,swarmPath:path,swarmSourcePath:path,url:'',folderId:'folder-unfiled',prompt:'test',sentPrompt:'test',negativePrompt:'',model:'root.safetensors',width:512,height:512,seed:1,starred:false,metadata,request:{},loras:[],presets:[],generationTimeMs:3700}];
      app.client={listImageDirectory:async folder=>folder===''?{folders:[day]}:{files:[{src:'0950-first.png',metadata},{src:'1520-last.png',metadata},{src:'1520-other.png',metadata}]},imageUrl:path=>'/fixture-image/'+path};
      app.connected=true;app.view='library';
      await app.syncSwarmHistory();const first=app.store.state.outputs.map(o=>({path:o.swarmSourcePath,time:o.createdAt}));
      const repaired=app.store.state.outputs.find(o=>o.id==='old-noon');
      const newStore=new StudioStore();const reload=newStore.state.outputs.map(o=>({path:o.swarmSourcePath,time:o.createdAt}));
      app.client.listImageDirectory=async folder=>folder===''?{folders:[day]}:{files:[{src:'1520-other.png',metadata},{src:'1520-last.png',metadata},{src:'0950-first.png',metadata}]};
      await app.syncSwarmHistory();const second=app.store.state.outputs.map(o=>({path:o.swarmSourcePath,time:o.createdAt}));
      return {first,reload,second,repaired:repaired.createdAt,gen:repaired.generationTimeMs,expected:new Date(2026,10,9,9,50).getTime()};
    });
    assert.deepEqual(sync.first,sync.reload);assert.deepEqual(sync.first,sync.second);assert.equal(sync.repaired,sync.expected);assert.equal(sync.gen,222000);
    assert.deepEqual(errors,[]);await context.close();
  }
  // Migration failure never replaces inline legacy data with an unreadable reference.
  const context=await browser.newContext();const page=await context.newPage();await page.goto(url);await page.waitForFunction(()=>window.ready);
  const migration=await page.evaluate(async()=>{const picture=makePicture();const state=structuredClone(app.store.state);state.identities=[{...record('Legacy',picture),id:'legacy',createdAt:1,updatedAt:1}];localStorage.setItem('swarm-studio-state-v8',JSON.stringify(state));const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(){throw new Error('fixture asset storage unavailable');};await reopen();const failed={warning,inline:JSON.parse(localStorage.getItem('swarm-studio-state-v8')).identities[0].avatarUrl===picture};IDBFactory.prototype.open=open;await reopen();return {failed,warning,identity:app.store.state.identities[0],inline:JSON.parse(localStorage.getItem('swarm-studio-state-v8')).identities[0].avatarUrl};});
  assert.match(migration.failed.warning,/could not/);assert.equal(migration.failed.inline,true);assert.equal(migration.warning,'');assert.ok(migration.identity.avatarKey);assert.equal(migration.inline,'');
  await context.close();console.log('Studio identity/storage and model-browser desktop/mobile regressions: ok');
} finally {await browser?.close();await server.close();}
