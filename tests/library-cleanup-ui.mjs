import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const fixture=`<!doctype html><html><body><div id="fixture"></div><script type="module">
import '/src/styles.css';
import { StudioApp } from '/src/app.ts';
window.deleted=[];window.notices=[];
const record=(id,path,starred=false,folderId='folder-a')=>({id,swarmPath:path,swarmSourcePath:path,starred,folderId,createdAt:0,model:'portrait',prompt:'character',sentPrompt:'',negativePrompt:''});
window.app=Object.create(StudioApp.prototype);
Object.assign(app,{root:document.querySelector('#fixture'),view:'library',connected:true,librarySyncing:false,libraryBatchBusy:false,libraryFolder:'folder-a',libraryDateFrom:'2026-10-04',libraryDateTo:'2026-10-04',librarySearch:'',libraryModelFilter:'',libraryStarFilter:'all',libraryRenderLimit:240,librarySelected:new Set(),librarySelectMode:false,
 store:{state:{outputs:[...Array.from({length:245},(_,i)=>record(String(i),'2026-10-04/'+i+'.png')),record('favorite','2026-10-04/local.png',true),record('remote','2026-10-04/remote.png'),record('flat','2026-10-04/flat.png'),record('other-folder','2026-10-04/elsewhere.png',false,'folder-b'),record('other-date','2026-10-03/earlier.png'),record('failed','2026-10-04/fail.png')],folders:[{id:'folder-a',name:'Characters'}]},save:()=>{}},
 client:{imageHistoryLimit:async()=>window.capped?1:1000,listImageDirectory:async(path)=>path===''?{folders:['Starred']}:path==='Starred'?{folders:['2026-10-04'],files:[{src:'2026-10-04flat.png'}]}:{files:[{src:'remote.png'}]},deleteImage:async(path)=>{deleted.push(path);if(path.endsWith('/fail.png'))throw new Error('fixture deletion failure');}},
 outputMutationPath:output=>output.swarmSourcePath,
 joinSwarmHistoryPath:(parent,child)=>child.startsWith(parent+'/')?child:parent+'/'+child,
 notify:message=>notices.push(message),addLog:()=>{},clearNativeImageCache:()=>{},yieldLibrarySync:async()=>{},outputCard:id=>'<article data-output-card="'+id+'">Mock image '+id+'</article>',render(){this.root.innerHTML=this.renderLibrary();this.bindLibraryEvents();}
});app.render();window.ready=true;
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:0},plugins:[{name:'library-cleanup-fixture',configureServer(server){server.middlewares.use('/__cleanup_contract',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(fixture);});}}]});
let browser;
try {
 await server.listen();browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const context=await browser.newContext({viewport});const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__cleanup_contract`);await page.waitForFunction(()=>window.ready);
  assert.equal(await page.locator('[data-output-card]').count(),240);
  const button=page.getByRole('button',{name:'Delete all non-favorited',exact:true});
  await Promise.all([page.waitForEvent('dialog').then(async dialog=>{
   assert.match(dialog.message(),/246 non-favorited Swarm images/);
   assert.match(dialog.message(),/Characters · 2026-10-04/);await dialog.dismiss();
  }),button.click()]);
  await page.waitForFunction(()=>!app.libraryBatchBusy);assert.equal(await page.evaluate(()=>deleted.length),0);
  await button.focus();await Promise.all([page.waitForEvent('dialog').then(dialog=>dialog.accept()),page.keyboard.press('Enter')]);
  await page.waitForFunction(()=>!app.libraryBatchBusy);
  assert.equal(await page.evaluate(()=>deleted.length),246);
  assert.deepEqual(await page.evaluate(()=>app.store.state.outputs.map(o=>o.id).sort()),['failed','favorite','flat','other-date','other-folder','remote']);
  assert.match(await page.evaluate(()=>notices.at(-1)),/1 failed and kept/);
  await page.evaluate(()=>{app.libraryFolder='folder-favorites';app.render();});assert.equal(await button.isEnabled(),false);
  await page.evaluate(()=>{app.libraryFolder='folder-a';window.capped=true;app.render();});await button.click();await page.waitForFunction(()=>!app.libraryBatchBusy);
  assert.match(await page.evaluate(()=>notices.at(-1)),/capped/);assert.equal(await page.evaluate(()=>deleted.length),246);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await context.close();
 }
 console.log('library cleanup desktop/mobile UI contracts: ok');
} finally {await browser?.close();await server.close();}
