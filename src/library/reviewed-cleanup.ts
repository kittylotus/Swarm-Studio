import { exactOutputPath } from './inventory.ts';
import { readStudioMetadata } from './provenance.ts';
import type { VacuumFile, VacuumRow } from './vacuum.ts';
export type RecycleMode = 'enabled' | 'disabled' | 'unknown';
export interface CleanupState { scope:string; serverId:string; policyKey:string; recycle:RecycleMode; files:VacuumFile[]; rows:VacuumRow[] }
export interface CleanupTarget { file:VacuumFile; identity:string; assetId:string; stage:string; origin:string; reason:string; manual?:boolean }
export interface CleanupPlan { id:string; createdAt:number; scope:string; serverId:string; policyKey:string; recycle:RecycleMode; targets:CleanupTarget[]; omitted:Array<{path:string;reason:string}> }
export interface CleanupOutcome { path:string; assetId:string; status:'deleted'|'skipped'|'failed'|'uncertain'|'cancelled'; reason:string; at:number }
export function fileIdentity(file:VacuumFile):string {
    exactOutputPath(file.path);
    let metadata=file.metadata;try{if(typeof metadata==='string')metadata=JSON.parse(metadata);}catch{/* Raw legacy metadata is still an exact identity value. */}
    const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
    return JSON.stringify([file.path,canonical(metadata)]);
}
export function cleanupPlan(id:string,state:CleanupState,selected:Set<string>,now=Date.now()):CleanupPlan {
    if(!state.scope||!state.serverId)throw new Error('Swarm server and user identity must be verified.');
    const targets:CleanupTarget[]=[],omitted:CleanupPlan['omitted']=[];
    for(const path of selected) {
        const matches=state.files.filter(file=>file.path===path),row=state.rows.find(row=>row.path===path),tag=readStudioMetadata(matches[0]?.metadata);
        if(matches.length!==1||!row||(row.status!=='candidate'&&!row.manualAllowed)){omitted.push({path,reason:row?.reason||'File missing or ambiguous'});continue;}
        const file=JSON.parse(JSON.stringify(matches[0])) as VacuumFile;
        targets.push({file,identity:fileIdentity(file),assetId:tag?.studio_asset_id||'',stage:tag?.studio_stage||'untagged',origin:tag?.studio_origin||'unknown',reason:row.reason,manual:row.status!=='candidate'||row.requiresReview===true});
    }
    const byId=new Map(state.files.flatMap(file=>{const tag=readStudioMetadata(file.metadata);return tag?[[tag.studio_asset_id,tag] as const]:[];}));
    const depth=(target:CleanupTarget)=>{let tag=readStudioMetadata(target.file.metadata),n=0;const seen=new Set<string>();while(tag?.studio_parent_id&&!seen.has(tag.studio_asset_id)){seen.add(tag.studio_asset_id);tag=byId.get(tag.studio_parent_id)||null;n++;}return n;};
    targets.sort((a,b)=>depth(a)-depth(b)||a.file.path.localeCompare(b.file.path));
    const plan={id,createdAt:now,scope:state.scope,serverId:state.serverId,policyKey:state.policyKey,recycle:state.recycle,targets,omitted};
    const freeze=(value:unknown)=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};freeze(plan);
    return plan;
}
export class CleanupBlocked extends Error {}
export interface CleanupPorts {
    check(deletedAncestors:VacuumFile[],signal:AbortSignal,target:CleanupTarget):Promise<CleanupState>;
    remove(path:string):Promise<void>;
    attempt(target:CleanupTarget):void;
    result(outcome:CleanupOutcome):void;
    reconcile(target:CleanupTarget):void;
}
/** Executes only an explicitly approved, frozen target list. Never widens or retries it. */
export async function executeCleanup(plan:CleanupPlan,ports:CleanupPorts,signal:AbortSignal):Promise<CleanupOutcome[]> {
    const results:CleanupOutcome[]=[],deleted:VacuumFile[]=[];
    let halt='';
    for(const target of plan.targets) {
        let outcome:CleanupOutcome|undefined;
        const result=(status:CleanupOutcome['status'],reason:string)=>({path:target.file.path,assetId:target.assetId,status,reason,at:Date.now()});
        if(signal.aborted)outcome=result('cancelled','Cancelled before sending a deletion request');
        else if(halt)outcome=result('skipped',halt);
        else {
            try {
                const state=await ports.check(deleted,signal,target);signal.throwIfAborted();
                if(state.scope!==plan.scope||state.serverId!==plan.serverId||state.policyKey!==plan.policyKey||state.recycle!==plan.recycle)throw new Error('Connection, policy or recycle behavior changed. Review again.');
                const file=state.files.find(file=>file.path===target.file.path),row=state.rows.find(row=>row.path===target.file.path);
                if(!file||fileIdentity(file)!==target.identity||(target.file.bytes!==undefined&&file.bytes!==target.file.bytes))outcome=result('skipped','File missing or metadata identity changed since review');
                else if(target.manual?row?.manualAllowed!==true:row?.status!=='candidate')outcome=result('skipped',row?.manualBlock||row?.reason||'File no longer eligible');
                else {
                    signal.throwIfAborted();
                    try { ports.attempt(target); } catch { throw new Error('Cleanup log could not be saved. No deletion request was sent.'); }
                    signal.throwIfAborted();
                    try { await ports.remove(target.file.path);outcome=result('deleted','Swarm confirmed deletion');deleted.push(target.file); }
                    catch(error) { outcome=error instanceof CleanupBlocked?result('skipped',error.message):result('uncertain',`Deletion request was not confirmed; no automatic retry. ${error instanceof Error?error.message:String(error)}`);halt='Stopped after an unconfirmed or blocked deletion. Rescan before retrying.'; }
                    if(outcome.status==='deleted')try{ports.reconcile(target);}catch{outcome.reason+='; local index could not be saved. Rescan Library.';halt='Stopped after local index persistence failed.';}
                }
            } catch(error) { outcome=result(signal.aborted?'cancelled':'skipped',error instanceof Error?error.message:String(error));halt='Stopped after a safety check failed. Review again.'; }
        }
        results.push(outcome!);
        try { ports.result(outcome!); } catch { halt='Cleanup history could not be saved. Further deletion stopped.'; }
    }
    return results;
}

export async function cleanupRead<T>(task:()=>Promise<T>,signal:AbortSignal,timeout=15000):Promise<T> {
    let timer:ReturnType<typeof setTimeout>|undefined,abort:(()=>void)|undefined;
    try {
        signal.throwIfAborted();
        return await Promise.race([Promise.resolve().then(task),new Promise<T>((_,reject)=>{
            timer=setTimeout(()=>reject(new Error('Cleanup verification timed out. Nothing further was deleted.')),timeout);
            abort=()=>reject(new DOMException('Cleanup cancelled.','AbortError'));signal.addEventListener('abort',abort,{once:true});
        })]);
    }finally{if(timer)clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);}
}
/** Cancellation cannot retract an already-sent mutation. A timeout is an unknown outcome. */
export async function cleanupMutation<T>(task:()=>Promise<T>,timeout=30000):Promise<T> {
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([Promise.resolve().then(task),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Deletion response timed out; the server may still finish this request.')),timeout);})]);}
    finally{if(timer)clearTimeout(timer);}
}
