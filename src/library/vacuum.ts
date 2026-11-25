import {branchResolver,type BranchChoice} from './branch-retention.ts';
import { readStudioMetadata, studioStages, processingStage, type StudioMetadata } from './provenance.ts';
import { exactOutputPath } from './inventory.ts';

export interface LumiClaim {
    assetId: string; imageId: string; swarmPath: string; swarmPathVerified: boolean;
    persisted: boolean; usableCopyVerified: boolean; references: string[]; protected: boolean;
    scope: string; metadata: StudioMetadata; copyCheck?: { status: string; byteLength?: number; width?: number; height?: number; verifiedAt?: number };
}
export interface LumiSnapshot {
    schema: 1; generatedAt: number; complete: boolean; coverage: string[]; claims: LumiClaim[]; activeJobs: boolean; referenceAudit?: Array<{ source: string; status: string; records?: number; reason?: string }>;
}
export interface VacuumFile { path: string; metadata: unknown; starred?: boolean; bytes?: number }
export interface VacuumRow { path: string; assetId: string; stage: string; status: 'candidate' | 'protected' | 'review'; reason: string; bytes?: number; manualAllowed?: boolean; manualBlock?: string; requiresReview?: boolean }
export interface VacuumContext {
    scope: string; now: number; complete: boolean; activeJobs: boolean; snapshot: LumiSnapshot | null;
    favorites: Set<string>; exclusions: Set<string>; graceMs?: number; policy?: VacuumPolicy; localReferences?: Set<string>; localAuditComplete?: boolean;
}

export function parseLumiSnapshot(raw: unknown): LumiSnapshot {
    const s = raw as LumiSnapshot;
    if (!s || s.schema !== 1 || !Number.isFinite(s.generatedAt) || typeof s.complete !== 'boolean'
        || typeof s.activeJobs !== 'boolean' || !Array.isArray(s.coverage) || !s.coverage.every(x => typeof x === 'string')
        || !Array.isArray(s.claims) || s.claims.length > 100000) throw new Error('Invalid Lumi reference snapshot.');
    if (s.referenceAudit !== undefined && (!Array.isArray(s.referenceAudit) || s.referenceAudit.length > 10000 || s.referenceAudit.some(check =>
        !check || typeof check.source !== 'string' || typeof check.status !== 'string'
        || (check.reason !== undefined && typeof check.reason !== 'string')
        || (check.records !== undefined && (!Number.isSafeInteger(check.records) || check.records < 0))))) throw new Error('Invalid Lumi reference audit.');
    for (const c of s.claims) {
        if (!c || typeof c.assetId !== 'string' || typeof c.imageId !== 'string' || typeof c.scope !== 'string'
            || typeof c.swarmPath !== 'string' || typeof c.swarmPathVerified !== 'boolean'
            || typeof c.persisted !== 'boolean' || typeof c.usableCopyVerified !== 'boolean' || typeof c.protected !== 'boolean'
            || !Array.isArray(c.references) || !c.references.every(x => typeof x === 'string')
            || readStudioMetadata(c.metadata)?.studio_asset_id !== c.assetId) throw new Error('Invalid Lumi asset claim.');
    }
    return s;
}

/** Pure preview only. No function in this module can delete an image. */
export function classifyVacuum(files: VacuumFile[], context: VacuumContext): VacuumRow[] {
    if (context.policy?.basis === 'lineage') return classifyLineage(files, context, context.policy);
    const tagged = files.map(file => ({ ...file, tag: readStudioMetadata(file.metadata) }));
    const identities = new Map<string, typeof tagged>();
    const paths = new Map<string, number>();
    for (const file of tagged) {
        paths.set(file.path.toLowerCase(), (paths.get(file.path.toLowerCase()) ?? 0) + 1);
        if (file.tag) identities.set(file.tag.studio_asset_id, [...(identities.get(file.tag.studio_asset_id) ?? []), file]);
    }
    const claims = context.snapshot?.claims ?? [];
    const favoriteLeaves = new Set([...context.favorites].map(path => path.split('/').pop()));
    const freshness = 15 * 60 * 1000;
    return tagged.map(file => {
        const row: VacuumRow = { path: file.path, assetId: file.tag?.studio_asset_id ?? '', stage: file.tag?.studio_stage ?? 'untagged', status: 'review', reason: '', bytes: file.bytes };
        const stop = (reason: string, status: VacuumRow['status'] = 'review') => ({ ...row, reason, status });
        try { exactOutputPath(file.path); } catch { return stop('Unverified output path'); }
        const key = file.path.toLowerCase();
        if (file.starred || context.favorites.has(key) || context.favorites.has(key.replaceAll('/', '')) || favoriteLeaves.has(key.split('/').pop())) return stop('Favorite', 'protected');
        if (context.exclusions.has(file.path)) return stop('Excluded by you', 'protected');
        if (context.localReferences?.has(file.path)) return stop('Standalone project or active workspace reference', 'protected');
        if (!file.tag) return stop('Untagged or unsupported metadata; historical files are never inferred');
        const tag = file.tag;
        if (tag.studio_batch_size && tag.studio_batch_size !== "1") return stop("Batch job identity is not a unique physical asset");
        if ((paths.get(key) ?? 0) !== 1 || identities.get(tag.studio_asset_id)?.length !== 1) return stop('Path or asset identity collision');
        if (tag.studio_parent_id === tag.studio_asset_id) return stop('Invalid self lineage');
        if (!context.complete) return stop('History scan incomplete');
        if (!context.scope) return stop('Swarm user/output scope unverified');
        if (context.activeJobs || context.snapshot?.activeJobs) return stop('Jobs are active', 'protected');
        if (!context.snapshot) return stop('Lumi reference snapshot unavailable');
        if (context.now - context.snapshot.generatedAt > freshness || context.snapshot.generatedAt > context.now) return stop('Lumi reference snapshot is stale');
        const relatedClaims = claims.filter(c => c.assetId === tag.studio_asset_id || c.swarmPath === file.path);
        const matchingClaims = claims.filter(c => c.assetId === tag.studio_asset_id);
        if (relatedClaims.some(c => c.protected || c.references.length)) return stop('Lumi reference or protection', 'protected');
        if (context.localAuditComplete === false) return stop('Standalone project/reference audit incomplete');
        if (matchingClaims.some(c => c.scope !== context.scope)) return stop('Lumi Swarm connection differs from standalone; verify server address, user and output routing');
        if (!context.snapshot.complete) return stop('Lumi reference coverage incomplete');
        if (matchingClaims.some(c => !c.swarmPathVerified || c.swarmPath !== file.path)) return stop('Lumi path or server/user scope unverified');
        if (tag.studio_origin === 'lumiswarm' && matchingClaims.length !== 1) return stop('Lumi ownership claim missing or ambiguous');
        const created = Number(tag.studio_created_at);
        if (!Number.isFinite(created) || created <= 0 || context.now - created < Math.max(7 * 86400000, context.graceMs ?? 0)) return stop('Seven-day grace period or creation time unverified', 'protected');
        if (tag.studio_stage !== 'expression_draft') return stop('Final or retained processing output', 'protected');
        const replacement = tagged.find(other => other.tag?.studio_parent_id === tag.studio_asset_id
            && other.tag.studio_pipeline_id === tag.studio_pipeline_id && other.tag.studio_origin === tag.studio_origin
            && ['expression_final', 'upscale_result', 'background_removed'].includes(other.tag.studio_stage)
            && identities.get(other.tag.studio_asset_id)?.length === 1 && paths.get(other.path.toLowerCase()) === 1
            && Number(other.tag.studio_created_at) >= created && other.tag.studio_asset_id !== tag.studio_parent_id);
        if (!replacement) return stop('Verified saved replacement not found');
        return stop('Saved replacement exists; no reported references (preview only)', 'candidate');
    });
}

export interface VacuumPolicy {
    basis: 'lineage' | 'references'; graceDays: number; branches?:BranchChoice[];
    lumi?: Partial<OriginVacuumPolicy>; standalone?: Partial<OriginVacuumPolicy>;
    expressionDraft: boolean; expressionUpscale: boolean; expressionBackground: boolean;
    upscaleSources: boolean; inpaintSources: boolean; backgroundSources: boolean; reviewGenerations: boolean;
}
export function vacuumPolicy(value?: Partial<VacuumPolicy>): VacuumPolicy {
    const defaults: VacuumPolicy = { basis:'lineage', graceDays:7, expressionDraft:true, expressionUpscale:true, expressionBackground:true, upscaleSources:false, inpaintSources:false, backgroundSources:false, reviewGenerations:true };
    const result = {...defaults};
    if(value?.basis === 'references') result.basis='references';
    if(Number.isFinite(value?.graceDays)) result.graceDays=Math.min(365,Math.max(0,Number(value!.graceDays)));
    for(const key of ['expressionDraft','expressionUpscale','expressionBackground','upscaleSources','inpaintSources','backgroundSources','reviewGenerations'] as const) if(typeof value?.[key]==='boolean') result[key]=value[key]!;
    for(const key of ['lumi','standalone'] as const) if(value?.[key] && typeof value[key]==='object') result[key]={...value[key]};
    return result;
}
export interface OriginVacuumPolicy {
    mode:'chains'|'stages'; stages:string[]; protectCopyBindings:boolean;
    expressionDraft:boolean; expressionUpscale:boolean; expressionBackground:boolean;
    upscaleSources:boolean; inpaintSources:boolean; backgroundSources:boolean; reviewGenerations:boolean;
}
export function originVacuumPolicy(p:VacuumPolicy, origin:'lumiswarm'|'standalone'):OriginVacuumPolicy {
    const raw=(origin==='lumiswarm'?p.lumi:p.standalone)||{};
    const result:OriginVacuumPolicy={mode:raw.mode==='stages'?'stages':'chains',stages:Array.isArray(raw.stages)?raw.stages.filter(stage=>studioStages.includes(stage as typeof studioStages[number])):[],protectCopyBindings:raw.protectCopyBindings===true,
      expressionDraft:p.expressionDraft,expressionUpscale:p.expressionUpscale,expressionBackground:p.expressionBackground,upscaleSources:p.upscaleSources,inpaintSources:p.inpaintSources,backgroundSources:p.backgroundSources,reviewGenerations:p.reviewGenerations};
    for(const key of ['expressionDraft','expressionUpscale','expressionBackground','upscaleSources','inpaintSources','backgroundSources','reviewGenerations','protectCopyBindings'] as const) if(typeof raw[key]==='boolean')result[key]=raw[key]!;
    return result;
}
function classifyLineage(files: VacuumFile[], c: VacuumContext, p: VacuumPolicy): VacuumRow[] {
    const items=files.map(file=>({...file,tag:readStudioMetadata(file.metadata)}));
    const ids=new Map<string,typeof items>(); const paths=new Map<string,number>();
    const children=new Map<string,typeof items>(); const pipelines=new Map<string,typeof items>();
    for(const item of items) {
        const key=item.path.toLowerCase();paths.set(key,(paths.get(key)||0)+1);
        if(!item.tag)continue;
        const t=item.tag;
        ids.set(t.studio_asset_id,[...(ids.get(t.studio_asset_id)||[]),item]);
        if(t.studio_parent_id)children.set(t.studio_parent_id,[...(children.get(t.studio_parent_id)||[]),item]);
        const pipeline=t.studio_origin+'|'+t.studio_pipeline_id;
        pipelines.set(pipeline,[...(pipelines.get(pipeline)||[]),item]);
    }
    const valid=new Map<string,boolean>();
    for(const [key,group] of pipelines) valid.set(key,group.every(item=>{
        let node:typeof item|undefined=item;const visited=new Set<string>();
        while(node?.tag) {
            const t=node.tag;
            if(visited.has(t.studio_asset_id)||ids.get(t.studio_asset_id)?.length!==1||paths.get(node.path.toLowerCase())!==1|| (t.studio_batch_size && t.studio_batch_size!=='1') || !(Number(t.studio_created_at)>0))return false;
            try {exactOutputPath(node.path);}catch{return false;}
            visited.add(t.studio_asset_id);
            if(!t.studio_parent_id)return true;
            const parent=ids.get(t.studio_parent_id);
            if(parent?.length!==1||parent[0]!.tag?.studio_pipeline_id!==t.studio_pipeline_id||parent[0]!.tag?.studio_origin!==t.studio_origin||Number(parent[0]!.tag!.studio_created_at)>Number(t.studio_created_at))return false;
            node=parent[0];
        }
        return false;
    }));
    const favoriteLeaves=new Set([...c.favorites].map(path=>path.toLowerCase().split('/').pop()));
    return items.map(item=>{
        const t=item.tag,key=item.path.toLowerCase();
        const row=(reason:string,status:VacuumRow['status']='review'):VacuumRow=>({path:item.path,assetId:t?.studio_asset_id||'',stage:t?.studio_stage||'untagged',bytes:item.bytes,reason,status});
        if(item.starred||c.favorites.has(key)||c.favorites.has(key.replaceAll('/',''))||favoriteLeaves.has(key.split('/').pop()))return row('Favorite · retained independently of later versions','protected');
        if(c.exclusions.has(item.path))return row('Excluded by you','protected');
        if(c.localReferences?.has(item.path))return row('Standalone project or active workspace reference','protected');
        if(!t)return row('Untagged or unsupported metadata; historical files are never inferred');
        const policy=originVacuumPolicy(p,t.studio_origin);
        const claims=c.snapshot?.claims.filter(claim=>claim.assetId===t.studio_asset_id || (claim.scope===c.scope&&claim.swarmPath===item.path))||[];
        if(claims.some(claim=>claim.references.some(ref=>ref==='favorite'||ref.startsWith('swarm-path:')) || (claim.protected&&!claim.references.length)))return row('Lumi favorite or direct Swarm-path reference','protected');
        if(policy.protectCopyBindings&&claims.some(claim=>claim.protected||claim.references.length))return row('Lumi copy binding · protected by origin policy','protected');
        if(c.activeJobs||c.snapshot?.activeJobs)return row('Jobs are active','protected');
        if(policy.mode==='stages') {
            if(!policy.stages.includes(t.studio_stage))return row('Metadata stage not selected for this Studio','protected');
            try{exactOutputPath(item.path);}catch{return row('Unverified output path');}
            if(!c.complete||!c.scope)return row('History scan or Swarm scope incomplete');
            if(ids.get(t.studio_asset_id)?.length!==1||paths.get(key)!==1 || (t.studio_batch_size&&t.studio_batch_size!=='1'))return row('Ambiguous asset or batch identity');
            if(c.localAuditComplete===false)return row('Standalone project/reference audit incomplete');
            const created=Number(t.studio_created_at);
            if(!(created>0)||c.now-created<p.graceDays*86400000)return row('Lifecycle grace period or creation time unverified','protected');
            return row('Explicit metadata-stage selection · includes branch ends (preview only)','candidate');
        }
        const next=(children.get(t.studio_asset_id)||[]).filter(child=>child.tag?.studio_pipeline_id===t.studio_pipeline_id&&child.tag.studio_origin===t.studio_origin&&child.tag.studio_stage!=='segmentation_result');
        if(!next.length) {
            if(['general_generation','quick_create'].includes(t.studio_stage)&&policy.reviewGenerations)return row('Unfavorited main generation · manual review only');
            return row('Last saved output in this branch · keepsake','protected');
        }
        if(!c.complete||!c.scope)return row('History scan or Swarm scope incomplete');
        if(!valid.get(t.studio_origin+'|'+t.studio_pipeline_id))return row('Incomplete, ambiguous or cyclic lineage');
        if(c.localAuditComplete===false)return row('Standalone project/reference audit incomplete');
        const expression=pipelines.get(t.studio_origin+'|'+t.studio_pipeline_id)!.some(node=>['expression_draft','expression_final'].includes(node.tag!.studio_stage));
        const selected=expression ? (['expression_draft','expression_final'].includes(processingStage(t.studio_stage))?policy.expressionDraft:processingStage(t.studio_stage)==='upscale_result'?policy.expressionUpscale:processingStage(t.studio_stage)==='background_removed'?policy.expressionBackground:processingStage(t.studio_stage)==='inpaint_variant'?policy.inpaintSources:false)
            : processingStage(t.studio_stage)==='upscale_result'?policy.upscaleSources:processingStage(t.studio_stage)==='inpaint_variant'?policy.inpaintSources:processingStage(t.studio_stage)==='background_removed'?policy.backgroundSources
            :next.some(child=>processingStage(child.tag!.studio_stage)==='upscale_result'?policy.upscaleSources:processingStage(child.tag!.studio_stage)==='inpaint_variant'?policy.inpaintSources:processingStage(child.tag!.studio_stage)==='background_removed'?policy.backgroundSources:false);
        if(!selected)return row('Source stage retained by your lifecycle policy','protected');
        if(c.now-Number(t.studio_created_at)<p.graceDays*86400000)return row('Lifecycle grace period','protected');
        return row('Superseded stage · saved child exists; metadata lifecycle preview','candidate');
    });
}

/** Manual path review bypasses lifecycle suggestions, never positive protection/evidence gates. */
export function withManualReview(rows:VacuumRow[],files:VacuumFile[],c:VacuumContext):VacuumRow[] {
    const paths=new Map<string,number>();for(const file of files)paths.set(file.path.toLowerCase(),(paths.get(file.path.toLowerCase())||0)+1);
    const byPath=new Map(files.map(file=>[file.path,file])),resolveBranch=branchResolver(files,c.policy?.branches||[]);
    const favorites=new Set([...c.favorites].map(path=>path.toLowerCase())),leaves=new Set([...favorites].map(path=>path.split('/').pop()));
    const local=new Set([...(c.localReferences||[])].map(path=>path.toLowerCase()));
    return rows.map(row=>{
        const file=byPath.get(row.path),key=row.path.toLowerCase(),tag=readStudioMetadata(file?.metadata);
        let block='';
        try{exactOutputPath(row.path);}catch{block='Unverified output path';}
        if(/^starred\//i.test(row.path))block='Starred mirror';
        if(!file||paths.get(key)!==1)block='Missing or ambiguous physical path';
        if(file?.starred||favorites.has(key)||favorites.has(key.replaceAll('/',''))||leaves.has(key.split('/').pop()))block='Favorite';
        if(c.exclusions.has(row.path))block='Excluded by you';
        if(local.has(key))block='Standalone project or active workspace reference';
        if(!c.complete||!c.scope)block='History scan or Swarm scope incomplete';
        if(c.localAuditComplete===false)block='Standalone project/reference audit incomplete';
        const claims=c.snapshot?.claims.filter(claim=>(tag&&claim.assetId===tag.studio_asset_id)||(claim.scope===c.scope&&claim.swarmPath===row.path))||[];
        if(claims.some(claim=>claim.references.some(ref=>ref==='favorite'||ref.startsWith('swarm-path:'))||(claim.protected&&!claim.references.length)))block='Lumi favorite or direct Swarm-path reference';
        const choice=file?resolveBranch(file):null;
        if(choice==='keep')block='Branch kept by you';
        if(c.activeJobs||c.snapshot?.activeJobs)block='Jobs are active';
        if(!block&&choice==='discard')return {...row,status:'candidate',reason:'Branch marked discard · explicit review required',manualAllowed:true,requiresReview:true};
        return {...row,reason:block||row.reason,status:block?'protected':row.status==='candidate'?'candidate':'review',manualAllowed:!block,manualBlock:block||undefined};
    });
}
