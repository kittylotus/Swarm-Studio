import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLumiBridge, lumiBridgePlugin } from '../scripts/lumi-bridge.mjs';
import { auditExpressionProjects } from '../scripts/expression-projects.mjs';
import { originalImageByteSize, originalImageRangeByteSize } from '../src/library/file-size.ts';
import { projectReferenceStrings, matchReferencePath } from '../src/library/local-references.ts';

const scope = JSON.stringify(['http://swarm.test:7801','local',true]);
const payload = (at=Date.now(),user='alice') => ({sourceUserId:user,scope,snapshot:{schema:1,generatedAt:at,complete:false,coverage:['fixture'],activeJobs:false,claims:[]}});
let now=Date.now(); const memory=createLumiBridge({now:()=>now}); const pair=memory.pair(scope,'http://studio.test');
assert.match(pair.token,/^[a-f0-9]{64}$/); assert.throws(()=>memory.accept('wrong',payload(now)),/credential/);
memory.accept(pair.token,payload(now)); assert.throws(()=>memory.accept(pair.token,payload(now)),/Invalid/,'replays rejected');
assert.throws(()=>memory.accept(pair.token,payload(now+1,'bob')),/Invalid/,'paired Lumi user cannot change');
assert.throws(()=>memory.accept(pair.token,{...payload(now+1),scope:'other'}),/Invalid/);
now+=121000; assert.throws(()=>memory.accept(pair.token,payload(now-121000)),/Invalid/);
assert.equal(JSON.stringify(memory.state()).includes(pair.token),false,'credential is not returned with snapshots');
const uuid='00000000-0000-4000-8000-000000000001';
const mismatched={assetId:uuid,imageId:uuid,scope:JSON.stringify(['http://localhost:7801','local',true]),swarmPath:'raw/a.png',swarmPathVerified:true,persisted:true,usableCopyVerified:false,protected:true,references:['expression-set'],metadata:{studio_schema:'1',studio_origin:'lumiswarm',studio_asset_id:uuid,studio_pipeline_id:uuid,studio_parent_id:'',studio_stage:'expression_draft'}};
const withClaim=payload(now);withClaim.snapshot.claims=[mismatched];memory.accept(pair.token,withClaim);
assert.equal(memory.state().snapshot.claims[0].scope,mismatched.scope,'authenticated envelope retains differing per-asset scope as evidence');
memory.disconnect(); assert.throws(()=>memory.accept(pair.token,payload(now)),/credential/);

let middleware; lumiBridgePlugin().configureServer({middlewares:{use(fn){middleware=fn;}}});
const server=createServer((req,res)=>void middleware(req,res,()=>{res.statusCode=404;res.end();}));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`, base=origin+'/__studio/lumi-bridge';
try {
 const session=await fetch(base+'/session'); const cookie=session.headers.get('set-cookie').split(';')[0];
 const request=(action,body,extra={})=>fetch(base+'/'+action,{method:'POST',headers:{'content-type':'application/json',cookie,origin,...extra},body:JSON.stringify(body)});
 assert.equal((await request('pair',{scope,origin},{origin:'http://evil.test'})).status,401);
 const paired=await (await request('pair',{scope,origin})).json();
 assert.ok(paired.token);
 assert.notEqual((await request('push',payload(),{authorization:'Bearer '+'0'.repeat(64)})).status,200);
 const at=Date.now(), body=payload(at);
 assert.equal((await request('push',body,{authorization:'Bearer '+paired.token})).status,200);
 assert.equal((await request('push',body,{authorization:'Bearer '+paired.token})).status,400);
 const state=await (await fetch(base+'/state',{headers:{cookie}})).json(); assert.equal(state.sourceUserId,'alice');assert.equal(state.snapshot.generatedAt,at);
 assert.equal(JSON.stringify(state).includes(paired.token),false);
 await request('disconnect',{});
 assert.equal((await request('push',payload(at+1),{authorization:'Bearer '+paired.token})).status,400);
 assert.equal((await fetch(base+'/state')).status,401);
} finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }

const root=await mkdtemp(path.join(tmpdir(),'studio-reference-fixtures-'));
try {
 const absent=await auditExpressionProjects(root); assert.equal(absent.complete,true);assert.equal(absent.files,0);
 await assert.rejects(()=>lstat(path.join(root,'Projects')),{code:'ENOENT'},'read-only audit never creates project roots');
 const dir=path.join(root,'Projects','Expressions','nested'); await mkdir(dir,{recursive:true});
 const project={version:2,reference:'View/local/raw/reference.png',tiles:[{path:'raw/current.png',image:'data:image/png;base64,AAAA',earlierStages:{generate:{path:'raw/draft.png'}},variants:[{path:'raw/variant.png'}]}]};
 const file=path.join(dir,'fixture.expressions.json');const text=JSON.stringify(project);await writeFile(file,text);
 const audited=await auditExpressionProjects(root);assert.equal(audited.complete,true);assert.equal(audited.references.length,4);assert.equal(await readFile(file,'utf8'),text);
 assert.equal((await auditExpressionProjects(root,{maxFiles:0})).complete,false);
 await writeFile(path.join(dir,'broken.expressions.json'),'{bad');assert.equal((await auditExpressionProjects(root)).complete,false);
} finally { assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep) && path.basename(root).startsWith('studio-reference-fixtures-')); await rm(root,{recursive:true,force:true}); }
const refs=projectReferenceStrings({tiles:[{path:'raw/draft.png',variants:[{path:'raw/old.png'}]}],reference:'data:image/png;base64,AAA'});
assert.deepEqual([...refs].sort(),['raw/draft.png','raw/old.png']);
assert.equal(matchReferencePath('http://swarm.test:7801/View/local/raw/a.png','http://swarm.test:7801','local'),'raw/a.png');
assert.equal(matchReferencePath('http://other.test/View/local/raw/a.png','http://swarm.test:7801','local'),null);
assert.equal(matchReferencePath('View/other/raw/a.png','http://swarm.test:7801','local'),null);
assert.equal(matchReferencePath('http://swarm.test:7801/View/local/raw/a%20b%5B1%5D.png','http://swarm.test:7801','local',{appendUser:true}),'raw/a b[1].png');
assert.equal(matchReferencePath('http://studio.test/__swarm/View/local/raw/a%20b.png','http://swarm.test:7801','local',{appendUser:true,studioOrigin:'http://studio.test'}),'raw/a b.png');
assert.equal(matchReferencePath('Output/raw/a.png','http://swarm.test:7801','local',{appendUser:true}),null);
assert.equal(matchReferencePath('View/local/raw/a.png','http://swarm.test:7801','local',{appendUser:false}),null);
assert.equal(matchReferencePath('http://swarm.test:7801/base/Output/raw/a.png','http://swarm.test:7801/base','local',{appendUser:false}),'raw/a.png');
assert.equal(originalImageByteSize(200,'image/png','1234',null),1234);
for(const args of [[200,'text/html','123',null],[404,'image/png','1',null],[200,'image/png','NaN',null],[200,'image/png','-1',null],[200,'image/png','123','gzip'],[200,'image/png',null,null]])assert.equal(originalImageByteSize(...args),null);
console.log('Authenticated live feed, user/scope binding, stale/replay/revoke, recursive read-only project audit and original-size semantics: PASS');

assert.equal(originalImageRangeByteSize(206,'image/png','1',null,'bytes 0-0/658066'),658066);
assert.equal(originalImageRangeByteSize(200,'image/png','658066',null,null),658066);
for(const args of [[206,'image/png','1',null,null],[206,'image/png','1',null,'bytes 0-0/*'],[206,'image/png','1',null,'bytes 0-0/0'],[206,'image/png','1',null,'bytes 1-1/100'],[206,'image/png','2',null,'bytes 0-1/100'],[206,'text/html','1',null,'bytes 0-0/100'],[206,'image/png','1','gzip','bytes 0-0/100'],[206,'image/png','1',null,'bytes 0-0/9007199254740992'],[401,'image/png','1',null,'bytes 0-0/100']])assert.equal(originalImageRangeByteSize(...args),null);
console.log('One-byte range size validation, malformed/encoded/auth/unsafe totals rejected: PASS');
