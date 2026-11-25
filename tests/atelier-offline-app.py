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
screenshots=root/'test-results'/'atelier-offline';screenshots.mkdir(parents=True,exist_ok=True)
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

appmod=module('app.js'); runtime=module('runtime/index.js'); pipeline=module('expressions/pipeline.js')
# Full existing mocked App fixture, served as inline data modules. No remote network.
fixture=(root/'tests/image-tools-ui.mjs').read_text().split('const fixture = `',1)[1].split('`;',1)[0]
script=fixture.split('<script type="module">',1)[1].split('</script>',1)[0]
script=script.replace("if (!cutout) {", "if (cutout) { ctx.fillStyle = 'rgba(20,240,20,.5)'; ctx.fillRect(0,0,4,4); } if (!cutout) {")
script=script.replace("import '/src/styles.css';",'').replace("'/src/app.ts'",json.dumps(appmod)).replace("'/src/runtime/index.ts'",json.dumps(runtime)).replace("'/src/expressions/pipeline.ts'",json.dumps(pipeline))
css=(root/'src/styles.css').read_text().replace("@import './scrollbars.css';",'')
storage="""<script>const local=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k),clear:()=>local.clear(),key:i=>Array.from(local.keys())[i]??null,get length(){return local.size}}});Object.defineProperty(window,'sessionStorage',{value:localStorage});const records=new Map();
const mockDB={createObjectStore(){},close(){},transaction(){
 const tx={};tx.objectStore=()=>({get(k){const q={result:records.get(k)};setTimeout(()=>q.onsuccess?.(),0);return q},put(v,k){records.set(k,structuredClone(v));const q={};setTimeout(()=>{q.onsuccess?.();tx.oncomplete?.()},0);return q}});return tx;
}};
Object.defineProperty(window,'indexedDB',{value:{open(){const r={result:mockDB};setTimeout(()=>r.onsuccess?.(),0);return r}}});</script>"""
html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style>'+storage+'<script type="importmap">'+json.dumps({'imports':imports})+'</script></head><body><div id="app"></div><script type="module">'+script+'</script></body></html>'

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('STUDIO_TEST_CHROMIUM') or None, args=['--no-sandbox'] if os.environ.get('STUDIO_TEST_CHROMIUM') else [],headless=True)
 for w,h in [(1440,1000),(390,844),(320,700)]:
  page=browser.new_page(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500)
  errors=[]; page.on('pageerror',lambda e:(errors.append(str(e)),print('page error:',str(e),flush=True)))
  page.set_content(html); page.wait_for_function('window.ready && app.expressionStudio',timeout=10000)
  # Mock the browser image renderer as well as the native data bridge: no network needed for comparisons.
  page.evaluate("""()=>{const original=app.swarmImageAttributes.bind(app);app.swarmImageAttributes=url=>{const file=files[String(url).split('/').pop()?.split('?')[0]];return original(file||url)}}""")
  print('App fixture ready',w,flush=True)
  page.evaluate('''()=>{window.failBackground=false;const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,48,96);x.fillStyle='#0000ff';x.fillRect(48,0,48,96);files['fixture.png']=c.toDataURL('image/png');const o=app.store.addOutput({url:'Output/fixture.png',swarmPath:'Output/fixture.png',swarmSourcePath:'fixture.png',model:'portrait.safetensors',prompt:'fixture',sentPrompt:'',negativePrompt:'',width:96,height:96,seed:1,metadata:'',request:{},loras:[],presets:[]});window.fixtureId=o.id;app.navigateToView('editor');}''')
  page.wait_for_function('app.imageEditor && document.querySelector("[data-edit=canvas]")');page.evaluate('app.imageEditor.loadOutput(fixtureId)');page.wait_for_function('!app.imageEditor.busy && app.imageEditor.source?.id===fixtureId');
  canvas=page.locator('[data-edit=canvas]'); overlay=page.locator('[data-edit=overlay]'); page.evaluate('window.originalCanvas=document.querySelector("[data-edit=canvas]")')
  assert page.locator('button[data-tool=generate]').count()==0
  page.keyboard.press('w');assert page.locator('button[data-tool=wand]').get_attribute('aria-pressed')=='true'; box=overlay.bounding_box();assert box and box['width']>5,box
  page.mouse.click(box['x']+box['width']*.25,box['y']+box['height']*.5)
  page.locator('[data-op=clear]').click(); assert page.evaluate('originalCanvas.getContext("2d").getImageData(10,10,1,1).data[3]')==0
  page.locator('[data-edit=undo]').click();assert page.evaluate('originalCanvas.getContext("2d").getImageData(10,10,1,1).data[3]')==255
  page.locator('[data-op=selection-undo]').click();assert not page.locator('[data-op=clear]').is_enabled()
  page.locator('[data-op=selection-redo]').click();assert page.locator('[data-op=clear]').is_enabled()
  page.locator('[data-edit=redo]').click();assert page.evaluate('originalCanvas.getContext("2d").getImageData(10,10,1,1).data[3]')==0
  page.locator('[data-edit=undo]').click();
  page.locator('button[data-tool=brush]').click();page.locator('[data-setting=paintColor]').fill('#00ff00');box=overlay.bounding_box();page.mouse.click(box['x']+box['width']*.25,box['y']+box['height']*.5);assert page.evaluate('originalCanvas.getContext("2d").getImageData(24,48,1,1).data[1]')>0
  page.locator('[data-edit=undo]').click();
  glyph_pairs={'[data-inpaint-tool=paint]':'[data-tool=brush]','[data-inpaint-tool=erase]':'[data-tool=erase]','[data-inpaint-tool=rect]':'[data-tool=rectangle]','[data-inpaint-tool=lasso]':'[data-tool=lasso]','[data-inpaint-tool=pan]':'[data-tool=hand]','[data-action=inpaint-undo]':'[data-edit=undo]','[data-action=inpaint-redo]':'[data-edit=redo]','[data-action=open-inpaint-help]':'[data-edit=help]'}
  editor_glyphs={mask:page.locator(edit+' svg').inner_html() for mask,edit in glyph_pairs.items()}
  page.locator('button[data-tool=inpaint]').click();assert page.locator('[data-inpaint-panel]').count()==0
  page.locator('[data-op=gpu]').click();page.wait_for_function('app.inpaintImageElement?.naturalWidth===96 && app.inpaintImportedMaskElement?.complete');assert page.locator('[data-inpaint-panel]').is_visible();
  for selector,shape in editor_glyphs.items():
   glyph=page.locator(selector+' svg')
   assert glyph.inner_html()==shape,selector
   assert glyph.evaluate('(el)=>getComputedStyle(el).strokeWidth')=='1.65px',selector
  print('Shared Editing/Inpaint icon geometry and stroke parity',w,flush=True)
  assert page.evaluate('originalCanvas===document.querySelector("[data-edit=canvas]")')
  # Tool hotkeys, no canvas remount, and no stealing typed prompt shortcuts.
  page.evaluate('window.maskCanvas=document.querySelector("#inpaint-canvas")');page.keyboard.press('e');assert page.locator('[data-inpaint-tool=erase]').get_attribute('aria-pressed')=='true';assert page.evaluate('maskCanvas===document.querySelector("#inpaint-canvas")');page.keyboard.press('b');assert page.locator('[data-inpaint-tool=paint]').get_attribute('aria-pressed')=='true'
  page.screenshot(path=str(screenshots/f'inpaint-{w}.png'),full_page=True)
  page.locator('[data-inpaint-inspector=prompt]').click();page.locator('#inpaint-prompt').fill('fixture edit');page.locator('#inpaint-prompt').press('e');assert page.locator('[data-inpaint-tool=paint]').get_attribute('aria-pressed')=='true';page.locator('[data-inpaint-inspector=mask]').click();assert page.evaluate('maskCanvas===document.querySelector("#inpaint-canvas")')
  print('Inpaint shortcuts passed',w,flush=True)
  page.locator('[data-inpaint-panel] [data-action=generate-inpaint]:visible').last.click();review=page.locator('.inpaint-result-review');review.wait_for(timeout=15000);page.wait_for_function('document.querySelector("[data-review-image=after] img")?.naturalWidth>0');bounds=review.bounding_box();layout=page.locator('.inpaint-layout').bounding_box();assert bounds and layout and abs(bounds['width']-layout['width'])<3 and abs(bounds['height']-layout['height'])<3,(bounds,layout)
  apply=page.locator('[data-action=apply-inpaint-result]');discard=page.locator('[data-action=dismiss-inpaint-result]');assert apply.is_visible() and discard.is_visible();assert page.locator('.inpaint-stage-shell').get_attribute('inert') is not None
  assert page.evaluate('''()=>[...document.querySelectorAll('.inpaint-result-review-actions button')].every(b=>{const r=b.getBoundingClientRect();const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&b.contains(el)})'''), 'Review actions must remain inside viewport and clickable'
  assert not page.locator('.toast').filter(has_text='Edited output indexed').count(), 'Completion notice must not obscure review' 
  if page.locator('[data-inpaint-review-view=before]').is_visible():
   page.locator('[data-inpaint-review-view=before]').click();assert page.locator('[data-review-image=before]').is_visible() and not page.locator('[data-review-image=after]').is_visible();page.locator('[data-inpaint-review-view=after]').click()
  else: assert page.locator('[data-review-image=before]').is_visible() and page.locator('[data-review-image=after]').is_visible()
  print('Review layout passed',w,flush=True)
  page.screenshot(path=str(screenshots/f'review-{w}.png'),full_page=True)
  # Rejection preserves the same source and imported mask; next approval returns to Editing.
  page.evaluate('window.reviewSource=app.inpaintSourceDataUrl;window.reviewMask=app.inpaintImportedMaskDataUrl');discard.click();assert page.evaluate('app.inpaintOpen && app.inpaintSourceDataUrl===reviewSource && app.inpaintImportedMaskDataUrl===reviewMask');page.locator('[data-inpaint-panel] [data-action=generate-inpaint]:visible').last.click();apply.click(timeout=15000);page.wait_for_function('!app.inpaintOpen && !app.inpaintApplyingResult');assert page.evaluate('app.imageEditor.source.id===app.store.state.outputs[0].id');assert page.evaluate('calls[0].stage')=='inpaint';assert page.evaluate('originalCanvas===document.querySelector("[data-edit=canvas]")');page.wait_for_function('!app.inpaintOpen && document.querySelector(".ss-edit-body") && !document.querySelector(".ss-edit-body").hidden');
  page.locator('button[data-tool=background]').click();page.wait_for_function('document.querySelector("[data-editor-recipe] select")');page.locator('[data-op=gpu]').click();page.wait_for_function('!app.imageEditor.busy && calls.length===3',timeout=15000)
  assert page.evaluate('originalCanvas.width')==192, page.evaluate('document.querySelector("[data-edit=status]").textContent')
  page.locator('[data-edit=undo]').click();assert page.evaluate('originalCanvas.width')==96;assert page.evaluate('app.imageEditor.referencedOutputIds.includes(fixtureId)');
  page.locator('[data-edit=redo]').click();assert page.evaluate('originalCanvas.width')==192
  page.locator('button[data-tool=wand]').click();page.screenshot(path=str(screenshots/f'app-{w}.png'),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.evaluate('[document.documentElement.scrollWidth,innerWidth]')
  page.evaluate("""()=>{app.navigateToView('expressions');const p=app.expressionStudio.project;Object.assign(p,{engine:'text',model:'portrait.safetensors',subject:'ashido mina',outfit:'cream sweater',temperament:'bubbly expressions',renderingPrompt:'anime illustration',refine:{mode:'off'},backgroundRemoval:{mode:'builtin',model:'birefnet.safetensors'},despill:true,despillColor:'green',autoDeleteDrafts:false,tiles:p.tiles.slice(0,1)});app.expressionStudio.draw()}""")
  page.locator('[data-command=run-pipeline]').click();page.wait_for_function('!app.expressionStudio.busy && calls.length===5',timeout=20000)
  print(page.evaluate('JSON.stringify({stage:app.expressionStudio.project.tiles[0].stage,path:app.expressionStudio.project.tiles[0].path,error:app.expressionStudio.project.tiles[0].error, variants:app.expressionStudio.project.tiles[0].variants?.length, prompt:calls[3].request.prompt})'),flush=True)
  assert page.evaluate('app.expressionStudio.project.tiles[0].stage')=='background';assert page.evaluate('app.expressionStudio.project.tiles[0].path')=='';assert page.evaluate('app.expressionStudio.project.tiles[0].variants.length')>0
  assert 'cream sweater' in page.evaluate('calls[3].request.prompt');assert 'bubbly expressions' in page.evaluate('calls[3].request.prompt')
  assert not errors,errors
  print('PASS',w,'selection, pixel undo/redo, brush, inpaint explicit + mask, GPU roundtrip, source ref, viewport',flush=True);page.close()
 browser.close()
