import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import {lumiBridgePlugin} from '../scripts/lumi-bridge.mjs';
import {auditExpressionProjects} from '../scripts/expression-projects.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const scope=JSON.stringify(['http://swarm.fixture:7801','local',true]);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tag=(n,stage,parent='')=>({studio_schema:'1',studio_origin:'lumiswarm',studio_asset_id:id(n),studio_pipeline_id:id(1),studio_parent_id:parent,studio_stage:stage,studio_retention:'candidate',studio_created_at:String(Date.now()-8*86400000+n)});
const tags=[tag(1,'expression_draft'),tag(2,'background_removed',id(1))];
const paths=['raw/2026-11-23/1817001-draft.png','raw/2026-11-23/1818002-final.png','raw/2026-05-28/120000-old.png'];
const root=await mkdtemp(path.join(tmpdir(),'studio-live-reference-ui-'));await mkdir(path.join(root,'Projects','Expressions'),{recursive:true});
await writeFile(path.join(root,'Projects','Expressions','retained.expressions.json'),JSON.stringify({version:2,tiles:[{variants:[{path:paths[0]}]}]}));
let heads=[];
const fixture=`<!doctype html><html><body><div id="fixture"></div><script type="module">
import '/src/styles.css';import {StudioApp} from '/src/app.ts';import {SwarmClient} from '/src/swarm/client.ts';
const client=new SwarmClient('http://swarm.fixture:7801');await client.connect();
window.app=Object.assign(Object.create(StudioApp.prototype),{root:document.querySelector('#fixture'),client,connected:true,generating:false,expressionStudio:null,imageEditor:null,librarySyncing:false,libraryBatchBusy:false,
vacuumOpen:true,vacuumPage:0,vacuumRows:[],vacuumSnapshot:null,vacuumScan:null,vacuumExclusions:new Set(),vacuumMessage:'Preview only.',vacuumHistory:[],vacuumFiles:[],vacuumFavorites:new Set(),vacuumScope:'',vacuumLocalAudit:null,vacuumLiveState:null,vacuumLiveMode:false,vacuumLiveFresh:false,
store:{state:{outputs:[],draft:{initImage:''},identities:[]}},outputMutationPath:output=>output.swarmSourcePath,joinSwarmHistoryPath:(parent,child)=>parent?parent+'/'+child:child,notify:()=>{},yieldLibrarySync:async()=>{},
render(){this.root.innerHTML=this.renderVacuum();this.bindVacuumEvents();}});app.render();window.ready=true;
</script></body></html>`;
const server=await createServer({configFile:false,cacheDir:'test-results/reference-vite-cache',server:{host:'127.0.0.1',port:0},plugins:[lumiBridgePlugin(),{name:'readonly-reference-fixtures',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/__live'){res.setHeader('content-type','text/html');res.end(fixture);return;}
 if(url.pathname==='/__studio/host-control/session'){res.setHeader('content-type','application/json');res.end('{}');return;}
 if(url.pathname==='/__studio/host-control/expression-projects'){req.resume();res.setHeader('content-type','application/json');res.end(JSON.stringify(await auditExpressionProjects(root)));return;}
 if(url.pathname.startsWith('/__swarm/API/')){
  req.resume();res.setHeader('content-type','application/json');
  if(url.pathname.endsWith('GetNewSession'))res.end(JSON.stringify({session_id:'fixture-session',user_id:'local',output_append_user:true}));
  else if(url.pathname.endsWith('GetUserSettings'))res.end(JSON.stringify({settings:{MaxImagesInHistory:1000}}));
  else { /* body was resumed; keep deterministic root listing compatible with BFS */ res.end(JSON.stringify({folders:[],files:paths.map((src,i)=>({src,metadata:i<2?JSON.stringify({sui_extra_data:tags[i]}):'{}'}))}));}
  return;
 }
 if(url.pathname.startsWith('/__swarm/View/local/')&&req.method==='HEAD'){heads.push(url.pathname);res.statusCode=200;res.setHeader('content-type','image/png');if(url.pathname.includes('draft'))res.setHeader('content-length','5000000');else if(url.pathname.includes('final'))res.setHeader('content-length','8000000');res.end();return;}
 next();
});}}]});
let browser;
try{
 await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({channel:'msedge',headless:true});await mkdir('test-results',{recursive:true});
 for(const viewport of [{width:1440,height:1000},{width:782,height:893},{width:390,height:844},{width:320,height:640}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));heads=[];
  await page.goto(origin+'/__live');await page.waitForFunction(()=>window.ready);
  await page.getByRole('button',{name:'Connect LumiSwarm',exact:true}).click();
  await page.getByRole('button',{name:'Create pairing code',exact:true}).click();
  await page.locator('[data-vacuum-pairing-code]').waitFor();const pair=JSON.parse(await page.locator('[data-vacuum-pairing-code]').inputValue());
  const snapshot={schema:1,generatedAt:Date.now(),complete:false,coverage:['fixture'],activeJobs:false,referenceAudit:[{source:'chats-and-swipes',status:'checked',records:2},{source:'other-accounts',status:'unavailable',reason:'Current account scope only.'}],claims:tags.map((metadata,i)=>({metadata,assetId:metadata.studio_asset_id,imageId:id(i+1),swarmPath:paths[i],swarmPathVerified:true,scope,persisted:i===1,usableCopyVerified:i===1,copyCheck:{status:i===1?'decoded-original':'not-in-library'},references:i===1?['expression-set']:[],protected:i===1}))};
  const published=await fetch(pair.url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+pair.token},body:JSON.stringify({sourceUserId:'lumi-fixture',scope,snapshot})});assert.equal(published.status,200);
  await page.getByRole('button',{name:'Check connection',exact:true}).click();await page.getByText('Live Lumi references',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-vacuum-pairing-code]').count(),0,'credential is cleared after connection');
  await page.evaluate(async()=>{
    const live=app.vacuumSnapshot;
    const imported={...live,generatedAt:live.generatedAt+1,claims:Array.from({length:18},()=>live.claims[0])};
    app.vacuumSnapshot=imported;app.vacuumLiveMode=false;
    await app.refreshLumiConnection(false);
    if(app.vacuumSnapshot!==imported || app.vacuumLiveMode || !app.vacuumLinkMessage.includes('18 claims'))throw Error('Older live state replaced a newer 18-claim import');
    app.vacuumSnapshot=live;app.vacuumLiveMode=true;
  });

  // Exercise production audit and scanner with a direct-file fixture inventory.
  await page.evaluate(({paths,tags})=>{app.client.listImageDirectory=async(path)=>path===''?{folders:['raw'],files:[]}:path==='raw'?{folders:['2026-11-23','2026-05-28'],files:[]}:path.endsWith('2026-11-23')?{folders:[],files:paths.slice(0,2).map((src,i)=>({src:src.split('/').pop(),metadata:JSON.stringify({sui_extra_data:tags[i]})}))}:{folders:[],files:[{src:paths[2].split('/').pop(),metadata:'{}'}]};},{paths,tags});
  await page.getByRole('button',{name:/^Scan Swarm history/}).click();await page.waitForFunction(()=>!app.vacuumScan&&app.vacuumRows.length===3);
  assert.equal(await page.evaluate(()=>app.vacuumRows[0].status),'protected','saved project variant protects source');
  assert.equal(await page.evaluate(()=>app.vacuumLocalAudit.complete),true);
  await page.getByRole('tab',{name:/What to keep/}).click();
  await page.getByRole('button',{name:'Reference checks',exact:true}).click();
  assert.match(await page.locator('.vacuum-audit').textContent(),/1 Lumi originals decoded/);
  assert.match(await page.locator('.vacuum-audit').textContent(),/saved expression projects and variants/);
  await page.getByRole('button',{name:'Reference checks',exact:true}).click();
  await page.getByRole('tab',{name:/Select files/}).click();
  await page.locator('[data-vacuum-origin]').selectOption('lumiswarm');
  await page.getByRole('button',{name:'Read matching file sizes',exact:true}).click();await page.waitForFunction(()=>!app.vacuumSizeScan);
  assert.equal(heads.length,2);assert.equal(await page.evaluate(()=>app.vacuumFiles.filter(f=>f.bytes!=null).length),2);
  assert.match(await page.locator('.vacuum-size-note').textContent(),/12.4 MB measured across 2 originals/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`test-results/live-reference-${viewport.width}.png`,fullPage:true});
  // Use the real authenticated receiver and production refresh, while selection is scrolled.
  const position=await page.evaluate(()=>{const input=document.querySelector('[data-vacuum-search]');input.focus({preventScroll:true});input.setSelectionRange(0,0);const body=document.querySelector('.vacuum-body');body.scrollTop=300;return body.scrollTop;});
  const updated={...snapshot,generatedAt:Date.now()+1};
  assert.equal((await fetch(pair.url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+pair.token},body:JSON.stringify({sourceUserId:'lumi-fixture',scope,snapshot:updated})})).status,200);
  await page.evaluate(()=>app.refreshLumiConnection());
  assert.equal(await page.evaluate(()=>document.querySelector('.vacuum-body').scrollTop),position,'authenticated live refresh preserves scroll');
  assert.equal(await page.getByRole('tab',{name:/Select files/}).getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-vacuum-search]').evaluate(el=>document.activeElement===el),true,'authenticated live refresh preserves focus');
  await page.getByRole('tab',{name:/What to keep/}).click();
  await page.getByRole('button',{name:'Revoke connection',exact:true}).click();await page.waitForFunction(()=>app.vacuumSnapshot===null);
  assert.equal((await fetch(pair.url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+pair.token},body:JSON.stringify({sourceUserId:'lumi-fixture',scope,snapshot:{...snapshot,generatedAt:Date.now()+1}})})).status,400);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Live authenticated feed without imports, saved-project protection, audited coverage, scoped HEAD sizes, revoke and responsive layout: PASS');
}finally{await browser?.close();await server.close();assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));await rm(root,{recursive:true,force:true});}
