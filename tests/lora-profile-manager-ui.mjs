import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/></head><body><div id="app"></div><script type="module">
import '/src/styles.css';import {StudioApp} from '/src/app.ts';
window.app=new StudioApp(document.querySelector('#app'));window.notices=[];app.notify=message=>notices.push(message);
app.models=[{name:'anima.safetensors',architecture:'anima'}];app.loras=Array.from({length:81},(_,i)=>({name:'LoRA '+String(i).padStart(3,'0')+'.safetensors',architecture:'anima'}));
const item=i=>({id:'item-'+i,name:app.loras[i].name,title:'Portrait LoRA '+i,weight:1,enabled:true,useTrigger:false,sourceUrl:''});
if(!app.store.state.loraProfiles.length){app.store.state.loraProfiles=Array.from({length:70},(_,i)=>({id:'stack-'+i,name:i===0?'Large stack':i===1?'Small stack':'Saved stack '+String(i).padStart(2,'0'),folder:'Unsorted',items:Array.from({length:i===0?64:i===1?2:1},(_,j)=>item(j)),source:'studio',createdAt:1,updatedAt:1}));app.store.save();}
app.store.updateDraft({model:'anima.safetensors'});app.store.updateUi({mobileCreatePane:'tune'});app.view=matchMedia('(max-width:760px)').matches?'create':'models';app.render();window.ready=true;
</script></body></html>`;
const server=await createServer({cacheDir:'test-results/profile-manager-vite-cache',server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'profile-manager-fixture',configureServer(server){server.middlewares.use('/__profiles',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(fixture);});}}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});await mkdir('test-results/profile-manager',{recursive:true});
 for(const viewport of [{width:1440,height:1000},{width:1281,height:800},{width:1280,height:800},{width:1100,height:650},{width:768,height:850},{width:390,height:844},{width:390,height:600}]){
  const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);
  const safeTop=viewport.width===390&&viewport.height===600?44:0;
  if(safeTop){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:safeTop,bottom:34,left:0,right:0}});}
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__profiles');await page.waitForFunction(()=>window.ready);
  const manage=page.locator('[data-action="manage-lora-profiles"]');await manage.click();
  const dialog=page.getByRole('dialog',{name:'Manage saved stacks'}),save=dialog.getByRole('button',{name:'Save changes',exact:true});
  if(safeTop){const close=await dialog.getByRole('button',{name:'Close saved stack manager',exact:true}).boundingBox();assert.ok(close.y>=safeTop,'close stays below the notched safe top');}
  const assertSaveVisible=async()=>{
   const metrics=await save.evaluate(button=>{const r=button.getBoundingClientRect(),modal=button.closest('[role="dialog"]').getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {r:{x:r.x,y:r.y,bottom:r.bottom,right:r.right,width:r.width,height:r.height},modal:{top:modal.top,bottom:modal.bottom,left:modal.left,right:modal.right},visible:Boolean(hit&&button.contains(hit)),viewport:{width:innerWidth,height:innerHeight}};});
   assert.ok(metrics.visible&&metrics.r.y>=metrics.modal.top&&metrics.r.bottom<=metrics.modal.bottom&&metrics.r.bottom<=metrics.viewport.height,JSON.stringify(metrics));
  };
  await page.screenshot({path:'test-results/profile-manager/initial-'+viewport.width+'x'+viewport.height+'.png'});
  await assertSaveVisible();
  const sidebar=dialog.locator('.lora-profile-manager-list-scroll'),editor=dialog.locator('.lora-profile-manager-editor-scroll');
  await sidebar.hover();await page.mouse.wheel(viewport.width<761?1200:0,viewport.width<761?0:1200);
  await page.waitForFunction(()=>{const el=document.querySelector('.lora-profile-manager-list-scroll');return el.scrollTop>0||el.scrollLeft>0;});
  await sidebar.evaluate(el=>{el.scrollTop=el.scrollHeight;el.scrollLeft=el.scrollWidth;});
  const last=dialog.locator('[data-lora-profile-manage-select="stack-69"]');await last.click();await assertSaveVisible();
  await sidebar.evaluate(el=>{el.scrollTop=0;el.scrollLeft=0;});await dialog.locator('[data-lora-profile-manage-select="stack-1"]').click();await assertSaveVisible();
  await sidebar.evaluate(el=>{el.scrollTop=0;el.scrollLeft=0;});await dialog.locator('[data-lora-profile-manage-select="stack-0"]').click();
  await dialog.getByRole('textbox',{name:'Stack name',exact:true}).fill('Edited large stack');await dialog.getByRole('combobox',{name:'Folder',exact:true}).fill('Portraits');
  await dialog.locator('[data-lora-profile-weight="item-0"]').fill('0.65');
  const trigger=dialog.getByRole('checkbox',{name:'Use trigger for Portrait LoRA 0',exact:true});
  assert.equal(await trigger.isVisible(),true,'saved-stack Trigger stays visible across the tablet breakpoint');
  await trigger.focus();await page.keyboard.press('Space');assert.equal(await trigger.isChecked(),true);
  await editor.hover();await page.mouse.wheel(0,1400);await page.waitForFunction(()=>document.querySelector('.lora-profile-manager-editor-scroll').scrollTop>0);
  await assertSaveVisible();const toggle=dialog.getByRole('button',{name:'Disable Portrait LoRA 20',exact:true});await toggle.scrollIntoViewIfNeeded();const before=await editor.evaluate(el=>el.scrollTop);await toggle.click();
  assert.ok(Math.abs(await editor.evaluate(el=>el.scrollTop)-before)<1,'row actions preserve editor position');await assertSaveVisible();
  await save.focus();await page.keyboard.press('Tab');assert.equal(await dialog.getByRole('button',{name:'Close saved stack manager',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');assert.equal(await save.evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Enter');await page.waitForFunction(()=>app.store.state.loraProfiles[0].name==='Edited large stack');
  assert.equal(await dialog.getByRole('textbox',{name:'Stack name',exact:true}).inputValue(),'Edited large stack');await assertSaveVisible();
  await page.screenshot({path:'test-results/profile-manager/saved-'+viewport.width+'x'+viewport.height+'.png'});
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await manage.evaluate(el=>el===document.activeElement),true);
  await manage.click();await assertSaveVisible();await dialog.getByRole('button',{name:'Close saved stack manager',exact:true}).click();
  await page.reload();await page.waitForFunction(()=>window.ready);
  const stored=await page.evaluate(()=>app.store.state.loraProfiles[0]);assert.equal(stored.name,'Edited large stack');assert.equal(stored.folder,'Portraits');assert.equal(stored.items[0].weight,.65);assert.equal(stored.items[0].useTrigger,true);assert.equal(stored.items[20].enabled,false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Saved-stack manager footer, sidebar/editor scrolling, keyboard save and reload: ok');
}finally{await browser?.close();await server.close();}
