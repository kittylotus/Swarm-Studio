from playwright.sync_api import sync_playwright
from pathlib import Path
import json, re, base64, posixpath, os, subprocess, tempfile, shutil

root=Path(__file__).resolve().parents[1]
work=tempfile.TemporaryDirectory(prefix='studio-readme-showcase-')
js=Path(work.name)
local_tsc=root/'node_modules'/'.bin'/('tsc.cmd' if os.name=='nt' else 'tsc')
tsc=str(local_tsc) if local_tsc.exists() else shutil.which('tsc')
if not tsc: raise RuntimeError('Install TypeScript or place tsc on PATH')
subprocess.run([tsc,'--noEmit','false','--outDir',str(js),'--rewriteRelativeImportExtensions'],cwd=root,check=True,shell=os.name=='nt')
shots=root/'docs'/'images'/'readme';shots.mkdir(parents=True,exist_ok=True)
imports={}

def module(rel):
    key='@studio/'+rel
    if key in imports: return key
    imports[key]=''
    p=js/rel
    s=p.read_text()
    def repl(m):
        quote=m.group(2)
        q=quote[1:-1]
        r=posixpath.normpath(posixpath.join(posixpath.dirname(rel),q))
        if r.endswith('.css'):
            css=(root/'src'/r).read_text()
            code='const el=document.createElement("style");el.textContent='+json.dumps(css)+';document.head.append(el);'
            name='@studio/'+r
            imports[name]='data:text/javascript;base64,'+base64.b64encode(code.encode()).decode()
            return m.group(1)+'"'+name+'"'
        if r.endswith('.ts'): r=r[:-3]+'.js'
        if not r.endswith('.js'): r=r+'.js' if (js/(r+'.js')).is_file() else r+'/index.js'
        return m.group(1)+'"'+module(r)+'"'
    s=re.sub(r'((?:from\s+|import\s*\(?\s*))(["\']\.[^"\']+["\'])', repl, s)
    imports[key]='data:text/javascript;base64,'+base64.b64encode(s.encode()).decode()
    return key

appmod=module('app.js'); runtime=module('runtime/index.js')
css=(root/'src/styles.css').read_text().replace("@import './scrollbars.css';",'')
storage="""<script>
const local=new Map();
Object.defineProperty(window,'localStorage',{value:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k),clear:()=>local.clear(),key:i=>Array.from(local.keys())[i]??null,get length(){return local.size}}});
Object.defineProperty(window,'sessionStorage',{value:localStorage});
const records=new Map();
const mockDB={createObjectStore(){},close(){},transaction(){const tx={};tx.objectStore=()=>({get(k){const q={result:records.get(k)};setTimeout(()=>q.onsuccess?.(),0);return q},put(v,k){records.set(k,structuredClone(v));const q={};setTimeout(()=>{q.onsuccess?.();tx.oncomplete?.()},0);return q}});return tx;}};
Object.defineProperty(window,'indexedDB',{value:{open(){const r={result:mockDB};setTimeout(()=>r.onsuccess?.(),0);return r}}});
</script>"""

assets={
    'green-library': (root/'docs/readme-fixtures/source/green-library.png').read_bytes(),
    'green-magic': (root/'docs/readme-fixtures/source/green-magic.png').read_bytes(),
    'homura-circle': (root/'docs/readme-fixtures/source/homura-circle.png').read_bytes(),
    'homura-flowers': (root/'docs/readme-fixtures/source/homura-flowers.png').read_bytes(),
    'homura-gallery': (root/'docs/readme-fixtures/source/homura-gallery.png').read_bytes(),
    'desk-guy': (root/'docs/readme-fixtures/source/desk-guy.png').read_bytes(),
    'green-screen-guy': (root/'docs/readme-fixtures/source/green-screen-guy.png').read_bytes(),
    'cutout-guy': (root/'docs/readme-fixtures/source/cutout-guy.png').read_bytes(),
    'blush-guy': (root/'docs/readme-fixtures/source/blush-guy.png').read_bytes(),
    'cat': (root/'docs/readme-fixtures/source/cat.png').read_bytes(),
}
files_js={name:'data:image/png;base64,'+base64.b64encode(data).decode() for name,data in assets.items()}

script=f'''
import {{ StudioApp }} from {json.dumps(appmod)};
import {{ runtime }} from {json.dumps(runtime)};
window.files={json.dumps(files_js)};
window.calls=[];
runtime.postJson=async (url, body)=>{{
  if(url.endsWith('GetNewSession')) return {{ session_id:'mock-session' }};
  if(url.endsWith('InterruptAll')) return {{}};
  if(url.endsWith('ComfyListWorkflows')) return {{ workflows:[{{name:'Saved/cutout'}}] }};
  if(url.endsWith('ComfyReadWorkflow')) return {{ result: {{ custom_params: JSON.stringify({{source:{{id:'comfyrawworkflowinputimage0',type:'image',name:'Source'}}}}) }} }};
  return {{}};
}};
runtime.getText=async ()=>JSON.stringify({{
  SwarmLoadImageB64: {{}}, SwarmSaveImageWS: {{}},
  LoadBackgroundRemovalModel: {{ input: {{ required: {{ bg_removal_name:['COMBO', {{ options:['birefnet.safetensors'] }}] }} }} }},
  RemoveBackground: {{}}, InvertMask: {{}}, JoinImageWithAlpha: {{}},
  UpscaleModelLoader: {{ input: {{ required: {{ model_name:[['detail.pth']] }} }} }}
}});
runtime.fetchDataUrl=async (url)=>{{
  const key=String(url).split('/').pop()?.split('?')[0].replace(/\.png$/,'');
  if(!files[key]) throw new Error('Unknown fixture image '+url);
  return files[key];
}};
const picture=(width,height,accent='#8b7cff')=>{{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  const g=ctx.createLinearGradient(0,0,width,height);g.addColorStop(0,'#182033');g.addColorStop(1,accent);ctx.fillStyle=g;ctx.fillRect(0,0,width,height);ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.ellipse(width*0.5,height*0.48,width*0.23,height*0.28,0,0,Math.PI*2);ctx.fill();return canvas.toDataURL('image/png');
}};
runtime.streamJson=async (url,request,count,emit)=>{{
  const name='render-'+(Object.keys(files).length+1);files[name]=picture(request.width||768,request.height||1024, '#5b9dff');emit({{image:{{image:'Output/'+name+'.png',seed:42}}}});
}};
window.app=new StudioApp(document.querySelector('#app'));
app.connected=true;app.libraryAutoSyncStarted=true;
app.swarmImageAttributes=((original)=>url=>{{const key=String(url).split('/').pop()?.split('?')[0].replace(/\.png$/,'');return original(files[key]||url);}})(app.swarmImageAttributes.bind(app));
app.models=[{{name:'animaPortrait.safetensors',architecture:'sdxl'}},{{name:'animeBase.safetensors',architecture:'sd15'}}];
app.store.updateDraft({{model:'animaPortrait.safetensors',prompt:'Painterly anime portrait lighting, rich details',negativePrompt:'low quality, text',width:832,height:1216,steps:32,guidance:6.5,sampler:'dpmpp_2m',scheduler:'karras'}});
const add=(name,opts={{}})=>app.store.addOutput({{
  url:'Output/'+name+'.png',swarmPath:'Output/'+name+'.png',swarmSourcePath:name+'.png',
  model:opts.model||'animaPortrait.safetensors',prompt:opts.prompt||'Painterly anime portrait',sentPrompt:opts.sentPrompt||opts.prompt||'Painterly anime portrait',negativePrompt:opts.negativePrompt||'low quality, text',
  width:opts.width||832,height:opts.height||1216,seed:opts.seed||1,metadata:'',request:opts.request||{{sampler:'dpmpp_2m',scheduler:'karras',loras:['cinematic.safetensors'],loraweights:['0.75']}},loras:opts.loras||[],presets:opts.presets||[]
}});
const folderArt=app.store.createFolder('Art studies');
const folderChars=app.store.createFolder('Characters');
const folderCutouts=app.store.createFolder('Cutouts');
const ids={{
  greenLibrary:add('green-library',{{prompt:'reading by the window, sunlit library, soft painterly anime illustration',width:1088,height:832,seed:410}}).id,
  greenMagic:add('green-magic',{{prompt:'forest shrine, glowing crystal, painterly fantasy anime illustration',width:1440,height:1120,seed:411}}).id,
  homuraCircle:add('homura-circle',{{prompt:'dramatic mirrored composition, magical girls and crimson lilies',width:1440,height:1120,seed:412}}).id,
  homuraFlowers:add('homura-flowers',{{prompt:'fallen magical girl among red flowers, dramatic surreal lighting',width:1440,height:1120,seed:413}}).id,
  deskGuy:add('desk-guy',{{prompt:'moody desk portrait, leather jacket, home workstation',width:1152,height:896,seed:414}}).id,
  greenScreenGuy:add('green-screen-guy',{{prompt:'cowboy shot, simple shirt, chroma background',width:1056,height:1888,seed:415}}).id,
  cutoutGuy:add('cutout-guy',{{prompt:'clean cutout preview, transparent asset',width:1056,height:1888,seed:416}}).id,
  blushGuy:add('blush-guy',{{prompt:'tech room portrait, stylized cel-shaded illustration',width:1664,height:1280,seed:417}}).id,
  cat:add('cat',{{prompt:'wide-eyed white cat portrait',width:576,height:384,seed:418}}).id,
}};
app.store.updateOutput(ids.greenLibrary,{{folderId:folderArt.id,favorite:true}});
app.store.updateOutput(ids.greenMagic,{{folderId:folderArt.id}});
app.store.updateOutput(ids.homuraCircle,{{folderId:folderArt.id}});
app.store.updateOutput(ids.homuraFlowers,{{folderId:folderArt.id}});
app.store.updateOutput(ids.deskGuy,{{folderId:folderChars.id}});
app.store.updateOutput(ids.greenScreenGuy,{{folderId:folderChars.id}});
app.store.updateOutput(ids.cutoutGuy,{{folderId:folderCutouts.id,favorite:true}});
app.store.updateOutput(ids.blushGuy,{{folderId:folderChars.id}});
app.store.updateOutput(ids.cat,{{folderId:folderArt.id}});
window.ids=ids;
window.ready=true;
'''
html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style>'+storage+'<script type="importmap">'+json.dumps({'imports':imports})+'</script></head><body><div id="app"></div><script type="module">'+script+'</script></body></html>'

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('STUDIO_TEST_CHROMIUM') or None,args=['--no-sandbox'] if os.environ.get('STUDIO_TEST_CHROMIUM') else [],headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(html)
    page.wait_for_function('window.ready && app.root')
    page.wait_for_timeout(300)

    # Create workspace hero
    page.evaluate("""()=>{app.navigateToView('create');app.store.updateUi({selectedOutputId: window.ids.greenLibrary});app.render();} """)
    page.wait_for_timeout(500)
    page.screenshot(path=str(shots/'create-workspace.png'))

    # Library screenshot
    page.evaluate("""()=>{app.navigateToView('library');app.store.updateUi({libraryFolder:'all',selectedOutputId:''});app.render();} """)
    page.wait_for_timeout(700)
    page.screenshot(path=str(shots/'library-workspace.png'))

    # Inspect screenshot
    page.evaluate("""()=>{app.navigateToView('library');app.store.updateUi({selectedOutputId: window.ids.homuraFlowers});app.render();} """)
    page.wait_for_timeout(700)
    page.screenshot(path=str(shots/'inspect-workspace.png'))

    # Editing screenshot
    page.evaluate("""()=>{app.openOutputInEditor(window.ids.greenScreenGuy); }""")
    page.wait_for_function('app.imageEditor?.source?.id===window.ids.greenScreenGuy && !app.imageEditor.busy')
    page.wait_for_timeout(700)
    page.screenshot(path=str(shots/'editing-workspace.png'))

    # Finalize screenshot
    page.evaluate("""()=>{app.openOutputInFinalize(window.ids.deskGuy);} """)
    page.wait_for_function('app.view==="finalize" && app.finalizeWorkspace?.source?.id===window.ids.deskGuy')
    page.wait_for_timeout(700)
    page.screenshot(path=str(shots/'finalize-workspace.png'))

    assert not errors, errors
    browser.close()
