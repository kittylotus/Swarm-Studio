import { normalizeRecipe, prepareProcessing, type ProcessingRecipe, type ProcessingBackend, type SavedProcessingWorkflow, type ProcessingSource } from '../expressions/processing.ts';
import { tagStudioRequest, type StudioMetadata, type StudioStage } from '../library/provenance.ts';
import type { SwarmGenerationRequest } from '../swarm/types.ts';

export const stageLabels = { refine: 'Refinement · img2img', detailer: 'Detailer', upscale: 'Upscale', background: 'Background removal' } as const;
export type FinalizeKind = keyof typeof stageLabels;
export interface FinalizeStage {
  kind: FinalizeKind; method: 'native' | 'workflow'; recipe: ProcessingRecipe;
  model: string; prompt: string; negative: string; inheritPrompt: boolean; inheritLoras: boolean;
  steps: number; cfg: number; creativity: number; scale: number; seed: number;
  sampler: string; scheduler: string; target: string; threshold: number; detailPrompt: string;
}
export interface FinalizeImage extends ProcessingSource {
  name: string; id?: string; parentId?: string; studioMetadata?: StudioMetadata | null;
  model?: string; prompt?: string; negativeprompt?: string; seed?: number;
  loras?: string[] | string; loraweights?: string[] | string; sampler?: string; scheduler?: string;
}
export const MAX_FINALIZE_STAGES = 8;
export const FINALIZE_RECIPES_KEY = 'studio-finalize-recipes-v1';
export interface FinalizeRecipe { name: string; stages: FinalizeStage[] }
const record = (raw: unknown): Record<string, unknown> => raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
const num = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const text = (v: unknown, max = 16000) => typeof v === 'string' ? v.slice(0, max) : '';
export function defaultStage(kind: FinalizeKind): FinalizeStage {
  return {kind, method: kind === 'refine' || kind === 'detailer' ? 'native' : 'workflow', recipe: normalizeRecipe({mode: 'builtin'}), model:'', prompt:'', negative:'', inheritPrompt:true, inheritLoras:true, steps:45,cfg:4,creativity:kind==='detailer'?.45:.2,scale:1,seed:-1,sampler:'',scheduler:'',target:'face',threshold:.5,detailPrompt:'detailed face, clean eyes'};
}
export function normalizeStage(raw: unknown): FinalizeStage {
  const o=record(raw); if (!Object.hasOwn(stageLabels,String(o.kind))) throw new Error('Unknown Finalize stage.');
  const d=defaultStage(o.kind as FinalizeKind);
  const method = d.kind==='upscale'||d.kind==='background'?'workflow':o.method==='workflow'?'workflow':'native';
  const recipe=normalizeRecipe(o.recipe??d.recipe);
  if (recipe.mode==='off'||(method==='workflow'&&(d.kind==='refine'||d.kind==='detailer')&&recipe.mode==='builtin')) recipe.mode=(d.kind==='refine'||d.kind==='detailer')?'saved':'builtin';
  return {...d,method,recipe,model:text(o.model,500),prompt:text(o.prompt),negative:text(o.negative),inheritPrompt:o.inheritPrompt!==false,inheritLoras:o.inheritLoras!==false,steps:Math.round(num(o.steps,d.steps,1,150)),cfg:num(o.cfg,d.cfg,0,30),creativity:num(o.creativity,d.creativity,.01,1),scale:num(o.scale,d.scale,1,2),seed:Math.round(num(o.seed,-1,-1,Number.MAX_SAFE_INTEGER)),sampler:text(o.sampler,100),scheduler:text(o.scheduler,100),target:typeof o.target==='string'?text(o.target,120):d.target,threshold:num(o.threshold,d.threshold,.01,1),detailPrompt:typeof o.detailPrompt==='string'?text(o.detailPrompt):d.detailPrompt};
}
export function normalizeChain(raw: unknown): FinalizeStage[] {
  if (!Array.isArray(raw) || !raw.length || raw.length>MAX_FINALIZE_STAGES) throw new Error(`Choose 1–${MAX_FINALIZE_STAGES} processing stages.`);
  return raw.map(normalizeStage);
}
export function readFinalizeRecipes(raw: string|null): FinalizeRecipe[] {
  try {const parsed=JSON.parse(raw||'[]');if(!Array.isArray(parsed))return [];return parsed.slice(0,24).flatMap(item=>{try{const name=text(item?.name,80).trim();return name?[{name,stages:normalizeChain(item.stages)}]:[]}catch{return []}})} catch{return []}
}
export interface PrimitiveHost {
  inventory(): Promise<ProcessingBackend>; savedWorkflow(name:string):Promise<SavedProcessingWorkflow>;
}
export type PreparedStage = (source: FinalizeImage) => SwarmGenerationRequest;
export function finalizeTag(kind:FinalizeKind):StudioStage {return kind==='refine'?'refinement_result':kind==='detailer'?'detailer_result':kind==='upscale'?'upscale_result':'background_removed'}
function dims(source:ProcessingSource,scale:number):[number,number] {
  const w=Math.max(64,Math.round(source.width*scale/8)*8),h=Math.max(64,Math.round(source.height*scale/8)*8);
  if(Math.max(w,h)>8192||w*h>36_000_000)throw new Error('Output exceeds 8192 px or 36 megapixels. Reduce scale.');
  return [w,h];
}
export async function prepareFinalizeStage(host:PrimitiveHost,raw:FinalizeStage,checkpoint:string):Promise<PreparedStage> {
  const s=normalizeStage(raw);
  let graph:((source:ProcessingSource)=>Record<string,unknown>)|undefined;
  if(s.method==='workflow') {
    const r=s.recipe;
    const inventory=r.mode==='builtin'?await host.inventory():undefined;
    const saved=r.mode==='saved'&&r.workflow?await host.savedWorkflow(r.workflow):undefined;
    graph=prepareProcessing(s.kind==='background'?'background':'refine',r,inventory,saved);
  } else if(s.kind==='detailer') {
    if(!s.target.trim()||/[<>,\r\n]/.test(s.target))throw new Error('Enter one segmentation target, e.g. face, hands, or an installed yolo target (no commas or brackets).');
    if(!s.detailPrompt.trim()||/<segment\s*:/i.test(s.detailPrompt))throw new Error('Enter a detail prompt without another segment directive.');
    const inv=await host.inventory();if(s.target.trim().startsWith('yolo-')?!inv.yoloSegmentationReady:!inv.textSegmentationReady)throw new Error('The required Swarm segmentation node is unavailable. Refresh the backend or use a custom detailer workflow.');
  }
  return source=>{
    const model=s.model||source.model||checkpoint;
    if(!model)throw new Error('Choose a checkpoint for this stage.');
    if(!/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(source.image))throw new Error('The stage requires decoded PNG, JPEG or WebP bytes.');
    const [width,height]=dims(source,graph||s.kind==='detailer'?1:s.scale);
    const basePrompt=s.inheritPrompt?source.prompt||'':s.prompt;
    const negative=s.inheritPrompt?source.negativeprompt||'':s.negative;
    // Existing segment directives must not leak into a subsequent native pass.
    const cleanPrompt=basePrompt.split(/<segment\s*:/i)[0]!.trim();
    const prompt=s.kind==='detailer'&&!graph?`${cleanPrompt}\n<segment:${s.target.trim()},${s.creativity},${s.threshold}> ${s.detailPrompt.trim()}`.trim():cleanPrompt;
    const req:SwarmGenerationRequest={model,prompt,negativeprompt:negative,width,height,seed:s.seed,steps:graph?1:s.steps,cfgscale:graph?1:s.cfg,images:1,batchsize:1,imageformat:'PNG'};
    if(graph)Object.assign(req,graph(source));
    else Object.assign(req,{initimage:source.image,initimagecreativity:s.kind==='detailer'?0:s.creativity,sampler:s.sampler||source.sampler||undefined,scheduler:s.scheduler||source.scheduler||undefined,...(s.inheritLoras&&source.model===model?{loras:source.loras,loraweights:source.loraweights}:{})});
    const tag=tagStudioRequest(req,finalizeTag(s.kind),source.studioMetadata);
    tag.studio_surface='finalize';tag.studio_operation=s.kind;
    // tagStudioRequest copies the metadata into the request; write the extra fields there too.
    Object.assign(req.extra_metadata as Record<string,unknown>,{studio_surface:'finalize',studio_operation:s.kind,studio_method:graph?s.recipe.mode:'native',...(source.parentId&&!source.id?{studio_source_modified:'true'}:{})});
    return req;
  };
}
const reqMeta=(request:SwarmGenerationRequest)=>record(request.extra_metadata);
export interface ChainCallbacks {start(index:number):void; progress(index:number,fraction:number):void; preview(index:number,image:string):void; complete(index:number,image:FinalizeImage):void}
export async function executeFinalizeChain(source:FinalizeImage,prepared:PreparedStage[],submit:(request:SwarmGenerationRequest,progress:(n:number)=>void,preview:(url:string)=>void,signal:AbortSignal)=>Promise<FinalizeImage>,signal:AbortSignal,events:ChainCallbacks):Promise<FinalizeImage> {
  let current=source;
  for(let i=0;i<prepared.length;i++){
    signal.throwIfAborted();const request=prepared[i]!(current);events.start(i);
    const result=await submit(request,n=>{if(!signal.aborted)events.progress(i,n)},url=>{if(!signal.aborted)events.preview(i,url)},signal);
    signal.throwIfAborted();
    if(!result.image||!result.width||!result.height)throw new Error('Stage returned no usable image.');
    // Built-in image-only transforms retain the previous diffusion context for a later native pass.
    const meta=reqMeta(request);
    current=meta.studio_method==='builtin'&&(meta.studio_operation==='upscale'||meta.studio_operation==='background')?{...result,model:current.model||result.model,prompt:current.prompt,negativeprompt:current.negativeprompt,loras:current.loras,loraweights:current.loraweights,sampler:current.sampler,scheduler:current.scheduler}:result;
    events.complete(i,current);
  }
  return current;
}
