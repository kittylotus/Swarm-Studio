from playwright.sync_api import sync_playwright
from pathlib import Path
import json, re, base64, posixpath, os, sys, subprocess, tempfile, shutil
root=Path(__file__).resolve().parents[1]
work=tempfile.TemporaryDirectory(prefix='studio-atelier-tests-')
js=Path(work.name)
local_tsc=root/'node_modules'/'.bin'/('tsc.cmd' if os.name=='nt' else 'tsc')
tsc=str(local_tsc) if local_tsc.exists() else shutil.which('tsc')
if not tsc: raise RuntimeError('Install TypeScript or place tsc on PATH')
subprocess.run([tsc,'--noEmit','false','--outDir',str(js),'--rewriteRelativeImportExtensions'],cwd=root,check=True,shell=os.name=='nt')
screenshots=root/'test-results'/'inspector-offline';screenshots.mkdir(parents=True,exist_ok=True)
imports={}
# Browser receives compiled modules without network or changes to managed browser policy.
def module(rel):
 key='@studio/'+rel
 if key in imports:return key
 imports[key]=''
 p=js/rel
 s=p.read_text()
 def resolve(m):
  q=m.group(2); r=posixpath.normpath(posixpath.join(posixpath.dirname(rel),q))
  if r.endswith('.css'):
   css=(root/'src'/r).read_text(); code='const el=document.createElement("style");el.textContent='+json.dumps(css)+';document.head.append(el);'; name='@studio/'+r;imports[name]='data:text/javascript;base64,'+base64.b64encode(code.encode()).decode();return m.group(1)+'"'+name+'"'
  if r.endswith('.ts'):r=r[:-3]+'.js'
  if not r.endswith('.js'):r=r+'.js' if (js/(r+'.js')).is_file() else r+'/index.js'
  return m.group(1)+'"'+module(r)+'"'
 s=re.sub(r'((?:from\s+|import\s*\(?\s*))([\"\']\.[^\"\']+[\"\'])', lambda m:resolve(type('M',(),{'group':lambda _,i: m.group(1) if i==1 else m.group(2)[1:-1]})()),s)
 imports[key]='data:text/javascript;base64,'+base64.b64encode(s.encode()).decode();return key

appmod=module('app.js'); runtime=module('runtime/index.js'); pipeline=module('expressions/pipeline.js'); provenance=module('library/provenance.js')
# Full existing mocked App fixture, served as inline data modules. No remote network.
fixture=(root/'tests/image-tools-ui.mjs').read_text().split('const fixture = `',1)[1].split('`;',1)[0]
script=fixture.split('<script type="module">',1)[1].split('</script>',1)[0]
script=script.replace("if (!cutout) {", "if (cutout) { ctx.fillStyle = 'rgba(20,240,20,.5)'; ctx.fillRect(0,0,4,4); } if (!cutout) {")
script=script.replace("import '/src/styles.css';",'').replace("'/src/app.ts'",json.dumps(appmod)).replace("'/src/runtime/index.ts'",json.dumps(runtime)).replace("'/src/expressions/pipeline.ts'",json.dumps(pipeline))
script += '\nimport {newStudioMetadata} from '+json.dumps(provenance)+';window.newStudioMetadata=newStudioMetadata;'
css=(root/'src/styles.css').read_text().replace("@import './scrollbars.css';",'')
storage="""<script>const local=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k),clear:()=>local.clear(),key:i=>Array.from(local.keys())[i]??null,get length(){return local.size}}});Object.defineProperty(window,'sessionStorage',{value:localStorage});const records=new Map();
const mockDB={createObjectStore(){},close(){},transaction(){
 const tx={};tx.objectStore=()=>({get(k){const q={result:records.get(k)};setTimeout(()=>q.onsuccess?.(),0);return q},put(v,k){records.set(k,structuredClone(v));const q={};setTimeout(()=>{q.onsuccess?.();tx.oncomplete?.()},0);return q}});return tx;
}};
Object.defineProperty(window,'indexedDB',{value:{open(){const r={result:mockDB};setTimeout(()=>r.onsuccess?.(),0);return r}}});</script>"""
html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style>'+storage+'<script type="importmap">'+json.dumps({'imports':imports})+'</script></head><body><div id="app"></div><script type="module">'+script+'</script></body></html>'

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('STUDIO_TEST_CHROMIUM') or None, args=['--no-sandbox'] if os.environ.get('STUDIO_TEST_CHROMIUM') else [],headless=True)
 for w,h in [(1440,1000),(782,893),(390,844),(320,640)]:
  if os.environ.get("STUDIO_TEST_WIDTH") and int(os.environ["STUDIO_TEST_WIDTH"])!=w: continue
  page=browser.new_page(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html);page.wait_for_function('window.ready && app.expressionStudio',timeout=10000)
  page.evaluate("""()=>{app.client.outputScope="fixture-scope";const original=app.swarmImageAttributes.bind(app);app.swarmImageAttributes=url=>{const file=files[String(url).split('/').pop()?.split('?')[0]];return original(file||url)};Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text;}}});const c=document.createElement('canvas');c.width=768;c.height=1024;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,768,1024);g.addColorStop(0,'#192b42');g.addColorStop(1,'#73516d');x.fillStyle=g;x.fillRect(0,0,768,1024);x.fillStyle='#efd6ab';x.beginPath();x.arc(384,375,160,0,Math.PI*2);x.fill();x.fillStyle='#87a6a7';x.beginPath();x.ellipse(384,810,230,280,0,0,Math.PI*2);x.fill();const base=newStudioMetadata('general_generation'),up=newStudioMetadata('upscale_result',base),bg=newStudioMetadata('background_removed',up),branch=newStudioMetadata('upscale_result',base);base.studio_origin=up.studio_origin=bg.studio_origin='lumiswarm';window.fixtureOutputs=[base,up,bg,branch].map((tag,i)=>{const name='fixture-'+i+'.png';files[name]=c.toDataURL('image/png');return app.store.addOutput({url:'Output/'+name,swarmPath:'Output/'+name,swarmSourcePath:name,model:'AnimaYume - fixture.safetensors',prompt:'Source prompt',sentPrompt:'Sent prompt',negativePrompt:'low quality',width:768,height:1024,seed:42,metadata:JSON.stringify({sui_image_params:{prompt:'masterpiece, 1girl, warm evening light, '+('a quiet portrait with soft colors and detailed clothing. '.repeat(36)),negativeprompt:'low quality',seed:42},sui_extra_data:tag}),request:{extra_metadata:tag,steps:30},loras:[],presets:[]})});app.navigateToView('library');app.store.updateUi({selectedOutputId:fixtureOutputs[2].id});app.render();}""")
  dialog=page.get_by_role('dialog',name='Output inspector');dialog.wait_for();page.wait_for_function('document.querySelector(".inspector-media img")?.naturalWidth>0')
  assert dialog.locator('.inspector-actions button').count()==4
  assert dialog.locator('.inspector-actions button svg').count()==4
  assert dialog.get_by_role('button',name='Open in Editing').is_visible()
  assert dialog.locator('.inspector-prompt-text').first.inner_text().startswith('masterpiece')
  assert dialog.locator('.inspector-prompt-text').first.evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)>=11')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(screenshots/f'inspect-{w}.png'))
  dialog.get_by_role('button',name='Copy prompt').click();page.wait_for_function('window.copied?.startsWith("masterpiece")')
  dialog.get_by_role('button',name='Details',exact=True).click();assert dialog.get_by_text('Source request',exact=True).is_visible();assert dialog.get_by_text('Swarm metadata',exact=True).is_visible();assert dialog.locator('.inspector-prompt-text').count()==0
  dialog.get_by_role('button',name='Review versions').click();assert dialog.locator('.version-node').count()==4;assert dialog.locator('.version-connectors path').count()==3
  assert dialog.locator('.inspector-versions').evaluate('(e)=>e.getBoundingClientRect().right<=innerWidth+1')
  ids=page.evaluate('fixtureOutputs.map(o=>o.id)');selector=lambda i:'[data-inspect-output="'+ids[i]+'"]'
  dialog.locator(selector(3)).click();assert page.evaluate('app.store.state.ui.selectedOutputId')==ids[3];assert dialog.locator('.version-node').count()==4
  dialog.locator(selector(2)).click();assert dialog.locator('.version-node.is-current').count()==1
  branch=dialog.locator('.version-node:has('+selector(3)+') [data-branch-choice]');branch.select_option('keep');assert page.evaluate('app.readBranchChoices().length')==1;assert branch.input_value()=='keep'
  dialog.locator('[data-keep-final]').check();assert page.evaluate('app.keepFinalEnabled()');assert page.evaluate('app.store.state.outputs.length')==4
  dialog.get_by_role('button',name='Prompt',exact=True).click();assert dialog.locator('.inspector-prompt-text').count()==3
  dialog.get_by_role('button',name='Open in Editing').click();page.wait_for_function('app.imageEditor?.source?.id===fixtureOutputs[2].id && !app.imageEditor.busy');assert dialog.count()==0;assert page.evaluate('app.view')=='editor';assert page.locator('[data-inpaint-panel]').count()==0
  # Reopen inspector, direct Inpaint retains its existing entry route.
  page.evaluate('app.navigateToView("library");app.store.updateUi({selectedOutputId:fixtureOutputs[2].id});app.render()');dialog.get_by_role('button',name='Inpaint',exact=True).click();page.wait_for_function('app.inpaintOpen && app.inpaintImageElement?.naturalWidth===768',timeout=15000);assert dialog.count()==0
  assert not errors,errors
  print('Inspect layout, prompt copy, details, lineage, retention, Editing and Inpaint routes:',w,'PASS',flush=True)
  page.close()
 browser.close()
