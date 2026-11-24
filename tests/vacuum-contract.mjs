import assert from 'node:assert/strict';
import { classifyVacuum, parseLumiSnapshot } from '../src/library/vacuum.ts';
import { scanSwarmHistory } from '../src/library/inventory.ts';
import { newStudioMetadata, readStudioMetadata, tagStudioRequest } from '../src/library/provenance.ts';

const now = Date.now(), scope = JSON.stringify(['https://swarm.test', 'local', true]);
const draft = newStudioMetadata('expression_draft'); draft.studio_created_at = String(now - 8 * 86400000);
const final = newStudioMetadata('upscale_result', draft);
const file = (path, tag) => ({ path, metadata: JSON.stringify({ sui_extra_data: tag }) });
const files = [file('day/draft.png', draft), file('day/final.png', final)];
const snapshot = { schema: 1, generatedAt: now, complete: true, claims: [], coverage: ['fixture-only'], activeJobs: false };
const context = { scope, now, complete: true, activeJobs: false, snapshot, favorites: new Set(), exclusions: new Set() };
const rows = (overrides = {}, inventory = files) => classifyVacuum(inventory, { ...context, ...overrides });
assert.equal(rows()[0].status, 'candidate');
assert.equal(rows()[1].status, 'protected', 'finals stay protected');
for (const overrides of [{ complete: false }, { scope: '' }, { snapshot: null }, { snapshot: { ...snapshot, complete: false } }, { snapshot: { ...snapshot, generatedAt: now - 16 * 60000 } }, { snapshot: { ...snapshot, generatedAt: now + 1 } }])
    assert.equal(rows(overrides)[0].status, 'review');
for (const overrides of [{ activeJobs: true }, { snapshot: { ...snapshot, activeJobs: true } }, { exclusions: new Set(['day/draft.png']) }, { favorites: new Set(['draft.png']) }, { favorites: new Set(['daydraft.png']) }])
    assert.equal(rows(overrides)[0].status, 'protected');
assert.equal(rows({}, [files[0]])[0].status, 'review', 'deleted replacement is never sufficient');
assert.equal(rows({}, [...files, file('elsewhere/collision.png', draft)])[0].status, 'review');
assert.equal(rows({}, [file('day/draft.png', { ...draft, studio_batch_size: '2' }), files[1]])[0].status, 'review');
assert.equal(rows({}, [files[0], file('day/final.png', { ...final, studio_pipeline_id: newStudioMetadata().studio_asset_id })])[0].status, 'review');
assert.equal(rows({}, [...files, { ...files[0], path: 'DAY/DRAFT.PNG' }])[0].status, 'review');
assert.equal(rows({}, [file('day/draft.png', { ...draft, studio_parent_id: draft.studio_asset_id }), files[1]])[0].status, 'review');
assert.equal(rows({}, [file('../outside.png', draft), files[1]])[0].status, 'review');
assert.equal(rows({}, [file('old.png', {}), files[1]])[0].status, 'review');
assert.equal(rows({}, [file('recent.png', { ...draft, studio_created_at: String(now) }), files[1]])[0].status, 'protected');
const claim = { assetId: draft.studio_asset_id, imageId: 'lumi-image', swarmPath: 'day/draft.png', swarmPathVerified: true, persisted: true, usableCopyVerified: false, references: [], protected: false, scope, metadata: draft };
const referenced = { ...snapshot, claims: [{ ...claim, references: ['chat'] }] };
assert.equal(rows({ snapshot: referenced })[0].status, 'protected', 'references changing after scan affect reclassification');
const conflict={...snapshot,complete:false,claims:[{...claim,scope:'different-server'}]};
assert.match(rows({snapshot:conflict})[0].reason,/connection differs/);
assert.equal(rows({snapshot:{...conflict,claims:[{...conflict.claims[0],references:['expression-set']}]}})[0].status,'protected','known references protect even when connection scope conflicts');

assert.equal(rows({ snapshot: { ...snapshot, claims: [{ ...claim, scope: 'another-user' }] } })[0].status, 'review');
assert.equal(rows({ snapshot: { ...snapshot, claims: [{ ...claim, swarmPathVerified: false }] } })[0].status, 'review');
assert.equal(rows({}, [file('day/draft.png', { ...draft, studio_origin: 'lumiswarm' }), files[1]])[0].status, 'review');
assert.equal(readStudioMetadata({ ...draft, studio_retention: 1 }), null);
assert.equal(readStudioMetadata({ ...draft, studio_schema: '2' }), null);
assert.throws(() => parseLumiSnapshot({ ...snapshot, claims: [{}] }), /Invalid/);
for (const referenceAudit of [null, {}, [null], [{source:'chats',status:4}], [{source:'chats',status:'listed',records:-1}]])
    assert.throws(() => parseLumiSnapshot({ ...snapshot, referenceAudit }), /Invalid/, 'malformed audit must not crash the review UI');
assert.equal(rows({localAuditComplete:false})[0].status,'review');
assert.equal(rows({localReferences:new Set(['day/draft.png'])})[0].status,'protected');
assert.equal(parseLumiSnapshot(snapshot), snapshot);
const request = { images: 1, extra_metadata: { client_note: 'preserve me' } };
const first = tagStudioRequest(request); tagStudioRequest(request);
assert.equal(request.extra_metadata.studio_asset_id, first.studio_asset_id, 'transport fallback keeps identity');
assert.equal(request.extra_metadata.client_note, 'preserve me');
assert.equal(final.studio_parent_id, draft.studio_asset_id);
assert.equal(final.studio_pipeline_id, draft.studio_pipeline_id);

const join = (parent, child) => parent ? `${parent}/${child}` : child;
const tree = { '': { folders: ['day', 'Starred'], files: [] }, day: { folders: [], files: [{ src: 'draft.png', metadata: 'tag' }] }, Starred: { folders: [], files: [{ src: 'draft.png' }] } };
const scanned = await scanSwarmHistory(async (path, depth) => { assert.equal(depth, 1, 'depth zero cannot discover child directories'); return tree[path]; }, 1000, join);
assert.equal(scanned.complete, true); assert.equal(scanned.files[0].src, 'day/draft.png'); assert.ok(scanned.favorites.has('draft.png'));
const recursive = await scanSwarmHistory(async path => path === '' ? { ...tree[''], files: [{ src: 'day/draft.png' }] } : tree[path], 1000, join);
assert.equal(recursive.files.length, 1, 'older servers returning recursive files do not create duplicate identities');
await assert.rejects(() => scanSwarmHistory(async path => tree[path], 1, join), /capped/);
await assert.rejects(() => scanSwarmHistory(async () => ({}), 1000, join), /Malformed/);
await assert.rejects(() => scanSwarmHistory(async () => ({ folders: ['../escape'], files: [] }), 1000, join), /path/);
const controller = new AbortController();
await assert.rejects(() => scanSwarmHistory(async path => { controller.abort(); return tree[path]; }, 1000, join, controller.signal), { name: 'AbortError' });
await assert.rejects(() => scanSwarmHistory(async () => { throw new Error('offline'); }, 1000, join), /offline/);
console.log('Vacuum provenance, conservative eligibility, changing references, complete inventory and cancellation: PASS');
