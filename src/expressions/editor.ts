import { editIcon, LIBRARY_ICON, IMPORT_ICON, DOWNLOAD_ICON } from '../editor/icons';
import { segmentationMask, textSegmentationParams } from '../editor/segmentation';
import type { SwarmGenerationRequest } from '../swarm/types';
import { tagStudioRequest, type StudioMetadata } from '../library/provenance';
import { normalizeRecipe, processingLabels, processingRequest, readProcessingImage, type ProcessingSource, type ProcessingStage } from './processing';
import { bindProcessingFields, escapeMarkup, resolveProcessing, type ProcessingChoices, type ProcessingHost } from './processing-ui';

export interface EditorImage extends ProcessingSource {
    name: string;
    studioMetadata?: StudioMetadata | null;
    id?: string;
    parentId?: string; // Original Library context for unsaved working pixels; never used as the image bytes.
    model?: string;
    seed?: number;
    prompt?: string;
    negativeprompt?: string;
    loras?: string[] | string; loraweights?: string[] | string; sampler?: string; scheduler?: string;
}

interface EditorHost extends ProcessingHost {
    busy(): boolean;
    checkpoint(): string;
    keepFinal?(): boolean;
    setKeepFinal?(enabled: boolean): void;
    browseLibrary(): void;
    inpaintBusy(): boolean;
    load(id: string): Promise<EditorImage>;
    generate(request: SwarmGenerationRequest, progress: (value: number) => void, stage?: ProcessingStage): Promise<EditorImage>;
    inpaint(source: EditorImage | null, selection?: EditorSelection): void;
    segment?(request:SwarmGenerationRequest,progress:(n:number)=>void,signal:AbortSignal):Promise<EditorImage>;
    finalize?(image:EditorImage):void;
    save(image: string, name: string): Promise<void>;
}

import { EDIT_MAX_PIXELS, EDIT_MAX_SIDE, editWand, editCombineSelection, editMorph, editFeather, editClearPixels, editDespill, editPushPixels, type EditSelectionMode } from '../editor/pixels';
export interface EditorSelection { width: number; height: number; mask: Uint8Array }
type EditTool = 'hand'|'smart'|'wand'|'lasso'|'rectangle'|'brush'|'erase'|'liquify'|'crop'|'despill'|'inpaint'|'upscale'|'background';
interface Snapshot { pixels: ImageData; source: EditorImage; dirty: boolean }
const TOOL_KEYS:Record<EditTool,string>={hand:"H",smart:"S",wand:"W",lasso:"L",rectangle:"R",brush:"B",erase:"E",liquify:"Q",crop:"C",despill:"D",inpaint:"I",upscale:"U",background:"G"};
const EDIT_TOOLS: [EditTool,string][]=[["hand","Pan"],["wand","Magic wand"],["smart","Smart Selection"],["lasso","Lasso"],["rectangle","Rectangle"],["brush","Brush"],["erase","Eraser"],["liquify","Liquify · Push"],["crop","Crop & transform"],["despill","Despill"],["inpaint","Inpaint"],["upscale","AI Upscale"],["background","Remove background"]]

export class ImageEditor {
  private root:HTMLElement
  private bridge:EditorHost
  private canvas:HTMLCanvasElement
  private overlay:HTMLCanvasElement
  private viewport:HTMLElement
  private surface:HTMLElement
  private controls:HTMLElement
  private status:HTMLElement
  private title:HTMLElement
  private meta:HTMLElement
  private mask:Uint8Array=new Uint8Array(0)
  private selectionPast:Uint8Array[]=[]
  private selectionFuture:Uint8Array[]=[]
  private cursor:HTMLElement
  private cursorTimer:number|undefined
  private paintColor="#ffffff"
  private warpStrength=45
  private brushTools(){return ["brush","erase","liquify"].includes(this.tool)}
  private hideCursor=()=>{window.clearTimeout(this.cursorTimer);this.cursor.hidden=true}
  private showCursor(p:{x:number;y:number}){
    if(!this.source||this.locked()||!this.brushTools())return
    window.clearTimeout(this.cursorTimer)
    this.cursor.style.left=`${(p.x+.5)/this.canvas.width*100}%`;this.cursor.style.top=`${(p.y+.5)/this.canvas.height*100}%`
    this.cursor.style.width=`${this.brush/this.canvas.width*100}%`;this.cursor.hidden=false
  }
  private previewBrush(){
    const a=this.overlay.getBoundingClientRect(),b=this.viewport.getBoundingClientRect()
    if(!a.width||!a.height)return
    const x=(Math.max(a.left,b.left)+Math.min(a.right,b.right))/2,y=(Math.max(a.top,b.top)+Math.min(a.bottom,b.bottom))/2
    this.showCursor({x:(x-a.left)*this.canvas.width/a.width,y:(y-a.top)*this.canvas.height/a.height})
    this.cursorTimer=window.setTimeout(this.hideCursor,850)
  }
  private resetSelectionHistory(){this.selectionPast=[];this.selectionFuture=[]}
  private trimSelections(stack:Uint8Array[]){let bytes=stack.reduce((n,m)=>n+m.byteLength,0);while(stack.length>1&&(bytes>32*1024*1024||stack.length>12))bytes-=stack.shift()!.byteLength}
  private select(next:Uint8Array){if(next.every((v,i)=>v===this.mask[i]))return;this.selectionPast.push(this.mask);this.trimSelections(this.selectionPast);this.selectionFuture=[];this.mask=next}
  private selectionHistory(redo:boolean){const from=redo?this.selectionFuture:this.selectionPast,to=redo?this.selectionPast:this.selectionFuture;const mask=from.pop();if(!mask)return;to.push(this.mask);this.trimSelections(to);this.mask=mask;this.drawSelection();this.sync();this.say(redo?"Selection redone":"Selection undone")}

  private past:Snapshot[]=[]
  private future:Snapshot[]=[]
  private source:EditorImage|null=null
  private tool:EditTool="wand"
  private mode:EditSelectionMode="replace"
  private tolerance=24
  private contiguous=true
  private feather=0
  private spill=70
  private channel:"green"|"blue"="green"
  private brush=24
  private zoom=1
  private fit=true
  private dirty=false
  private working=false
  private smartEngine:"foreground"|"text"|"workflow"="text";
  private smartTarget="hair";
  private smartThreshold=50;
  private smartRecipe=normalizeRecipe({mode:'builtin'});
  private smartChoices:ProcessingChoices={};
  private smartFormat:'alpha'|'luminance'='alpha';
  private smartInvert=false;
  private smartController:AbortController|null=null;
  private inpaintActive=false
  private recipes={refine:normalizeRecipe({mode:'builtin'}),background:normalizeRecipe({mode:'builtin'})};
  private choices:Record<ProcessingStage,ProcessingChoices>={refine:{},background:{}};
  get busy(){return this.working}
  get referencedOutputIds():string[]{return [...new Set([this.source?.id,this.source?.parentId,...this.past.flatMap(x=>[x.source.id,x.source.parentId]),...this.future.flatMap(x=>[x.source.id,x.source.parentId])].filter((id):id is string=>Boolean(id)))]}

  private revision=0
  private observer:ResizeObserver
  private pointer:{id:number;start:{x:number;y:number};last:{x:number;y:number};points:{x:number;y:number}[];scrollX:number;scrollY:number;clientX:number;clientY:number;mutated:boolean}|null=null
  constructor(bridge:EditorHost){
    const root=document.createElement("div");this.root=root;this.bridge=bridge
    root.classList.add("ss-edit-workspace")
    root.innerHTML=`<header class="ss-edit-header"><span class="ss-edit-mark">${editIcon("wand")}</span><div class="ss-edit-heading"><strong data-edit="title">Editing</strong><small data-edit="meta">Local pixel tools · No GPU required</small></div><div class="ss-edit-header-actions"><button class="ss-button" data-edit="pick" aria-label="Choose library image" title="Library">${LIBRARY_ICON}<span>Library</span></button><button class="ss-button" data-edit="upload" aria-label="Upload image" title="Upload">${IMPORT_ICON}<span>Upload</span></button><input type="file" accept="image/png,image/jpeg,image/webp" data-edit="file" hidden><button class="ss-icon-button" data-edit="undo" title="Undo pixels (Ctrl/Cmd+Z)" aria-label="Undo">${editIcon("undo")}</button><button class="ss-icon-button" data-edit="redo" title="Redo pixels (Ctrl/Cmd+Shift+Z)" aria-label="Redo">${editIcon("redo")}</button><button class="ss-icon-button ss-edit-help-button" data-edit="help" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">${editIcon("help")}</button></div></header><div class="ss-edit-body"><nav class="ss-edit-rail" aria-label="Editing tools">${EDIT_TOOLS.map(([key,label],i)=>`${["brush","crop","inpaint"].includes(key)?'<span class="ss-edit-separator" aria-hidden="true"></span>':''}<button type="button" class="ss-icon-button" data-tool="${key}" title="${label} (${TOOL_KEYS[key]})" aria-label="${label}" aria-keyshortcuts="${TOOL_KEYS[key]}" aria-pressed="${key===this.tool}">${editIcon(key)}</button>`).join("")}</nav><section class="ss-edit-center"><div class="ss-edit-viewport" data-background="checker"><div class="ss-edit-empty"><span>${editIcon("wand")}</span><h2>Open an image</h2><p>Open artwork from the Library or upload an image.</p><button class="ss-button ss-button-primary" data-edit="pick">${LIBRARY_ICON} Choose image</button></div><div class="ss-edit-surface" hidden><canvas data-edit="canvas" aria-label="Working image"></canvas><canvas data-edit="overlay" aria-label="Image selection and editing canvas" tabindex="0"></canvas><span class="ss-edit-brush-cursor" data-edit="brush-cursor" aria-hidden="true" hidden></span></div></div><div class="ss-edit-canvasbar"><button class="ss-button" data-edit="fit">Fit</button><button class="ss-icon-button" data-edit="zoom-out" aria-label="Zoom out">−</button><span data-edit="zoom">100%</span><button class="ss-icon-button" data-edit="zoom-in" aria-label="Zoom in">+</button><span class="ss-edit-spacer"></span><span class="ss-edit-swatch-label">Preview</span>${["checker","black","white"].map(key=>`<button class="ss-edit-swatch" data-bg="${key}" aria-label="${key} preview" aria-pressed="${key==="checker"}"></button>`).join("")}<input type="color" value="#805aaf" data-edit="custom-bg" aria-label="Custom preview background"></div></section><aside class="ss-edit-controls"></aside></div><section class="ss-edit-inpaint" hidden><div class="ss-edit-inpaint-bar"><button class="ss-button ss-edit-back" data-edit="close-inpaint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M19 12H5m6-6-6 6 6 6"/></svg>Editing</button><span class="ss-edit-breadcrumb">/</span><strong>Inpaint</strong><small>Mask-based edit</small></div><div data-editor-inpaint-slot></div></section><footer class="ss-edit-footer"><div class="ss-edit-foot-text"><strong data-edit="status" role="status">Choose an image to begin.</strong><small data-edit="target">Original artwork stays untouched.</small></div><div class="ss-edit-footer-actions"><button class="ss-button" data-edit="finalize" title="Send working image to Finalize">${editIcon("wand")}<span>Finalize</span></button><button class="ss-button" data-edit="download">${DOWNLOAD_ICON}<span>Export PNG</span></button></div></footer><dialog class="ss-edit-shortcuts" data-edit="shortcuts" aria-label="Editing keyboard shortcuts"><header><div><small>EDITING</small><h2>Keyboard shortcuts</h2></div><button class="ss-icon-button" data-edit="close-help" aria-label="Close shortcuts">×</button></header><div class="ss-edit-shortcut-list"><section><h3>Tools</h3>${EDIT_TOOLS.map(([key,label])=>`<div><span>${label}</span><kbd>${TOOL_KEYS[key]}</kbd></div>`).join("")}</section><section><h3>Canvas & selection</h3>${[["Undo pixels","Ctrl/Cmd + Z"],["Redo pixels","Ctrl/Cmd + Shift + Z / Y"],["Undo selection","Ctrl/Cmd + Alt + Z"],["Redo selection","Ctrl/Cmd + Alt + Shift + Z"],["Select all","Ctrl/Cmd + A"],["Deselect","Ctrl/Cmd + D / Esc"],["Invert selection","Ctrl/Cmd + Shift + I"],["Clear selected pixels","Delete"],["Brush size","[ / ]"],["Fit canvas","0"],["Zoom","+ / −"],["Export PNG","Ctrl/Cmd + S"]].map(([label,key])=>`<div><span>${label}</span><kbd>${key}</kbd></div>`).join("")}</section></div></dialog>`
    const get=<T extends HTMLElement>(key:string)=>root.querySelector<T>(`[data-edit="${key}"]`)!
    this.cursor=get<HTMLElement>("brush-cursor");this.canvas=get<HTMLCanvasElement>("canvas");this.overlay=get<HTMLCanvasElement>("overlay");this.viewport=root.querySelector(".ss-edit-viewport")!;this.surface=root.querySelector(".ss-edit-surface")!;this.controls=root.querySelector(".ss-edit-controls")!;this.status=get("status");this.title=get("title");this.meta=get("meta")
    this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(this.viewport)
    root.addEventListener("click",this.click)
    root.addEventListener("change",this.change)
    root.addEventListener("input",this.input)
    this.overlay.addEventListener("pointerdown",this.down);this.overlay.addEventListener("pointermove",this.move);this.overlay.addEventListener("pointerup",this.up);this.overlay.addEventListener("pointercancel",this.cancelPointer);this.overlay.addEventListener("lostpointercapture",this.cancelPointer)
    this.overlay.addEventListener("pointerleave",this.hideCursor);this.viewport.addEventListener("scroll",this.hideCursor,{passive:true});
    root.addEventListener("keydown",this.handleKeydown)
    this.renderControls();this.sync()
  }
  mount(host:HTMLElement,panel:HTMLElement|null){
    if(this.root.parentElement!==host)host.append(this.root);
    const slot=this.root.querySelector<HTMLElement>('[data-editor-inpaint-slot]')!;
    slot.replaceChildren();if(panel&&this.inpaintActive)slot.append(panel);else panel?.remove();
    this.root.querySelector<HTMLElement>('.ss-edit-inpaint')!.hidden=!this.inpaintActive;
    this.root.querySelector<HTMLElement>('.ss-edit-body')!.hidden=this.inpaintActive;
    this.layout();this.renderControls();this.sync();
  }
  async loadOutput(id:string,inpaint=false){if(!id||this.busy||this.bridge.inpaintBusy())return;await this.open(()=>this.bridge.load(id),inpaint)}
  private locked(){return this.busy||this.inpaintActive||this.bridge.inpaintBusy()}

  private ctx(){return this.canvas.getContext("2d",{willReadFrequently:true})!}
  private read(){return this.ctx().getImageData(0,0,this.canvas.width,this.canvas.height)}
  private say(message:string,error=false){this.status.textContent=message;this.status.dataset.error=String(error)}
  private report=(error:unknown)=>{this.say(error instanceof Error?error.message:String(error),true)}
  private sync(){
    const loaded=Boolean(this.source),selected=this.mask.some(v=>v>0)
    this.root.querySelectorAll<HTMLButtonElement>("button[data-tool], [data-edit='undo'],[data-edit='redo'],[data-edit='download'],[data-edit='finalize'],[data-edit='save'],[data-edit='replace'],[data-edit='fit'],[data-edit='zoom-in'],[data-edit='zoom-out'],[data-op]").forEach(b=>{const k=b.dataset.edit,op=b.dataset.op;b.disabled=!loaded||this.locked()||(op==="selection-undo"&&!this.selectionPast.length)||(op==="selection-redo"&&!this.selectionFuture.length)||(k==="undo"&&!this.past.length)||(k==="redo"&&!this.future.length)||(op!==undefined&&["clear","grow","shrink","feather","deselect","crop"].includes(op)&&!selected)})
    this.root.querySelectorAll<HTMLButtonElement>('[data-edit="pick"],[data-edit="upload"]').forEach(b=>b.disabled=this.locked())
    const cancel=this.controls.querySelector<HTMLButtonElement>('[data-edit="cancel-smart"]');if(cancel){cancel.hidden=!this.smartController;cancel.disabled=!this.smartController||this.smartController.signal.aborted;}
    const selectionState=this.controls.querySelector<HTMLElement>('[data-edit="selection-state"]');if(selectionState)selectionState.textContent=selected?"Active":"None";
    this.root.querySelectorAll<HTMLElement>("button[data-tool]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.tool===this.tool)))
    this.root.querySelector<HTMLButtonElement>('[data-edit="close-inpaint"]')!.disabled=this.bridge.inpaintBusy();this.root.dataset.editBusy=String(this.busy);this.root.dataset.editDirty=String(this.dirty)
    this.root.querySelector<HTMLElement>('[data-edit="zoom"]')!.textContent=`${Math.round(this.zoom*100)}%`
    if(loaded)this.meta.textContent=`${this.canvas.width} × ${this.canvas.height} · PNG · ${this.dirty?"Unsaved changes":"Alpha"}`
  }
  private async decode(image:EditorImage):Promise<HTMLImageElement>{
    const bitmap=new Image();bitmap.src=image.image;await bitmap.decode();
    const w=bitmap.naturalWidth,h=bitmap.naturalHeight;
    if(!w||!h||w*h>EDIT_MAX_PIXELS||Math.max(w,h)>EDIT_MAX_SIDE)throw new Error("Local editor supports up to 16 megapixels and 8192px per side. The original was not resized.");return bitmap;
  }
  private resetMask(){this.mask=new Uint8Array(this.canvas.width*this.canvas.height);this.resetSelectionHistory()}
  private setPixels(image:ImageData){const resized=image.width!==this.canvas.width||image.height!==this.canvas.height;this.canvas.width=image.width;this.canvas.height=image.height;this.overlay.width=image.width;this.overlay.height=image.height;this.ctx().putImageData(image,0,0);if(resized)this.resetMask();this.layout();this.drawSelection()}
  private async open(load:()=>Promise<EditorImage>,inpaint=false){
    if(this.busy||this.bridge.inpaintBusy())return;
    if((this.dirty||this.inpaintActive)&&!window.confirm("Discard unsaved edits or the open mask session and open another image?"))return;
    this.working=true;this.sync();this.say("Reading original artwork…");let opened=false;
    try{const image=await load(),bitmap=await this.decode(image);this.canvas.width=bitmap.naturalWidth;this.canvas.height=bitmap.naturalHeight;this.overlay.width=this.canvas.width;this.overlay.height=this.canvas.height;this.ctx().drawImage(bitmap,0,0);this.source=image;this.resetMask();this.past=[];this.future=[];this.hideCursor();this.dirty=false;this.title.textContent=image.name;this.surface.hidden=false;this.root.querySelector<HTMLElement>(".ss-edit-empty")!.hidden=true;this.fit=true;this.tool=inpaint?"inpaint":"hand";this.inpaintActive=false;this.layout();this.drawSelection();this.say("Ready · select a tool");opened=true}
    catch(error){this.report(error)}finally{this.working=false;this.renderControls();this.sync()}
    if(opened){if(inpaint)await this.gpu();else this.bridge.inpaint(null)}
  }
  private layout(){if(!this.source)return;const w=this.canvas.width,h=this.canvas.height;if(this.fit){const vw=this.viewport.clientWidth,vh=this.viewport.clientHeight;if(vw>0&&vh>0)this.zoom=Math.min(1,Math.max(.02,Math.min((vw-28)/w,(vh-28)/h)))}this.surface.style.width=`${w*this.zoom}px`;this.surface.style.height=`${h*this.zoom}px`;this.root.querySelector<HTMLElement>('[data-edit="zoom"]')!.textContent=`${Math.round(this.zoom*100)}%`}
  private snapshot(){this.past.push({pixels:this.read(),source:this.source!,dirty:this.dirty});this.future=[];let bytes=this.past.reduce((n,i)=>n+i.pixels.data.byteLength,0);while(this.past.length>1&&(bytes>96*1024*1024||this.past.length>16))bytes-=this.past.shift()!.pixels.data.byteLength}
  private changed(){this.revision++;this.dirty=true;this.drawSelection();this.sync()}
  private drawSelection(){const ctx=this.overlay.getContext("2d")!;ctx.clearRect(0,0,this.overlay.width,this.overlay.height);if(!this.mask.some(v=>v>0))return;const w=this.canvas.width,h=this.canvas.height,im=ctx.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!this.mask[i])continue;const p=i*4,edge=x===0||y===0||x===w-1||y===h-1||!this.mask[i-1]||!this.mask[i+1]||!this.mask[i-w]||!this.mask[i+w];if(edge){const c=(Math.floor((x+y)/4)%2)*255;im.data[p]=im.data[p+1]=im.data[p+2]=c;im.data[p+3]=255}else{im.data[p]=154;im.data[p+1]=145;im.data[p+2]=255;im.data[p+3]=Math.round(this.mask[i]!*.16)}}ctx.putImageData(im,0,0)}
  private xy(e:PointerEvent){const r=this.overlay.getBoundingClientRect();return{x:Math.min(this.canvas.width-1,Math.max(0,Math.floor((e.clientX-r.left)*this.canvas.width/r.width))),y:Math.min(this.canvas.height-1,Math.max(0,Math.floor((e.clientY-r.top)*this.canvas.height/r.height)))}}
  private down=(e:PointerEvent)=>{if(!this.source||this.locked()||this.pointer||e.button!==0||!["hand","wand","lasso","rectangle","brush","erase","liquify","crop"].includes(this.tool))return;e.preventDefault();const p=this.xy(e);this.overlay.focus({preventScroll:true});if(this.tool==="wand"){this.select(editCombineSelection(this.mask,editWand(this.read().data,this.canvas.width,this.canvas.height,p.x,p.y,this.tolerance,this.contiguous),e.shiftKey?"add":e.altKey?"subtract":this.mode));this.drawSelection();this.sync();this.say("Selection ready · clear, refine or crop");return}this.pointer={id:e.pointerId,start:p,last:p,points:[p],scrollX:this.viewport.scrollLeft,scrollY:this.viewport.scrollTop,clientX:e.clientX,clientY:e.clientY,mutated:false};this.overlay.focus({preventScroll:true});this.overlay.setPointerCapture(e.pointerId);if(this.brushTools()){this.showCursor(p);if(this.tool!=="liquify"){this.snapshot();this.pointer.mutated=true;this.stroke(p,p)}} }
  private stroke(a:{x:number;y:number},b:{x:number;y:number}){const ctx=this.ctx();ctx.save();ctx.globalCompositeOperation=this.tool==="erase"?"destination-out":"source-over";ctx.strokeStyle=this.paintColor;ctx.lineWidth=this.brush;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x+.01,b.y+.01);ctx.stroke();ctx.restore()}
  private warp(a:{x:number;y:number},b:{x:number;y:number}){
    const r=Math.max(1,this.brush/2),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(!d)return
    // Limit each stamp and subdivide long pointer moves; local reads only.
    const steps=Math.min(64,Math.max(1,Math.ceil(d/Math.max(1,r/3))))
    const ctx=this.ctx(),w=this.canvas.width,h=this.canvas.height
    for(let i=1;i<=steps;i++){
      const x=a.x+dx*i/steps,y=a.y+dy*i/steps,margin=Math.ceil(r*1.5)+2
      const left=Math.max(0,Math.floor(x-margin)),top=Math.max(0,Math.floor(y-margin)),right=Math.min(w,Math.ceil(x+margin)),bottom=Math.min(h,Math.ceil(y+margin))
      if(right<=left||bottom<=top)continue
      const im=ctx.getImageData(left,top,right-left,bottom-top)
      editPushPixels(im.data,im.width,im.height,x-left,y-top,dx/steps,dy/steps,r,this.warpStrength/100)
      ctx.putImageData(im,left,top)
    }
  }
  private move=(e:PointerEvent)=>{if(!this.source||this.locked())return;const next=this.xy(e);if(this.brushTools())this.showCursor(next);const p=this.pointer;if(!p||p.id!==e.pointerId)return;if(this.tool==="hand"){this.viewport.scrollLeft=p.scrollX+p.clientX-e.clientX;this.viewport.scrollTop=p.scrollY+p.clientY-e.clientY;return}if(this.brushTools()){if(this.tool==="liquify"){if(next.x!==p.last.x||next.y!==p.last.y){if(!p.mutated){this.snapshot();p.mutated=true}this.warp(p.last,next)}}else this.stroke(p.last,next);p.last=next;return}p.points.push(next);p.last=next;this.drawSelection();const ctx=this.overlay.getContext("2d")!;ctx.save();ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(1,1/this.zoom);ctx.setLineDash([5/this.zoom,4/this.zoom]);ctx.beginPath();if(this.tool==="lasso"){ctx.moveTo(p.start.x,p.start.y);for(const v of p.points)ctx.lineTo(v.x,v.y)}else ctx.rect(p.start.x,p.start.y,next.x-p.start.x,next.y-p.start.y);ctx.stroke();ctx.restore()}
  private up=(e:PointerEvent)=>{const p=this.pointer;if(!p||p.id!==e.pointerId)return;this.pointer=null;const end=this.xy(e);if(this.brushTools()){if(p.mutated)this.changed();if(e.pointerType==="touch")this.hideCursor();return}if(this.tool==="hand")return;const tmp=document.createElement("canvas");tmp.width=this.canvas.width;tmp.height=this.canvas.height;const c=tmp.getContext("2d")!;c.fillStyle="#fff";if(this.tool==="lasso"){c.beginPath();c.moveTo(p.start.x,p.start.y);for(const v of p.points)c.lineTo(v.x,v.y);c.lineTo(end.x,end.y);c.closePath();c.fill()}else c.fillRect(Math.min(p.start.x,end.x),Math.min(p.start.y,end.y),Math.abs(end.x-p.start.x)+1,Math.abs(end.y-p.start.y)+1);const data=c.getImageData(0,0,tmp.width,tmp.height).data,next=new Uint8Array(tmp.width*tmp.height);for(let i=0;i<next.length;i++)next[i]=data[i*4+3]!;this.select(editCombineSelection(this.mask,next,e.shiftKey?"add":e.altKey?"subtract":this.mode));tmp.width=tmp.height=1;this.drawSelection();this.sync()}
  private cancelPointer=(e:PointerEvent)=>{if(this.pointer?.id!==e.pointerId)return;const mutated=this.pointer.mutated;this.pointer=null;if(this.brushTools()&&mutated)this.changed();else this.drawSelection();this.hideCursor()}
  private range(label:string,key:string,value:number,min:number,max:number){return `<label class="ss-edit-range"><span>${label}<output data-value="${key}">${value}</output></span><input type="range" min="${min}" max="${max}" value="${value}" data-setting="${key}"></label>`}
  private op(key:string,label:string){return `<button type="button" class="ss-button ss-edit-commit" data-op="${key}">${label}</button>`}
  private selectionIcon(key:string,label:string,icon=key){return `<button type="button" class="ss-icon-button ss-edit-selection-icon" data-op="${key}" title="${label}" aria-label="${label}">${editIcon(icon)}</button>`}
  private chooseTool(tool:EditTool){if(this.pointer||this.locked())return;this.hideCursor();this.tool=tool;this.renderControls();this.controls.scrollTop=0}
  private openHelp(){const dialog=this.root.querySelector<HTMLDialogElement>('[data-edit="shortcuts"]');if(dialog&&!dialog.open)dialog.showModal()}
  private zoomBy(factor:number){this.fit=false;this.zoom=Math.max(.02,Math.min(8,this.zoom*factor));this.layout()}
  private renderControls(){const name=EDIT_TOOLS.find(t=>t[0]===this.tool)?.[1]||"Edit";let html=`<div class="ss-edit-tool-head"><span class="ss-edit-mark">${editIcon(this.tool)}</span><div><small>TOOL PROPERTIES</small><h3>${name}</h3></div><kbd>${TOOL_KEYS[this.tool]}</kbd></div>`
    if(["wand","lasso","rectangle"].includes(this.tool)){html+=`<p>${this.tool==="wand"?"Click a color to select matching pixels.":"Draw around the area to select."}</p><label>Selection mode<select data-setting="mode" class="ss-select">${["replace","add","subtract"].map(m=>`<option value="${m}" ${m===this.mode?"selected":""}>${m[0]!.toUpperCase()+m.slice(1)}</option>`).join("")}</select></label>${this.tool==="wand"?this.range("Tolerance","tolerance",this.tolerance,0,100)+`<label class="ss-edit-check"><input type="checkbox" data-setting="contiguous" ${this.contiguous?"checked":""}> Connected pixels only</label>`:""}<small>Shift adds · Alt subtracts</small>`}
    else if(this.tool==="smart")html+=`<p>Select objects by description or isolate the foreground without changing the artwork.</p><label>Segmentation engine<select class="ss-select" data-setting="smartEngine"><option value="text" ${this.smartEngine==='text'?'selected':''}>Text · CLIPSeg</option><option value="foreground" ${this.smartEngine==='foreground'?'selected':''}>Foreground · BiRefNet</option><option value="workflow" ${this.smartEngine==='workflow'?'selected':''}>Custom mask workflow</option></select></label>${this.smartEngine==='text'?`<label>Object description<input class="ss-select" data-setting="smartTarget" value="${escapeMarkup(this.smartTarget)}" maxlength="120" placeholder="e.g. hair, jacket, face"></label>${this.range('Detection threshold %','smartThreshold',this.smartThreshold,1,99)}<small>First use may download CLIPSeg on the backend.</small>`:this.smartEngine==='foreground'?'<small>Requires the installed BiRefNet workflow.</small>':'<div class="processing-fields" data-smart-recipe></div>'}${this.smartEngine!=='workflow'?'':`<label>Mask output<select class="ss-select" data-setting="smartFormat"><option value="alpha" ${this.smartFormat==='alpha'?'selected':''}>Alpha channel</option><option value="luminance" ${this.smartFormat==='luminance'?'selected':''}>Grayscale mask</option></select></label>`}<label>Selection mode<select class="ss-select" data-setting="mode">${['replace','add','subtract'].map(m=>`<option value="${m}" ${m===this.mode?'selected':''}>${m[0]!.toUpperCase()+m.slice(1)}</option>`).join('')}</select></label><label class="ss-edit-check"><input type="checkbox" data-setting="smartInvert" ${this.smartInvert?'checked':''}> Select background / invert mask</label>${this.op('segment','Run Smart Selection')}<button type="button" class="ss-button" data-edit="cancel-smart" ${this.smartController?'':'hidden'}>Cancel segmentation</button>`
    else if(this.tool==="erase"||this.tool==="brush"||this.tool==="liquify")html+=`<p>${this.tool==="erase"?"Brush away unwanted pixels to transparency.":this.tool==="brush"?"Paint directly on the working artwork.":"Drag gently to push pixels. Small strokes give the best control."} Undo restores your previous image.</p>${this.range("Brush size (px)","brush",this.brush,1,200)}${this.tool==="brush"?`<label>Paint color<input type="color" data-setting="paintColor" value="${this.paintColor}"></label>`:this.tool==="liquify"?this.range("Strength %","warp",this.warpStrength,1,100):""}`
    else if(this.tool==="crop")html+=`<p>Drag a rectangle on the artwork, then crop to the selected bounds.</p>${this.op("crop","Crop to selection")}<div class="ss-edit-pair">${this.op("rotate","Rotate 90°")}${this.op("flip","Flip horizontal")}</div>`
    else if(this.tool==="despill")html+=`<p>Reduce green or blue color spill without deleting hair edges. A selection limits the repair; otherwise only alpha edges are affected.</p><label>Spill color<select class="ss-select" data-setting="channel"><option value="green" ${this.channel==="green"?"selected":""}>Green</option><option value="blue" ${this.channel==="blue"?"selected":""}>Blue</option></select></label>${this.range("Strength %","spill",this.spill,0,100)}${this.op("despill","Apply despill")}`
    else if(this.tool==="hand")html+="<p>Drag to pan the canvas when zoomed. Fit brings the entire artwork back into view.</p>"
    else html+=`<p>${this.tool==="inpaint"?"Open the existing region mask and generation controls.":this.tool==="upscale"?"Use your existing AI enhancement workflow.":"Run the built-in BiRefNet background-removal graph."} Uses the current canvas pixels. Results return as editable copies.</p>${this.op("gpu",this.tool==="inpaint"?"Open region editor":this.tool==="upscale"?"Run upscale":"Remove background")}`
    if(["smart","wand","lasso","rectangle","crop","erase","despill"].includes(this.tool))html+=`<section class="ss-edit-selection"><header><h4>Selection</h4><span data-edit="selection-state">No selection</span></header><div class="ss-edit-selection-strip" role="toolbar" aria-label="Selection actions">${this.selectionIcon("selection-undo","Undo selection (Ctrl/Cmd+Alt+Z)","undo")}${this.selectionIcon("selection-redo","Redo selection (Ctrl/Cmd+Alt+Shift+Z)","redo")}<i></i>${this.selectionIcon("all","Select all (Ctrl/Cmd+A)")}${this.selectionIcon("invert","Invert selection (Ctrl/Cmd+Shift+I)")}${this.selectionIcon("deselect","Deselect (Ctrl/Cmd+D)")}</div><div class="ss-edit-property-row"><span>Adjust edges</span><div class="ss-edit-inline-actions">${this.selectionIcon("shrink","Shrink 1px")}${this.selectionIcon("grow","Grow 1px")}</div></div><div class="ss-edit-feather-row">${this.range("Feather (px)","feather",this.feather,0,12)}<button type="button" class="ss-button ss-edit-apply-small" data-op="feather">Apply</button></div><button type="button" class="ss-button ss-edit-clear-action" data-op="clear">${editIcon("erase")} Clear selected pixels <kbd>Del</kbd></button></section>`
    if(this.tool==="upscale"||this.tool==="background") html=html.replace('<button type="button" class="ss-button ss-edit-commit" data-op="gpu">','<div class="processing-fields" data-editor-recipe></div><label class="ss-edit-check"><input type="checkbox" data-setting="keepFinal" '+(this.bridge.keepFinal?.()?'checked':'')+'> Keep final only (Vacuum review)</label><button type="button" class="ss-button ss-edit-commit" data-op="gpu">');
    this.controls.innerHTML=html;this.overlay.dataset.tool=this.tool;
    const recipeRoot=this.controls.querySelector<HTMLElement>('[data-editor-recipe]');
    if(recipeRoot){const stage=this.tool==="upscale"?"refine":"background";bindProcessingFields(recipeRoot,this.bridge,stage,this.recipes[stage],recipe=>{this.recipes[stage]=recipe},this.choices[stage],false,this.locked())}
    const smartRoot=this.controls.querySelector<HTMLElement>('[data-smart-recipe]');
    if(smartRoot)bindProcessingFields(smartRoot,this.bridge,'background',this.smartRecipe,recipe=>{this.smartRecipe=recipe},this.smartChoices,false,this.locked(),true);
    this.controls.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-setting]').forEach(el=>{el.disabled=this.locked()});
    this.sync()
  }
  private input=(e:Event)=>{const el=e.target as HTMLInputElement;if(el.closest("[data-editor-inpaint-slot]"))return;const key=el.dataset.setting;if(key){const output=this.controls.querySelector<HTMLOutputElement>(`[data-value="${key}"]`);if(output)output.value=el.value;if(key==="smartTarget")this.smartTarget=el.value;if(key==="smartThreshold")this.smartThreshold=Number(el.value);if(key==="tolerance")this.tolerance=Number(el.value);if(key==="brush"){this.brush=Number(el.value);this.previewBrush()}if(key==="paintColor")this.paintColor=el.value;if(key==="warp")this.warpStrength=Number(el.value);if(key==="feather")this.feather=Number(el.value);if(key==="spill")this.spill=Number(el.value)}if(el.dataset.edit==="custom-bg"){this.viewport.dataset.background="custom";this.viewport.style.setProperty("--ss-edit-custom",el.value);this.root.querySelectorAll("[data-bg]").forEach(b=>b.setAttribute("aria-pressed","false"))}}
  private change=(e:Event)=>{const el=e.target as HTMLInputElement;if(el.closest("[data-editor-inpaint-slot]"))return;if(el.dataset.setting==="smartEngine"){this.smartEngine=el.value as typeof this.smartEngine;if(this.smartEngine==="workflow"&&this.smartRecipe.mode==="builtin")this.smartRecipe=normalizeRecipe({mode:"saved"});this.renderControls();return}if(el.dataset.setting==="smartFormat")this.smartFormat=el.value==="luminance"?"luminance":"alpha";if(el.dataset.setting==="smartInvert")this.smartInvert=el.checked;if(el.dataset.setting==="keepFinal")this.bridge.setKeepFinal?.(el.checked);if(el.dataset.setting==="channel")this.channel=el.value==="blue"?"blue":"green";if(el.dataset.setting==="mode")this.mode=el.value as EditSelectionMode;if(el.dataset.setting==="contiguous")this.contiguous=el.checked;if(el.dataset.edit==="file"){const file=el.files?.[0];el.value="";if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>50*1024*1024){this.say("Choose PNG, JPEG or WebP below 50 MB.",true);return}void this.open(async()=>{const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read image"));reader.readAsDataURL(file)});return {...await readProcessingImage(data),name:file.name}})}}
  private click=(e:Event)=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>("button");if(!b||b.disabled||this.pointer||b.closest("[data-editor-inpaint-slot]"))return;const tool=b.dataset.tool as EditTool;if(tool){this.chooseTool(tool);return}if(b.dataset.bg){this.viewport.dataset.background=b.dataset.bg;this.root.querySelectorAll("[data-bg]").forEach(el=>el.setAttribute("aria-pressed",String(el===b)));return}if(b.dataset.op){void this.operation(b.dataset.op).catch(this.report);return}switch(b.dataset.edit){case"pick":this.bridge.browseLibrary();break;case"upload":this.root.querySelector<HTMLInputElement>('[data-edit="file"]')!.click();break;case"fit":this.fit=true;this.layout();break;case"zoom-in":case"zoom-out":this.zoomBy(b.dataset.edit==="zoom-in"?1.25:.8);break;case"undo":case"redo":this.history(b.dataset.edit);break;case"close-inpaint":this.inpaintActive=false;this.bridge.inpaint(null);this.sync();break;case"cancel-smart":this.smartController?.abort();this.say("Cancelling segmentation…");this.sync();break;case"finalize":if(this.source&&!this.locked())this.bridge.finalize?.(this.workingImage());break;case"download":void this.download().catch(this.report);break;case"help":this.openHelp();break;case"close-help":this.root.querySelector<HTMLDialogElement>('[data-edit="shortcuts"]')?.close();break;}}
  handleKeydown=(e:KeyboardEvent):boolean=>{
    if(e.defaultPrevented||e.isComposing||this.pointer||this.locked()||!this.root.isConnected||this.root.querySelector("dialog[open]")||document.querySelector("dialog[open], [role='dialog'][aria-modal='true']"))return false;
    const target=e.target instanceof Element?e.target:null;
    if(target?.closest("input,select,textarea,[contenteditable]:not([contenteditable='false'])"))return false;
    const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
    let action:(()=>void)|undefined;
    const op=(name:string)=>()=>{void this.operation(name).catch(this.report)};
    if(!mod&&!e.altKey&&key==="?")action=()=>this.openHelp();
    else if(!this.source)return false;
    else if(mod&&key==="z")action=e.altKey?()=>this.selectionHistory(e.shiftKey):()=>this.history(e.shiftKey?"redo":"undo");
    else if(mod&&!e.altKey&&key==="y")action=()=>this.history("redo");
    else if(mod&&!e.altKey&&!e.shiftKey&&key==="a")action=op("all");
    else if(mod&&!e.altKey&&!e.shiftKey&&key==="d")action=op("deselect");
    else if(mod&&!e.altKey&&e.shiftKey&&key==="i")action=op("invert");
    else if(mod&&!e.altKey&&!e.shiftKey&&key==="s")action=()=>{void this.download().catch(this.report)};
    else if(!mod&&!e.altKey){
      const tool=EDIT_TOOLS.find(([id])=>TOOL_KEYS[id].toLowerCase()===key)?.[0];
      if(tool&&!e.shiftKey)action=()=>this.chooseTool(tool);
      else if(key==="delete"||key==="backspace")action=op("clear");
      else if(key==="escape"&&this.mask.some(v=>v>0))action=op("deselect");
      else if(key==="0")action=()=>{this.fit=true;this.layout()};
      else if(key==="+"||key==="=")action=()=>this.zoomBy(1.25);
      else if(key==="-")action=()=>this.zoomBy(.8);
      else if((key==="["||key==="]")&&this.brushTools())action=()=>{this.brush=Math.max(1,Math.min(200,this.brush+(key==="]"?6:-6)));const slider=this.controls.querySelector<HTMLInputElement>('[data-setting="brush"]');if(slider)slider.value=String(this.brush);const output=this.controls.querySelector<HTMLOutputElement>('[data-value="brush"]');if(output)output.value=String(this.brush);this.previewBrush()};
    }
    if(!action)return false;
    e.preventDefault();e.stopPropagation();if(!e.repeat||["[","]","+","=","-"].includes(key))action();return true;
  }

  private history(which:string){const from=which==="undo"?this.past:this.future,to=which==="undo"?this.future:this.past,im=from.pop();if(!im)return;to.push({pixels:this.read(),source:this.source!,dirty:this.dirty});this.source=im.source;this.dirty=im.dirty;this.title.textContent=im.source.name;this.setPixels(im.pixels);this.revision++;this.sync();this.say(which==="undo"?"Undone":"Redone")}
  private async operation(op:string){if(!this.source||this.locked())return;const w=this.canvas.width,h=this.canvas.height
    if(op==="gpu"){await this.gpu();return}
    if(op==="segment"){await this.smartSelect();return}
    if(op==="selection-undo"||op==="selection-redo"){this.selectionHistory(op==="selection-redo");return}
    if(op==="all")this.select(new Uint8Array(this.mask.length).fill(255))
    else if(op==="deselect")this.select(new Uint8Array(this.mask.length))
    else if(op==="invert")this.select(this.mask.map(v=>255-v))
    else if(op==="grow"||op==="shrink")this.select(editMorph(this.mask,w,h,op==="grow"))
    else if(op==="feather")this.select(editFeather(this.mask,w,h,this.feather))
    else if(op==="clear"){if(!this.mask.some(v=>v>0))return;this.snapshot();const im=this.read();editClearPixels(im.data,this.mask);this.ctx().putImageData(im,0,0);this.changed();this.say("Selected pixels cleared to transparency")}
    else if(op==="despill"){this.snapshot();const im=this.read(),channel=this.channel,strength=this.spill/100;editDespill(im.data,w,h,this.mask,channel,strength);this.ctx().putImageData(im,0,0);this.changed();this.say("Color spill reduced")}
    else if(op==="crop"||op==="rotate"||op==="flip"){const original=this.read();let x0=w,y0=h,x1=-1,y1=-1;if(op==="crop"){for(let i=0;i<this.mask.length;i++)if(this.mask[i]){const x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}if(x1<0)return}this.snapshot();const tmp=document.createElement("canvas");tmp.width=w;tmp.height=h;tmp.getContext("2d")!.putImageData(original,0,0);const nw=op==="crop"?x1-x0+1:op==="rotate"?h:w,nh=op==="crop"?y1-y0+1:op==="rotate"?w:h;this.canvas.width=nw;this.canvas.height=nh;const ctx=this.ctx();if(op==="crop")ctx.drawImage(tmp,x0,y0,nw,nh,0,0,nw,nh);else if(op==="rotate"){ctx.translate(h,0);ctx.rotate(Math.PI/2);ctx.drawImage(tmp,0,0);ctx.resetTransform()}else{ctx.translate(w,0);ctx.scale(-1,1);ctx.drawImage(tmp,0,0);ctx.resetTransform()}tmp.width=tmp.height=1;this.overlay.width=nw;this.overlay.height=nh;this.resetMask();this.layout();this.changed();this.say("Canvas transformed")}
    this.drawSelection();this.sync()
  }
  private workingImage():EditorImage{const source=this.source!;return {...source,image:this.dirty?this.canvas.toDataURL("image/png"):source.image,width:this.canvas.width,height:this.canvas.height,id:this.dirty?undefined:source.id,parentId:this.dirty?source.id??source.parentId:source.parentId}}
  private async download(){if(!this.source)return;await this.bridge.save(this.canvas.toDataURL("image/png"),this.source.name.replace(/\.[^.]+$/,"")+"-edit.png");this.say("PNG exported · original retained")}
  private async accept(image:EditorImage){const bitmap=await this.decode(image);this.snapshot();this.canvas.width=bitmap.naturalWidth;this.canvas.height=bitmap.naturalHeight;this.overlay.width=this.canvas.width;this.overlay.height=this.canvas.height;this.ctx().drawImage(bitmap,0,0);this.resetMask();this.source=image;this.title.textContent=image.name;this.revision++;this.dirty=false;this.layout();this.drawSelection();this.say("Processed copy ready · Undo restores previous artwork")}
  async useInpaintResult(image:EditorImage){if(!this.inpaintActive||!this.source)throw new Error("The inpaint document is no longer active.");await this.accept(image);this.inpaintActive=false;this.bridge.inpaint(null);this.sync()}
  private async smartSelect(){
    if(!this.source||this.locked()||!this.bridge.segment)return;
    if(this.bridge.busy()||!this.bridge.connected()){this.say('Connect to Swarm and wait for other jobs to finish.',true);return}
    const controller=new AbortController();this.smartController=controller;this.working=true;const source=this.workingImage(),mode=this.mode,format=this.smartEngine==='text'?'luminance':this.smartEngine==='foreground'?'alpha':this.smartFormat,invert=this.smartInvert;
    this.renderControls();this.say('Detecting selection…');
    try{
      const params=this.smartEngine==='text'?textSegmentationParams(source.image,this.smartTarget,this.smartThreshold/100,Boolean((await this.bridge.inventory()).textSegmentationReady)):(await resolveProcessing(this.bridge,'background',this.smartEngine==='foreground'?normalizeRecipe({mode:'builtin'}):this.smartRecipe))(source);controller.signal.throwIfAborted();
      const request=processingRequest(source,params,{...source,model:source.model||this.bridge.checkpoint()});
      tagStudioRequest(request,'segmentation_result',source.studioMetadata);Object.assign(request.extra_metadata as Record<string,unknown>,{studio_surface:'editing',studio_operation:'segmentation'});
      const result=await this.bridge.segment(request,n=>this.say(`Detecting selection · ${Math.round(n*100)}%`),controller.signal);
      controller.signal.throwIfAborted();const bitmap=await this.decode(result);controller.signal.throwIfAborted();
      if(bitmap.naturalWidth!==this.canvas.width||bitmap.naturalHeight!==this.canvas.height)throw new Error('Segmentation must return the exact source dimensions. Selection unchanged.');
      const tmp=document.createElement('canvas');tmp.width=bitmap.naturalWidth;tmp.height=bitmap.naturalHeight;const ctx=tmp.getContext('2d')!;ctx.drawImage(bitmap,0,0);const next=segmentationMask(ctx.getImageData(0,0,tmp.width,tmp.height).data,tmp.width,tmp.height,format,invert);tmp.width=tmp.height=1;
      this.select(editCombineSelection(this.mask,next,mode));this.drawSelection();this.say('Smart Selection ready · undo, refine or Inpaint');
    }catch(err){if(controller.signal.aborted)this.say('Segmentation cancelled · selection unchanged');else this.report(err)}finally{this.smartController=null;this.working=false;this.renderControls();this.sync()}
  }
  private async gpu(){
    if(!this.source||this.locked())return;
    if(this.tool!=="inpaint"&&(this.bridge.busy()||!this.bridge.connected())){this.say("Connect to Swarm and wait for other jobs to finish.",true);return}
    this.working=true;this.sync();
    try{const image=this.workingImage();if(this.tool==="inpaint"){
      this.inpaintActive=true;this.bridge.inpaint(image,this.mask.some(v=>v>0)?{width:this.canvas.width,height:this.canvas.height,mask:this.mask.slice()}:undefined);return;
    }
    const stage:ProcessingStage=this.tool==="upscale"?"refine":"background";
    const workflow=await resolveProcessing(this.bridge,stage,this.recipes[stage]);
    const request=processingRequest(image,workflow(image),{...image,model:image.model||this.bridge.checkpoint()});
    tagStudioRequest(request,stage==="background"?"background_removed":"upscale_result",image.studioMetadata);
    this.say(`${processingLabels[stage]} · running…`);
    await this.accept(await this.bridge.generate(request,progress=>this.say(`${processingLabels[stage]} · ${Math.round(progress*100)}%`),stage));
    }catch(error){this.inpaintActive=false;this.report(error)}finally{this.working=false;this.renderControls();this.sync()}
  }
}
