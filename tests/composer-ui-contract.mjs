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

console.log('Composer UI contract OK.');
