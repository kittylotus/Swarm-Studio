import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  applyLoraFacetView,
  buildLoraFacetCounts,
  effectiveFacetMetadata,
  emptyCivitaiFacetCache,
  isFacetRecordFresh,
  modelMatchesFacetFilters,
  normalizeCivitaiFacetCache,
  normalizeFacetTags,
  selectFacetEnrichmentCandidates,
} from '../src/civitai/facets.ts';

const models = [
  { name: 'characters/till.safetensors', title: 'Till', author: 'Kitty', architecture: 'anima', tags: ['Character', 'male', 'uniform'] },
  { name: 'styles/ink.safetensors', title: 'Ink', author: 'Painter', architecture: 'anima', tags: ['Style', 'line art'] },
  { name: 'poses/lean.safetensors', title: 'Lean Pose', author: '', architecture: 'anima', tags: [] },
  { name: 'misc/unknown.safetensors', title: 'Unknown', architecture: 'sdxl', tags: [] },
];

const cache = normalizeCivitaiFacetCache({ version: 1, records: {
  'lean': {
    modelKey: 'lean', status: 'matched', fetchedAt: Date.now(), modelId: 77, versionId: 88,
    tags: ['Pose', 'standing', 'pose'], creator: 'PoseMaker', family: 'anima', downloads: 1200, rating: 4.8, ratingCount: 20, createdAt: '2026-01-05T00:00:00Z',
  },
  'ink': {
    modelKey: 'ink', status: 'matched', fetchedAt: Date.now(),
    tags: ['style', 'monochrome'], creator: 'Painter', family: 'anima', downloads: 5000, rating: 4.5, createdAt: '2026-05-05T00:00:00Z',
  },
} });

assert.deepEqual(normalizeFacetTags([' Style ', 'style', { name: 'POSE' }, { name: 'pose' }, '']), ['Style', 'POSE']);
assert.equal(effectiveFacetMetadata(models[1], cache).tags.join('|'), 'Style|line art|monochrome');
assert.equal(effectiveFacetMetadata(models[2], cache).creator, 'PoseMaker');

const baseFilters = { tags: [], creator: '', family: '', metadata: 'all', sort: 'name' };
assert.equal(modelMatchesFacetFilters(models[0], cache, { ...baseFilters, tags: ['uniform', 'pose'] }), true, 'tags are OR within the tag facet');
assert.equal(modelMatchesFacetFilters(models[2], cache, { ...baseFilters, tags: ['uniform', 'pose'] }), true, 'cached CivitAI tags participate in tag OR matching');
assert.equal(modelMatchesFacetFilters(models[0], cache, { ...baseFilters, tags: ['uniform'], creator: 'PoseMaker' }), false, 'creator ANDs with tag selection');
assert.equal(modelMatchesFacetFilters(models[2], cache, { ...baseFilters, tags: ['pose'], creator: 'PoseMaker', family: 'anima' }), true, 'creator/family AND across facet groups');
assert.equal(modelMatchesFacetFilters(models[3], cache, { ...baseFilters, metadata: 'unclassified' }), true);
assert.equal(modelMatchesFacetFilters(models[2], cache, { ...baseFilters, metadata: 'matched' }), true);
assert.equal(modelMatchesFacetFilters(models[0], cache, { ...baseFilters, metadata: 'stats-uncached' }), true);

const counts = buildLoraFacetCounts(models, cache);
assert.equal(counts.tags.find((item) => item.name.toLowerCase() === 'style')?.count, 1, 'native/cache duplicate tags collapse per model');
assert.equal(counts.tags.find((item) => item.name.toLowerCase() === 'pose')?.count, 1);
assert.equal(counts.unclassified, 1);
assert.equal(counts.matched, 2);
assert.equal(counts.statsUncached, 2, 'uncached CivitAI stats remain distinct from local classification');
assert.equal(counts.unclassifiedLookupDue, 1, 'only genuinely unclassified + stale models are primary enrichment candidates');

assert.deepEqual(applyLoraFacetView(models, cache, { ...baseFilters, sort: 'downloads' }).slice(0, 2).map((model) => model.title), ['Ink', 'Lean Pose']);
assert.deepEqual(applyLoraFacetView(models, cache, { ...baseFilters, sort: 'rating' }).slice(0, 2).map((model) => model.title), ['Lean Pose', 'Ink']);
assert.deepEqual(applyLoraFacetView(models, cache, { ...baseFilters, tags: ['pose'] }).map((model) => model.title), ['Lean Pose']);

const classificationCandidates = selectFacetEnrichmentCandidates(models, cache, 'classification', [], 24);
assert.deepEqual(classificationCandidates.map((model) => model.title), ['Unknown'], 'classification enrichment targets only unclassified stale models');
const statsCandidates = selectFacetEnrichmentCandidates(models, cache, 'stats', ['characters/till.safetensors'], 24);
assert.deepEqual(statsCandidates.map((model) => model.title), ['Till', 'Unknown'], 'stats enrichment prioritizes visible/preferred models before the rest');

const empty = emptyCivitaiFacetCache();
assert.deepEqual(empty, { version: 1, records: {} });
assert.equal(isFacetRecordFresh({ modelKey: 'a', tags: [], status: 'matched', fetchedAt: 1000 }, 10_000, 10_000), true);
assert.equal(isFacetRecordFresh({ modelKey: 'a', tags: [], status: 'error', fetchedAt: 1000 }, 10_000_000, 1000 + 31 * 60 * 1000), false, 'transient errors retry quickly');
assert.equal(isFacetRecordFresh({ modelKey: 'a', tags: [], status: 'unmatched', fetchedAt: 1000 }, 20 * 86400000, 1000 + 8 * 86400000), false, 'unmatched hash results eventually retry');


const root = fileURLToPath(new URL('..', import.meta.url));
const appSource = readFileSync(join(root, 'src/app.ts'), 'utf8');
const cssSource = readFileSync(join(root, 'src/styles.css'), 'utf8');
assert.match(appSource, /LOCAL LORA FACETS/, 'mobile facet sheet must remain wired');
assert.match(appSource, /selectFacetEnrichmentCandidates\([\s\S]*?24,/, 'enrichment pass must stay bounded');
assert.match(appSource, /Math\.min\(3, candidates\.length\)/, 'enrichment concurrency must stay bounded');
assert.match(appSource, /Enrich unclassified/, 'classification enrichment must be labeled separately from optional CivitAI stats');
assert.match(appSource, /Fetch stats/, 'desktop CivitAI stats action must remain explicit');
assert.match(appSource, /Fetch CivitAI stats/, 'mobile CivitAI stats action must remain explicit');
assert.match(appSource, /CivitAI stats uncached/, 'status/filter copy must distinguish uncached stats from missing classification');
assert.doesNotMatch(appSource, /Enrich metadata ·|Needs enrichment ·|Enrich up to 24 missing/, 'UI must not call uncached CivitAI stats missing metadata');
assert.match(appSource, /savedFacetMetadata === "needs-enrichment" \? "stats-uncached"/, 'legacy metadata filter preference must migrate safely');
assert.match(appSource, /model-versions\/by-hash/, 'facets must resolve CivitAI from the Swarm model hash');
assert.match(appSource, /OR within tags; AND with the fields above/, 'facet semantics must stay visible in the UI');
assert.match(cssSource, /\.lora-facet-toolbar--desktop/, 'desktop facet toolbar styling is missing');
assert.match(cssSource, /\.lora-facet-mobile-modal/, 'mobile facet sheet styling is missing');

console.log('CivitAI facet contract OK');
