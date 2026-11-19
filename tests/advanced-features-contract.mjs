import assert from 'node:assert/strict';
import { advancedCatalog, activeAdvancedParams, applyAdvancedFeature, featureEnabled, featureInStudio, featureValues } from '../src/advanced/catalog.ts';

const groups = [
  { id: 'refine', name: 'Refine / Upscale', toggles: true },
  { id: 'controlnet', name: 'ControlNet', toggles: true },
  { id: 'controlnettwo', name: 'ControlNet Two', toggles: true },
  { id: 'sampling', name: 'Sampling' },
  { id: 'internal', name: 'Swarm Internal' },
];
const params = [
  { id: 'steps', name: 'Steps', group: 'sampling', type: 'integer', default: 20 },
  { id: 'server_scheduler', name: 'Schedule Type', group: 'sampling', default: 'normal' },
  { id: 'images', name: 'Images', default: 1 },
  { id: 'refiner_model', name: 'Refiner Model', group: 'refine', type: 'model' },
  { id: 'refine_strength', name: 'Refine Strength', group: 'refine', type: 'decimal', default: .2 },
  { id: 'control_strength', name: 'Control Strength', group: 'controlnet', default: 1 },
  { id: 'control_two_strength', name: 'Control Two Strength', group: 'controlnettwo', default: .8 },
  { id: 'eta', name: 'Eta', group: 'sampling', type: 'decimal', default: 0 },
  { id: 'brand_new_param', name: 'New server option', default: 42 },
  { id: 'hidden', extra_hidden: true, group: 'refine' },
  { id: 'private', visible: false, group: 'refine' },
  { id: 'donotsave', name: 'Do Not Save', type: 'boolean', group: 'internal' },
];
const catalog = advancedCatalog(params, groups), get = id => catalog.find(feature => feature.id === id);
assert.ok(!catalog.flatMap(f => f.params).some(p => ['steps', 'server_scheduler', 'images', 'hidden', 'private', 'donotsave'].includes(p.id)));
assert.ok(get('other').params.some(p => p.id === 'brand_new_param'), 'new public fields remain browsable without a hardcoded advanced flag');
assert.equal(get('controlnet').category, get('controlnettwo').category);
assert.notEqual(get('controlnet').id, get('controlnettwo').id, 'ControlNet slots keep independent server toggles');
const draft = { extraParams: { 'Refiner Model': 'detail.safetensors', steps: 90, eta: .1, retired: 9, donotsave: true }, advancedEnabledGroups: ['refine'], advancedStudioFeatures: [], advancedDisabledFeatures: [] };
assert.equal(featureInStudio(get('refine'), draft), true, 'legacy overrides are discovered');
assert.equal(featureValues(get('refine'), draft.extraParams).refiner_model, 'detail.safetensors');
let request = activeAdvancedParams(draft, params, groups);
assert.equal(request.refiner_model, 'detail.safetensors');
assert.equal(request.refine_strength, .2, 'enabled groups send server defaults without depending on UI filters');
assert.ok(!('steps' in request) && !('retired' in request));
assert.equal(request.donotsave, true, 'Studio review-before-save is preserved');
let next = { ...draft, ...applyAdvancedFeature(get('sampling'), { enabled: false, values: { eta: .4 } }, draft) };
assert.equal(featureInStudio(get('sampling'), next), true);
assert.equal(featureEnabled(get('sampling'), next), false);
assert.ok(!('eta' in activeAdvancedParams(next, params, groups)));
assert.equal(next.extraParams.eta, .4, 'disabling keeps the value');
next = { ...next, ...applyAdvancedFeature(get('sampling'), { enabled: true, values: { eta: .4 } }, next) };
assert.equal(activeAdvancedParams(next, params, groups).eta, .4);
next = { ...next, ...applyAdvancedFeature(get('refine'), { enabled: false, values: {} }, next, true) };
assert.equal(featureInStudio(get('refine'), next), false);
assert.equal(activeAdvancedParams(next, params, groups).refiner_model, undefined);
assert.equal(activeAdvancedParams(next, params, groups).eta, .4, 'removing one feature preserves another');
assert.equal(next.extraParams.retired, 9, 'unrelated stored values are not destroyed');
assert.equal(draft.extraParams['Refiner Model'], 'detail.safetensors', 'applying is immutable');
console.log('PASS: common-control deduplication and aliases, unknown public fields, independent slots, legacy migration, enabled defaults, request filtering, disable/re-enable, feature removal.');
