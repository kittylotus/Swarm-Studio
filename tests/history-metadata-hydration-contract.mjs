import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');

const ensureStart = app.indexOf('private async ensureOutputMetadata(output: OutputRecord)');
assert.notEqual(ensureStart, -1, 'ensureOutputMetadata must exist');
const ensureEnd = app.indexOf('\n  private async reuseLatestAsVariationSeed', ensureStart);
assert.notEqual(ensureEnd, -1, 'ensureOutputMetadata boundary must remain discoverable');
const ensure = app.slice(ensureStart, ensureEnd);

assert.doesNotMatch(ensure, /hasResolvedPrompt|if \(!hasResolvedPrompt/, 'history hydration must not treat any prompt as proof that metadata is fully resolved');
assert.match(ensure, /embeddedMetadataChecked\.has\(output\.id\)/, 'embedded history metadata reads must be deduplicated per output');
assert.match(ensure, /embeddedMetadataPending\.get\(output\.id\)/, 'concurrent embedded metadata reads must share a pending request');
assert.match(ensure, /await this\.embeddedMetadataFromDataUrl\(dataUrl\)/, 'history hydration must read the actual image metadata');
assert.match(ensure, /const timing = this\.generationTimingFromMetadata\(embedded\)/, 'embedded metadata must restore generation timing');
assert.match(ensure, /const params = \{ \.\.\.currentParams, \.\.\.embeddedParams \}/, 'embedded resolved values must override API metadata without dropping request-only params');
assert.match(ensure, /prompt: resolvedPrompt/, 'hydration must persist the resolved positive prompt onto the Library record');
assert.match(ensure, /negativePrompt: resolvedNegative/, 'hydration must persist the resolved negative prompt onto the Library record');
assert.match(ensure, /prepTimeMs: timing\.prepTimeMs \?\? output\.prepTimeMs/, 'embedded timing must restore prep time without erasing an existing value when absent');
assert.match(ensure, /generationTimeMs: timing\.generationTimeMs \?\? output\.generationTimeMs/, 'embedded timing must restore generation time without erasing an existing value when absent');
assert.match(ensure, /totalTimeMs: timing\.totalTimeMs \?\? output\.totalTimeMs/, 'embedded timing must restore total time without erasing an existing value when absent');

assert.match(app, /private async embeddedMetadataFromDataUrl\(dataUrl: string\)/, 'embedded metadata parsing must have one shared entry point');
assert.match(app, /data:image\\\/png/, 'shared embedded metadata parsing must support PNG parameters chunks');
assert.match(app, /data:image\\\/jpe\?g/, 'shared embedded metadata parsing must support JPEG user comments');
assert.match(app, /const metadata = await this\.embeddedMetadataFromDataUrl\(dataUrl\)/, 'seed recovery must use the same embedded metadata parser');

const inspectHandler = app.slice(
  app.indexOf('this.root.querySelectorAll<HTMLElement>("[data-inspect-output]")'),
  app.indexOf('this.root.querySelectorAll<HTMLElement>("[data-reuse-output]")'),
);
assert.match(inspectHandler, /if \(output\) \{[\s\S]*this\.ensureOutputMetadata\(output\)/, 'opening Inspect must lazily upgrade historical outputs even when API metadata already contains a prompt');
assert.doesNotMatch(inspectHandler, /metadataValue\([\s\S]*"prompt"[\s\S]*== null/, 'Inspect must not gate embedded hydration on a missing prompt');

const reuseStart = app.indexOf('private async reuseOutput(id: string)');
assert.notEqual(reuseStart, -1, 'Reuse All handler must exist');
const reuseEnd = app.indexOf('\n  private readDraftFromForm', reuseStart);
assert.notEqual(reuseEnd, -1, 'Reuse All boundary must remain discoverable');
const reuse = app.slice(reuseStart, reuseEnd);
assert.match(reuse, /const params = await this\.ensureOutputMetadata\(output\)/, 'Reuse All must await authoritative embedded metadata even if Inspect hydration is still pending');
assert.match(reuse, /metadataValue\(params, "prompt"\) \?\? output\.sentPrompt/, 'Reuse All must prefer the resolved embedded positive prompt over the source/tag prompt');
assert.match(reuse, /metadataValue\(params, "negativeprompt", "negative prompt"\) \?\? output\.negativePrompt/, 'Reuse All must prefer the resolved embedded negative prompt');
assert.match(reuse, /prompt: resolvedPrompt/, 'Reuse All must write the resolved prompt into the composer');
assert.match(reuse, /activePresets: \[\]/, 'Reuse All must not reapply source preset/tag expansion after materializing the resolved prompt');
assert.match(reuse, /seed: resolvedSeed != null && resolvedSeed >= 0 \? resolvedSeed/, 'Reuse All must restore the exact rendered seed for reproduction and variation-seed workflows');

console.log('history metadata hydration contract: ok');
