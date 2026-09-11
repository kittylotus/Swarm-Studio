import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGION_LAYOUT_PRESETS,
  applyRegionLayoutPreset,
  applyRegionPresetSpacing,
  compileRegionalPrompt,
  emptyRegionalPromptDraft,
  hasRegionalPromptContent,
  moveRegionGeometry,
  normalizeRegionalPromptDraft,
  regionOverlapAreas,
  resizeRegionGeometry,
} from '../src/regions.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function close(actual, expected, message) {
  if (Math.abs(actual - expected) > 1e-9) throw new Error(`${message} Expected ${expected}, got ${actual}.`);
}

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');

assert(REGION_LAYOUT_PRESETS.length === 5, 'Regional prompting must expose exactly the five preset layouts.');
assert(REGION_LAYOUT_PRESETS.some((preset) => preset.id === 'left-right'), 'Left / Right region preset is missing.');
assert(REGION_LAYOUT_PRESETS.some((preset) => preset.id === 'top-bottom'), 'Top / Bottom region preset is missing.');
assert(REGION_LAYOUT_PRESETS.some((preset) => preset.id === 'three-columns'), 'Three-column region preset is missing.');
assert(REGION_LAYOUT_PRESETS.some((preset) => preset.id === 'three-rows'), 'Three-row region preset is missing.');
assert(REGION_LAYOUT_PRESETS.some((preset) => preset.id === 'grid-2x2'), '2x2 region preset is missing.');

let regional = applyRegionLayoutPreset(emptyRegionalPromptDraft(), 'left-right');
assert(regional.regions.length === 2, 'Left / Right must create two regions.');
assert(regional.regions[0].x === 0 && regional.regions[0].width === 0.5, 'Left region geometry is wrong.');
assert(regional.regions[1].x === 0.5 && regional.regions[1].width === 0.5, 'Right region geometry is wrong.');

regional = applyRegionPresetSpacing(regional, 0.06);
assert(regional.spacing === 0.06, 'Positive region spacing must persist as normalized draft state.');
assert(!regional.customGeometry, 'Preset spacing must stay in preset geometry mode.');
close(regional.regions[0].width, 0.47, 'Positive spacing must inset the left region by half the shared gap.');
close(regional.regions[1].x, 0.53, 'Positive spacing must move the right region away from the shared edge.');
close(regional.regions[1].width, 0.47, 'Positive spacing must preserve the outer canvas edge.');
assert(regionOverlapAreas(regional.regions).length === 0, 'Positive spacing must not create overlap.');

regional = applyRegionPresetSpacing(regional, -0.1);
assert(regional.spacing === -0.1, 'Negative region spacing must persist as overlap state.');
close(regional.regions[0].width, 0.55, 'Negative spacing must expand the left region into the shared edge.');
close(regional.regions[1].x, 0.45, 'Negative spacing must expand the right region into the shared edge.');
close(regional.regions[1].width, 0.55, 'Negative spacing must preserve the right outer canvas edge.');
const leftRightOverlap = regionOverlapAreas(regional.regions);
assert(leftRightOverlap.length === 1, 'Negative Left / Right spacing must create one overlap area.');
close(leftRightOverlap[0].x, 0.45, 'Overlap must begin where the right region begins.');
close(leftRightOverlap[0].width, 0.1, 'A -10% spacing value must create a 10% overlap.');
close(leftRightOverlap[0].height, 1, 'Left / Right overlap must span full height.');

regional = applyRegionPresetSpacing(regional, 0.06);
regional.regions[0].prompt = 'blonde hair, blue coat';
regional.regions[1].prompt = 'black hair, red jacket';
regional.regions[1].strength = 0.75;
regional.backgroundEnabled = true;
regional.backgroundPrompt = 'rainy city street';
const compiled = compileRegionalPrompt('cinematic photograph', regional);
assert(compiled === [
  'cinematic photograph',
  '<region:0,0,0.47,1,1> blonde hair, blue coat',
  '<region:0.53,0,0.47,1,0.75> black hair, red jacket',
  '<region:background> rainy city street',
].join('\n'), `Unexpected regional syntax:\n${compiled}`);
assert(hasRegionalPromptContent(regional), 'Regional content detector must notice enabled regional prompts.');

regional.regions[0].enabled = false;
regional.regions[1].prompt = '';
regional.backgroundEnabled = false;
assert(!hasRegionalPromptContent(regional), 'Disabled/empty regional prompts must not count as generation content.');
assert(compileRegionalPrompt('base prompt', regional) === 'base prompt', 'Disabled/empty regions must not alter the global prompt.');

const threeGap = applyRegionPresetSpacing(applyRegionLayoutPreset(emptyRegionalPromptDraft(), 'three-columns'), 0.04);
assert(threeGap.regions.length === 3, 'Three-column preset must create three regions.');
close(threeGap.regions[0].width, 1 / 3 - 0.02, 'Outer columns must lose only half a positive gap at their shared edge.');
close(threeGap.regions[1].x, 1 / 3 + 0.02, 'Middle column must inset at its left shared edge.');
close(threeGap.regions[1].width, 1 / 3 - 0.04, 'Middle column must inset on both positive-gap edges.');
close(threeGap.regions[2].x, 2 / 3 + 0.02, 'Three-column gap must preserve the right outer edge.');

const threeOverlap = applyRegionPresetSpacing(applyRegionLayoutPreset(emptyRegionalPromptDraft(), 'three-columns'), -0.04);
close(threeOverlap.regions[0].width, 1 / 3 + 0.02, 'Outer columns must expand half an overlap into the shared edge.');
close(threeOverlap.regions[1].x, 1 / 3 - 0.02, 'Middle column must expand left for negative spacing.');
close(threeOverlap.regions[1].width, 1 / 3 + 0.04, 'Middle column must expand into both neighbors for negative spacing.');
assert(regionOverlapAreas(threeOverlap.regions).length === 2, 'Three columns with negative spacing must expose two overlap areas.');

const grid = applyRegionPresetSpacing(applyRegionLayoutPreset(emptyRegionalPromptDraft(), 'grid-2x2'), 0.08);
close(grid.regions[0].width, 0.46, '2x2 positive spacing must create the vertical gutter.');
close(grid.regions[0].height, 0.46, '2x2 positive spacing must create the horizontal gutter.');
close(grid.regions[3].x, 0.54, '2x2 positive spacing must inset bottom-right on X.');
close(grid.regions[3].y, 0.54, '2x2 positive spacing must inset bottom-right on Y.');

const remappedDefaults = applyRegionLayoutPreset(applyRegionLayoutPreset(emptyRegionalPromptDraft(), 'left-right'), 'top-bottom');
assert(remappedDefaults.regions[0].name === 'Top' && remappedDefaults.regions[1].name === 'Bottom', 'Switching layouts must update untouched default region names.');
const named = applyRegionLayoutPreset(emptyRegionalPromptDraft(), 'left-right');
named.regions[0].name = 'Alice';
assert(applyRegionLayoutPreset(named, 'top-bottom').regions[0].name === 'Alice', 'Custom region names must survive layout changes by index.');

const movable = { ...applyRegionLayoutPreset(emptyRegionalPromptDraft(), 'grid-2x2').regions[0] };
const moved = moveRegionGeometry(movable, 0.3, 0.2);
close(moved.x, 0.3, 'Freeform dragging must move X in normalized space.');
close(moved.y, 0.2, 'Freeform dragging must move Y in normalized space.');
const clampedMove = moveRegionGeometry(movable, 9, 9);
close(clampedMove.x, 0.5, 'Dragging must clamp against the right canvas edge.');
close(clampedMove.y, 0.5, 'Dragging must clamp against the bottom canvas edge.');

const resized = resizeRegionGeometry(movable, 'se', 0.2, 0.1);
close(resized.width, 0.7, 'South-east resize must grow width from the dragged edge.');
close(resized.height, 0.6, 'South-east resize must grow height from the dragged edge.');
const northWest = resizeRegionGeometry(movable, 'nw', 0.2, 0.2);
close(northWest.x, 0.2, 'North-west resize must move the left edge.');
close(northWest.y, 0.2, 'North-west resize must move the top edge.');
close(northWest.width, 0.3, 'North-west resize must preserve the opposite X edge.');
close(northWest.height, 0.3, 'North-west resize must preserve the opposite Y edge.');
const minimum = resizeRegionGeometry(movable, 'se', -9, -9);
close(minimum.width, 0.05, 'Resize must enforce the editor minimum width.');
close(minimum.height, 0.05, 'Resize must enforce the editor minimum height.');

const normalized = normalizeRegionalPromptDraft({
  layout: 'grid-2x2',
  spacing: -99,
  customGeometry: true,
  regions: [{ name: 'unsafe', x: -2, y: 2, width: 9, height: 0, strength: 99, prompt: 'x', enabled: true }],
  backgroundEnabled: true,
  backgroundPrompt: 'bg',
});
assert(normalized.customGeometry, 'Custom geometry mode must survive persistence normalization.');
assert(normalized.regions[0].x === 0 && normalized.regions[0].y === 0.999, 'Persisted regional coordinates must clamp inside normalized canvas bounds.');
assert(normalized.regions[0].width === 1 && normalized.regions[0].height === 0.001, 'Persisted regional size must clamp safely.');
assert(normalized.regions[0].strength === 99, 'Regional strength must not invent an undocumented upper cap.');
assert(normalized.spacing === -0.2, 'Persisted negative region spacing must clamp to the editor-safe -20% maximum.');
const migrated = normalizeRegionalPromptDraft({ layout: 'left-right', gutter: 0.07, regions: [] });
assert(migrated.spacing === 0.07, 'Legacy gutter-only drafts must migrate to signed spacing.');

assert(app.includes('data-action="open-region-editor"'), 'Create prompt dock must expose the Regions editor.');
assert(app.includes('data-region-layout="${preset.id}"'), 'Region editor must render preset layout controls.');
assert(app.includes('data-region-spacing'), 'Region editor must expose signed spacing.');
assert(app.includes('min="-20" max="20"'), 'Signed spacing must expose overlap and gap ranges.');
assert(app.includes('applyRegionPresetSpacing(this.store.state.draft.regionalPrompt, spacing)'), 'Spacing control must regenerate preset geometry without inventing backend syntax.');
assert(app.includes('data-region-drag="${index}"'), 'Preview regions must be draggable.');
assert(app.includes('data-region-resize="${index}:${handle}"'), 'Preview regions must expose resize handles.');
assert(app.includes('moveRegionGeometry(activePointer.startRegion, dx, dy)'), 'Pointer dragging must use normalized region geometry helpers.');
assert(app.includes('resizeRegionGeometry(activePointer.startRegion, activePointer.handle, dx, dy)'), 'Pointer resizing must use normalized region geometry helpers.');
assert(app.includes('next.customGeometry = true'), 'Manual geometry edits must leave preset-locked mode.');
assert(app.includes('regionOverlapAreas(regional.regions)'), 'Region editor must visualize actual overlap geometry.');
assert(app.includes('compileRegionalPrompt(basePrompt, draft.regionalPrompt)'), 'Create generation must compile structured regional state at request time.');
assert(app.includes('studioRegionalPrompt: cloneRegionalPromptDraft(draft.regionalPrompt)'), 'Output request snapshots must preserve structured regional state.');
assert(!app.includes('Split the prompt, not your patience.'), 'Partypooper pass must remove the regional editor snark tagline.');
assert(css.includes('regional prompting: preset geometry, signed spacing, and freeform editing'), 'Regional freeform editor styles are missing.');
assert(css.includes('.region-spacing-control') && css.includes('.region-resize-handle') && css.includes('.region-preview-overlap') && css.includes('.region-prompt-card.is-selected'), 'Regional signed-spacing/freeform UI contract is incomplete.');
assert(css.includes('display:block;\n    overflow-x:hidden;\n    overflow-y:auto;'), 'Mobile region editor must use normal block flow so preset content cannot paint over the prompt panel.');
assert(css.includes('.region-resize-n,\n  .region-resize-e,\n  .region-resize-s,\n  .region-resize-w {\n    display:none;'), 'Mobile freeform editor must simplify resize affordances to corner handles.');
assert(css.includes('pointer-events:none;\n  touch-action:none;') && css.includes('opacity:1;\n  pointer-events:auto;'), 'Hidden resize handles must not steal pointer input before selection.');

console.log('Region preset contract OK.');
