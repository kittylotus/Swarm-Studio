import assert from 'node:assert/strict';
import { defaultSheet, expressionTiles, normalizeSheet, expressionRequest } from '../src/expressions/pipeline.ts';
import { animaWorkflow, isAnimaModel } from '../src/expressions/anima.ts';

import { node, schema } from './fixtures/anima-schema.mjs';

const project = { ...defaultSheet(), engine: 'anima', model: 'anima-base.safetensors', reference: 'data:image/png;base64,aGVsbG8=', subject: 'portrait, simple background' };
const tile = expressionTiles(1)[0];
const graph = animaWorkflow(project, tile, schema);
assert.equal(graph['1'].inputs.unet_name, 'diffusion/anima-base.safetensors');
assert.equal(graph['2'].inputs.type, 'stable_diffusion'); assert.deepEqual(graph['5'].inputs.vae, ['3', 0]);
assert.equal(graph['5'].inputs.ref_guidance, 4.5); assert.equal(graph['5'].inputs.strength, 1); assert.deepEqual(graph['9'].inputs.model, ['5', 0]);
assert.equal(graph['6'].inputs.text, expressionRequest(project, tile, []).prompt);
assert.equal(graph['11'].class_type, 'SwarmSaveImageWS');
assert.equal(isAnimaModel({ name: 'renamed', architecture: 'anima' }), true); assert.equal(isAnimaModel({ name: 'sdxl' }), false);
assert.equal(normalizeSheet(project).engine, 'anima'); assert.equal(normalizeSheet({ ...project, animaGuidance: 100 }).animaGuidance, 20);
assert.equal(normalizeSheet({ version: 1 }).animaAdapter, 'anima_ref_adapter_v2_r64.safetensors');
const lora = { id: 'a', name: 'detail.safetensors', enabled: true, useTrigger: true, triggerPhrase: 'extra detail', weight: .5 };
const stacked = animaWorkflow({ ...project, useLoras: true }, tile, schema, [lora]);
assert.deepEqual(stacked['5'].inputs.model, ['lora-0', 0]); assert.equal(stacked['lora-0'].inputs.lora_name, 'styles/detail.safetensors'); assert.match(stacked['6'].inputs.text, /^extra detail,/);
assert.throws(() => animaWorkflow({ ...project, useLoras: true }, tile, schema), /standalone/);
assert.throws(() => animaWorkflow({ ...project, reference: '' }, tile, schema), /reference/);
assert.throws(() => animaWorkflow(project, tile, { ...schema, AnimaRefAdapter: undefined }), /adapter weights/);
assert.throws(() => animaWorkflow(project, tile, { ...schema, UNETLoader: node({ unet_name: ['a/anima-base.safetensors', 'b/anima-base.safetensors'] }) }), /ambiguous/);
assert.throws(() => animaWorkflow(project, tile, { ...schema, AnimaRefAdapter: node({ ...Object.fromEntries(Object.entries(schema.AnimaRefAdapter.input.required).map(([key, [type]]) => [key, type])), surprise: 'MODEL' }, ['strength', 'ref_end', 'ref_megapixels']) }), /Unsupported required/);
assert.throws(() => animaWorkflow({ ...project, scheduler: 'unavailable' }, tile, schema), /scheduler/);
console.log('Anima reference graph and inventory contracts: ok');
