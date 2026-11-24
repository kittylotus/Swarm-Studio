import {readStudioMetadata} from './provenance.ts';
import type {VacuumFile} from './vacuum.ts';
export interface BranchChoice {assetId:string;origin:string;pipelineId:string;path:string;decision:'keep'|'discard'}
export function branchChoices(raw:unknown):BranchChoice[] {
    return Array.isArray(raw)?raw.filter((v):v is BranchChoice=>Boolean(v&&typeof v.assetId==='string'&&typeof v.path==='string'&&typeof v.pipelineId==='string'&&['lumiswarm','standalone'].includes(v.origin)&&['keep','discard'].includes(v.decision))).slice(-10000):[];
}
/** Applies only to exact saved ancestry. A sibling is never inside another branch. */
export function branchResolver(files:VacuumFile[],choices:BranchChoice[]):(file:VacuumFile)=>'keep'|'discard'|null {
    if(!choices.length)return ()=>null;
    const ids=new Map<string,VacuumFile[]>();
    for(const f of files){const t=readStudioMetadata(f.metadata);if(t)ids.set(t.studio_asset_id,[...(ids.get(t.studio_asset_id)||[]),f]);}
    return file=>{
    const seen=new Set<string>();let node:VacuumFile|undefined=file,discard=false;
    while(node){
        const t=readStudioMetadata(node.metadata);if(!t||seen.has(t.studio_asset_id))return null;seen.add(t.studio_asset_id);
        const choice=choices.find(c=>c.assetId===t.studio_asset_id&&c.origin===t.studio_origin&&c.pipelineId===t.studio_pipeline_id&&c.path===node!.path);
        if(choice?.decision==='keep')return 'keep';
        if(ids.get(t.studio_asset_id)?.length!==1)return null;
        if(choice?.decision==='discard')discard=true;
        if(!t.studio_parent_id)return discard?'discard':null;
        const parent=ids.get(t.studio_parent_id);if(parent?.length!==1)return null;
        const p=readStudioMetadata(parent[0]!.metadata);if(p?.studio_pipeline_id!==t.studio_pipeline_id)return null;
        node=parent[0];
    }
    return null;
    };
}
export function branchChoice(file:VacuumFile,files:VacuumFile[],choices:BranchChoice[]){return branchResolver(files,choices)(file);}
