import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(app.includes('checkpoint-field-label'), 'Checkpoint composer must use the compact family-pill label.');
assert(!app.includes('<div class="checkpoint-meta"><b>'), 'Checkpoint title must not be duplicated below the dropdown.');
assert(app.includes('data-preset-apply="${index}"'), 'Preset stack rows must expose the apply-to-workspace action.');
assert(app.includes('Apply preset to prompt &amp; controls'), 'Preset apply icon must explain that it expands the preset into prompt and controls.');
assert(app.includes('[data-preset-apply]') && app.includes('void this.applyPresetFromStack(index);'), 'Preset apply action must call the existing workspace expansion path.');
assert(app.includes('Current stack · choose a saved stack…'), 'Saved LoRA stacks must be selected at stack scope.');
assert(app.includes('id="lora-profile-select"') && app.includes('addEventListener("change"'), 'Saved LoRA stack selection must load directly on change.');
assert(app.includes('class="lora-add-card"'), 'Add LoRA must live in the placeholder card after the stack.');
assert(!app.includes('title="Reorder in the modal"'), 'Normal LoRA rows must not advertise fake drag handles.');
assert(!app.includes('<span>${escapeHtml(item.name)}</span>'), 'Normal LoRA rows must not show the raw filename/path.');
assert(app.includes('const meta = [model?.author, modelFamily(model)]'), 'Normal LoRA rows should use lightweight metadata only.');
assert(app.includes('class="resolution-card"'), 'Resolution controls must render inside the raised resolution card.');
assert(css.includes('.resolution-card') && css.includes('.lora-add-card') && css.includes('.stack-profile-picker'), 'Composer hierarchy styles are incomplete.');
assert(css.includes('v0.63.21 mobile composer density'), 'Mobile composer density pass is missing.');
assert(css.includes('grid-template-areas:\n      \"thumb copy trigger actions\"\n      \"thumb weight trigger actions\"'), 'Mobile LoRA rows must keep Trigger in the right-side control rail.');
assert(css.includes('grid-template-rows:27px auto') && css.includes('transform:translateY(4px)'), 'Mobile Trigger control must stack its checkbox above its label beside enable/remove.');
assert(css.includes('.lora-section .section-icon-actions') && css.includes('flex-wrap:nowrap'), 'Mobile LoRA header actions must remain a compact single-row toolbar.');
assert(app.includes('const tabCreateSvg = `<svg class="tab-svg"') && app.includes('const tabLibrarySvg = `<svg class="tab-svg"') && app.includes('const tabTuneSvg = `<svg class="tab-svg"'), 'Studio navigation tabs must use inline Lucide-style SVGs instead of text glyphs.');
assert(app.includes('this.navButton("create", "Create", tabCreateSvg)') && app.includes('data-mobile-pane="generation"><span>${tabGenerationSvg}</span>Generation'), 'Desktop and mobile context tabs must share the SVG icon system.');
assert(app.includes('data-settings-pane="connection"><span>${tabConnectionSvg}</span>') && app.includes('data-settings-pane="backend"><span>${tabBackendSvg}</span>') && app.includes('data-settings-pane="appearance"><span>${tabAppearanceSvg}</span>'), 'Desktop Settings tabs must use the same SVG icon system.');
assert(app.includes('class="ghost-button prompt-clear"') && app.includes('${clearPromptSvg}<em>Clear</em>'), 'Prompt Clear must use an SVG action for visual continuity.');
assert(app.includes('class="card-actions image-card-actions"') && app.includes('class="image-card-action-buttons"') && app.includes('class="image-card-folder-select"'), 'Library cards must use the compact icon action rail plus separate folder control.');
assert(app.includes('${heartSvg}</button>'), 'Library favorite control must use an SVG heart instead of a text glyph.');
assert(css.includes('v0.63.21 visual continuity polish') && css.includes('.image-card-action-buttons') && css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), 'Library icon action rail styles are missing.');
assert(css.includes('.canvas-toolbar > div:last-child [data-reuse-output], .canvas-toolbar > div:last-child [data-nav="library"] { display: none; }'), 'Mobile Current Output must keep Inspect and drop redundant Reuse/Library actions.');
assert(app.includes('`<div class="output-caption"><span>${genStep ? `Step ${genStep} / ${genSteps}` : escapeHtml(this.generationMessage || "Starting…")}</span></div>`'), 'Live output caption must render one progress chip instead of duplicating the step counter.');

assert(app.includes('!this.loraBatchMode || this.loraMoveModalOpen || this.loraDeleteModalOpen'), 'LoRA organize rail must hide while its move/delete modal is open instead of floating above the dialog on mobile.');
assert(app.includes('data-action="finish-lora-batch">Done</button>') && app.includes("[data-action='finish-lora-batch']"), 'LoRA organize rail must expose a nearby Done action that exits batch mode.');
assert(css.includes('.lora-batch-rail-summary') && css.includes('.lora-batch-done'), 'LoRA organize Done affordance styles are missing.');
assert(app.includes('<b>Comfy runtime controls</b>') && app.includes('GPU 0 baseline') && app.includes('VRAM diagnostic'), 'Comfy runtime controls must use durable user-facing labels instead of machine-specific incident notes.');
assert(app.includes('Avoids page-locked host memory for CPU↔GPU transfers.') && app.includes('Forces model offload and transfers to run synchronously.'), 'Comfy memory/offload toggles need actionable explanations.');
assert(!app.includes('stops the mystery deaths') && !app.includes('excavate from the rubble') && !app.includes('Your crash test showed Comfy can still implode'), 'Runtime settings copy must not preserve incident-specific debugging jokes.');

assert(app.includes('builtInThemes.map((profile) =>') && app.includes('profile.name'), 'Appearance preset buttons must render the shared built-in theme definitions.');
assert(app.includes('fontField("titleFont"') && app.includes('fontField("subtitleFont"'), 'Appearance must expose separate title and subtitle font selectors.');
assert(app.includes('colorField("success", "Success / online", theme.success)') && app.includes('colorField("dangerSurface", "Danger surface", theme.dangerSurface)'), 'Appearance must expose semantic status/destructive colors.');
assert(css.includes('.theme-font-grid') && css.includes('.theme-font-field'), 'Theme typography controls are missing their layout styles.');
assert(css.includes('.status-chip.is-online {') && css.includes('.link-dimensions.is-active { color: var(--accent);'), 'Online and linked states must be fully theme-aware.');
assert(css.includes('.log-console {') && css.includes('background: var(--surface-alt);'), 'Light themes need a configurable log utility surface.');

console.log('Composer UI contract OK.');
