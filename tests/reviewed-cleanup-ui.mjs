import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import {createServer as netServer} from 'node:net';
const portProbe=netServer();await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));const fixturePort=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const scope=JSON.stringify(['http://swarm.fixture:7801','local',true]);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const files=()=>[1,2,3,4].map(n=>({src:n===1?'source.png':n===2?'up.png':n===3?'final.png':'favorite.png',size:1000+n,metadata:JSON.stringify({sui_extra_data:{studio_schema:'1',studio_origin:'standalone',studio_asset_id:id(n),studio_pipeline_id:id(n===4?4:1),studio_parent_id:n===2?id(1):n===3?id(2):'',studio_stage:n===1?'expression_draft':n===2?'upscale_result':n===3?'background_removed':'general_generation',studio_created_at:String(Date.now()-9*86400000+n)}})}));
let state,releaseDelete;
const reset=()=>state={files:files(),favorites:new Set(['favorite.png']),busy:false,recycle:true,unknownRecycle:false,capped:false,deleteMode:'success',sizeMode:'range',deletes:[],ranges:0,heads:0,scans:0,globalChecks:0};reset();
const fixture=`<!doctype html><html><body><div id="fixture"></div><script type="module">
import '/src/styles.css';import {StudioApp} from '/src/app.ts';import {SwarmClient} from '/src/swarm/client.ts';
const client=new SwarmClient('http://swarm.fixture:7801');await client.connect();
const metadata=n=>({studio_schema:'1',studio_origin:'standalone',studio_asset_id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),studio_pipeline_id:'00000000-0000-4000-8000-000000000001',studio_parent_id:'',studio_stage:'expression_draft'});
window.app=Object.assign(Object.create(StudioApp.prototype),{root:document.querySelector('#fixture'),client,connected:true,generating:false,expressionStudio:null,imageEditor:null,librarySyncing:false,libraryBatchBusy:false,
vacuumOpen:true,vacuumPage:0,vacuumRows:[],vacuumSnapshot:null,vacuumScan:null,vacuumExclusions:new Set(),vacuumMessage:'Ready.',vacuumHistory:[],vacuumFiles:[],vacuumFavorites:new Set(),vacuumScope:'',vacuumLocalAudit:null,vacuumLiveState:null,vacuumLiveMode:false,vacuumLiveFresh:false,librarySelected:new Set(['source','source-alias']),
store:{state:{outputs:['source','up','final','favorite','source-alias'].map((name,index)=>({id:name,swarmSourcePath:'raw/'+(name==='source-alias'?'source':name)+'.png',metadata:{sui_extra_data:metadata(index+1)},request:{}})),draft:{initImage:''},identities:[],ui:{selectedOutputId:'source'}},save(){window.saved=(window.saved||0)+1;},updateUi(value){Object.assign(this.state.ui,value);}},
auditStandaloneReferences:async()=>({paths:new Set(window.localRefs||[]),checkedAt:Date.now(),complete:!window.badAudit,checks:[]}),
refreshLumiConnection:async()=>{},outputMutationPath:output=>output.swarmSourcePath,joinSwarmHistoryPath:(parent,child)=>parent?parent+'/'+child:child,notify:()=>{},yieldLibrarySync:async()=>{},
render(){this.root.innerHTML=this.renderVacuum();this.bindVacuumEvents();}});app.render();window.ready=true;
</script></body></html>`;
const server=await createServer({configFile:false,cacheDir:'test-results/cleanup-vite-cache',server:{host:'127.0.0.1',port:fixturePort,strictPort:true},plugins:[{name:'reviewed-cleanup-fixtures',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/__cleanup'){res.setHeader('content-type','text/html');res.end(fixture);return;}
 if(url.pathname.startsWith('/__swarm/API/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');res.setHeader('content-type','application/json');const api=url.pathname.split('/').pop();
  if(api==='GetNewSession')res.end(JSON.stringify({session_id:'session-fixture',user_id:'local',output_append_user:true,server_id:state.serverIdentity||'server-fixture'}));
  else if(api==='GetUserSettings')res.end(JSON.stringify({settings:{MaxImagesInHistory:state.capped?1:(state.historyLimit||1000)}}));
  else if(api==='GetGlobalStatus'){if(state.checkDelay)await new Promise(resolve=>setTimeout(resolve,state.checkDelay));state.globalChecks++;res.end(JSON.stringify({status:{waiting_gens:0,waiting_backends:0,loading_models:0,live_gens:state.busy?1:0}}));}
  else if(api==='ListServerSettings')res.end(JSON.stringify(state.unknownRecycle?{error:'Permission denied'}:{settings:{Paths:{type:'group',value:{RecycleDeletedImages:{type:'BOOLEAN',value:state.recycle}}}}}));
  else if(api==='ListImages'){
   state.scans++;
   res.end(JSON.stringify(body.path===''?{folders:['raw','Starred'],files:[]}:body.path==='raw'?{folders:[],files:state.files}:{folders:[],files:[...state.favorites].map(src=>({src,metadata:''}))}));
  }
  else if(api==='DeleteImage'){
   state.deletes.push(body.path);
   if(state.deleteMode==='slow')await new Promise(resolve=>releaseDelete=resolve);
   if(state.deleteMode==='invalid_session'){res.end(JSON.stringify({error_id:'invalid_session_id'}));return;}
   state.files=state.files.filter(file=>'raw/'+file.src!==body.path);if(state.onDelete)await state.onDelete();res.end(JSON.stringify({success:true}));
  }else res.end(JSON.stringify({error:'Unexpected fixture API '+api}));return;
 }
 if(url.pathname.startsWith('/__swarm/View/local/raw/')){
  const file=state.files.find(file=>url.pathname.endsWith('/'+file.src));
  if(req.method==='HEAD'){
   state.heads++;
   if(state.sizeMode==='unavailable'||!file){res.statusCode=404;res.end();return;}
   if(state.sizeMode==='head'){res.statusCode=200;res.setHeader('content-type','image/png');res.setHeader('content-length',String(file.size));res.end();return;}
   res.statusCode=405;res.setHeader('allow','GET');res.end();return;
  }
  if(req.method!=='GET'||req.headers.range!=='bytes=0-0'){res.statusCode=500;res.end('Only a one-byte range may be requested');return;}
  state.ranges++;res.statusCode=file?206:404;res.setHeader('content-type','image/png');
  if(file){res.setHeader('content-length','1');res.setHeader('content-range',state.sizeMode==='malformed'?'bytes 1-1/'+file.size:'bytes 0-0/'+file.size);}
  res.end(file?Buffer.from([0]):undefined);return;
 }
 next();
});}}]});
let browser;
try {
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});await mkdir('test-results',{recursive:true});
 const open=async(viewport,setup)=>{reset();if(setup)setup();const expectedCount=state.files.length;const context=await browser.newContext({viewport,acceptDownloads:true,reducedMotion:'reduce'}),page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/__cleanup');await page.waitForFunction(()=>window.ready);await page.getByRole('button',{name:/^Scan Swarm history/}).click();await page.waitForFunction(count=>!app.vacuumScan&&app.vacuumRows.length===count,expectedCount);if(!setup){await page.getByRole('button',{name:'Select matching candidates',exact:true}).click();assert.equal(await page.evaluate(()=>app.vacuumSelected.size),2);}return {context,page,errors};};
 const review=async page=>{await page.getByRole('button',{name:'Review 2 selected',exact:true}).click();await page.waitForFunction(()=>!app.vacuumDeleteBusy&&app.vacuumReview?.targets.length===2);assert.equal(state.deletes.length,0);assert.equal(await page.getByRole('button',{name:'Delete 2 reviewed originals',exact:true}).isDisabled(),true);};
 const approve=async page=>{await page.locator('[data-vacuum-review-ack]').check();await page.getByRole('button',{name:'Delete 2 reviewed originals',exact:true}).click();};
 const finished=page=>page.waitForFunction(()=>!app.vacuumDeleteBusy&&app.vacuumReview===null&&app.readCleanupRuns().length>0);
 // A long archive, redraws from outside Vacuum, and independent step positions.
 for(const viewport of [{width:1440,height:1000},{width:782,height:893},{width:390,height:844},{width:320,height:640},{width:720,height:450}]) {
  const {context,page,errors}=await open(viewport,()=>{
   const count=viewport.width===1440?4382:140;state.historyLimit=10000;
   state.files=Array.from({length:count},(_,n)=>({src:'archive-'+String(n).padStart(5,'0')+'-long-expression-output.png',size:1024,metadata:JSON.stringify({sui_image_params:{seed:n}})}));
  });
  assert.equal(await page.locator('[role="tabpanel"]:visible').count(),1);
  assert.equal(await page.getByRole('tab',{name:/Review$/}).isDisabled(),true);
  const body=page.locator('.vacuum-body');
  const target=page.locator('[data-vacuum-select]').nth(45);await target.scrollIntoViewIfNeeded();
  const before=await body.evaluate(el=>el.scrollTop);assert.ok(before>500);
  await target.check();assert.ok(Math.abs(await body.evaluate(el=>el.scrollTop)-before)<2,'row selection retains scroll');
  await page.evaluate(()=>{app.vacuumMessage='Live evidence refreshed.';app.render();});
  assert.ok(Math.abs(await body.evaluate(el=>el.scrollTop)-before)<2,'global/live-style redraw retains scroll');
  assert.equal(await page.locator('[data-vacuum-select]').nth(45).evaluate(el=>el===document.activeElement),true);
  const excluded=page.locator('[data-vacuum-exclude]').nth(45);await excluded.check();
  const afterExclude=await body.evaluate(el=>el.scrollTop);await page.evaluate(()=>app.render());
  assert.ok(Math.abs(await body.evaluate(el=>el.scrollTop)-afterExclude)<2,'exclusion redraw retains scroll');
  await excluded.uncheck();
  await page.getByRole('tab',{name:/What to keep/}).click();await body.evaluate(el=>el.scrollTop=350);
  const configScroll=await body.evaluate(el=>el.scrollTop);
  await page.evaluate(()=>app.render());assert.equal(await body.evaluate(el=>el.scrollTop),configScroll);
  await page.getByRole('tab',{name:/Select files/}).click();
  assert.ok(Math.abs(await body.evaluate(el=>el.scrollTop)-afterExclude)<2,'returning to selection restores its own scroll');
  await page.locator('[data-vacuum-search]').fill('archive');
  await page.locator('[data-vacuum-search]').evaluate(el=>{el.focus();el.setSelectionRange(2,5);});
  await page.evaluate(()=>app.render());
  assert.deepEqual(await page.locator('[data-vacuum-search]').evaluate(el=>[el===document.activeElement,el.selectionStart,el.selectionEnd]),[true,2,5]);
  await page.getByRole('button',{name:'Next files',exact:true}).click();assert.equal(await page.evaluate(()=>app.vacuumPage),1);
  const pageScroll=await body.evaluate(el=>el.scrollTop);await page.evaluate(()=>app.render());assert.equal(await body.evaluate(el=>el.scrollTop),pageScroll);
  await page.getByRole('button',{name:'Previous files',exact:true}).click();
  await page.getByRole('button',{name:'Review 1 selected',exact:true}).click();await page.waitForFunction(()=>!app.vacuumDeleteBusy&&app.vacuumReview);
  assert.equal(await page.getByRole('tab',{name:/Review$/}).getAttribute('aria-selected'),'true');assert.equal(state.deletes.length,0);
  await page.getByRole('button',{name:'Back to selection',exact:true}).click();
  assert.equal(await page.getByRole('tab',{name:/Review$/}).isDisabled(),true);
  assert.equal(await page.locator('[data-vacuum-select]').nth(45).isEnabled(),true);
  await page.getByRole('tab',{name:/Results/}).click();assert.match(await page.locator('[data-vacuum-cleanup-results]').textContent(),/No reviewed cleanup/);
  await page.getByRole('tab',{name:/What to keep/}).focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:/Select files/}).getAttribute('aria-selected'),'true');
  await body.evaluate(el=>el.scrollTop=0);
  assert.equal(await page.locator('[data-vacuum-dialog]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  const rect=await page.locator('.vacuum-footer').boundingBox();assert.ok(rect.y>=0&&rect.y+rect.height<=viewport.height+1,'footer remains visible at short/zoomed viewport');
  await page.screenshot({path:`test-results/vacuum-workflow-select-${viewport.width}.png`,fullPage:true});
  await page.getByRole('tab',{name:/What to keep/}).click();await body.evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:`test-results/vacuum-workflow-configure-${viewport.width}.png`,fullPage:true});
  assert.equal(state.deletes.length,0);assert.deepEqual(errors,[]);await context.close();
 }
 for(const viewport of [{width:1440,height:1000},{width:782,height:893},{width:390,height:844},{width:320,height:640}]) {
  const {context,page,errors}=await open(viewport);await review(page);
  assert.match(await page.locator('.vacuum-review').textContent(),/raw\/source.png/);assert.match(await page.locator('.vacuum-review').textContent(),/raw\/up.png/);assert.doesNotMatch(await page.locator('.vacuum-review-files').textContent(),/favorite.png/);
  assert.ok(await page.locator('[data-vacuum-delete-confirm]').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),'confirmation action stays inside mobile viewport');
  await page.locator('.vacuum-review').scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/cleanup-review-${viewport.width}.png`,fullPage:true});
  await approve(page);await finished(page);
  assert.deepEqual(state.deletes,['raw/source.png','raw/up.png']);assert.equal(state.files.length,2);assert.ok(state.globalChecks>=6);assert.ok(state.heads>=5);
  assert.equal(await page.evaluate(()=>app.store.state.outputs.length),2,'all aliases of confirmed deleted originals leave the local index');
  assert.equal(await page.evaluate(()=>app.store.state.ui.selectedOutputId),'');assert.equal(await page.evaluate(()=>app.librarySelected.size),0);
  assert.equal(await page.locator('[data-outcome="deleted"]').count(),2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('[data-vacuum-cleanup-results]').scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/cleanup-results-${viewport.width}.png`,fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export cleanup log',exact:true}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/cleanup-log/);
  assert.deepEqual(errors,[]);await context.close();
 }
 {
  const {context,page,errors}=await open({width:390,height:844});state.checkDelay=1000;
  await page.getByRole('button',{name:'Review 2 selected',exact:true}).click();
  await page.getByRole('heading',{name:'Rechecking your selection',exact:true}).waitFor();
  assert.equal(await page.getByRole('tab',{name:/Select files/}).isDisabled(),true);
  await page.getByRole('button',{name:'Cancel review checks',exact:true}).click();
  await page.waitForFunction(()=>!app.vacuumDeleteBusy);
  assert.equal(await page.evaluate(()=>app.vacuumReview),null);assert.equal(state.deletes.length,0);
  assert.equal(await page.getByRole('tab',{name:/Select files/}).getAttribute('aria-selected'),'true');
  assert.equal(await page.evaluate(()=>app.vacuumSelected.size),2);assert.deepEqual(errors,[]);await context.close();
 }
 for(const mode of ['head','range','malformed','unavailable']) {
  const {context,page,errors}=await open({width:390,height:844});state.sizeMode=mode;
  await page.getByRole('button',{name:'Review 2 selected',exact:true}).click();await page.waitForFunction(()=>!app.vacuumDeleteBusy&&app.vacuumReview);
  if(mode==='head'||mode==='range'){
   assert.equal(await page.evaluate(()=>app.vacuumReview.targets.length),2);
   assert.equal(state.ranges>0,mode==='range');
   assert.equal(await page.evaluate(()=>app.vacuumReview.targets[0].file.bytes>1),true,'range transfer length never becomes original size');
  }else{
   assert.equal(await page.locator('[data-vacuum-review-ack]').count(),0);assert.equal(await page.locator('[data-vacuum-delete-confirm]').count(),0);
   await page.getByRole('heading',{name:'No selected originals could be verified',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>app.vacuumSelected.size),2,'failed verification retains selection');
   assert.equal(await page.locator('.vacuum-review-omitted li').count(),2);
   if(mode==='unavailable')assert.equal(state.ranges,0,'missing/auth failures do not trigger GET fallback');
   await page.screenshot({path:'test-results/cleanup-verification-failed-'+mode+'.png',fullPage:true});
   state.sizeMode='range';await page.getByRole('button',{name:'Retry verification',exact:true}).click();await page.waitForFunction(()=>!app.vacuumDeleteBusy&&app.vacuumReview?.targets.length===2);
   assert.equal(await page.locator('[data-vacuum-review-ack]').isChecked(),false);
  }
  assert.equal(state.deletes.length,0);assert.deepEqual(errors,[]);await context.close();
 }
 // Enable only after a successful reviewed execution; idle automation reuses the real client/runner.
 for(const outcome of ['success','uncertain','changed-policy','new-favorite','no-proof','changed-server','disable-midrun']) {
  const {context,page,errors}=await open({width:390,height:844});
  await page.getByRole('tab',{name:/What to keep/}).click();assert.equal(await page.locator('[data-vacuum-automatic]').isDisabled(),true);
  await page.getByRole('tab',{name:/Select files/}).click();
  if(outcome!=='no-proof'){
   await review(page);await approve(page);await finished(page);
   await page.getByRole('tab',{name:/What to keep/}).click();assert.equal(await page.locator('[data-vacuum-automatic]').isEnabled(),true);
   await page.locator('[data-vacuum-automatic]').check();await page.locator('[data-vacuum-automatic-limit]').selectOption('5');
   await page.screenshot({path:'test-results/automatic-cleanup-options.png',fullPage:true});
  }
  const initial=state.deletes.length;
  state.files.push(...files().slice(0,3).map((file,index)=>{
   const data=JSON.parse(file.metadata),t=data.sui_extra_data;t.studio_asset_id=id(10+index);t.studio_pipeline_id=id(10);t.studio_parent_id=index?id(9+index):'';
   return {...file,src:'auto-'+file.src,metadata:JSON.stringify(data)};
  }));
  if(outcome==='uncertain')state.deleteMode='invalid_session';
  if(outcome==='changed-server')state.serverIdentity='different-server';
  if(outcome==='disable-midrun')state.onDelete=()=>page.evaluate(()=>app.writeAutomaticSettings({...app.readAutomaticSettings(),enabled:false}));
  if(outcome==='new-favorite')state.favorites.add('auto-source.png');
  await page.evaluate(async outcome=>{
   app.vacuumOpen=false;app.vacuumLastInteraction=Date.now()-120000;
   if(outcome==='no-proof')app.writeAutomaticSettings({...app.readAutomaticSettings(),enabled:true});
   if(outcome==='changed-policy')localStorage.setItem('studio-vacuum-policy-v1:'+app.client.historyScope,JSON.stringify({basis:'lineage',graceDays:0}));
   await app.maybeAutomaticCleanup();
  },outcome);
  const later=state.deletes.slice(initial);
  if(outcome==='success')assert.deepEqual(later,['raw/auto-source.png','raw/auto-up.png']);
  else if(outcome==='uncertain'||outcome==='disable-midrun'){assert.deepEqual(later,['raw/auto-source.png']);assert.equal(await page.evaluate(()=>app.readAutomaticSettings().enabled),false);}
  else if(outcome==='new-favorite')assert.deepEqual(later,['raw/auto-up.png']);
  else assert.deepEqual(later,[]);
  if(['success','uncertain','new-favorite','disable-midrun'].includes(outcome))assert.equal(await page.evaluate(()=>app.readCleanupRuns().at(-1).automatic),true);
  assert.ok(!later.includes('raw/auto-final.png'));assert.equal(await page.evaluate(()=>app.vacuumDeleteBusy||app.libraryBatchBusy),false);
  assert.deepEqual(errors,[]);await context.close();
 }
 for(const scenario of ['favorite','missing-replacement','active-job','metadata-changed','scope-setting','invalid-session','cancel','bad-audit','storage-failure','cap','reference-change','local-reference','other-tab']) {
  const {context,page,errors}=await open({width:390,height:844});await review(page);
  if(scenario==='favorite')state.favorites.add('source.png');
  if(scenario==='missing-replacement')state.files=state.files.filter(file=>file.src!=='up.png');
  if(scenario==='active-job')state.busy=true;
  if(scenario==='metadata-changed'){const file=state.files[0];file.metadata=JSON.stringify({...JSON.parse(file.metadata),sui_image_params:{seed:999}});}
  if(scenario==='scope-setting')state.recycle=false;
  if(scenario==='invalid-session')state.deleteMode='invalid_session';
  if(scenario==='bad-audit')await page.evaluate(()=>window.badAudit=true);
  if(scenario==='reference-change')await page.evaluate(()=>{app.vacuumSnapshot={schema:1,generatedAt:Date.now(),complete:false,activeJobs:false,claims:[{assetId:'00000000-0000-4000-8000-000000000001',scope:app.client.historyScope,swarmPath:'raw/source.png',references:['swarm-path:chat'],protected:true}]};});
  if(scenario==='local-reference')await page.evaluate(()=>window.localRefs=['raw/source.png']);
  if(scenario==='other-tab')await page.evaluate(()=>localStorage.setItem('studio-vacuum-cleanup-lock-v1:'+app.client.historyScope,JSON.stringify({id:'another-tab',expiresAt:Date.now()+60000})));

  if(scenario==='cap')state.capped=true;
  if(scenario==='storage-failure')await page.evaluate(()=>Storage.prototype.setItem=function(){throw Error('Fixture storage full');});
  if(scenario==='cancel')state.deleteMode='slow';
  await approve(page);
  if(scenario==='cancel'){
   for(let i=0;i<100&&!state.deletes.length;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(state.deletes.length,1);
   await page.getByRole('button',{name:'Cancel cleanup',exact:true}).click();assert.equal(await page.locator('[data-vacuum-dialog]').isVisible(),true);releaseDelete();
  }
  if(scenario==='storage-failure'||scenario==='other-tab')await page.waitForFunction(()=>!app.vacuumDeleteBusy);else await finished(page);
  if(['favorite','metadata-changed','reference-change','local-reference'].includes(scenario))assert.deepEqual(state.deletes,['raw/up.png'],scenario);
  else if(scenario==='invalid-session'||scenario==='cancel')assert.equal(state.deletes.length,1,scenario+' never retries/starts a second request');
  else assert.equal(state.deletes.length,0,scenario);
  if(scenario==='invalid-session'){assert.equal(await page.locator('[data-outcome="uncertain"]').count(),1);assert.equal(await page.evaluate(()=>app.store.state.outputs.length),5,'unconfirmed deletion does not falsely remove local records');}
  assert.deepEqual(errors,[]);await context.close();
 }
 for(const kind of ['legacy','lumi-policy']) {
  const {context,page,errors}=await open({width:390,height:844},()=>{
   if(kind==='legacy'){state.files[0].metadata='';state.files[1].metadata=JSON.stringify({sui_image_params:{seed:44}});}
   else for(const file of state.files.slice(0,3)){const data=JSON.parse(file.metadata);data.sui_extra_data.studio_origin='lumiswarm';data.sui_extra_data.studio_created_at=String(Date.now());file.metadata=JSON.stringify(data);}
  });
  if(kind==='lumi-policy')await page.evaluate(()=>{localStorage.setItem('studio-vacuum-policy-v1:'+app.client.historyScope,JSON.stringify({basis:'lineage',graceDays:7,lumi:{mode:'stages',stages:['background_removed'],protectCopyBindings:true}}));app.vacuumSnapshot={schema:1,generatedAt:Date.now(),complete:false,activeJobs:false,claims:[{assetId:'00000000-0000-4000-8000-000000000001',scope:app.client.historyScope,swarmPath:'raw/source.png',protected:true,references:['folder','expression-set']}]};app.refreshVacuumRows();app.render();});
  assert.equal(await page.getByRole('checkbox',{name:'Select raw/source.png for reviewed deletion',exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('checkbox',{name:'Select raw/favorite.png for reviewed deletion',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Select matching for manual review',exact:true}).click();assert.equal(await page.evaluate(()=>app.vacuumSelected.size),3);
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();
  await page.getByRole('checkbox',{name:'Select raw/source.png for reviewed deletion',exact:true}).check();
  await page.getByRole('checkbox',{name:'Select raw/up.png for reviewed deletion',exact:true}).check();
  await review(page);assert.equal(await page.evaluate(()=>app.vacuumReview.targets.filter(target=>target.manual).length),2);
  assert.match(await page.locator('.vacuum-review').textContent(),/2 manual overrides/);
  await page.locator('.vacuum-review').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/cleanup-manual-'+kind+'.png',fullPage:true});
  await approve(page);await finished(page);assert.deepEqual(new Set(state.deletes),new Set(['raw/source.png','raw/up.png']));assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Reviewed cleanup real-client browser flow: exact approval, native API success, index aliases, audit export, new favorites, missing replacements, jobs, changed metadata/settings, invalid-session no retry, cancel, audit/storage/cap failures and responsive layout: PASS');
} finally {releaseDelete?.();await browser?.close();await server.close();}
