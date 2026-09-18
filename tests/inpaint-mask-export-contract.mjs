import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, message) { if (!condition) throw new Error(message); }
const root = join(fileURLToPath(new URL('..', import.meta.url)));
const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
const runtime = readFileSync(join(root, 'src/runtime/index.ts'), 'utf8');
const rust = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');

assert(app.includes('await runtime.saveDataUrl(mask, fileName)'), 'Inpaint mask export must use the runtime save bridge instead of a detached anchor click.');
assert(runtime.includes('saveDataUrl(dataUrl: string, suggestedName: string): Promise<string | null>'), 'Runtime bridge must expose data-URL export.');
assert(runtime.includes('document.body.appendChild(anchor)') && runtime.includes('URL.createObjectURL(blob)'), 'Browser/PWA export must use an attached object-URL download.');
assert(runtime.includes('tauriInvoke<string>("save_data_url_download"'), 'Desktop export must route through the native Tauri saver.');
assert(rust.includes('fn save_data_url_download(app: tauri::AppHandle') && rust.includes('.path()') && rust.includes('.download_dir()') && rust.includes('unique_download_path'), 'Desktop saver must resolve the OS Downloads directory through Tauri and avoid silently overwriting an existing mask.');
assert(rust.includes('save_data_url_download') && rust.includes('studio_update_apply,') && rust.includes('save_data_url_download\n        ])'), 'Native export command must be registered with Tauri.');
console.log('Inpaint mask export contract OK.');
