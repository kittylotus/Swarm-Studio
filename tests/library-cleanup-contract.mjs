import assert from 'node:assert/strict';
import { historyListingLimit, readSwarmFavorites, nonFavoriteTargets } from '../src/library/cleanup.ts';

const join = (parent, child) => child.toLowerCase().startsWith(parent.toLowerCase()+'/') ? child : `${parent}/${child}`;
assert.equal(historyListingLimit({MaxImagesInHistory:{value:1000}}),1000);
assert.throws(()=>historyListingLimit({}),/verify/);
const directories = {'':{folders:['2026-10-04','Starred']},Starred:{folders:['2026-10-04'],files:[{src:'2026-10-03flat.png'}]},'Starred/2026-10-04':{files:[{src:'remote.png'}]}};
const favorites=await readSwarmFavorites(async path=>directories[path],1000,join);
assert.deepEqual([...favorites].sort(),['2026-10-03flat.png','2026-10-04/remote.png']);
await assert.rejects(()=>readSwarmFavorites(async path=>path?{files:[{src:'capped.png'}]}:{folders:['Starred']},1,join),/capped/);
await assert.rejects(()=>readSwarmFavorites(async()=>{throw new Error('offline');},1000,join),/offline/);
assert.equal((await readSwarmFavorites(async()=>({folders:[]}),1000,join)).size,0);

const output=(id,path,starred=false,folderId='folder-a')=>({id,swarmPath:path,swarmSourcePath:path,starred,folderId});
const records=[output('local-favorite','2026-10-04/local.png',true),output('remote','2026-10-04/remote.png'),output('flat','2026-10-03/flat.png'),output('delete','2026-10-04/remove.png'),output('alias','2026-10-04/remove.png'),output('elsewhere','2026-10-03/elsewhere.png',false,'folder-b'),output('local',''),output('starred-mirror','Starred/2026-10-04/other.png'),output('invalid','../outside.png')];
const pathFor=record=>record.swarmSourcePath || record.swarmPath;
assert.deepEqual(nonFavoriteTargets(records.filter(record=>record.folderId==='folder-a'),records,favorites,pathFor),[{path:'2026-10-04/remove.png',ids:['delete','alias']}]);
assert.equal(nonFavoriteTargets(records.filter(record=>record.starred),records,favorites,pathFor).length,0);
const protectedAlias=[output('a','2026-10-04/same.png'),output('b','2026-10-04/same.png',true,'folder-b')];
assert.equal(nonFavoriteTargets([protectedAlias[0]],protectedAlias,new Set(),pathFor).length,0);
const many=Array.from({length:301},(_,index)=>output(String(index),`2026-10-04/${index}.png`));
assert.equal(nonFavoriteTargets(many,many,new Set(),pathFor).length,301,'must include outputs beyond mounted page');
console.log('library cleanup contracts: ok');
