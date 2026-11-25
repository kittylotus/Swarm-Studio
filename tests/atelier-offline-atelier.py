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
mod=module('expressions/editor.js'); despill=module('editor/despill.js')
css=(root/'src/styles.css').read_text().replace("@import './scrollbars.css';",'')
script='''import {ImageEditor} from "'''+mod+'''";import {despillImage} from "'''+despill+'''";
const pic=(w,h,alpha=false)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,w/2,h);x.fillStyle='#0000ff';x.fillRect(w/2,0,w/2,h);if(alpha){x.fillStyle='rgba(30,230,30,.5)';x.clearRect(0,0,4,4);x.fillRect(0,0,4,4)}return c.toDataURL('image/png')};
window.calls=[];window.mask=null;window.inpaintOpen=false;window.fail=false;
const original={id:'fixture',image:pic(96,96),width:96,height:96,name:'fixture.png',model:'anima.safetensors'};
const graph={'1':{class_type:'LoadImage',inputs:{image:'fixture.png'}},'2':{class_type:'SaveImage',inputs:{images:['1',0]}}};
const bridge={connected:()=>true,busy:()=>false,inpaintBusy:()=>false,checkpoint:()=>original.model,keepFinal:()=>false,setKeepFinal:()=>{},browseLibrary:()=>{},load:async()=>original,save:async(image,name)=>{window.exported={image,name}},inventory:async()=>({nodes:{SwarmLoadImageB64:{},SwarmSaveImageWS:{},LoadBackgroundRemovalModel:{input:{required:{bg_removal_name:['COMBO',{options:['birefnet.safetensors']}]}}},RemoveBackground:{},InvertMask:{},JoinImageWithAlpha:{}}}),listWorkflows:async()=>[],savedWorkflow:async()=>({imageInputs:[],metadata:{}}),generate:async(req,progress,stage)=>{calls.push({req,stage});progress(.5);if(window.fail)throw Error('fixture failure');return {image:pic(192,192),width:192,height:192,name:'processed.png',id:'processed'}},inpaint:(source,selection)=>{window.inpaintOpen=Boolean(source);window.mask=selection;window.inpaintSource=source;const panel=source?document.createElement('div'):null;if(panel){panel.dataset.inpaintPanel='';panel.textContent='Mock native Inpaint panel'};remount(panel)}};
const editor=new ImageEditor(bridge);window.editor=editor;function remount(panel=null){const old=document.querySelector('#host');const next=document.createElement('div');next.id='host';old.replaceWith(next);editor.mount(next,panel)}window.remount=remount;
editor.mount(document.querySelector('#host'),null);await editor.loadOutput('fixture');window.ready=true;window.despillImage=despillImage;window.pic=pic;
'''
html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><script type="importmap">'+json.dumps({'imports':imports})+'</script></head><body><div id="host" style="padding:8px"></div><script type="module">'+script+'</script></body></html>'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('STUDIO_TEST_CHROMIUM') or None, args=['--no-sandbox'] if os.environ.get('STUDIO_TEST_CHROMIUM') else [],headless=True)
 for w,h in [(1440,1000),(390,844),(320,700)]:
  page=browser.new_page(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_content(html);page.wait_for_function('window.ready',timeout=5000)
  overlay=page.locator('[data-edit=overlay]');page.evaluate('window.originalCanvas=document.querySelector("[data-edit=canvas]")');assert page.locator('button[data-tool=generate]').count()==0
  overlay.focus();page.keyboard.press('w');assert page.locator('button[data-tool=wand]').get_attribute('aria-pressed')=='true';box=overlay.bounding_box();page.mouse.click(box['x']+box['width']*.25,box['y']+box['height']*.5)
  page.locator('[data-op=clear]').click();assert page.evaluate('originalCanvas.getContext("2d").getImageData(10,10,1,1).data[3]')==0
  page.keyboard.press('Control+z');assert page.evaluate('originalCanvas.getContext("2d").getImageData(10,10,1,1).data[3]')==255
  page.keyboard.press('Control+Alt+z');assert not page.locator('[data-op=clear]').is_enabled()
  overlay.focus();page.keyboard.press('Control+Alt+Shift+z');assert page.locator('[data-op=clear]').is_enabled()
  page.locator('[data-edit=redo]').click();assert page.evaluate('originalCanvas.getContext("2d").getImageData(10,10,1,1).data[3]')==0
  page.locator('[data-edit=undo]').click();page.locator('button[data-tool=brush]').click();page.locator('[data-setting=paintColor]').fill('#00ff00');box=overlay.bounding_box();page.mouse.click(box['x']+box['width']*.25,box['y']+box['height']*.5);assert page.evaluate('originalCanvas.getContext("2d").getImageData(24,48,1,1).data[1]')>0
  page.locator('button[data-tool=inpaint]').click();assert not page.evaluate('inpaintOpen');page.locator('[data-op=gpu]').click();page.wait_for_function('inpaintOpen && mask && mask.mask.some(x=>x>0)');assert page.evaluate('!inpaintSource.id');assert page.evaluate('originalCanvas===document.querySelector("[data-edit=canvas]")')
  page.locator('[data-edit=close-inpaint]').click();assert not page.evaluate('inpaintOpen');page.locator('button[data-tool=inpaint]').click();page.locator('[data-op=gpu]').click();page.evaluate('editor.useInpaintResult({id:"approved",image:pic(192,192),width:192,height:192,name:"approved.png"})');assert not page.evaluate('inpaintOpen');assert page.evaluate('originalCanvas.width')==192
  page.locator('[data-edit=undo]').click();assert page.evaluate('originalCanvas.width')==96;assert page.evaluate('editor.referencedOutputIds.includes("fixture")');page.locator('[data-edit=redo]').click();assert page.evaluate('originalCanvas.width')==192
  page.locator('button[data-tool=background]').click();page.locator('[data-recipe="mode"]').select_option('json');page.locator('[data-recipe-file]').set_input_files({'name':'graph.json','mimeType':'application/json','buffer':json.dumps({'1':{'class_type':'LoadImage','inputs':{'image':'fixture.png'}},'2':{'class_type':'SaveImage','inputs':{'images':['1',0]}}}).encode()});page.wait_for_function('editor.recipes.background.graph.length>0');page.locator('[data-op=gpu]').click();page.wait_for_function('!editor.busy && calls.length===1');assert page.evaluate('editor.source.id')=='processed';page.evaluate('window.fail=true');page.locator('[data-op=gpu]').click();page.wait_for_function('!editor.busy && calls.length===2');assert page.evaluate('editor.source.id')=='processed'
  page.locator('[data-edit=download]').click();page.wait_for_function('window.exported');assert page.evaluate('exported.name')=='processed-edit.png'
  assert page.evaluate('''async()=>{let source=pic(10,10,true);let result=await despillImage(source,'green');return result!==source}''')
  page.locator('button[data-tool=wand]').click();page.screenshot(path=str(screenshots/f'atelier-{w}.png'),full_page=True);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
  print('PASS',w,'selection, undo/redo, brush, explicit inpaint + mask, approved result, GPU success/failure, export, despill, viewport',flush=True);page.close()
 browser.close()
