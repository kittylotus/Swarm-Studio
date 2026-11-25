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
screenshots=root/'test-results'/'finalize-offline';screenshots.mkdir(parents=True,exist_ok=True)
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

# Exercise real StudioApp + real Editor + real workspace and the actual SwarmClient stream bridge.
setup = r'''async()=>{
 app.client.outputScope="fixture-scope"; window.failBackground=false;
 const original=app.swarmImageAttributes.bind(app);app.swarmImageAttributes=url=>{const file=files[String(url).split('/').pop()?.split('?')[0]];return original(file||url)};
 const oldGet=app.probeComfyNodes.bind(app);app.probeComfyNodes=async()=>({...await oldGet(),SwarmClipSeg:{input:{required:{images:['IMAGE'],match_text:['STRING'],threshold:['FLOAT']}}},MaskToImage:{},SwarmYoloDetection:{}});
 const create=(w,h,kind,seq=0)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');if(kind==='mask'){x.fillStyle='#000';x.fillRect(0,0,w,h);x.fillStyle='#fff';x.fillRect(0,0,w/2,h)}else if(kind==='cutout'){x.fillStyle='#9977ab';x.fillRect(w/4,h/4,w/2,h/2)}else{const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#26334c');g.addColorStop(1,'#855c79');x.fillStyle=g;x.fillRect(0,0,w,h);x.fillStyle='#e0be98';x.beginPath();x.ellipse(w*.5,h*.35,w*.22,h*.2,0,0,Math.PI*2);x.fill();x.fillStyle='#8ea6b8';x.beginPath();x.ellipse(w*.5,h*.8,w*.3,h*.35,0,0,Math.PI*2);x.fill();x.fillStyle='#ddd';x.fillRect(seq*2,0,2,2)}return c.toDataURL('image/png')};
 const root=newStudioMetadata('general_generation');files['finalize-source.png']=create(192,256,'art');window.finSource=app.store.addOutput({url:'Output/finalize-source.png',swarmPath:'Output/finalize-source.png',swarmSourcePath:'finalize-source.png',model:'portrait.safetensors',prompt:'portrait, evening light',sentPrompt:'portrait, evening light',negativePrompt:'low quality',width:192,height:256,seed:12,metadata:JSON.stringify({sui_extra_data:root}),request:{extra_metadata:root,loras:['style.safetensors'],loraweights:['0.8'],sampler:'euler'},loras:[],presets:[]});
 window.finCalls=[];window.holdFin=false;window.failFin=false;window.finSeq=0;
 const runtime=(await import(RUNTIME_MODULE)).runtime;
 runtime.streamJson=async(url,req,count,emit,token,signal)=>{const tag=req.extra_metadata;const graph=JSON.parse(req.comfyworkflowraw||'{}');const classes=Object.values(graph).map(x=>x.class_type);const kind=tag.studio_stage;const imageInput=req.initimage||('data:image/png;base64,'+graph['1']?.inputs?.image_base64);const input=new Image();input.src=imageInput;await input.decode();let w=input.naturalWidth,h=input.naturalHeight;const call={req,graph,kind,input:imageInput};finCalls.push(call);emit({gen_progress:{overall_percent:.35,current_percent:.35,preview:create(48,64,'art')}});
 if(holdFin){holdFin=false;await new Promise(resolve=>{window.finishFin=resolve;signal?.addEventListener('abort',resolve,{once:true})})}if(signal?.aborted)return;
 await new Promise(resolve=>setTimeout(resolve,80));if(signal?.aborted)return;if(failFin){failFin=false;emit({error:'fixture stage failed'});return}
 if(classes.includes('ImageScale')){const scale=Object.values(graph).find(n=>n.class_type==='ImageScale');w=scale.inputs.width;h=scale.inputs.height}else if(!classes.length){w=req.width;h=req.height}
 const data=create(w,h,classes.includes('SwarmClipSeg')?'mask':classes.includes('RemoveBackground')?'cutout':'art',++finSeq);const name='fin-'+finSeq+'.png';files[name]=data;call.output=data;emit({image:{image:'Output/'+name,seed:42,metadata:JSON.stringify({sui_extra_data:tag})}});
 };
 app.openOutputInEditor(finSource.id);
}'''.replace('RUNTIME_MODULE',json.dumps(runtime))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('STUDIO_TEST_CHROMIUM') or None,args=['--no-sandbox'] if os.environ.get('STUDIO_TEST_CHROMIUM') else [],headless=True)
 for w,h in [(1440,1000),(390,844),(320,640)]:
  if os.environ.get('STUDIO_TEST_WIDTH') and int(os.environ['STUDIO_TEST_WIDTH'])!=w: continue
  page=browser.new_page(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500);page.set_default_timeout(12000)
  errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(html);page.wait_for_function('window.ready && app.expressionStudio');page.evaluate(setup)
  page.wait_for_function('app.imageEditor?.source?.id===finSource.id && !app.imageEditor.busy')
  before=page.evaluate('app.imageEditor.canvas.toDataURL()');page.locator('[data-tool="smart"]').click();page.locator('[data-setting="smartTarget"]').fill('jacket');page.locator('[data-op="segment"]').click();page.wait_for_function('!app.imageEditor.busy && app.imageEditor.mask.some(v=>v>0)')
  assert page.evaluate('app.imageEditor.canvas.toDataURL()')==before
  assert page.evaluate('app.imageEditor.mask[0]===255 && app.imageEditor.mask[191]===0 && app.imageEditor.selectionPast.length===1')
  assert page.evaluate('finCalls[0].graph["2"].inputs.match_text')=='jacket'
  page.locator('[data-op="selection-undo"]').click();assert page.evaluate('!app.imageEditor.mask.some(v=>v>0)');page.locator('[data-op="selection-redo"]').click();assert page.evaluate('app.imageEditor.mask[0]===255')
  page.screenshot(path=str(screenshots/f'smart-{w}.png'))
  # Existing inpaint bridge consumes the same mask (not an independent segmentation state).
  page.locator('[data-tool="inpaint"]').click();page.locator('[data-op="gpu"]').click();page.wait_for_function('app.inpaintOpen && app.inpaintImageElement?.naturalWidth===192');assert page.evaluate('app.inpaintHasMask()');page.locator('[data-edit="close-inpaint"]').click();page.wait_for_function('!app.inpaintOpen')
  # Send the actual working canvas to Finalize; source remains the same immutable Library asset.
  page.locator('[data-edit="finalize"]').click();page.wait_for_function('app.view==="finalize" && app.finalizeWorkspace?.source?.id===finSource.id');fin=page.locator('.finalize-workspace')
  assert fin.is_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  def tab(name):
   if w<=760: fin.locator('[data-fin="pane-'+name+'"]').click()
  tab('settings')
  # Ordered stage configuration, custom settings, save/load, move and preview.
  fin.locator('[data-fin-field="creativity"]').fill('0.18');fin.locator('[data-fin-field="steps"]').fill('64');tab('chain');fin.locator('[data-fin-add-kind]').select_option('detailer');fin.locator('[data-fin="add"]').click();fin.locator('[data-fin="up-2"]').click();assert page.evaluate('app.finalizeWorkspace.stages.map(s=>s.kind)')==['refine','detailer','upscale']
  tab('settings');fin.locator('[data-fin-field="target"]').fill('face');fin.locator('[data-fin-field="detailPrompt"]').fill('sharp eyes');tab('chain');fin.locator('[data-fin-name]').fill('Finishing recipe');fin.locator('[data-fin="save-recipe"]').click();assert page.evaluate('JSON.parse(localStorage.getItem("studio-finalize-recipes-v1"))[0].stages.length')==3
  fin.locator('[data-fin="select-0"]').click();assert fin.locator('[data-fin-field="steps"]').input_value()=='64';fin.locator('[data-fin="run"]').click();page.wait_for_function('!app.finalizeWorkspace.busy && app.finalizeWorkspace.results.every(r=>r.status==="done")',timeout=25000)
  assert page.evaluate('finCalls.slice(1).map(c=>c.kind)')==['refinement_result','detailer_result','upscale_result'];assert page.evaluate('finCalls[1].req.initimage===files["finalize-source.png"] && finCalls[2].req.initimage===finCalls[1].output && finCalls[3].input===finCalls[2].output')
  assert page.evaluate('finCalls[1].req.steps===64 && finCalls[1].req.initimagecreativity===.18 && finCalls[1].req.loras==="style.safetensors"');assert page.evaluate('finCalls[2].req.prompt.includes("<segment:face,0.45,0.5> sharp eyes") && finCalls[2].req.initimagecreativity===0')
  assert page.evaluate('finCalls[2].req.extra_metadata.studio_parent_id===finCalls[1].req.extra_metadata.studio_asset_id && finCalls[3].req.extra_metadata.studio_parent_id===finCalls[2].req.extra_metadata.studio_asset_id');assert page.evaluate('app.finalizeWorkspace.results[2].image.width===384')
  assert page.evaluate('app.finalizeWorkspace.referencedOutputIds.length===4');assert page.evaluate('app.store.state.outputs.length===5');assert page.evaluate('app.finalizeWorkspace.results[2].image.studioMetadata.studio_stage==="upscale_result"');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  tab('preview');fin.locator('.finalize-view-actions [data-fin="source-preview"]').click();assert page.evaluate('app.finalizeWorkspace.previewIndex===-1');fin.locator('.finalize-view-actions [data-fin="preview-2"]').click();assert page.evaluate('app.finalizeWorkspace.previewIndex===2')
  page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(screenshots/f'finalize-{w}.png'))
  if w<=760:
   assert page.evaluate('document.querySelector("[data-fin=run]").getBoundingClientRect().bottom <= document.querySelector(".mobile-tabbar").getBoundingClientRect().top'), 'Footer overlaps mobile nav'
   tab('chain');page.screenshot(path=str(screenshots/f'finalize-chain-{w}.png'));tab('settings');page.screenshot(path=str(screenshots/f'finalize-settings-{w}.png'));tab('preview')
  # Cancel during active stream, ensure no later stage and no cross-workspace competing render.
  page.evaluate('window.holdFin=true');fin.locator('[data-fin="run"]').click();page.wait_for_function('window.finishFin && app.finalizeWorkspace.busy');calls=page.evaluate('finCalls.length');page.evaluate('app.generate()');assert page.evaluate('finCalls.length')==calls;fin.locator('[data-fin="cancel"]').click();page.wait_for_function('!app.finalizeWorkspace.busy');assert page.evaluate('finCalls.length')==calls;assert page.evaluate('app.finalizeWorkspace.results[0].status')=='cancelled';assert page.evaluate('interrupts.length')>=1
  # Failure stops chain and retains source, recipe reload restores ordering.
  page.evaluate('window.failFin=true');fin.locator('[data-fin="run"]').click();page.wait_for_function('!app.finalizeWorkspace.busy && app.finalizeWorkspace.failed');assert page.evaluate('app.finalizeWorkspace.results.map(r=>r.status)')==['failed','waiting','waiting'];assert page.evaluate('app.finalizeWorkspace.source.id===finSource.id');assert page.evaluate('finCalls.length')==calls+1
  tab('chain');fin.locator('[data-fin="load-recipe"]').click();assert page.evaluate('app.finalizeWorkspace.stages.map(s=>s.kind)')==['refine','detailer','upscale'];assert not errors,errors
  print('Smart Selection, Inpaint handoff, ordered Finalize, recipe, provenance, cancellation and failure:',w,'PASS',flush=True);page.close()
 browser.close()
