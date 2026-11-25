import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const fixture=`<!doctype html><html><body><div id="fixture"></div><script type="module">
import '/src/styles.css';
import {StudioApp} from '/src/app.ts';
import {newStudioMetadata} from '/src/library/provenance.ts';
const base=newStudioMetadata('general_generation'),up=newStudioMetadata('upscale_result',base),bg=newStudioMetadata('background_removed',up),branch=newStudioMetadata('upscale_result',base);
base.studio_origin=up.studio_origin=bg.studio_origin='lumiswarm';
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="528" height="944"><rect width="528" height="944" fill="#383040"/><circle cx="264" cy="340" r="140" fill="#a798b2"/></svg>');
const out=(tag,id)=>({id,url:image,swarmPath:'day/'+id+'.png',swarmSourcePath:'day/'+id+'.png',metadata:JSON.stringify({sui_extra_data:tag}),request:{extra_metadata:tag},folderId:'original',model:'Fixture portrait',prompt:'A portrait',negativePrompt:'',loras:[],seed:1,createdAt:Date.now()});
const outputs=[out(base,'source'),out(up,'upscale'),out(bg,'background'),out(branch,'branch')];
window.app=Object.assign(Object.create(StudioApp.prototype),{root:document.querySelector('#fixture'),client:{historyScope:'fixture-scope'},inspectorVersionsOpen:false,store:{state:{outputs,ui:{selectedOutputId:'background'}},updateUi(value){Object.assign(this.state.ui,value);}},
 outputById:id=>outputs.find(x=>x.id===id),outputTiming:()=>({}),outputImageUrl:out=>out.url,swarmImageAttributes:url=>'src="'+url+'"',notify:()=>{},
 render(){this.root.innerHTML=this.renderInspector();this.bindVacuumEvents();this.root.querySelectorAll('[data-inspect-output]').forEach(button=>button.addEventListener('click',()=>{this.store.updateUi({selectedOutputId:button.dataset.inspectOutput});this.render();}));}});
app.render();window.ready=true;
</script></body></html>`;
const server=await createServer({cacheDir:'test-results/inspector-vite-cache',server:{host:'127.0.0.1',port:0},plugins:[{name:'fixture',configureServer(server){server.middlewares.use('/__inspect',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(fixture);});}}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});await mkdir('test-results',{recursive:true});
 for(const viewport of [{width:1440,height:1000},{width:782,height:893},{width:390,height:844},{width:320,height:640}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__inspect`);await page.waitForFunction(()=>window.ready);
  assert.equal(await page.locator('.inspector-actions').evaluate(node=>getComputedStyle(node).display),'flex');
  await page.getByRole('button',{name:'Review versions',exact:true}).click();
  assert.equal(await page.locator('.inspector-versions li').count(),4);
  assert.equal(await page.locator('.version-connectors path').count(),3);
  assert.ok(await page.locator('.inspector-versions').evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1),'version panel stays inside viewport');
  assert.ok(await page.locator('.version-map-viewport').evaluate(el=>el.scrollWidth>=el.clientWidth),'graph owns horizontal scrolling');
  assert.equal(await page.locator('.version-state.is-end').count(),2);
  await page.locator('[data-inspect-output="branch"]').click();
  assert.equal(await page.locator('.inspector-versions li').count(),4,'standalone child sees its Lumi parent and siblings');
  assert.equal(await page.locator('.version-node.is-missing').count(),0);
  await page.locator('[data-inspect-output="background"]').click();

  const up=await page.locator('.version-node:has([data-inspect-output="upscale"])').boundingBox(),branch=await page.locator('.version-node:has([data-inspect-output="branch"])').boundingBox();
  assert.ok(Math.abs(up.y-branch.y)<1&&Math.abs(up.x-branch.x)>100,'sibling upscales occupy separate lanes');

  const branchId=await page.locator('.version-node:has([data-inspect-output="branch"]) [data-branch-choice]').getAttribute('data-branch-choice');
  const backgroundId=await page.locator('.version-node:has([data-inspect-output="background"]) [data-branch-choice]').getAttribute('data-branch-choice');
  await page.locator('[data-branch-choice="'+branchId+'"]').selectOption('keep');
  assert.equal(await page.evaluate(()=>app.readBranchChoices().length),1);
  await page.evaluate(()=>app.render());assert.equal(await page.locator('[data-branch-choice="'+branchId+'"]').inputValue(),'keep');
  await page.locator('[data-branch-choice="'+backgroundId+'"]').selectOption('discard');
  assert.equal(await page.locator('[data-branch-choice="'+branchId+'"]').inputValue(),'keep','discard never changes a sibling keep');
  assert.equal(await page.evaluate(()=>app.readBranchChoices().length),2);
  await page.locator('[data-branch-choice="'+branchId+'"]').selectOption('policy');await page.locator('[data-branch-choice="'+backgroundId+'"]').selectOption('policy');
  assert.equal(await page.evaluate(()=>app.readBranchChoices().length),0);
  await page.locator('[data-keep-final]').check();
  await page.evaluate(()=>app.queueReplacement(app.store.state.outputs[1],false,app.keepFinalEnabled()));
  assert.equal(await page.evaluate(()=>app.retentionQueue().length),0);
  await page.evaluate(()=>app.queueReplacement(app.store.state.outputs[1],true,app.keepFinalEnabled()));
  assert.equal(await page.evaluate(()=>app.retentionQueue().length),1);
  await page.evaluate(()=>app.render());assert.equal(await page.getByLabel('Queued for Vacuum review',{exact:true}).count(),1);
  assert.equal(await page.locator('.version-connectors .is-current-path').count(),2);
  await page.locator('.inspector-versions').screenshot({path:`test-results/inspector-forks-${viewport.width}.png`});
  await page.locator('[data-inspect-output="source"]').click();
  assert.equal(await page.evaluate(()=>app.store.state.ui.selectedOutputId),'source');
  assert.equal(await page.locator('.inspector-versions li.is-current').count(),1);
  assert.equal(await page.evaluate(()=>app.store.state.outputs.length),4,'queue keeps physical/local outputs');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`test-results/inspector-versions-${viewport.width}.png`,fullPage:true});
  await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await page.locator('[data-keep-final]').isChecked(),true);
  assert.equal(await page.evaluate(()=>app.retentionQueue().length),1);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Inspector action rail, parent/branch navigation, opt-in persistent review queue, failed decode, mobile overflow: PASS');
}finally{await browser?.close();await server.close();}
