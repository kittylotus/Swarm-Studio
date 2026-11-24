import {classifyVacuum,withManualReview,originVacuumPolicy,type VacuumContext,type VacuumFile} from './vacuum.ts';
export interface AutomaticSettings {enabled:boolean;maxFiles:number;lastAttemptAt:number;message:string}
export interface CleanupEvidence {scope:string;serverId:string;createdAt:number;policyKey?:string;recycle:string;finishedAt?:number;automatic?:boolean;targets:unknown[];results:Array<{status:string;reason:string}>;pendingPath?:string}
export function automaticSettings(raw?:Partial<AutomaticSettings>):AutomaticSettings {
    return {enabled:raw?.enabled===true,maxFiles:[5,10,20].includes(Number(raw?.maxFiles))?Number(raw!.maxFiles):10,lastAttemptAt:Number.isFinite(raw?.lastAttemptAt)?Number(raw!.lastAttemptAt):0,message:typeof raw?.message==='string'?raw.message:''};
}
export function sameAutomaticPolicy(a:string|undefined,b:string):boolean {
    const key=(text:string)=>{try{const raw=JSON.parse(text);raw.branches||=[];const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;return JSON.stringify(stable(raw));}catch{return text;}};
    return typeof a==='string'&&key(a)===key(b);
}
export function automaticProof(runs:CleanupEvidence[],scope:string,policyKey:string):CleanupEvidence|undefined {
    if(runs.some(r=>!r||!Array.isArray(r.targets)||!Array.isArray(r.results)||!Number.isFinite(r.createdAt)||r.results.some(result=>!result||typeof result.status!=='string'||typeof result.reason!=='string')))return undefined;
    const failedAt=Math.max(0,...runs.filter(r=>r.scope===scope&&r.automatic&&(!r.finishedAt||r.pendingPath||r.results.length!==r.targets.length||r.results.some(result=>result.status!=='deleted'||result.reason!=='Swarm confirmed deletion'))).map(r=>r.createdAt));
    return runs.slice().reverse().find(r=>r.scope===scope&&r.createdAt>failedAt&&sameAutomaticPolicy(r.policyKey,policyKey)&&r.automatic!==true&&r.finishedAt&&!r.pendingPath&&r.targets.length>0&&r.results.length===r.targets.length&&r.results.every(result=>result.status==='deleted'&&result.reason==='Swarm confirmed deletion'));
}
/** Automatic execution is deliberately narrower than explicit, reviewed stage/manual selections. */
export function automaticCandidates(files:VacuumFile[],context:VacuumContext):Set<string> {
    if(!context.policy||!context.complete||context.localAuditComplete!==true||context.activeJobs||context.snapshot?.activeJobs)return new Set();
    const policy={...context.policy,basis:'lineage' as const,graceDays:Math.max(7,context.policy.graceDays),lumi:{...originVacuumPolicy(context.policy,'lumiswarm'),mode:'chains' as const},standalone:{...originVacuumPolicy(context.policy,'standalone'),mode:'chains' as const}};
    const current=withManualReview(classifyVacuum(files,context),files,context),strictContext={...context,policy};
    const strict=new Set(withManualReview(classifyVacuum(files,strictContext),files,strictContext).filter(row=>row.status==='candidate'&&!row.requiresReview).map(row=>row.path));
    return new Set(current.filter(row=>row.status==='candidate'&&!row.requiresReview&&strict.has(row.path)).map(row=>row.path));
}

export function automaticSelection(files:VacuumFile[],context:VacuumContext,maxFiles:number):Set<string>{return new Set([...automaticCandidates(files,context)].slice(0,Math.min(20,Math.max(1,maxFiles))));}
