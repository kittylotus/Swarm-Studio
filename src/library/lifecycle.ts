import type { OutputRecord } from '../types';
import { readStudioMetadata } from './provenance.ts';
import { exactOutputPath } from './inventory.ts';

export const outputTag = (output: OutputRecord) => readStudioMetadata(output.metadata) || readStudioMetadata(output.request?.extra_metadata);
export interface VersionNode { assetId: string; output?: OutputRecord; parentId: string; stage: string; ambiguous: boolean; origin?: string; pipelineConflict?: boolean }
export function assetVersions(current: OutputRecord, outputs: OutputRecord[]): VersionNode[] {
    const tag = outputTag(current); if (!tag) return [];
    const inventory=outputs.some(output=>output.id===current.id)?outputs:[...outputs,current];
    const tagged = inventory.flatMap(output => { const tag = outputTag(output); return tag ? [{ output, tag }] : []; });
    const all=new Map<string,typeof tagged>(),pipelines=new Map<string,string[]>(),children=new Map<string,string[]>();
    for(const item of tagged) {
        const t=item.tag;
        all.set(t.studio_asset_id,[...(all.get(t.studio_asset_id)||[]),item]);
        pipelines.set(t.studio_pipeline_id,[...(pipelines.get(t.studio_pipeline_id)||[]),t.studio_asset_id]);
        if(t.studio_parent_id)children.set(t.studio_parent_id,[...(children.get(t.studio_parent_id)||[]),t.studio_asset_id]);
    }
    // Origin describes who produced an asset, not which Studio owns its ancestry.
    // Expand exact parent/child IDs as well as declared pipeline membership.
    const groups=new Map<string,typeof tagged>(),pending=[tag.studio_asset_id],seenPipelines=new Set<string>();
    while(pending.length) {
        const id=pending.pop()!;if(groups.has(id))continue;
        const items=all.get(id);if(!items)continue;
        groups.set(id,items);
        pending.push(...(children.get(id)||[]));
        for(const item of items) {
            const pipeline=item.tag.studio_pipeline_id;
            if(!seenPipelines.has(pipeline)){seenPipelines.add(pipeline);pending.push(...(pipelines.get(pipeline)||[]));}
            if(item.tag.studio_parent_id)pending.push(item.tag.studio_parent_id);
        }
    }
    const result: VersionNode[] = [];
    for (const [assetId, items] of groups) {
        const item=items[0]!,parent=all.get(item.tag.studio_parent_id);
        result.push({ assetId, output:item.output, parentId:item.tag.studio_parent_id, stage:item.tag.studio_stage, ambiguous:items.length!==1, origin:item.tag.studio_origin,
            pipelineConflict:parent?.length===1 && parent[0]!.tag.studio_pipeline_id!==item.tag.studio_pipeline_id });
    }
    for (const item of [...result]) if (item.parentId && !groups.has(item.parentId) && !result.some(node => node.assetId === item.parentId))
        result.push({ assetId: item.parentId, parentId: '', stage: 'missing_parent', ambiguous: false });
    const nodes = new Map(result.map(node => [node.assetId, node]));
    const depth = (node: VersionNode) => { let count = 0; const seen = new Set<string>();
        while (node.parentId && nodes.has(node.parentId)) { if (seen.has(node.assetId)) return Number.MAX_SAFE_INTEGER; seen.add(node.assetId); node = nodes.get(node.parentId)!; count++; } return count; };
    return result.sort((a,b) => depth(a) - depth(b) || Number(outputTag(a.output || current)?.studio_created_at || 0) - Number(outputTag(b.output || current)?.studio_created_at || 0) || a.assetId.localeCompare(b.assetId));
}
export interface RetentionEntry { sourceAssetId: string; replacementAssetId: string; sourcePath: string; replacementPath: string; scope: string; queuedAt: number }
export function retentionEntry(source: OutputRecord, replacement: OutputRecord, scope: string, decoded: boolean, now = Date.now()): RetentionEntry | null {
    const parent = outputTag(source), child = outputTag(replacement);
    if (!decoded || !scope || !parent || !child || child.studio_parent_id !== parent.studio_asset_id
        || child.studio_pipeline_id !== parent.studio_pipeline_id || child.studio_asset_id === parent.studio_asset_id) return null;
    try {
        const sourcePath = exactOutputPath(source.swarmSourcePath || ''), replacementPath = exactOutputPath(replacement.swarmSourcePath || '');
        if (sourcePath === replacementPath) return null;
        return { sourceAssetId: parent.studio_asset_id, replacementAssetId: child.studio_asset_id, sourcePath, replacementPath, scope, queuedAt: now };
    } catch { return null; }
}

export interface VersionGraphNode { node:VersionNode; x:number; y:number; children:number; unresolved:boolean }
export function versionGraph(nodes:VersionNode[]) {
    const cardWidth=176,cardHeight=206,columnGap=24,rowGap=38,padding=12;
    const byId=new Map(nodes.map(node=>[node.assetId,node])),parents=new Map<string,string>(),unresolved=new Set<string>();
    for(const node of nodes) {
        if(node.ambiguous){unresolved.add(node.assetId);continue;}
        const parent=byId.get(node.parentId);
        if(parent&&!parent.ambiguous)parents.set(node.assetId,parent.assetId);
        else if(node.parentId)unresolved.add(node.assetId);
    }
    // Quarantine cyclic components before laying out a forest. No fabricated edges.
    for(const node of nodes) {
        const path=new Set<string>();let id=node.assetId;
        while(parents.has(id)) {
            if(path.has(id)){for(const member of path)unresolved.add(member);break;}
            path.add(id);id=parents.get(id)!;
        }
    }
    for(const id of unresolved)parents.delete(id);
    const children=new Map<string,VersionNode[]>();
    for(const node of nodes){const parent=parents.get(node.assetId);if(parent)children.set(parent,[...(children.get(parent)||[]),node]);}
    const positions=new Map<string,VersionGraphNode>();let column=0,maxDepth=0;
    const ordered:VersionGraphNode[]=[];
    const roots=nodes.filter(node=>!parents.has(node.assetId));
    // Iterative postorder handles long pipelines without exhausting the call stack.
    for(const root of roots) {
        const stack=[{node:root,depth:0,done:false}];
        while(stack.length) {
            const entry=stack.pop()!,list=children.get(entry.node.assetId)||[];
            if(!entry.done){stack.push({...entry,done:true});for(let i=list.length-1;i>=0;i--)stack.push({node:list[i]!,depth:entry.depth+1,done:false});continue;}
            const x=list.length?(positions.get(list[0]!.assetId)!.x+positions.get(list[list.length-1]!.assetId)!.x)/2:padding+column++*(cardWidth+columnGap);
            const point={node:entry.node,x,y:padding+entry.depth*(cardHeight+rowGap),children:list.length,unresolved:unresolved.has(entry.node.assetId)};
            positions.set(entry.node.assetId,point);maxDepth=Math.max(maxDepth,entry.depth);
        }
        const queue=[root];while(queue.length){const node=queue.pop()!;ordered.push(positions.get(node.assetId)!);const list=children.get(node.assetId)||[];for(let i=list.length-1;i>=0;i--)queue.push(list[i]!);}
    }
    const edges=[...parents].map(([child,parent])=>({child,parent,from:positions.get(parent)!,to:positions.get(child)!}));
    return {nodes:ordered,edges,width:Math.max(cardWidth+padding*2,column*(cardWidth+columnGap)-columnGap+padding*2),height:nodes.length?padding*2+(maxDepth+1)*cardHeight+maxDepth*rowGap:0,cardWidth,cardHeight};
}
