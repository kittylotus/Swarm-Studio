import assert from 'node:assert/strict';
import { recoverPresetParameters } from '../src/swarm/preset-recovery.ts';

const presets = [
  { title: 'base', param_map: { prompt: 'before {value} after', negativeprompt: 'bad, {value}', model: 'checkpoint.safetensors', steps: '30' } },
  { title: 'style', param_map: { prompt: ' style', negativeprompt: 'worse, {value}', cfgscale: '5' } },
  { title: 'nested', param_map: { prompt: '<preset:style>{value}' } },
  { title: 'cycle', param_map: { prompt: '<preset:cycle>' } },
];
const recovered = recoverPresetParameters({ prompt: '<preset:base><preset:style>subject', negativeprompt: 'blur', seed: 123 }, presets);
assert.equal(recovered.prompt, 'before subject after style');
assert.equal(recovered.negativeprompt, 'worse, bad, blur');
assert.equal(recovered.model, 'checkpoint.safetensors');
assert.equal(recovered.steps, '30');
assert.equal(recovered.cfgscale, '5');
assert.equal(recovered.seed, 123);
assert.equal(recoverPresetParameters({ prompt: '<preset:nested>subject' }, presets).prompt, ' stylesubject');
assert.throws(() => recoverPresetParameters({ prompt: '<preset:missing>' }, presets), /not available/);
assert.throws(() => recoverPresetParameters({ prompt: '<preset:cycle>' }, presets), /Recursive preset/);
assert.equal(recoverPresetParameters({ prompt: 'already resolved', negativeprompt: '' }, []).prompt, 'already resolved');
console.log('preset recovery contract: ok');
