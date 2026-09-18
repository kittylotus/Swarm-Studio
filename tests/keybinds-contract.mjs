import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUDIO_KEYBIND_ACTIONS, defaultStudioKeybinds, eventToKeybind, keybindMatches, normalizeStudioKeybindPreferences } from '../src/keybinds.ts';

function assert(condition, message) { if (!condition) throw new Error(message); }
const root = join(fileURLToPath(new URL('..', import.meta.url)));
const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
const store = readFileSync(join(root, 'src/library/store.ts'), 'utf8');
const types = readFileSync(join(root, 'src/types.ts'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');

const defaults = defaultStudioKeybinds();
assert(defaults.generate === 'Mod+Enter', 'Generate must default to Ctrl/Cmd+Enter so multiline Enter remains available.');
assert(STUDIO_KEYBIND_ACTIONS.filter((item) => item.group === 'Navigation').length >= 7, 'Navigation keybinds must cover Studio destinations.');
assert(eventToKeybind({ key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }) === 'Mod+Enter', 'Ctrl+Enter must normalize to Mod+Enter.');
assert(eventToKeybind({ key: 'Enter', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }) === 'Mod+Enter', 'Cmd+Enter must normalize to Mod+Enter.');
assert(keybindMatches('Alt+4', { key: '4', ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }), 'Navigation keybind matching failed.');
assert(eventToKeybind({ key: '¡', code: 'Digit1', ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }) === 'Alt+1', 'Option/Alt+digit must use the physical digit code so macOS alternate characters do not break navigation.');
const normalized = normalizeStudioKeybindPreferences({ enabled: true, bindings: { generate: 'ctrl+enter', 'nav-create': '' } });
assert(normalized.enabled && normalized.bindings.generate === 'Mod+Enter' && normalized.bindings['nav-create'] === '', 'Stored keybind preferences must normalize safely while allowing explicit unbound actions.');
assert(types.includes('"appearance" | "keybinds"'), 'Keybinds must be a persisted Settings pane.');
assert(store.includes('["connection", "backend", "appearance", "keybinds"]'), 'Settings migration must preserve the Keybinds pane.');
assert(app.includes('id="keybinds-enabled"') && app.includes('data-keybind-input=') && app.includes('handleStudioKeybind(event)'), 'Settings must expose opt-in editable keybinds and install one global dispatcher.');
assert(app.includes('if (editing && !definition.allowWhenEditing) return;'), 'Navigation shortcuts must not fire while the user is typing.');
assert(app.includes("[role='dialog'][aria-modal='true']"), 'Modal suppression must ignore docked non-modal panels while blocking active dialogs.');
assert(app.includes('if (this.view !== "create") return;') && app.includes('void this.generate();'), 'Generate shortcut must only trigger from Create.');
assert(css.includes('v0.63 keybind settings') && css.includes('.keybind-row'), 'Keybind settings styles are missing.');
console.log('Keybind contract OK.');
