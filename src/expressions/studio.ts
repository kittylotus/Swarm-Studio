import { circleHelpIcon, openExpressionHelp } from './help';
import { expressionFailure } from './errors';
import { defaultSheet, normalizeSheet, expressionTiles, emptyMotion, motionLimits, expressionRequest, livePortraitWorkflow, ipAdapterWorkflow, advertisedValues, isAdapterModel, type SheetProject, type ExpressionTile, type NodeSchema, type ExpressionMotion } from './pipeline';
import type { LoraStackItem } from '../types';
import type { SwarmGenerationRequest, SwarmModel, SwarmParamDefinition } from '../swarm/types';
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
export interface ExpressionHost {
    models(): SwarmModel[];
    params(): SwarmParamDefinition[];
    busy(): boolean;
    connected(): boolean;
    captureLoras(model: string): LoraStackItem[];
    generate(request: SwarmGenerationRequest, loras: LoraStackItem[], progress: (n: number) => void): Promise<{
        image: string;
        path: string;
        seed: number;
    }>;
    probe(): Promise<Record<string, NodeSchema>>;
    save(data: string, name: string): Promise<void>;
    notify(message: string, error?: boolean): void;
}
const imageFrom = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not decode an expression image.')); image.src = src; });
function db(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open('swarm-studio-expressions-v1', 1); request.onupgradeneeded = () => request.result.createObjectStore('projects'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function storedProject(write?: SheetProject): Promise<unknown> { const store = await db(); try {
    return await new Promise((resolve, reject) => { const tx = store.transaction('projects', write ? 'readwrite' : 'readonly'); const request = write ? tx.objectStore('projects').put(write, 'current') : tx.objectStore('projects').get('current'); request.onsuccess = () => { if (!write)
        resolve(request.result); }; tx.oncomplete = () => { if (write)
        resolve(undefined); }; request.onerror = () => reject(request.error); tx.onerror = () => reject(tx.error); });
}
finally {
    store.close();
} }
function download(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'expression-sheet';
export class ExpressionStudio {
    private host: HTMLElement | null = null;
    private project: SheetProject = defaultSheet();
    private loaded = false;
    private saving: Promise<unknown> = Promise.resolve();
    private saveTimer: number | undefined;
    private running = false;
    private stopped = false;
    private currentId = '';
    private progress = 0;
    private status = 'Ready to build your expression sheet.';
    private schema: Record<string, NodeSchema> = {};
    private setup = 'Not checked yet. Check backend setup to inspect loaded nodes.';
    private setupBusy = false;
    constructor(private readonly bridge: ExpressionHost) { }
    get busy(): boolean { return this.running; }
    async mount(host: HTMLElement): Promise<void> { this.host = host; if (!this.loaded) {
        this.loaded = true;
        try {
            const saved = await storedProject();
            if (saved)
                this.project = normalizeSheet(saved);
        }
        catch (error) {
            this.bridge.notify(`Expression project could not be restored: ${String(error)}`, true);
        }
    } this.draw(); }
    private persist(): void { window.clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => { const snapshot = structuredClone(this.project); this.saving = this.saving.catch(() => undefined).then(() => storedProject(snapshot)).catch(error => this.bridge.notify(`Expression project could not be saved: ${String(error)}`, true)); }, 250); }
    private draw(): void {
        if (!this.host?.isConnected)
            return;
        const p = this.project, disabled = this.running ? 'disabled' : '';
        const models = this.bridge.models().filter(m => !['ipadapter', 'hybrid'].includes(p.engine) || isAdapterModel(m));
        if (!p.model || !models.some(m => m.name === p.model)) {
            if (models.length && !this.running)
                p.model = models[0]!.name;
        }
        const adapters = advertisedValues(this.bridge.params(), 'useipadapter').filter(v => v !== 'None');
        const samplers = advertisedValues(this.bridge.params(), 'sampler');
        const schedulers = advertisedValues(this.bridge.params(), 'scheduler');
        const options = (values: string[], chosen: string) => Array.from(new Set([chosen, ...values])).filter(Boolean).map(v => `<option ${v === chosen ? 'selected' : ''} value="${esc(v)}">${esc(v)}</option>`).join('');
        const field = (label: string, key: keyof SheetProject, min: number, max: number, step: number = 1) => `<label class="field"><span>${label}</span><input data-setting="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${p[key]}" ${disabled}/></label>`;
        this.host.innerHTML = `<div class="expression-studio">
   <header class="expression-hero"><div><div class="expression-heading"><h1>Expression studio</h1><button type="button" class="expression-help-button" data-command="help" title="Expression sheet usage guide" aria-label="Expression sheet usage guide" aria-haspopup="dialog">${circleHelpIcon}</button></div><p>Keep the identity, direct the emotion, and build a sheet one portrait at a time.</p></div><div class="expression-hero-actions"><label class="secondary-button file-button">Open project<input data-project-import type="file" accept="application/json,.json" hidden ${disabled}/></label><button data-command="project-export" class="secondary-button">Save project</button><button data-command="sheet-export" class="primary-button">Export sheet PNG</button><button data-command="pack-export" class="secondary-button">Export portrait pack</button></div></header>
   <div class="expression-layout"><aside class="expression-controls">
    <section class="expression-section"><div class="expression-section-head"><b>01 / Identity</b><small>One clean reference</small></div><label class="field"><span>Project name</span><input data-setting="name" value="${esc(p.name)}" maxlength="120" ${disabled}/></label>
    <div class="expression-reference">${p.reference ? `<img src="${esc(p.reference)}" alt="Character reference"/><span>${esc(p.referenceName)}</span>` : `<div class="expression-reference-empty"><b>＋</b><span>Add a face reference</span><small>Front-facing, neutral expression, clear eyes</small></div>`}</div>
    <div class="expression-button-row"><label class="secondary-button file-button">Upload portrait<input data-reference type="file" accept="image/png,image/jpeg,image/webp" hidden ${disabled}/></label><button data-command="clear-reference" class="ghost-button" ${disabled}>Clear</button></div><p class="helper-copy">Reference is resized to at most 1024 px and stored with this project. IPAdapter uses it to guide identity; LivePortrait edits the face directly.</p>
    <label class="field"><span>Character & framing</span><textarea rows="4" data-setting="subject" ${disabled}>${esc(p.subject)}</textarea></label><label class="field"><span>Avoid</span><textarea rows="3" data-setting="negative" ${disabled}>${esc(p.negative)}</textarea></label>
    <label class="check-row"><input data-setting="useLoras" type="checkbox" ${p.useLoras ? 'checked' : ''} ${disabled}/>Use enabled LoRAs from the composer</label></section>
    <section class="expression-section"><div class="expression-section-head"><b>02 / Pipeline</b><small>Batch size 1</small></div>
    <label class="field"><span>Render method</span><select data-setting="engine" ${disabled}>${[['ipadapter', 'IPAdapter · reference-guided'], ['liveportrait', 'LivePortrait · facial edit'], ['hybrid', 'IPAdapter → LivePortrait · two passes'], ['img2img', 'Image-to-image · redraw'], ['text', 'Prompt only · baseline']].map(([v, label]) => `<option value="${v}" ${p.engine === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label class="field"><span>Style preset</span><select data-setting="style" ${disabled}>${[['semireal', 'Semirealism'], ['realistic', 'Realistic portrait'], ['illustrated', 'Illustrated / anime']].map(([v, label]) => `<option value="${v}" ${p.style === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <div data-pipeline-part="checkpoint" ${p.engine === 'liveportrait' ? 'hidden' : ''}><label class="field"><span>${['ipadapter', 'hybrid'].includes(p.engine) ? 'SDXL / SD1.5 checkpoint' : 'Checkpoint'}</span><select data-setting="model" ${disabled}>${models.map(m => `<option value="${esc(m.name)}" ${m.name === p.model ? 'selected' : ''}>${esc(m.title || m.name)}</option>`).join('') || '<option value="">No compatible checkpoint loaded</option>'}</select></label></div><p data-pipeline-part="portrait" class="helper-copy" ${p.engine !== 'liveportrait' ? 'hidden' : ''}>Works best on detectable portrait faces. Uses the ExpressionEditor sliders in each card; character prompts and LoRAs are not used.</p>
    <div data-pipeline-part="adapter" ${['ipadapter', 'hybrid'].includes(p.engine) ? '' : 'hidden'}><label class="field"><span>Adapter</span><select data-setting="adapter" ${disabled}>${options(adapters, p.adapter)}</select></label><div class="expression-fields">${field('Identity strength', 'weight', 0, 2, .05)}${field('Start', 'start', 0, 1, .05)}${field('End', 'end', 0, 1, .05)}</div><p class="helper-copy">Start at 0.65 strength / 0.8 end. Lower strength or end if the reference expression is overpowering the requested emotion. Anima is not compatible with these SDXL adapters.</p></div>
    <div data-pipeline-part="img2img" ${p.engine === 'img2img' ? '' : 'hidden'}>${field('Redraw / creativity', 'denoise', 0, 1, .05)}</div>
    <details class="expression-details"><summary>Sampling & resolution</summary><div class="expression-fields">${field('Width', 'width', 256, 1536, 64)}${field('Height', 'height', 256, 1536, 64)}${field('Steps', 'steps', 1, 100)}${field('CFG', 'cfg', 1, 20, .5)}${field('Shared seed', 'seed', 0, 2147483646)}</div><label class="field"><span>Sampler</span><select data-setting="sampler" ${disabled}>${options(samplers, p.sampler)}</select></label><label class="field"><span>Scheduler</span><select data-setting="scheduler" ${disabled}>${options(schedulers, p.scheduler)}</select></label><p class="helper-copy">768² / 24 steps is a conservative starting point for an 8 GB GPU. Every card shares the seed; rerolls increment only that card.</p></details>
    <details class="expression-details"><summary>Backend setup & research</summary><button data-command="probe" class="secondary-button" ${this.setupBusy ? 'disabled' : ''}>${this.setupBusy ? 'Checking…' : 'Check loaded nodes'}</button><p class="expression-setup">${esc(this.setup)}</p><p class="helper-copy">IPAdapter needs its model weights and CLIP Vision. LivePortrait additionally needs ExpressionEditor and its models; install through ComfyUI Manager, restart the backend, then recheck.</p><button data-command="workflow-export" class="ghost-button">Export API workflow</button><a href="https://github.com/cubiq/ComfyUI_IPAdapter_plus" target="_blank" rel="noopener noreferrer">IPAdapter setup ↗</a><a href="https://github.com/PowerHouseMan/ComfyUI-AdvancedLivePortrait" target="_blank" rel="noopener noreferrer">LivePortrait setup ↗</a><a href="https://github.com/ToTheBeginning/PuLID/blob/main/docs/pulid_for_flux.md" target="_blank" rel="noopener noreferrer">Why PuLID-FLUX needs more memory ↗</a></details></section>
    <section class="expression-section"><div class="expression-section-head"><b>03 / Sheet layout</b></div><div class="expression-fields">${field('Columns', 'columns', 1, 8)}${field('Gutter', 'gutter', 0, 100)}<label class="field"><span>Paper</span><input data-setting="background" type="color" value="${p.background}" ${disabled}/></label></div><label class="check-row"><input data-setting="labels" type="checkbox" ${p.labels ? 'checked' : ''} ${disabled}/>Include expression labels</label><p class="helper-copy">Exports include enabled cards in their current order. Portrait packs include separate images and the project manifest.</p></section>
   </aside><main class="expression-board"><div class="expression-toolbar"><div><input class="expression-title" data-setting="name" value="${esc(p.name)}" ${disabled}/><p>${p.tiles.filter(t => t.image).length} rendered · ${p.tiles.filter(t => t.enabled).length} selected · ${p.tiles.filter(t => t.locked).length} locked</p></div><div class="expression-toolbar-actions"><select data-preset-count ${disabled}><option value="6">Essential 6</option><option value="12" selected>Classic 12</option><option value="24">Full range 24</option></select><button data-command="load-presets" class="secondary-button" ${disabled}>Add expressions</button><button data-command="add-card" class="ghost-button" ${disabled}>＋ Custom</button><button data-command="run-missing" class="primary-button" ${disabled}>Render missing</button><button data-command="run-all" class="secondary-button" ${disabled}>Render unlocked</button>${this.running ? '<button data-command="stop" class="danger-soft">Stop after current</button>' : ''}</div></div>
    <div class="expression-run-status" role="status" aria-live="polite"><span class="${this.running ? 'is-running' : ''}"></span><b>${esc(this.status)}</b><small>${this.running ? `${Math.round(this.progress * 100)}% of current portrait` : 'Reference → expression → individual portrait → sheet'}</small></div>
    <div class="expression-grid" style="--expression-columns:${Math.min(p.columns, 4)}">${p.tiles.map((t, index) => this.card(t, index, disabled)).join('')}</div>
   </main></div></div>`;
        this.bind();
    }
    private card(t: ExpressionTile, index: number, disabled: string): string {
        const failure = t.error ? expressionFailure(t.error) : null;
        return `<article class="expression-card ${t.locked ? 'is-locked' : ''} ${!t.enabled ? 'is-excluded' : ''} ${this.currentId === t.id ? 'is-rendering' : ''}" data-card="${t.id}"><div class="expression-card-head"><label><input type="checkbox" data-tile="enabled" ${t.enabled ? 'checked' : ''} ${disabled}/><span>${String(index + 1).padStart(2, '0')}</span></label><input data-tile="name" value="${esc(t.name)}" aria-label="Expression name" ${disabled}/><button data-tile-command="lock" title="${t.locked ? 'Unlock portrait' : 'Lock portrait'}" ${disabled}>${t.locked ? '●' : '○'}</button></div><div class="expression-card-image" style="aspect-ratio:${this.project.width}/${this.project.height}">${t.image ? `<img src="${esc(t.image)}" alt="${esc(t.name)}"/>` : `<div><b>${esc(t.name.slice(0, 1))}</b><span>${esc(t.name)}</span><small>Ready for direction</small></div>`}${this.currentId === t.id ? '<span class="expression-render-overlay">Rendering…</span>' : ''}</div><div class="expression-card-body"><textarea data-tile="prompt" rows="2" aria-label="Expression direction" ${disabled}>${esc(t.prompt)}</textarea>${failure ? `<p class="expression-error">${esc(failure.message)}</p>${failure.setup ? '<a class="expression-error-setup" href="https://github.com/cubiq/ComfyUI_IPAdapter_plus#installation" target="_blank" rel="noopener noreferrer">Get the matching CLIP Vision encoder ↗</a><details class="expression-error-details"><summary>Technical details</summary><p>' + esc(t.error) + '</p></details>' : ''}` : ''}${t.variants?.length ? `<div class="expression-variants" aria-label="Previous takes">${t.variants.map((v, i) => `<button data-take="${i}" title="Restore take with seed ${v.seed}" ${disabled}><img src="${esc(v.image)}" alt="Previous ${esc(t.name)}"/></button>`).join('')}</div>` : ''}<small>${t.seed >= 0 ? `Seed ${t.seed}` : 'Shared seed'}${t.locked ? ' · locked' : ''}</small><details data-pipeline-part="motion" ${['liveportrait', 'hybrid'].includes(this.project.engine) ? '' : 'hidden'}><summary>Face controls</summary><div class="expression-motion">${Object.entries(t.motion).map(([key, value]) => `<label><span>${esc(key.replaceAll('_', ' '))}</span><input data-motion="${key}" type="number" min="${motionLimits[key as keyof ExpressionMotion][0]}" max="${motionLimits[key as keyof ExpressionMotion][1]}" step="${key === 'smile' ? .05 : .5}" value="${value}" ${disabled}/></label>`).join('')}</div></details><div class="expression-card-actions"><button data-tile-command="render" class="primary-button" ${disabled || t.locked ? 'disabled' : ''}>${this.project.engine === 'liveportrait' ? 'Apply face' : t.image ? 'Reroll' : 'Render'}</button><button data-tile-command="reference" class="ghost-button" title="Use this portrait as the character reference" ${t.image && !this.running ? '' : 'disabled'}>Ref</button><button data-tile-command="download" class="ghost-button" ${t.image ? '' : 'disabled'}>PNG</button><button data-tile-command="up" title="Move earlier" ${disabled}>↑</button><button data-tile-command="down" title="Move later" ${disabled}>↓</button><button data-tile-command="remove" title="Remove card" ${disabled}>×</button></div></div></article>`;
    }
    private syncPipelineControls(): void {
        const root = this.host;
        if (!root) return;
        const p = this.project;
        const adapter = ['ipadapter', 'hybrid'].includes(p.engine);
        const visible: Record<string, boolean> = { checkpoint: p.engine !== 'liveportrait', portrait: p.engine === 'liveportrait', adapter, img2img: p.engine === 'img2img', motion: ['liveportrait', 'hybrid'].includes(p.engine) };
        root.querySelectorAll<HTMLElement>('[data-pipeline-part]').forEach(part => { part.hidden = !visible[part.dataset.pipelinePart!]; });
        const models = this.bridge.models().filter(model => !adapter || isAdapterModel(model));
        if (!models.some(model => model.name === p.model)) p.model = models[0]?.name ?? '';
        const select = root.querySelector<HTMLSelectElement>('[data-setting="model"]');
        if (select) {
            select.innerHTML = models.map(model => `<option value="${esc(model.name)}" ${model.name === p.model ? 'selected' : ''}>${esc(model.title || model.name)}</option>`).join('') || '<option value="">No compatible checkpoint loaded</option>';
            const label = select.parentElement?.querySelector('span');
            if (label) label.textContent = adapter ? 'SDXL / SD1.5 checkpoint' : 'Checkpoint';
        }
        root.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
            const tile = p.tiles.find(item => item.id === card.dataset.card);
            const render = card.querySelector('[data-tile-command="render"]');
            if (render) render.textContent = p.engine === 'liveportrait' ? 'Apply face' : tile?.image ? 'Reroll' : 'Render';
        });
        this.persist();
    }
    private bind(): void {
        const root = this.host!;
        root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-setting]').forEach(input => input.addEventListener(input instanceof HTMLSelectElement ? 'change' : 'input', () => {
            if (this.running)
                return;
            const key = input.dataset.setting as keyof SheetProject;
            const previous = this.project;
            const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input instanceof HTMLInputElement && input.type === 'number' ? Number(input.value) : input.value;
            this.project = normalizeSheet({ ...previous, [key]: value }); // Normalize numeric bounds without changing existing card identities.
            this.project.tiles = previous.tiles;
            this.persist();
            if (key === 'engine') this.syncPipelineControls();
            if (key === 'columns')
                this.host?.querySelector<HTMLElement>('.expression-grid')?.style.setProperty('--expression-columns', String(Math.min(this.project.columns, 4)));
            if (key === 'name')
                this.host?.querySelectorAll<HTMLInputElement>('[data-setting="name"]').forEach(other => { if (other !== input)
                    other.value = this.project.name; });
        }));
        root.querySelector<HTMLInputElement>('[data-reference]')?.addEventListener('change', e => void this.loadReference((e.currentTarget as HTMLInputElement).files?.[0]));
        root.querySelector<HTMLInputElement>('[data-project-import]')?.addEventListener('change', e => void this.importProject((e.currentTarget as HTMLInputElement).files?.[0]));
        root.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(button => button.addEventListener('click', () => void this.command(button.dataset.command!)));
        root.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
            const tile = this.project.tiles.find(t => t.id === card.dataset.card)!;
            card.querySelectorAll<HTMLButtonElement>('[data-take]').forEach(button => button.addEventListener('click', () => { if (this.running)
                return; const index = Number(button.dataset.take); const take = tile.variants?.[index]; if (!take)
                return; tile.variants![index] = { image: tile.image, path: tile.path, seed: tile.seed }; Object.assign(tile, take); this.persist(); this.draw(); }));
            card.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-tile]').forEach(input => input.addEventListener('change', () => { if (this.running)
                return; const key = input.dataset.tile!; if (key === 'enabled') {
                tile.enabled = (input as HTMLInputElement).checked;
                card.classList.toggle('is-excluded', !tile.enabled);
            }
            else if (key === 'name')
                tile.name = input.value.slice(0, 80);
            else
                tile.prompt = input.value.slice(0, 3000); this.persist(); }));
            card.querySelectorAll<HTMLInputElement>('[data-motion]').forEach(input => input.addEventListener('change', () => { const key = input.dataset.motion as keyof ExpressionMotion; tile.motion[key] = Number.isFinite(input.valueAsNumber) ? Math.max(motionLimits[key][0], Math.min(motionLimits[key][1], input.valueAsNumber)) : 0; this.persist(); }));
            card.querySelectorAll<HTMLButtonElement>('[data-tile-command]').forEach(button => button.addEventListener('click', () => { const command = button.dataset.tileCommand; if (command === 'download') {
                void this.saveTile(tile).catch(error => this.bridge.notify(String(error), true));
                return;
            } if (this.running)
                return; if (command === 'reference') {
                this.project.reference = tile.image;
                this.project.referenceName = tile.name;
                this.persist();
                this.draw();
                return;
            } if (command === 'render') {
                if (tile.image && this.project.engine !== 'liveportrait')
                    tile.seedOffset++;
                void this.run([tile]);
                return;
            } if (command === 'lock')
                tile.locked = !tile.locked; if (command === 'remove')
                this.project.tiles = this.project.tiles.filter(t => t.id !== tile.id); if (command === 'up' || command === 'down') {
                const index = this.project.tiles.indexOf(tile);
                const next = index + (command === 'up' ? -1 : 1);
                if (next >= 0 && next < this.project.tiles.length) {
                    this.project.tiles.splice(index, 1);
                    this.project.tiles.splice(next, 0, tile);
                }
            } this.persist(); this.draw(); }));
        });
    }
    private async command(command: string): Promise<void> {
        try {
            if (command === 'help') {
                openExpressionHelp();
                return;
            }
            if (command === 'stop') {
                this.stopped = true;
                this.status = 'Stopping after the current portrait finishes.';
                this.draw();
                return;
            }
            if (command === 'project-export') {
                download(new Blob([JSON.stringify(this.project, null, 2)], { type: 'application/json' }), `${slug(this.project.name)}.expressions.json`);
                return;
            }
            if (command === 'sheet-export') {
                await this.bridge.save(await this.sheetPng(), `${slug(this.project.name)}.png`);
                return;
            }
            if (command === 'pack-export') {
                await this.pack();
                return;
            }
            if (command === 'workflow-export') {
                await this.probe();
                const tile = this.project.tiles.find(t => t.enabled);
                if (!tile)
                    throw new Error('Select an expression first.');
                if (!['ipadapter', 'liveportrait'].includes(this.project.engine))
                    throw new Error('Workflow export supports IPAdapter or LivePortrait; choose a single-pass method.');
                const workflow = this.project.engine === 'liveportrait' ? livePortraitWorkflow(this.project.reference, tile.motion, this.schema) : ipAdapterWorkflow(this.project, tile, this.schema);
                download(new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' }), `${slug(this.project.name)}-${slug(tile.name)}-api.json`);
                return;
            }
            if (command === 'probe') {
                await this.probe();
                return;
            }
            if (this.running)
                return;
            if (command === 'run-missing') {
                await this.run(this.project.tiles.filter(t => t.enabled && !t.locked && !t.image));
                return;
            }
            if (command === 'run-all') {
                await this.run(this.project.tiles.filter(t => t.enabled && !t.locked));
                return;
            }
            if (command === 'clear-reference') {
                this.project.reference = '';
                this.project.referenceName = '';
            }
            if (command === 'add-card') {
                if (this.project.tiles.length >= 48)
                    throw new Error('A sheet supports up to 48 expressions.');
                this.project.tiles.push({ ...expressionTiles(1)[0]!, name: 'Custom expression', prompt: '', motion: emptyMotion() });
            }
            if (command === 'load-presets') {
                const count = Number(this.host?.querySelector<HTMLSelectElement>('[data-preset-count]')?.value || 12);
                const names = new Set(this.project.tiles.map(t => t.name));
                this.project.tiles.push(...expressionTiles(count).filter(t => !names.has(t.name)).slice(0, 48 - this.project.tiles.length));
            }
            this.persist();
            this.draw();
        }
        catch (error) {
            this.bridge.notify(error instanceof Error ? error.message : String(error), true);
        }
    }
    private async loadReference(file?: File): Promise<void> { if (!file)
        return; try {
        if (file.size > 30 * 1024 * 1024)
            throw new Error('Choose a portrait under 30 MB.');
        const url = URL.createObjectURL(file);
        try {
            const image = await imageFrom(url);
            const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
            if (this.running)
                throw new Error('Wait for the sheet queue to finish before changing its reference.');
            this.project.reference = canvas.toDataURL('image/png');
            this.project.referenceName = file.name;
        }
        finally {
            URL.revokeObjectURL(url);
        }
        this.persist();
        this.draw();
    }
    catch (error) {
        this.bridge.notify(String(error), true);
    } }
    private async importProject(file?: File): Promise<void> { if (!file)
        return; try {
        if (file.size > 150 * 1024 * 1024)
            throw new Error('Project exceeds the 150 MB import limit.');
        const imported = normalizeSheet(JSON.parse(await file.text()));
        if (this.running)
            throw new Error('Wait for the sheet queue to finish before opening a project.');
        this.project = imported;
        this.persist();
        this.draw();
    }
    catch (error) {
        this.bridge.notify(String(error), true);
    } }
    private async probe(): Promise<void> { this.setupBusy = true; this.draw(); try {
        this.schema = await this.bridge.probe();
        const ipa = Boolean(this.schema.IPAdapterUnifiedLoader);
        const portrait = Boolean(this.schema.ExpressionEditor);
        this.setup = `IPAdapter loader: ${ipa ? 'loaded' : 'not loaded'}. ExpressionEditor: ${portrait ? 'loaded' : 'not installed or not loaded'}. Swarm image bridge: ${this.schema.SwarmLoadImageB64 && this.schema.SwarmSaveImageWS ? 'loaded' : 'missing'}. Installed files alone do not mean a node is loaded.`;
    }
    catch (error) {
        this.setup = `Could not inspect backend nodes: ${String(error)}. The Swarm account needs direct Comfy access.`;
    }
    finally {
        this.setupBusy = false;
        this.draw();
    } }
    private async run(tiles: ExpressionTile[]): Promise<void> {
        if (this.running)
            return;
        if (!tiles.length) {
            this.bridge.notify('No unlocked expressions are selected.');
            return;
        }
        if (!this.bridge.connected()) {
            this.bridge.notify('Connect Studio to Swarm first.', true);
            return;
        }
        if (this.bridge.busy()) {
            this.bridge.notify('Wait for the current Studio generation to finish.', true);
            return;
        }
        const snapshot = structuredClone(this.project);
        this.running = true;
        this.stopped = false;
        let completed = 0;
        let failed = 0;
        try {
            const loras = snapshot.useLoras && snapshot.engine !== 'liveportrait' ? this.bridge.captureLoras(snapshot.model) : [];
            if (['ipadapter', 'hybrid'].includes(snapshot.engine)) {
                await this.probe();
                if (Object.keys(this.schema).length && !this.schema.IPAdapterUnifiedLoader)
                    throw new Error('IPAdapter Unified Loader is not loaded in this backend. Check setup.');
            }
            if (['liveportrait', 'hybrid'].includes(snapshot.engine)) {
                if (snapshot.engine === 'liveportrait')
                    await this.probe();
                if (!this.schema.ExpressionEditor)
                    throw new Error('ExpressionEditor is not loaded. Open backend setup for installation instructions.');
            }
            for (const tile of tiles) {
                if (this.stopped)
                    break;
                this.currentId = tile.id;
                this.progress = 0;
                tile.error = '';
                this.status = `${completed + failed + 1} / ${tiles.length} · ${tile.name}`;
                this.draw();
                try {
                    const request = expressionRequest(snapshot, tile, this.bridge.params());
                    if (snapshot.engine === 'liveportrait')
                        request.comfyworkflowraw = JSON.stringify(livePortraitWorkflow(snapshot.reference, tile.motion, this.schema));
                    let output = await this.bridge.generate(request, loras, n => { this.progress = n; const label = this.host?.querySelector('.expression-run-status small'); if (label)
                        label.textContent = `${Math.round(n * 100)}% of current portrait`; });
                    if (snapshot.engine === 'hybrid') {
                        this.status = `Facial refinement · ${tile.name}`;
                        this.draw();
                        const facial: SwarmGenerationRequest = { model: snapshot.model, prompt: request.prompt, negativeprompt: request.negativeprompt, width: snapshot.width, height: snapshot.height, steps: 1, cfgscale: 1, seed: output.seed, images: 1, imageformat: 'PNG', comfyworkflowraw: JSON.stringify(livePortraitWorkflow(output.image, tile.motion, this.schema)) };
                        output = await this.bridge.generate(facial, [], n => { this.progress = n; });
                    }
                    if (tile.image) {
                        tile.variants = [...(tile.variants ?? []), { image: tile.image, path: tile.path, seed: tile.seed }].slice(-8);
                    }
                    tile.image = output.image;
                    tile.path = output.path;
                    tile.seed = output.seed;
                    completed++;
                }
                catch (error) {
                    tile.error = error instanceof Error ? error.message : String(error);
                    failed++;
                    const failure = expressionFailure(tile.error);
                    this.bridge.notify(`${tile.name}: ${failure.message}`, true);
                    if (failure.stop) {
                        this.stopped = true;
                    }
                }
                this.persist();
                this.draw();
            }
            this.status = `${this.stopped ? 'Stopped' : 'Finished'} · ${completed} rendered${failed ? ` · ${failed} failed` : ''}.`;
        }
        catch (error) {
            this.status = error instanceof Error ? error.message : String(error);
            this.bridge.notify(this.status, true);
        }
        finally {
            this.running = false;
            this.currentId = '';
            this.persist();
            this.draw();
        }
    }
    private async saveTile(tile: ExpressionTile): Promise<void> { const image = await imageFrom(tile.image); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d')!.drawImage(image, 0, 0); await this.bridge.save(canvas.toDataURL('image/png'), `${slug(tile.name)}.png`); }
    private async sheetPng(): Promise<string> { const p = this.project; const tiles = p.tiles.filter(t => t.enabled); if (!tiles.length || tiles.some(t => !t.image))
        throw new Error('Render every selected expression before exporting, or deselect unfinished cards.'); const labelHeight = p.labels ? 48 : 0; const titleHeight = 80; const rows = Math.ceil(tiles.length / p.columns); const canvas = document.createElement('canvas'); canvas.width = p.columns * p.width + (p.columns + 1) * p.gutter; canvas.height = titleHeight + rows * (p.height + labelHeight) + (rows + 1) * p.gutter; if (canvas.width * canvas.height > 70000000)
        throw new Error('Sheet is too large. Reduce tile size or export the portrait pack.'); const ctx = canvas.getContext('2d')!; ctx.fillStyle = p.background; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#24212b'; ctx.font = '600 28px system-ui'; ctx.fillText(p.name.slice(0, 90), p.gutter, 46); ctx.font = '14px system-ui'; ctx.fillText(`${tiles.length} expressions · ${p.style} · ${p.engine}`, p.gutter, 68); for (const [i, tile] of tiles.entries()) {
        const image = await imageFrom(tile.image);
        const x = p.gutter + (i % p.columns) * (p.width + p.gutter), y = titleHeight + p.gutter + Math.floor(i / p.columns) * (p.height + labelHeight + p.gutter);
        const scale = Math.min(p.width / image.width, p.height / image.height);
        const w = image.width * scale, h = image.height * scale;
        ctx.drawImage(image, x + (p.width - w) / 2, y + (p.height - h) / 2, w, h);
        if (p.labels) {
            ctx.font = '600 20px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(tile.name, x + p.width / 2, y + p.height + 30, p.width - 12);
            ctx.textAlign = 'left';
        }
    } return canvas.toDataURL('image/png'); }
    private async pack(): Promise<void> { const tiles = this.project.tiles.filter(t => t.enabled && t.image); if (!tiles.length)
        throw new Error('Render a portrait before exporting the pack.'); const { zipStore } = await import('./zip'); const files: Array<{
        name: string;
        data: Uint8Array;
    }> = [{ name: 'project.expressions.json', data: new TextEncoder().encode(JSON.stringify(this.project, null, 2)) }]; for (const [i, t] of tiles.entries()) {
        const image = await imageFrom(t.image);
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d')!.drawImage(image, 0, 0);
        const blob = await fetch(canvas.toDataURL('image/png')).then(r => r.blob());
        files.push({ name: `${String(i + 1).padStart(2, '0')}-${slug(t.name)}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    } if (this.project.tiles.filter(t => t.enabled).every(t => t.image)) {
        const sheet = await fetch(await this.sheetPng()).then(r => r.blob());
        files.push({ name: 'expression-sheet.png', data: new Uint8Array(await sheet.arrayBuffer()) });
    } download(zipStore(files), `${slug(this.project.name)}.zip`); }
}
