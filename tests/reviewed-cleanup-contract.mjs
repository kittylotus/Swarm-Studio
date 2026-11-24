import assert from 'node:assert/strict';
import {cleanupPlan,executeCleanup,fileIdentity,cleanupRead,cleanupMutation,CleanupBlocked} from '../src/library/reviewed-cleanup.ts';
import {classifyVacuum,vacuumPolicy,withManualReview} from '../src/library/vacuum.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now=Date.now(),scope='fixture-scope',policy=vacuumPolicy({graceDays:0});
const make=(n,stage,parent=0)=>({path:`raw/${n}.png`,metadata:{sui_extra_data:{studio_schema:'1',studio_origin:'standalone',studio_asset_id:id(n),studio_pipeline_id:id(1),studio_parent_id:parent?id(parent):'',studio_stage:stage,studio_created_at:String(now-1000+n)}}});
const original=[make(1,'expression_draft'),make(2,'upscale_result',1),make(3,'background_removed',2)];
function fixture(){
 let files=structuredClone(original),favorites=new Set(),checks=0,removed=[],logs=[],attempts=[];
 const identity={scope,serverId:'server-fixture',policyKey:JSON.stringify(policy),recycle:'enabled'};
 const state=ancestors=>({...identity,files,rows:classifyVacuum([...files,...ancestors],{scope,now:Date.now(),complete:true,activeJobs:false,snapshot:null,favorites,exclusions:new Set(),localAuditComplete:true,policy})});
 const plan=cleanupPlan('review-1',state([]),new Set(original.map(f=>f.path)));
 const h={plan,identity,removed,logs,attempts,state,setFiles:value=>files=value,favorite:path=>favorites.add(path),beforeCheck:()=>{},removeError:null,logError:false,reconcileError:false,
 ports:{check:async ancestors=>{await h.beforeCheck(++checks);return state(ancestors);},remove:async path=>{removed.push(path);if(h.removeError)throw h.removeError;files=files.filter(file=>file.path!==path);},attempt:target=>{if(h.logError)throw Error('storage full');attempts.push(target.file.path);},result:row=>logs.push(row),reconcile:()=>{if(h.reconcileError)throw Error('index disk failure');}}};
 return h;
}
let h=fixture();assert.equal(h.plan.targets.length,2);assert.equal(h.plan.omitted.length,1);assert.deepEqual(h.removed,[],'review preparation cannot delete');
assert.ok(Object.isFrozen(h.plan)&&Object.isFrozen(h.plan.targets)&&Object.isFrozen(h.plan.targets[0].file),'review plan is frozen');
let results=await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.deepEqual(h.removed,['raw/1.png','raw/2.png']);assert.ok(results.every(r=>r.status==='deleted'),'deleted ancestors preserve only this approved run’s verified lineage');
h=fixture();h.beforeCheck=async count=>{if(count===2)h.favorite('raw/2.png');};results=await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.deepEqual(h.removed,['raw/1.png']);assert.equal(results[1].status,'skipped');assert.match(results[1].reason,/Favorite/);
h=fixture();h.beforeCheck=async()=>h.setFiles([original[0],original[2]]);results=await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.equal(h.removed.length,0,'missing direct replacement blocks source');
h=fixture();const changed=structuredClone(original);changed[0].metadata.sui_image_params={seed:22};h.setFiles(changed);results=await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.ok(!h.removed.includes('raw/1.png'));assert.match(results[0].reason,/identity changed/);
for(const [field,value] of [['scope','other-user'],['serverId','restarted-server'],['policyKey','changed-policy'],['recycle','disabled']]){h=fixture();h.identity[field]=value;results=await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.equal(h.removed.length,0);assert.equal(results[0].status,'skipped');}
h=fixture();h.ports.check=async()=>{throw Error('History cap or global jobs active');};results=await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.equal(h.removed.length,0);
h=fixture();h.removeError=Error('Connection lost after request');results=await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.equal(h.removed.length,1);assert.equal(results[0].status,'uncertain');assert.equal(results[1].status,'skipped');
h=fixture();h.logError=true;await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.equal(h.removed.length,0,'no destructive request without persisted intent');
h=fixture();h.reconcileError=true;results=await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.equal(results[0].status,'deleted');assert.match(results[0].reason,/index/);assert.equal(h.removed.length,1);
h=fixture();const cancelled=new AbortController();cancelled.abort();results=await executeCleanup(h.plan,h.ports,cancelled.signal);assert.equal(h.removed.length,0);assert.ok(results.every(r=>r.status==='cancelled'));
h=fixture();const cancelDuring=new AbortController();let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);h.ports.remove=async path=>{h.removed.push(path);entered();await gate;};const running=executeCleanup(h.plan,h.ports,cancelDuring.signal);await started;cancelDuring.abort();release();results=await running;assert.equal(h.removed.length,1);assert.equal(results[0].status,'deleted');assert.equal(results[1].status,'cancelled','cancel never starts another delete');
assert.equal(fileIdentity({path:'raw/x.png',metadata:'{"b":2,"a":1}'}),fileIdentity({path:'raw/x.png',metadata:{a:1,b:2}}));
console.log('Reviewed cleanup exact plan, per-file checks, surviving replacements, favorites, identity/policy/server/recycle changes, write-ahead logging, uncertain outcome and cancellation: PASS');

await assert.rejects(()=>cleanupRead(()=>new Promise(()=>{}),new AbortController().signal,10),/timed out/);
const interrupted=new AbortController();const reading=cleanupRead(()=>new Promise(()=>{}),interrupted.signal);interrupted.abort();await assert.rejects(()=>reading,{name:'AbortError'});
await assert.rejects(()=>cleanupMutation(()=>new Promise(()=>{}),10),/server may still finish/);
console.log('Verification cancel/deadline and mutation uncertain-timeout semantics: PASS');

h=fixture();h.ports.remove=async()=>{throw new CleanupBlocked('New direct reference arrived before sending');};results=await executeCleanup(h.plan,h.ports,new AbortController().signal);assert.equal(results[0].status,'skipped');assert.equal(h.removed.length,0);

const recent={...original[0],metadata:{sui_extra_data:{...original[0].metadata.sui_extra_data,studio_origin:'lumiswarm',studio_created_at:String(Date.now())}}};
const legacy={path:'raw/old-untagged.png',metadata:{sui_image_params:{seed:123}}},blank={path:'raw/no-metadata.png',metadata:''};
const manualFiles=[recent,legacy,blank];
const manualContext={scope,now:Date.now(),complete:true,activeJobs:false,localAuditComplete:true,favorites:new Set(),exclusions:new Set(),snapshot:{schema:1,generatedAt:Date.now(),complete:false,activeJobs:false,claims:[{assetId:id(1),scope,swarmPath:recent.path,protected:true,references:['folder','expression-set']}]},policy:vacuumPolicy({lumi:{mode:'stages',stages:[],protectCopyBindings:true}})};
const manualState=()=>({scope,serverId:'server-fixture',policyKey:'manual-policy',recycle:'unknown',files:manualFiles,rows:withManualReview(classifyVacuum(manualFiles,manualContext),manualFiles,manualContext)});
const manual=manualState();assert.ok(manual.rows.every(row=>row.manualAllowed&&row.status==='review'));
const manualPlan=cleanupPlan('manual-review',manual,new Set(manualFiles.map(file=>file.path)));assert.equal(manualPlan.targets.length,3);assert.ok(manualPlan.targets.every(target=>target.manual));
const manualDeletes=[];results=await executeCleanup(manualPlan,{check:async()=>manualState(),remove:async path=>manualDeletes.push(path),attempt:()=>{},result:()=>{},reconcile:()=>{}},new AbortController().signal);assert.equal(manualDeletes.length,3);
for(const changed of [{favorites:new Set([legacy.path])},{localReferences:new Set([legacy.path])},{exclusions:new Set([legacy.path])},{activeJobs:true},{complete:false},{localAuditComplete:false}])assert.equal(withManualReview(classifyVacuum(manualFiles,{...manualContext,...changed}),manualFiles,{...manualContext,...changed}).find(row=>row.path===legacy.path).manualAllowed,false);
const direct={...manualContext,snapshot:{...manualContext.snapshot,claims:[{assetId:id(1),scope,swarmPath:legacy.path,references:['swarm-path:chat'],protected:true}]}};assert.equal(withManualReview(classifyVacuum(manualFiles,direct),manualFiles,direct).find(row=>row.path===legacy.path).manualAllowed,false);
assert.doesNotThrow(()=>fileIdentity(blank));
console.log('Manual review accepts recent/copy-bound/untagged/empty-metadata paths while retaining favorites, direct refs, project refs, jobs and complete-scan checks: PASS');
