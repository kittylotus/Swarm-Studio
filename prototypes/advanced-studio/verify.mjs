import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Model/render smoke checks only. This minimal DOM does not verify browser layout.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const markup = html.slice(0, html.indexOf('<script>'));
const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'static markup must not contain duplicate IDs');
assert.match(markup, /<input id="search"/, 'search ID belongs to the input');
assert.doesNotMatch(markup, /<symbol id="search"/, 'icons must not shadow input IDs');
for (const match of markup.matchAll(/<use href="#([^"]+)"/g)) {
  assert.ok(ids.includes(match[1]), `icon reference ${match[1]} must exist`);
}
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const nodes = new Map();
function node(selector) {
  if (!nodes.has(selector)) nodes.set(selector, {
    innerHTML: '', textContent: '', value: selector === '#category' ? 'All workflows' : '',
    isConnected: true, dataset: {}, open: false, focused: false, listeners: {}, classList: { add() {}, remove() {} },
    focus() { this.focused = true; }, setAttribute() {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    showModal() { this.open = true; }, close() { this.open = false; },
    querySelector: node, querySelectorAll: () => [],
  });
  return nodes.get(selector);
}
const nativeOpen = () => { throw new Error('Native window.open must not be used for the modal'); };
const nativeClose = () => { throw new Error('Native window.close must not be used for the modal'); };
const context = vm.createContext({ open: nativeOpen, close: nativeClose, document: { querySelector: node, querySelectorAll: () => [] }, structuredClone, setTimeout: () => 1, clearTimeout() {} });
const instrumented = script.replace(/\}\)\(\);\s*$/, 'globalThis.runInside = code => eval(code);\n})();');
vm.runInContext(instrumented, context);
const run = code => context.runInside(code);
assert.equal(context.open, nativeOpen, 'script must not overwrite browser APIs');
assert.equal(context.close, nativeClose, 'script must not overwrite browser APIs');
const advancedButton = node('#open-advanced'), dialog = node('#advanced');
assert.equal(dialog.open, false, 'start in Studio so the entry action is visible');
for (let i = 0; i < 3; i++) {
  advancedButton.onclick({ currentTarget: advancedButton });
  assert.equal(dialog.open, true, 'Advanced button opens the dialog');
  node('#close-modal').onclick();
  assert.equal(dialog.open, false, 'Close button closes the dialog');
  assert.equal(advancedButton.focused, true, 'closing restores focus');
}
advancedButton.onclick({ currentTarget: advancedButton });
dialog.listeners.cancel({ preventDefault() {} });
assert.equal(dialog.open, false, 'Escape cancel closes the dialog');
node('#studio-pills').onclick({ target: { closest: () => ({ dataset: { pill: 'controlnet' } }) } });
assert.equal(dialog.open, true, 'Studio pill opens Advanced');
assert.match(node('#detail').innerHTML, /ControlNet/);
node('#close-modal').onclick();
assert.match(node('#feature-list').innerHTML, /Refine &amp; upscale|Refine & upscale/);
assert.match(node('#studio-pills').innerHTML, /ControlNet/);
run("search.value='sampler';renderList()");
assert.match(node('#feature-list').innerHTML, /Already in Studio/);
run("search.value='nothing-matches-this';renderList()");
assert.match(node('#feature-list').innerHTML, /No features here yet/);
run("search.value='';view='Pinned';pins.clear();renderList()");
assert.match(node('#feature-list').innerHTML, /No features here yet/);
run("selected='refiner';draft(byId(selected)).values.scale=3");
assert.equal(run("sent.refiner"), undefined, 'draft edits must not apply before send');
run("sent[selected]=structuredClone(draft(byId(selected)));renderPills()");
assert.match(node('#studio-pills').innerHTML, /Refine &amp; upscale/);
run("draft(byId(selected)).values.scale=4");
assert.equal(run('sent.refiner.values.scale'), 3, 'sent values must not alias editor drafts');
run("sent.refiner.enabled=false;renderPills()");
assert.match(node('#studio-pills').innerHTML, /off/);
run("delete sent.refiner;renderPills()");
assert.doesNotMatch(node('#studio-pills').innerHTML, /Refine &amp; upscale/);
vm.runInContext(instrumented, context);
console.log('PASS: unique DOM IDs, search targets input, icon references, entry opens/closes/reopens, Escape, focus return, pill opening, browser API isolation, repeated initialization, catalog rendering, search/common-control results, empty pins, staged edits, independent sent values, disabled pill, removal. Browser QA not covered.');
