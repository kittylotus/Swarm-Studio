import { actionMenu, bindActionMenus, disclosureChevronSvg } from '../ui/action-menu';
import { resolveLoraModelName as resolveModelFileName } from '../lora/request';
import { cloneLoraStack } from '../lora/stack';
import { dimensionsForRatio } from '../resolution';
import { ANIMA_INSTALL_GUIDE, animaWorkflow, isAnimaModel, nodeChoices, resolveAnimaSetup } from './anima';
import { circleHelpIcon, openExpressionHelp } from './help';
import { expressionFailure } from './errors';
import { defaultSheet, normalizeSheet, expressionTiles, emptyMotion, motionLimits, expressionRequest, livePortraitWorkflow, ipAdapterWorkflow, advertisedValues, isAdapterModel, imageForStage, recordStageImage, type ExpressionImage, type SheetProject, type ExpressionTile, type NodeSchema, type ExpressionMotion } from './pipeline';
import { pendingStages, processingLabels, processingRequest, readProcessingImage, type PipelineStage, type ProcessingStage } from './processing';
import { bindProcessingFields, resolveProcessing, type ProcessingChoices, type ProcessingHost } from './processing-ui';
import type { ExpressionLora } from './loras';
import type { SwarmGenerationRequest, SwarmModel, SwarmParamDefinition } from '../swarm/types';
import type { IdentityRecord, LoraStackItem } from '../types';
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
type SavedIdentity = Pick<IdentityRecord, 'name' | 'positivePrompt' | 'negativePrompt' | 'avatarUrl' | 'model' | 'loraStack'>;
export interface ExpressionHost {
    models(): SwarmModel[];
    processing?: ProcessingHost;
    params(): SwarmParamDefinition[];
    busy(): boolean;
    connected(): boolean;
    identitySources?(): { identities: SavedIdentity[]; presets: SavedIdentity[] };
    browseReference?(apply: (source: Promise<string>, name: string) => Promise<void>): void;
    captureLoras(model: string, savedStack?: LoraStackItem[]): ExpressionLora[];
    generate(request: SwarmGenerationRequest, loras: ExpressionLora[], progress: (n: number) => void, stage?: ProcessingStage, preview?: (image: string) => void, signal?: AbortSignal): Promise<{
        image: string;
        path: string;
        seed: number;
    }>;
    probe(): Promise<Record<string, NodeSchema>>;
    save(data: string, name: string): Promise<void>;
    notify(message: string, error?: boolean): void;
    log?(message: string, error?: boolean): void;
    openAnimaGuide?(): Promise<void>;
}
const stageLabels = { generate: 'Generate', ...processingLabels };
const stageActions = { generate: 'Render missing', refine: 'Refine selected', background: 'Remove backgrounds' };
const settingsTabs = { identity: 'Identity', generate: 'Generate', layout: 'Layout' } as const;
type SettingsTab = keyof typeof settingsTabs;
const animaAssets = [
    ['Text encoder', 'animaClip', 'CLIPLoader', 'clip_name'],
    ['VAE', 'animaVae', 'VAELoader', 'vae_name'],
    ['Adapter weights', 'animaAdapter', 'AnimaRefAdapter', 'lora_name'],
] as const;
const imageFrom = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not decode an expression image.')); image.src = src; });
async function portraitDataUrl(src: string): Promise<string> {
    const image = await imageFrom(src);
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}
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
    private currentStage: PipelineStage | null = null;
    private runController: AbortController | null = null;
    private livePreview = '';
    private referenceRequest = 0;
    private screen: PipelineStage = 'generate';
    private settingsTab: SettingsTab = 'identity';
    private settingsOpen = false;
    private settingsMediaListener: AbortController | null = null;
    private generateDisclosures = new Set<string>();
    private status = 'Ready to build your expression sheet.';
    private schema: Record<string, NodeSchema> = {};
    private setup = 'Not checked yet. Check backend setup to inspect loaded nodes.';
    private setupBusy = false;
    private setupChecked = false;
    private setupError = '';
    private probeRequest: Promise<void> | null = null;
    private processingChoices: Record<ProcessingStage, ProcessingChoices> = { refine: {}, background: {} };
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
    private persist(immediate = false): void {
        window.clearTimeout(this.saveTimer);
        const write = () => {
            const snapshot = structuredClone(this.project);
            this.saving = this.saving.catch(() => undefined).then(() => storedProject(snapshot))
                .catch(error => this.bridge.notify(`Expression project could not be saved: ${String(error)}`, true));
        };
        if (immediate) write();
        else this.saveTimer = window.setTimeout(write, 250);
    }
    private modelsForEngine(engine: SheetProject['engine']): SwarmModel[] {
        return this.bridge.models().filter(model => engine === 'anima' ? isAnimaModel(model)
            : !['ipadapter', 'hybrid'].includes(engine) || isAdapterModel(model));
    }
    private draw(): void {
        if (!this.host?.isConnected)
            return;
        this.settingsMediaListener?.abort();
        const p = this.project, disabled = this.running ? 'disabled' : '';
        const models = this.modelsForEngine(p.engine);
        if (!p.model || !models.some(m => m.name === p.model)) {
            if (models.length && !this.running)
                p.model = models[0]!.name;
        }
        const adapters = advertisedValues(this.bridge.params(), 'useipadapter').filter(v => v !== 'None');
        const samplers = advertisedValues(this.bridge.params(), 'sampler');
        const schedulers = advertisedValues(this.bridge.params(), 'scheduler');
        const options = (values: string[], chosen: string) => Array.from(new Set([chosen, ...values])).filter(Boolean).map(v => `<option ${v === chosen ? 'selected' : ''} value="${esc(v)}">${esc(v)}</option>`).join('');
        const field = (label: string, key: keyof SheetProject, min: number, max: number, step: number = 1) => `<label class="field"><span>${label}</span><input data-setting="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${p[key]}" ${disabled}/></label>`;
        this.host.querySelectorAll<HTMLDetailsElement>('details[data-generate-disclosure]').forEach(details => {
            const name = details.dataset.generateDisclosure!;
            if (details.open) this.generateDisclosures.add(name);
            else this.generateDisclosures.delete(name);
        });
        const stage = this.screen;
        const generatingScreen = stage === 'generate';
        const focusedTab = document.activeElement?.matches('[data-stage-tab]');
        this.host.innerHTML = `<div class="expression-studio">
   <header class="expression-hero"><div><div class="expression-heading"><h1>Expression studio</h1><button type="button" class="expression-help-button" data-command="help" title="Expression sheet usage guide" aria-label="Expression sheet usage guide" aria-haspopup="dialog">${circleHelpIcon}</button></div><p>Keep the identity, direct the emotion, and build a sheet one portrait at a time.</p></div><div class="expression-hero-actions">${actionMenu('expression-project-menu', 'Project', 'Project files', `<div class="studio-menu-section"><button type="button" data-command="project-open" ${disabled}>Open project<small>Continue a saved expression project.</small></button><button type="button" data-command="project-export">Save project<small>Download the project JSON, including portraits.</small></button></div>`)}${actionMenu('expression-export-menu', 'Export', 'Export portraits', '<div class="studio-menu-section"><button type="button" data-command="sheet-export">Export sheet PNG<small>Arrange the selected portraits into one sheet.</small></button><button type="button" data-command="pack-export">Export portrait pack<small>Separate images with the project manifest.</small></button></div>')}<input data-project-import type="file" accept="application/json,.json" hidden ${disabled}/></div></header>
   ${this.pipelineTabs()}
   <div class="expression-layout" id="expression-stage-panel" role="tabpanel" aria-labelledby="expression-tab-${stage}">
   <aside class="expression-controls" aria-label="Expression settings">
    ${generatingScreen ? `<div class="expression-settings-tabs" role="tablist" aria-label="Expression settings tabs">${Object.entries(settingsTabs).map(([key, label]) => `<button type="button" class="secondary-button" role="tab" id="expression-settings-tab-${key}" aria-controls="expression-settings-${key}" data-settings-tab="${key}">${label}</button>`).join('')}</div>
    <section class="expression-section" id="expression-settings-identity" data-settings-group="identity"><div class="expression-section-head"><b>Identity</b>${this.bridge.identitySources ? `<button type="button" class="secondary-button" data-command="pick-identity" aria-haspopup="dialog" ${disabled}>Choose saved identity</button>` : ''}</div><label class="field"><span>Project name</span><input data-setting="name" value="${esc(p.name)}" maxlength="120" ${disabled}/></label>
    <div class="expression-reference">${p.reference ? `<img src="${esc(p.reference)}" alt="Character reference"/><span>${esc(p.referenceName)}</span>` : `<div class="expression-reference-empty"><b>＋</b><span>Add a face reference</span><small>Front-facing, neutral expression, clear eyes</small></div>`}</div>
    <div class="expression-button-row"><button type="button" data-command="upload-reference" class="secondary-button" ${disabled}>Upload portrait</button>${this.bridge.browseReference ? `<button type="button" data-command="browse-reference" class="secondary-button" ${disabled}>Browse Library</button>` : ''}<button type="button" data-command="clear-reference" class="ghost-button" ${disabled}>Clear</button><input data-reference type="file" accept="image/png,image/jpeg,image/webp" hidden ${disabled}/></div><p class="helper-copy">Reference is resized to at most 1024 px and stored with this project. IPAdapter uses it to guide identity; LivePortrait edits the face directly.</p>
    <label class="field"><span>Character & framing</span><textarea rows="4" data-setting="subject" ${disabled}>${esc(p.subject)}</textarea></label><label class="field"><span>Avoid</span><textarea rows="3" data-setting="negative" ${disabled}>${esc(p.negative)}</textarea></label>
    <label class="check-row"><input data-setting="useLoras" type="checkbox" ${p.useLoras ? 'checked' : ''} ${disabled}/>${p.savedIdentityLoras ? 'Use LoRAs from saved identity' : 'Use enabled LoRAs from the composer'}</label></section>
    <section class="expression-section" id="expression-settings-generate" data-settings-group="generate"><div class="expression-section-head"><b>Generate</b></div>
    <label class="field"><span id="expression-engine-label">Render method</span><select data-setting="engine" aria-labelledby="expression-engine-label" ${disabled}>${[['ipadapter', 'IPAdapter · reference-guided'], ['anima', 'Anima Ref Adapter · reference-guided'], ['liveportrait', 'LivePortrait · facial edit'], ['hybrid', 'IPAdapter → LivePortrait · two passes'], ['img2img', 'Image-to-image · redraw'], ['text', 'Prompt only · baseline']].map(([v, label]) => `<option value="${v}" ${p.engine === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label class="field" data-pipeline-part="style" ${p.engine === 'anima' ? 'hidden' : ''}><span id="expression-style-label">Style preset</span><select data-setting="style" aria-labelledby="expression-style-label" ${disabled}>${[['semireal', 'Semirealism'], ['realistic', 'Realistic portrait'], ['illustrated', 'Illustrated / anime']].map(([v, label]) => `<option value="${v}" ${p.style === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <div data-pipeline-part="checkpoint" ${p.engine === 'liveportrait' ? 'hidden' : ''}><label class="field"><span>${['ipadapter', 'hybrid'].includes(p.engine) ? 'SDXL / SD1.5 checkpoint' : p.engine === 'anima' ? 'Anima model' : 'Checkpoint'}</span><select data-setting="model" ${disabled}>${models.map(m => `<option value="${esc(m.name)}" ${m.name === p.model ? 'selected' : ''}>${esc(m.title || m.name)}</option>`).join('') || '<option value="">No compatible checkpoint loaded</option>'}</select></label></div><p data-pipeline-part="portrait" class="helper-copy" ${p.engine !== 'liveportrait' ? 'hidden' : ''}>Works best on detectable portrait faces. Uses the ExpressionEditor sliders in each card; character prompts and LoRAs are not used.</p>
    <div data-pipeline-part="adapter" ${['ipadapter', 'hybrid'].includes(p.engine) ? '' : 'hidden'}><label class="field"><span>Adapter</span><select data-setting="adapter" ${disabled}>${options(adapters, p.adapter)}</select></label><div class="expression-fields">${field('Identity strength', 'weight', 0, 2, .05)}${field('Start', 'start', 0, 1, .05)}${field('End', 'end', 0, 1, .05)}</div><p class="helper-copy">Start at 0.65 strength / 0.8 end. Lower strength or end if the reference expression is overpowering the requested emotion. Anima is not compatible with these SDXL adapters.</p></div>
    <div class="anima-controls" data-pipeline-part="anima" ${p.engine === 'anima' ? '' : 'hidden'}>
      <section class="anima-setup" aria-label="Anima backend setup">
        <div class="anima-setup-heading"><b>Backend setup</b><button type="button" data-command="probe-anima" class="secondary-button" ${disabled}>Check Anima setup</button></div>
        <div class="anima-setup-report" data-anima-report role="status" aria-live="polite"></div>
        <details class="anima-model-files expression-disclosure" data-anima-files data-generate-disclosure="anima" ${this.generateDisclosures.has('anima') ? 'open' : ''}>
          <summary>Model files</summary>
          <label class="check-row"><input data-setting="animaEmbedded" type="checkbox" ${p.animaEmbedded ? 'checked' : ''} ${disabled}/>Use checkpoint’s encoder and VAE</label>
          <div class="anima-separate-assets" data-anima-separate ${p.animaEmbedded ? 'hidden' : ''}>
            ${animaAssets.slice(0, 2).map(([label, key, node, input]) => `<label class="field"><span id="expression-${key}-label">${label}</span><select data-setting="${key}" aria-labelledby="expression-${key}-label" ${disabled}>${options(nodeChoices(this.schema, node, input), p[key])}</select></label>`).join('')}
          </div>
          <label class="field"><span id="expression-animaAdapter-label">Adapter weights</span><select data-setting="animaAdapter" aria-labelledby="expression-animaAdapter-label" ${disabled}>${options(nodeChoices(this.schema, 'AnimaRefAdapter', 'lora_name'), p.animaAdapter)}</select></label>
        </details>
        <a class="anima-install-link" data-anima-guide href="${ANIMA_INSTALL_GUIDE}" target="_blank" rel="noopener noreferrer">Installation guide <span aria-hidden="true">↗</span></a>
      </section>
      <section class="anima-reference-controls" aria-label="Reference controls">
        <b>Reference controls</b>
        <div class="expression-fields">${field('Guidance', 'animaGuidance', 0, 20, .1)}${field('Adapter strength', 'animaStrength', 0, 2, .05)}${field('Guidance end', 'animaEnd', 0, 1, .05)}</div>
        <p class="helper-copy" data-anima-sampling-note></p>
      </section>
    </div>
    <div data-pipeline-part="img2img" ${p.engine === 'img2img' ? '' : 'hidden'}>${field('Redraw / creativity', 'denoise', 0, 1, .05)}</div>
    <details class="expression-details expression-disclosure" data-generate-disclosure="sampling" ${this.generateDisclosures.has('sampling') ? 'open' : ''}><summary>Sampling & resolution</summary>${this.resolutionFields(disabled)}<div class="expression-fields">${field('Steps', 'steps', 1, 100)}${field('CFG', 'cfg', 1, 20, .5)}${field('Shared seed', 'seed', 0, 2147483646)}</div><label class="field"><span>Sampler</span><select data-setting="sampler" ${disabled}>${options(samplers, p.sampler)}</select></label><label class="field"><span>Scheduler</span><select data-setting="scheduler" ${disabled}>${options(schedulers, p.scheduler)}</select></label><p class="helper-copy">768² / 24 steps is a conservative starting point for an 8 GB GPU. Every card shares the seed; rerolls increment only that card.</p></details>
    <details class="expression-details expression-disclosure" data-generate-disclosure="backend" ${this.generateDisclosures.has('backend') ? 'open' : ''}><summary>Backend setup & research</summary><button data-command="probe" class="secondary-button" ${this.setupBusy ? 'disabled' : ''}>${this.setupBusy ? 'Checking…' : 'Check loaded nodes'}</button><p class="expression-setup">${esc(this.setup)}</p><p class="helper-copy">IPAdapter needs its model weights and CLIP Vision. LivePortrait additionally needs ExpressionEditor and its models; install through ComfyUI Manager, restart the backend, then recheck.</p><button data-command="workflow-export" class="ghost-button">Export API workflow</button><a href="https://github.com/cubiq/ComfyUI_IPAdapter_plus" target="_blank" rel="noopener noreferrer">IPAdapter setup ↗</a><a href="https://github.com/PowerHouseMan/ComfyUI-AdvancedLivePortrait" target="_blank" rel="noopener noreferrer">LivePortrait setup ↗</a><a href="https://github.com/ToTheBeginning/PuLID/blob/main/docs/pulid_for_flux.md" target="_blank" rel="noopener noreferrer">Why PuLID-FLUX needs more memory ↗</a></details></section>
    <section class="expression-section" id="expression-settings-layout" data-settings-group="layout"><div class="expression-section-head"><b>Sheet layout</b></div><div class="expression-fields">${field('Columns', 'columns', 1, 8)}${field('Gutter', 'gutter', 0, 100)}<label class="field"><span>Paper</span><input data-setting="background" type="color" value="${p.background}" ${disabled}/></label></div><label class="check-row"><input data-setting="labels" type="checkbox" ${p.labels ? 'checked' : ''} ${disabled}/>Include expression labels</label><p class="helper-copy">Exports include enabled cards in their current order. Portrait packs include separate images and the project manifest.</p></section>
    ` : `<section class="expression-section" data-processing-stage="${stage}">
        <div class="expression-section-head"><b>${stageLabels[stage]} settings</b></div>
        <div class="processing-fields" data-processing-fields></div>
    </section>`}
   </aside>
   <section class="expression-board" aria-labelledby="expression-stage-heading">
    <div class="expression-toolbar">
      <div>
        ${generatingScreen ? `<input class="expression-title" id="expression-stage-heading" aria-label="Expression sheet name" data-setting="name" value="${esc(p.name)}" ${disabled}/>` : `<h2 id="expression-stage-heading" class="expression-stage-heading">${stageLabels[stage]}</h2>`}
        <p data-stage-count></p>
      </div>
      <div class="expression-toolbar-actions">
        <button type="button" class="secondary-button expression-settings-open" aria-haspopup="dialog" aria-controls="expression-settings-drawer" data-expression-settings-open>Settings</button>
        ${generatingScreen ? this.addExpressionsMenu(disabled) : ''}
        <div class="expression-render-actions">
          <button type="button" data-command="run-stage" class="primary-button" ${disabled}>${stageActions[stage]}</button>
          ${actionMenu('expression-render-menu', 'Options', 'Render options', `<div class="studio-menu-section"><button type="button" data-command="run-all" ${disabled}>Render unlocked<small>Start again from Generate on selected, unlocked portraits.</small></button></div><div class="studio-menu-section"><label class="check-row"><input type="checkbox" data-setting="autoDeleteDrafts" ${p.autoDeleteDrafts ? 'checked' : ''} ${disabled}/> Keep final results only</label><small>Keep earlier steps until the portrait finishes. Successful pipelines discard earlier steps and takes for that card.</small></div>`)}
        </div>
        ${this.running ? '<button type="button" data-command="stop" class="danger-soft">Stop after current</button>'
            : this.bridge.processing ? '<button type="button" data-command="run-pipeline" class="secondary-button">Run pipeline</button>' : ''}
      </div>
    </div>
    <div class="expression-run-status" role="status"><span class="${this.running ? 'is-running' : ''}"></span><b>${esc(this.status)}</b></div>
    ${p.tiles.length ? `<div class="expression-grid" style="--expression-columns:${Math.min(p.columns, 4)}">${p.tiles.map((tile, index) => this.card(tile, index, disabled)).join('')}</div>`
        : '<p class="expression-stage-empty">Add expressions on the Generate screen to build your sheet.</p>'}
   </section></div>
   <dialog id="expression-settings-drawer" class="expression-settings-drawer" aria-labelledby="expression-settings-title"><header><h2 id="expression-settings-title">${generatingScreen ? 'Expression settings' : `${stageLabels[stage]} settings`}</h2><button type="button" class="icon-button" aria-label="Close expression settings" data-expression-settings-close>×</button></header></dialog>
   </div>`;
        this.bind();
        this.syncSetupFeedback();
        this.syncStageStatus();
        if (focusedTab) this.host.querySelector<HTMLElement>('[data-stage-tab][aria-selected="true"]')?.focus({ preventScroll: true });
        const processing = this.bridge.processing;
        const fields = this.host.querySelector<HTMLElement>('[data-processing-fields]');
        if (processing && fields && stage !== 'generate') {
            const key = stage === 'refine' ? 'refine' : 'backgroundRemoval';
            bindProcessingFields(fields, processing, stage, p[key], recipe => {
                this.project[key] = recipe;
                this.persist();
                this.syncStageStatus();
            }, this.processingChoices[stage], true, this.running);
        }
        this.bindMobileSettings();
    }
    private bindMobileSettings(): void {
        const root = this.host!;
        const controls = root.querySelector<HTMLElement>('.expression-controls')!;
        const layout = controls.parentElement!;
        const drawer = root.querySelector<HTMLDialogElement>('.expression-settings-drawer')!;
        const trigger = root.querySelector<HTMLButtonElement>('[data-expression-settings-open]')!;
        const close = drawer.querySelector<HTMLButtonElement>('[data-expression-settings-close]')!;
        const tabs = [...controls.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')];
        const sections = controls.querySelectorAll<HTMLElement>('[data-settings-group]');
        const phone = window.matchMedia('(max-width: 760px)');
        const viewport = window.visualViewport;
        const syncViewport = () => {
            const width = viewport?.width ?? document.documentElement.clientWidth;
            const right = Math.max(0, document.documentElement.clientWidth - width - (viewport?.offsetLeft ?? 0));
            drawer.style.setProperty('--settings-viewport-width', `${width}px`);
            drawer.style.setProperty('--settings-viewport-right', `${right}px`);
            drawer.style.setProperty('--settings-viewport-top', `${viewport?.offsetTop ?? 0}px`);
            if (viewport) drawer.style.setProperty('--settings-viewport-height', `${viewport.height}px`);
            drawer.toggleAttribute('data-narrow-viewport', width < 340);
        };
        const selectTab = (key: SettingsTab) => {
            this.settingsTab = key;
            for (const tab of tabs) {
                const selected = tab.dataset.settingsTab === key;
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
            }
            for (const section of sections) {
                section.toggleAttribute('data-selected', section.dataset.settingsGroup === key);
            }
            controls.scrollTop = 0;
        };
        const dismiss = () => {
            this.settingsOpen = false;
            drawer.close();
        };
        const open = () => {
            if (!phone.matches || drawer.open) return;
            this.settingsOpen = true;
            for (const section of sections) {
                section.setAttribute('role', 'tabpanel');
                section.setAttribute('aria-labelledby', `expression-settings-tab-${section.dataset.settingsGroup}`);
            }
            selectTab(this.settingsTab);
            drawer.append(controls);
            syncViewport();
            drawer.showModal();
            (tabs.find(tab => tab.tabIndex === 0) ?? close).focus({ preventScroll: true });
            this.settingsMediaListener = new AbortController();
            const { signal } = this.settingsMediaListener;
            viewport?.addEventListener('resize', syncViewport, { signal });
            viewport?.addEventListener('scroll', syncViewport, { signal });
            phone.addEventListener('change', () => { if (!phone.matches && drawer.open) dismiss(); },
                { signal });
        };
        trigger.addEventListener('click', open);
        close.addEventListener('click', dismiss);
        drawer.addEventListener('click', event => { if (event.target === drawer) dismiss(); });
        drawer.addEventListener('cancel', () => { this.settingsOpen = false; });
        drawer.addEventListener('keydown', event => event.stopPropagation());
        drawer.addEventListener('close', () => {
            if (!drawer.isConnected) return;
            this.settingsOpen = false;
            this.settingsMediaListener?.abort();
            for (const section of sections) {
                section.removeAttribute('role');
                section.removeAttribute('aria-labelledby');
            }
            layout.prepend(controls);
            if (phone.matches) trigger.focus({ preventScroll: true });
        });
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => selectTab(tab.dataset.settingsTab as SettingsTab));
            tab.addEventListener('keydown', event => {
                const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
                    : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length]
                    : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : undefined;
                if (!next) return;
                event.preventDefault();
                selectTab(next.dataset.settingsTab as SettingsTab);
                next.focus({ preventScroll: true });
            });
        });
        if (this.settingsOpen && phone.matches) open();
        else this.settingsOpen = false;
    }
    private availableStages(): PipelineStage[] {
        return this.bridge.processing ? ['generate', 'refine', 'background'] : ['generate'];
    }
    private nextStages(tile: ExpressionTile, project = this.project): PipelineStage[] {
        return pendingStages(tile.image, tile.stage, project.refine, project.backgroundRemoval)
            .filter(stage => stage === 'generate' || this.bridge.processing);
    }
    private pipelineTabs(): string {
        return `<div class="expression-pipeline" role="tablist" aria-label="Expression pipeline">
            ${this.availableStages().map(stage => {
                const selected = stage === this.screen;
                const active = stage === this.currentStage;
                return `<button type="button" id="expression-tab-${stage}" role="tab" aria-label="${stageLabels[stage]}" aria-controls="expression-stage-panel"
                    aria-selected="${selected}" tabindex="${selected ? 0 : -1}" data-stage-tab="${stage}" data-pipeline-stage="${stage}" ${active ? 'aria-current="step"' : ''}>
                    <span><b>${stageLabels[stage]}</b><small></small></span>
                    ${active ? `<progress aria-label="${stageLabels[stage]} progress" max="1" ${this.progress ? `value="${this.progress}"` : ''}></progress>` : ''}
                </button>`;
            }).join('')}
        </div>`;
    }
    private syncStageStatus(): void {
        const root = this.host;
        if (!root) return;
        const tiles = this.project.tiles;
        const selected = tiles.filter(tile => tile.enabled && !tile.locked);
        const ready = (stage: PipelineStage) => selected.filter(tile => this.nextStages(tile)[0] === stage).length;
        const done = (stage: PipelineStage) => tiles.filter(tile => imageForStage(tile, stage)).length;
        for (const stage of this.availableStages()) {
            const recipe = stage === 'refine' ? this.project.refine : this.project.backgroundRemoval;
            const waiting = ready(stage);
            const complete = done(stage);
            const failed = tiles.filter(tile => tile.error && tile.errorStage === stage).length;
            const badge = root.querySelector(`[data-stage-tab="${stage}"] small`);
            if (badge) badge.textContent = stage === this.currentStage ? 'Running' : stage !== 'generate' && recipe.mode === 'off'
                ? 'Skipped' : failed ? `${failed} failed` : waiting ? `${waiting} ready` : complete ? `${complete} shown` : 'Waiting';
        }
        const count = root.querySelector('[data-stage-count]');
        if (count) count.textContent = `${done(this.screen)} results · ${ready(this.screen)} ready · ${tiles.filter(tile => tile.locked).length} locked`;
        const run = root.querySelector<HTMLButtonElement>('[data-command="run-stage"]');
        if (run) run.disabled = this.running || !ready(this.screen);
        const pipeline = root.querySelector<HTMLButtonElement>('[data-command="run-pipeline"]');
        if (pipeline) pipeline.disabled = !selected.some(tile => this.nextStages(tile).length);
        if (this.screen !== 'generate') {
            root.querySelectorAll<HTMLElement>('[data-stage-state]').forEach(element => {
                const tile = tiles.find(item => item.id === element.dataset.stageState);
                if (tile) element.textContent = this.processingStatus(tile, this.screen as ProcessingStage);
            });
        }
    }
    private addExpressionsMenu(disabled: string): string {
        return actionMenu('expression-add-menu', 'Add expressions', 'Build the sheet', `<div class="studio-menu-section"><label class="field"><span>Preset set</span><select data-preset-count ${disabled}><option value="6">Essential 6</option><option value="12" selected>Classic 12</option><option value="24">Full range 24</option></select></label><button type="button" data-command="load-presets" ${disabled}>Add preset expressions<small>Add the chosen preset set to this sheet.</small></button></div><div class="studio-menu-section"><button type="button" data-command="add-card" ${disabled}>Add custom expression<small>Start with a blank direction.</small></button></div>`);
    }
    private processingStatus(tile: ExpressionTile, stage: ProcessingStage): string {
        if (imageForStage(tile, stage)) return 'Result';
        const next = this.nextStages(tile)[0];
        if (next === stage) return 'Source ready';
        if (!tile.image) return 'Awaiting generation';
        const recipe = stage === 'refine' ? this.project.refine : this.project.backgroundRemoval;
        if (recipe.mode === 'off') return 'Stage skipped';
        if (tile.stage === 'background') return 'Earlier result unavailable';
        return 'Awaiting refinement';
    }
    private cardError(tile: ExpressionTile): string {
        if (!tile.error || (tile.errorStage ?? 'generate') !== this.screen) return '';
        const failure = expressionFailure(tile.error);
        return `<p class="expression-error">${esc(failure.message)}</p>${failure.setup ? `<a class="expression-error-setup" href="https://github.com/cubiq/ComfyUI_IPAdapter_plus#installation" target="_blank" rel="noopener noreferrer">Get the matching CLIP Vision encoder ↗</a><details class="expression-error-details expression-disclosure"><summary>Technical details</summary><p>${esc(tile.error)}</p></details>` : ''}`;
    }
    private card(tile: ExpressionTile, index: number, disabled: string): string {
        const stage = this.screen;
        const generate = stage === 'generate';
        const result = imageForStage(tile, stage);
        const source = stage === 'refine' ? imageForStage(tile, 'generate')
            : stage === 'background' ? imageForStage(tile, 'refine') ?? imageForStage(tile, 'generate') : undefined;
        const preview = result ?? source;
        const working = this.currentId === tile.id && this.currentStage === stage;
        const active = this.currentId === tile.id && this.currentStage !== null;
        const stopping = this.runController?.signal.aborted;
        const stopButton = active ? `<button type="button" data-tile-command="stop" class="danger-soft expression-stop-card" aria-label="Stop ${esc(tile.name)}" ${stopping ? 'disabled' : ''}>${stopping ? 'Stopping…' : 'Stop'}</button>` : '';
        const actions = generate ? `
            <textarea data-tile="prompt" rows="2" aria-label="Expression direction" ${disabled}>${esc(tile.prompt)}</textarea>
            ${this.cardError(tile)}
            ${tile.variants?.length ? `<div class="expression-variants" aria-label="Previous takes">${tile.variants.map((take, i) => `<button data-take="${i}" title="Restore take with seed ${take.seed}" ${disabled}><img src="${esc(take.image)}" alt="Previous ${esc(tile.name)}"/></button>`).join('')}</div>` : ''}
            <small>${result && result.seed >= 0 ? `Seed ${result.seed}` : 'Shared seed'}</small>
            <details class="expression-disclosure" data-pipeline-part="motion" ${['liveportrait', 'hybrid'].includes(this.project.engine) ? '' : 'hidden'}><summary>Face controls</summary><div class="expression-motion">${Object.entries(tile.motion).map(([key, value]) => `<label><span>${esc(key.replaceAll('_', ' '))}</span><input data-motion="${key}" type="number" min="${motionLimits[key as keyof ExpressionMotion][0]}" max="${motionLimits[key as keyof ExpressionMotion][1]}" step="${key === 'smile' ? .05 : .5}" value="${value}" ${disabled}/></label>`).join('')}</div></details>
            <div class="expression-card-actions">
                ${stopButton || `<button data-tile-command="render" class="primary-button" ${disabled || tile.locked ? 'disabled' : ''}>${this.project.engine === 'liveportrait' ? 'Apply face' : tile.image ? 'Reroll' : 'Render'}</button>`}
                <button data-tile-command="reference" class="ghost-button" title="Use this portrait as the character reference" ${result && !this.running ? '' : 'disabled'}>Ref</button>
                <button data-tile-command="download" class="ghost-button" ${result ? '' : 'disabled'}>PNG</button>
                <button data-tile-command="up" title="Move earlier" ${disabled}>↑</button><button data-tile-command="down" title="Move later" ${disabled}>↓</button><button data-tile-command="remove" title="Remove card" ${disabled}>×</button>
            </div>` : `
            ${this.cardError(tile)}
            <div class="expression-processing-meta"><small data-stage-state="${tile.id}"></small>${stopButton}${result ? '<button data-tile-command="download" class="ghost-button">PNG</button>' : ''}</div>`;
        const lastStage = tile.stage ?? 'generate';
        const latest = !preview && tile.image && lastStage !== stage && this.availableStages().includes(lastStage);
        const empty = latest ? 'Earlier image unavailable' : generate ? 'Ready for direction' : 'No image yet';
        return `<article class="expression-card ${tile.locked ? 'is-locked' : ''} ${tile.enabled ? '' : 'is-excluded'} ${working ? 'is-rendering' : ''}" data-card="${tile.id}">
            <div class="expression-card-head">
                <label><input type="checkbox" data-tile="enabled" aria-label="Select ${esc(tile.name)}" ${tile.enabled ? 'checked' : ''} ${disabled}/><span>${String(index + 1).padStart(2, '0')}</span></label>
                ${generate ? `<input data-tile="name" value="${esc(tile.name)}" aria-label="Expression name" ${disabled}/>` : `<b>${esc(tile.name)}</b>`}
                <button data-tile-command="lock" title="${tile.locked ? 'Unlock portrait' : 'Lock portrait'}" aria-label="${tile.locked ? 'Unlock' : 'Lock'} ${esc(tile.name)}" ${disabled}>${tile.locked ? '●' : '○'}</button>
            </div>
            <div class="expression-card-image" ${stage === 'background' && result ? 'data-cutout' : ''} style="aspect-ratio:${this.project.width}/${this.project.height}">
                ${preview ? `<img src="${esc(preview.image)}" alt="${esc(tile.name)} · ${result ? stageLabels[stage] : 'Source'}"/>`
                    : `<div><span>${esc(tile.name)}</span><small>${empty}</small></div>`}
                ${working ? `<img class="expression-live-preview" data-expression-live-preview alt="Live preview for ${esc(tile.name)}" ${this.livePreview ? `src="${esc(this.livePreview)}"` : 'hidden'}/><span class="expression-render-overlay">${stageLabels[stage]}…</span>` : ''}
            </div>
            <div class="expression-card-body">
                ${latest ? `<button type="button" class="ghost-button" data-open-stage="${lastStage}">View latest result</button>` : ''}
                ${actions}
            </div>
        </article>`;
    }
    private syncPipelineControls(): void {
        const root = this.host;
        if (!root) return;
        const p = this.project;
        const adapter = ['ipadapter', 'hybrid'].includes(p.engine);
        const visible: Record<string, boolean> = { checkpoint: p.engine !== 'liveportrait', portrait: p.engine === 'liveportrait', adapter, style: p.engine !== 'anima', anima: p.engine === 'anima', img2img: p.engine === 'img2img', motion: ['liveportrait', 'hybrid'].includes(p.engine) };
        root.querySelectorAll<HTMLElement>('[data-pipeline-part]').forEach(part => { part.hidden = !visible[part.dataset.pipelinePart!]; });
        const models = this.modelsForEngine(p.engine);
        if (!models.some(model => model.name === p.model)) p.model = models[0]?.name ?? '';
        const select = root.querySelector<HTMLSelectElement>('[data-setting="model"]');
        if (select) {
            select.innerHTML = models.map(model => `<option value="${esc(model.name)}" ${model.name === p.model ? 'selected' : ''}>${esc(model.title || model.name)}</option>`).join('') || '<option value="">No compatible checkpoint loaded</option>';
            const label = select.parentElement?.querySelector('span');
            if (label) label.textContent = adapter ? 'SDXL / SD1.5 checkpoint' : p.engine === 'anima' ? 'Anima model' : 'Checkpoint';
        }
        root.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
            const tile = p.tiles.find(item => item.id === card.dataset.card);
            const render = card.querySelector('[data-tile-command="render"]');
            if (render) render.textContent = p.engine === 'liveportrait' ? 'Apply face' : tile?.image ? 'Reroll' : 'Render';
        });
        this.persist();
    }
    private resolutionFields(disabled: string): string {
        const presets = ['1:1', '2:3', '3:4', '4:5', '9:16', '3:2', '4:3', '5:4', '16:9'];
        return `<div class="expression-resolution">
            <div class="expression-resolution-options">
                <label class="field"><span id="expression-ratio-label">Aspect ratio</span><select data-expression-ratio aria-labelledby="expression-ratio-label" ${disabled}><option value="">Custom</option>${presets.map(ratio => `<option value="${ratio}" ${ratio === this.project.linkedRatio ? 'selected' : ''}>${ratio}</option>`).join('')}</select></label>
                <button type="button" class="secondary-button" data-expression-link aria-label="Link dimensions" aria-pressed="${Boolean(this.project.linkedRatio)}" ${disabled}>${this.project.linkedRatio ? 'Linked' : 'Unlinked'}</button>
            </div>
            ${(['width', 'height'] as const).map((axis) => {
                const label = axis === 'width' ? 'Width' : 'Height';
                return `<div class="expression-dimension"><label class="field"><span>${label} (px)</span><input type="number" min="256" max="1536" step="64" data-dimension="${axis}" value="${this.project[axis]}" ${disabled}/></label><input type="range" min="256" max="1536" step="64" aria-label="${label} slider" data-dimension="${axis}" value="${this.project[axis]}" ${disabled}/></div>`;
            }).join('')}
        </div>`;
    }
    private bindResolution(root: HTMLElement): void {
        const fields = [...root.querySelectorAll<HTMLInputElement>('[data-dimension]')];
        const presets = root.querySelector<HTMLSelectElement>('[data-expression-ratio]');
        const link = root.querySelector<HTMLButtonElement>('[data-expression-link]');
        if (!presets || !link) return;
        const apply = (axis: 'width' | 'height', size: number, ratio = this.project.linkedRatio) => {
            const p = this.project;
            if (ratio) {
                const [width, height] = ratio.split(':').map(Number);
                const long = Math.max(width!, height!);
                const short = Math.min(width!, height!);
                const requested = size * long / (axis === 'width' ? width! : height!);
                const longest = Math.min(1536, Math.max(256 * long / short, requested));
                Object.assign(p, dimensionsForRatio(ratio, false, longest, longest));
            } else if (Number.isFinite(size)) {
                p[axis] = Math.min(1536, Math.max(256, Math.round(size / 64) * 64));
            }
            for (const input of fields) input.value = String(p[input.dataset.dimension as 'width' | 'height']);
            link.textContent = p.linkedRatio ? 'Linked' : 'Unlinked';
            link.setAttribute('aria-pressed', String(Boolean(p.linkedRatio)));
            presets.value = [...presets.options].some(option => option.value === p.linkedRatio) ? p.linkedRatio! : '';
            root.querySelectorAll<HTMLElement>('.expression-card-image').forEach(image => { image.style.aspectRatio = `${p.width} / ${p.height}`; });
            this.persist();
        };
        for (const field of fields) field.addEventListener(field.type === 'range' ? 'input' : 'change', () => {
            const axis = field.dataset.dimension as 'width' | 'height';
            apply(axis, Number.isFinite(field.valueAsNumber) ? field.valueAsNumber : this.project[axis]);
        });
        link.addEventListener('click', () => {
            const p = this.project;
            p.linkedRatio = p.linkedRatio ? undefined : `${p.width}:${p.height}`;
            apply('width', p.width);
        });
        presets.addEventListener('change', () => {
            if (!presets.value) {
                this.project.linkedRatio = undefined;
                apply('width', this.project.width);
                return;
            }
            const [width, height] = presets.value.split(':').map(Number);
            this.project.linkedRatio = presets.value;
            apply(width! >= height! ? 'width' : 'height', Math.max(this.project.width, this.project.height));
        });
    }
    private bind(): void {
        const root = this.host!;
        this.bindResolution(root);
        const switchStage = (stage: PipelineStage) => {
            if (this.screen !== stage) {
                this.screen = stage;
                this.draw();
            }
            this.host?.querySelector<HTMLElement>('[data-stage-tab][aria-selected="true"]')?.focus({ preventScroll: true });
        };
        root.querySelectorAll<HTMLButtonElement>('[data-stage-tab]').forEach(button => {
            button.addEventListener('click', () => switchStage(button.dataset.stageTab as PipelineStage));
            button.addEventListener('keydown', event => {
                const stages = this.availableStages();
                const index = stages.indexOf(this.screen);
                const next = event.key === 'ArrowRight' ? stages[(index + 1) % stages.length]
                    : event.key === 'ArrowLeft' ? stages[(index + stages.length - 1) % stages.length]
                    : event.key === 'Home' ? stages[0] : event.key === 'End' ? stages.at(-1) : undefined;
                if (!next) return;
                event.preventDefault();
                switchStage(next);
            });
        });
        root.querySelectorAll<HTMLButtonElement>('[data-open-stage]').forEach(button => {
            button.addEventListener('click', () => switchStage(button.dataset.openStage as PipelineStage));
        });
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
            if (key === 'engine' || key === 'model' || key.startsWith('anima')) this.syncSetupFeedback();
            if (key === 'columns')
                this.host?.querySelector<HTMLElement>('.expression-grid')?.style.setProperty('--expression-columns', String(Math.min(this.project.columns, 4)));
            if (key === 'name')
                this.host?.querySelectorAll<HTMLInputElement>('[data-setting="name"]').forEach(other => { if (other !== input)
                    other.value = this.project.name; });
        }));
        root.querySelector<HTMLInputElement>('[data-reference]')?.addEventListener('change', event => {
            const input = event.currentTarget as HTMLInputElement;
            const file = input.files?.[0];
            input.value = '';
            void this.loadReference(file);
        });
        root.querySelector<HTMLInputElement>('[data-project-import]')?.addEventListener('change', e => void this.importProject((e.currentTarget as HTMLInputElement).files?.[0]));
        bindActionMenus(root);
        const openGuide = this.bridge.openAnimaGuide;
        if (openGuide) root.querySelector('[data-anima-guide]')?.addEventListener('click', event => {
            event.preventDefault();
            void openGuide().catch(error => this.bridge.notify(`Could not open the installation guide: ${String(error)}`, true));
        });
        root.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(button => button.addEventListener('click', () => void this.command(button.dataset.command!)));
        root.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
            const tile = this.project.tiles.find(t => t.id === card.dataset.card)!;
            card.querySelectorAll<HTMLButtonElement>('[data-take]').forEach(button => button.addEventListener('click', () => { if (this.running)
                return; const index = Number(button.dataset.take); const take = tile.variants?.[index]; if (!take)
                return; tile.variants![index] = { image: tile.image, path: tile.path, seed: tile.seed, stage: tile.stage }; Object.assign(tile, take); tile.earlierStages = undefined; tile.error = ''; this.persist(); this.draw(); }));
            card.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-tile]').forEach(input => input.addEventListener('change', () => { if (this.running)
                return; const key = input.dataset.tile!; if (key === 'enabled') {
                tile.enabled = (input as HTMLInputElement).checked;
                card.classList.toggle('is-excluded', !tile.enabled);
                this.syncStageStatus();
            }
            else if (key === 'name')
                tile.name = input.value.slice(0, 80);
            else
                tile.prompt = input.value.slice(0, 3000); this.persist(); }));
            card.querySelectorAll<HTMLInputElement>('[data-motion]').forEach(input => input.addEventListener('change', () => { const key = input.dataset.motion as keyof ExpressionMotion; tile.motion[key] = Number.isFinite(input.valueAsNumber) ? Math.max(motionLimits[key][0], Math.min(motionLimits[key][1], input.valueAsNumber)) : 0; this.persist(); }));
            card.querySelectorAll<HTMLButtonElement>('[data-tile-command]').forEach(button => button.addEventListener('click', () => { const command = button.dataset.tileCommand; if (command === 'download') {
                const result = imageForStage(tile, this.screen);
                if (result) void this.saveTile(tile.name, result).catch(error => this.bridge.notify(String(error), true));
                return;
            } if (command === 'stop' && this.currentId === tile.id && this.runController) {
                this.stopped = true;
                this.runController.abort();
                this.livePreview = '';
                this.status = `Stopping ${tile.name}…`;
                this.draw();
                return;
            } if (this.running)
                return; if (command === 'reference') {
                this.project.reference = imageForStage(tile, 'generate')?.image ?? '';
                this.project.referenceName = tile.name;
                this.persist();
                this.draw();
                return;
            } if (command === 'render') {
                void this.run([tile], true, 'generate');
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
            if (command === 'pick-identity') {
                this.openIdentityPicker();
                return;
            }
            if (command === 'browse-reference') {
                if (!this.running) this.bridge.browseReference?.((source, name) => this.setReference(source, name));
                return;
            }
            if (command === 'upload-reference') {
                this.host?.querySelector<HTMLInputElement>('[data-reference]')?.click();
                return;
            }
            if (command === 'stop') {
                this.stopped = true;
                this.status = 'Stopping after the current portrait finishes.';
                this.draw();
                return;
            }
            if (command === 'project-open') {
                if (!this.running) this.host?.querySelector<HTMLInputElement>('[data-project-import]')?.click();
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
                if (!['ipadapter', 'anima', 'liveportrait'].includes(this.project.engine))
                    throw new Error('Workflow export supports IPAdapter, Anima Ref Adapter or LivePortrait; choose a single-pass method.');
                const workflow = this.project.engine === 'anima' ? this.animaGraph(this.project, tile) : this.project.engine === 'liveportrait' ? livePortraitWorkflow(this.project.reference, tile.motion, this.schema) : ipAdapterWorkflow(this.project, tile, this.schema);
                download(new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' }), `${slug(this.project.name)}-${slug(tile.name)}-api.json`);
                return;
            }
            if (command === 'probe' || command === 'probe-anima') {
                if (this.setupBusy) return;
                await this.probe();
                if (command === 'probe-anima') {
                    const report = this.animaSetupReport();
                    this.bridge.log?.(`Anima setup · ${report.message}`, report.state === 'error');
                }
                return;
            }
            if (this.running)
                return;
            if (command === 'run-stage' || command === 'run-pipeline') {
                await this.run(this.project.tiles.filter(t => t.enabled && !t.locked), false, command === 'run-stage' ? this.screen : undefined);
                return;
            }
            if (command === 'run-all') {
                await this.run(this.project.tiles.filter(t => t.enabled && !t.locked), true);
                return;
            }
            if (command === 'clear-reference') {
                this.referenceRequest++;
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
    private openIdentityPicker(): void {
        const host = this.host, sources = this.bridge.identitySources?.();
        if (!host || !sources || this.running || host.querySelector('.expression-identity-dialog')) return;
        const groups = [
            { title: 'Studio identities', entries: sources.identities, empty: 'No saved identities. Create one in Identities.' },
            { title: 'Swarm presets', entries: sources.presets, empty: 'No Swarm presets loaded. Connect to Swarm to see your presets.' },
        ];
        const dialog = document.createElement('dialog');
        dialog.className = 'expression-identity-dialog';
        dialog.setAttribute('aria-labelledby', 'expression-identity-title');
        dialog.innerHTML = `
            <header><div><h2 id="expression-identity-title">Choose saved identity</h2><p>Bring in prompts, a reference portrait, and LoRAs.</p></div><button type="button" class="icon-button" data-close aria-label="Close identity picker" autofocus>×</button></header>
            <div class="expression-identity-choices">
                ${groups.map(({ title, entries, empty }, groupIndex) => `
                    <details class="expression-disclosure" name="expression-identity-source" ${groupIndex === (sources.identities.length || !sources.presets.length ? 0 : 1) ? 'open' : ''}>
                        <summary>${title}<span>${entries.length}</span></summary>
                        <div class="expression-identity-options">${entries.map((entry, index) => {
                            const loras = entry.loraStack.filter(lora => lora.enabled);
                            const portrait = entry.avatarUrl && groupIndex === 0
                                ? `<img src="${esc(entry.avatarUrl)}" alt="" loading="lazy"/>`
                                : esc([...entry.name.trim()][0]?.toUpperCase() ?? '?');
                            return `<button type="button" class="secondary-button" data-identity-group="${groupIndex}" data-identity-index="${index}">
                                <span class="expression-identity-avatar" aria-hidden="true">${portrait}</span>
                                <span class="expression-identity-copy"><b>${esc(entry.name)}</b>${loras.length ? `<small>LoRAs · ${esc(loras.map(lora => `${lora.title || lora.name} × ${lora.weight}`).join(' · '))}</small>` : ''}</span>
                                ${disclosureChevronSvg}
                            </button>`;
                        }).join('') || `<p class="helper-copy">${empty}</p>`}</div>
                    </details>`).join('')}
                <p class="expression-error" data-identity-error role="alert" hidden></p>
            </div>`;
        dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
        dialog.addEventListener('keydown', event => event.stopPropagation());
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('[data-identity-group]')];
        buttons.forEach(button => button.addEventListener('click', async () => {
            const identity = groups[Number(button.dataset.identityGroup)]?.entries[Number(button.dataset.identityIndex)];
            if (!identity || this.running) return;
            const errorNote = dialog.querySelector<HTMLElement>('[data-identity-error]')!;
            errorNote.hidden = true;
            buttons.forEach(option => { option.disabled = true; });
            try {
                const reference = identity.avatarUrl ? await portraitDataUrl(identity.avatarUrl) : '';
                if (!dialog.open || !dialog.isConnected || this.running) return;
                const project = this.project;
                const defaults = defaultSheet();
                const model = resolveModelFileName(identity.model, this.bridge.models().map(item => item.name));
                const checkpoint = this.modelsForEngine(project.engine).find(item => item.name.replaceAll('\\', '/') === model);
                const loras = cloneLoraStack(identity.loraStack);
                this.referenceRequest++;
                Object.assign(project, {
                    subject: (identity.positivePrompt.trim() || defaults.subject).slice(0, 20000),
                    negative: (identity.negativePrompt.trim() || defaults.negative).slice(0, 20000),
                    model: checkpoint?.name ?? project.model,
                    reference,
                    referenceName: reference ? identity.name : '',
                    savedIdentityLoras: loras.length ? loras : undefined,
                    useLoras: loras.some(lora => lora.enabled),
                });
                this.status = `${identity.name} loaded.${identity.model && !checkpoint ? ' The saved checkpoint is unavailable for the current render method.' : ''}`;
                this.persist(true);
                dialog.close();
                dialog.remove();
                this.draw();
                this.host?.querySelector<HTMLElement>('[data-command="pick-identity"]')?.focus({ preventScroll: true });
            } catch (error) {
                errorNote.textContent = error instanceof Error ? error.message : String(error);
                errorNote.hidden = false;
                buttons.forEach(option => { option.disabled = false; });
                button.focus({ preventScroll: true });
            }
        }));
        host.append(dialog);
        dialog.showModal();
    }
    private async loadReference(file?: File): Promise<void> { if (!file)
        return; try {
        if (file.size > 30 * 1024 * 1024)
            throw new Error('Choose a portrait under 30 MB.');
        const url = URL.createObjectURL(file);
        try {
            await this.setReference(url, file.name);
        }
        finally {
            URL.revokeObjectURL(url);
        }
    }
    catch (error) {
        this.bridge.notify(String(error), true);
    } }
    private async setReference(source: string | Promise<string>, name: string): Promise<void> {
        const request = ++this.referenceRequest;
        const reference = await portraitDataUrl(await source);
        if (request !== this.referenceRequest) return;
        if (this.running) throw new Error('Wait for the sheet queue to finish before changing its reference.');
        this.project.reference = reference;
        this.project.referenceName = name;
        this.persist();
        this.draw();
    }
    private async importProject(file?: File): Promise<void> { if (!file)
        return; try {
        const imported = normalizeSheet(JSON.parse(await file.text()));
        if (this.running)
            throw new Error('Wait for the sheet queue to finish before opening a project.');
        this.project = imported;
            this.referenceRequest++;
        this.screen = 'generate';
        this.persist();
        this.draw();
    }
    catch (error) {
        this.bridge.notify(String(error), true);
    } }
    private animaSetupReport(): { state: string; title: string; message: string } {
        if (this.setupBusy) return { state: 'checking', title: 'Checking…', message: 'Reading the connected ComfyUI model inventory.' };
        if (this.setupError) return { state: 'error', title: 'Check failed', message: this.setupError };
        if (!this.setupChecked) return { state: 'idle', title: 'Unchecked', message: 'Check which model files and nodes ComfyUI can see.' };
        try {
            const setup = resolveAnimaSetup(this.project, this.schema);
            const source = setup.loader === 'CheckpointLoaderSimple' ? 'checkpoint loader' : 'diffusion loader';
            const components = this.project.animaEmbedded ? 'Checkpoint encoder and VAE selected.' : 'Separate encoder and VAE found.';
            return { state: 'ready', title: 'Files found', message: `${setup.name} · ${source}. ${components} Adapter node and weights are listed.` };
        } catch (error) {
            return { state: 'error', title: 'Needs attention', message: error instanceof Error ? error.message : String(error) };
        }
    }
    private syncSetupFeedback(): void {
        const root = this.host;
        if (!root) return;
        const report = root.querySelector<HTMLElement>('[data-anima-report]');
        if (report) {
            const result = this.animaSetupReport();
            report.dataset.state = result.state;
            report.innerHTML = `<b>${esc(result.title)}</b><p>${esc(result.message)}</p>`;
        }
        const button = root.querySelector('[data-command="probe-anima"]');
        button?.setAttribute('aria-disabled', String(this.setupBusy || this.running));
        const general = root.querySelector('.expression-setup');
        if (general) general.textContent = this.setupBusy ? 'Reading ComfyUI nodes…' : this.setup;
        const note = root.querySelector('[data-anima-sampling-note]');
        if (note) note.textContent = /turbo/i.test(this.project.model)
            ? 'Turbo model starting point · CFG 1, 8–12 steps. Reference guidance 1 avoids an extra model pass.'
            : 'Reference guidance 1 avoids an extra model pass. Higher values give the reference more influence.';
        const separate = root.querySelector<HTMLElement>('[data-anima-separate]');
        if (separate) separate.hidden = this.project.animaEmbedded;
        for (const [, key, node, input] of animaAssets) {
            const select = root.querySelector<HTMLSelectElement>(`[data-setting="${key}"]`);
            if (!select) continue;
            const values = [...new Set([this.project[key], ...nodeChoices(this.schema, node, input)])].filter(Boolean);
            if (values.length === select.options.length && values.every((value, i) => select.options[i]?.value === value)) continue;
            select.replaceChildren(...values.map(value => new Option(value, value, false, value === this.project[key])));
        }
    }
    private probe(): Promise<void> {
        if (this.probeRequest) return this.probeRequest;
        this.setupBusy = true;
        this.syncSetupFeedback();
        this.probeRequest = Promise.resolve().then(() => this.bridge.probe()).then(schema => {
            this.schema = schema;
            this.setupChecked = true;
            this.setupError = '';
            this.setup = [
                ['Anima Ref Adapter', Boolean(schema.AnimaRefAdapter)],
                ['IPAdapter loader', Boolean(schema.IPAdapterUnifiedLoader)],
                ['ExpressionEditor', Boolean(schema.ExpressionEditor)],
                ['Swarm image bridge', Boolean(schema.SwarmLoadImageB64 && schema.SwarmSaveImageWS)],
            ].map(([label, present]) => `${label}: ${present ? 'loaded' : 'missing'}`).join(' · ');
        }).catch(error => {
            this.schema = {};
            this.setupError = `Could not read the connected ComfyUI inventory. ${error instanceof Error ? error.message : String(error)}`;
            this.setup = this.setupError;
        }).finally(() => {
            this.setupBusy = false;
            this.probeRequest = null;
            this.syncSetupFeedback();
        });
        return this.probeRequest;
    }
    private animaGraph(project: SheetProject, tile: ExpressionTile, loras?: ExpressionLora[]) {
        if (this.setupError) throw new Error(this.setupError);
        return animaWorkflow(project, tile, this.schema, loras, this.bridge.models().find(model => model.name === project.model));
    }
    private async generateTile(snapshot: SheetProject, tile: ExpressionTile, loras: ExpressionLora[], transient: boolean, signal: AbortSignal) {
        const request = expressionRequest(snapshot, tile, this.bridge.params());
        if (snapshot.engine === 'anima')
            request.comfyworkflowraw = JSON.stringify(this.animaGraph(snapshot, tile, loras));
        if (snapshot.engine === 'liveportrait')
            request.comfyworkflowraw = JSON.stringify(livePortraitWorkflow(snapshot.reference, tile.motion, this.schema));
        if (transient || (snapshot.autoDeleteDrafts && snapshot.engine === 'hybrid')) request.donotsave = true;
        const preview = (image: string) => this.updatePreview(image);
        const output = await this.bridge.generate(request, loras, fraction => this.updateProgress(snapshot.engine === 'hybrid' ? fraction / 2 : fraction), undefined, preview, signal);
        signal.throwIfAborted();
        if (snapshot.engine !== 'hybrid') return output;
        preview(output.image);
        const facial: SwarmGenerationRequest = {
            ...request, promptimages: undefined, useipadapter: undefined, steps: 1, cfgscale: 1, seed: output.seed,
            donotsave: transient || undefined,
            comfyworkflowraw: JSON.stringify(livePortraitWorkflow(output.image, tile.motion, this.schema)),
        };
        return this.bridge.generate(facial, [], fraction => this.updateProgress(.5 + fraction / 2), undefined, preview, signal);
    }
    private updatePreview(image: string): void {
        if (!image || !this.currentId || !this.currentStage || this.runController?.signal.aborted) return;
        this.livePreview = image;
        const node = this.host?.querySelector<HTMLImageElement>('[data-expression-live-preview]');
        if (node) {
            node.src = image;
            node.hidden = false;
        }
    }
    private updateProgress(value: number): void {
        this.progress = value;
        const meter = this.host?.querySelector<HTMLProgressElement>('.expression-pipeline progress');
        if (meter) meter.value = value;
    }
    private async run(tiles: ExpressionTile[], regenerate = false, stageOnly?: PipelineStage): Promise<void> {
        if (this.running) return;
        const snapshot = { ...this.project };
        const queue = tiles.map(tile => {
            const stages = this.nextStages(regenerate ? { ...tile, image: '' } : tile, snapshot);
            return { tile, stages: stageOnly ? stages.slice(0, 1).filter(stage => stage === stageOnly) : stages };
        }).filter(item => item.stages.length);
        if (!queue.length) {
            this.bridge.notify('No selected, unlocked portraits have pending stages.');
            return;
        }
        if (!this.bridge.connected() || this.bridge.busy()) {
            this.bridge.notify(!this.bridge.connected() ? 'Connect Studio to Swarm first.' : 'Wait for the current Studio generation to finish.', true);
            return;
        }
        this.running = true;
        this.runController = new AbortController();
        const signal = this.runController.signal;
        this.stopped = false;
        this.status = 'Checking pipeline settings…';
        this.draw();
        let completed = 0;
        let failed = 0;
        try {
            const required = new Set(queue.flatMap(item => item.stages));
            const workflows = new Map<ProcessingStage, Awaited<ReturnType<typeof resolveProcessing>>>();
            for (const stage of ['refine', 'background'] as const) {
                if (!required.has(stage) || this.stopped) continue;
                if (!this.bridge.processing) throw new Error('Image processing is unavailable.');
                const recipe = stage === 'refine' ? snapshot.refine : snapshot.backgroundRemoval;
                try {
                    workflows.set(stage, await resolveProcessing(this.bridge.processing, stage, recipe));
                } catch (error) {
                    throw new Error(`${processingLabels[stage]} · ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            const loras = required.has('generate') && snapshot.useLoras && snapshot.engine !== 'liveportrait'
                ? this.bridge.captureLoras(snapshot.model, snapshot.savedIdentityLoras) : [];
            if (required.has('generate') && !this.stopped) {
                if (['anima', 'liveportrait', 'ipadapter', 'hybrid'].includes(snapshot.engine)) await this.probe();
                if (snapshot.engine === 'anima') {
                    const first = queue.find(item => item.stages[0] === 'generate')!;
                    this.animaGraph(snapshot, first.tile, loras);
                }
                if (['ipadapter', 'hybrid'].includes(snapshot.engine) && Object.keys(this.schema).length && !this.schema.IPAdapterUnifiedLoader)
                    throw new Error('IPAdapter Unified Loader is not loaded in this backend. Check setup.');
                if (['liveportrait', 'hybrid'].includes(snapshot.engine) && !this.schema.ExpressionEditor)
                    throw new Error('ExpressionEditor is not loaded. Open backend setup for installation instructions.');
            }
            for (const [index, { tile, stages }] of queue.entries()) {
                if (this.stopped) break;
                this.currentId = tile.id;
                const oldSeedOffset = tile.seedOffset;
                if (regenerate && stageOnly === 'generate' && tile.image && snapshot.engine !== 'liveportrait') tile.seedOffset++;
                tile.error = '';
                tile.errorStage = undefined;
                try {
                    for (const stage of stages) {
                        const transient = snapshot.autoDeleteDrafts
                            && pendingStages('completed', stage, snapshot.refine, snapshot.backgroundRemoval)
                                .some(next => this.availableStages().includes(next));
                        this.currentStage = stage;
                        this.status = `${index + 1} / ${queue.length} · ${tile.name} · ${stageLabels[stage]}`;
                        this.progress = 0;
                        this.livePreview = '';
                        this.draw();
                        let output;
                        if (stage === 'generate') {
                            output = await this.generateTile(snapshot, tile, loras, transient, signal);
                            signal.throwIfAborted();
                            if (tile.image) {
                                tile.variants = [...(tile.variants ?? []), { image: tile.image, path: tile.path, seed: tile.seed, stage: tile.stage }].slice(-8);
                            }
                        } else {
                            const source = await readProcessingImage(tile.image);
                            signal.throwIfAborted();
                            const request = processingRequest(source, workflows.get(stage)!(source), {
                                model: snapshot.model, seed: tile.seed, prompt: tile.prompt, negativeprompt: snapshot.negative,
                            });
                            if (transient) request.donotsave = true;
                            output = await this.bridge.generate(request, [], value => this.updateProgress(value), stage, image => this.updatePreview(image), signal);
                        }
                        signal.throwIfAborted();
                        recordStageImage(tile, stage, output);
                        this.persist();
                    }
                    if (snapshot.autoDeleteDrafts && !this.nextStages(tile, snapshot).length) {
                        tile.variants = [];
                        tile.earlierStages = undefined;
                    }
                    completed++;
                } catch (error) {
                    if (signal.aborted) {
                        tile.seedOffset = oldSeedOffset;
                        break;
                    }
                    const message = error instanceof Error ? error.message : String(error);
                    const failure = expressionFailure(message);
                    const stage = this.currentStage;
                    tile.errorStage = stage ?? undefined;
                    tile.error = stage && stage !== 'generate' ? `${processingLabels[stage]} · ${message}` : message;
                    failed++;
                    this.bridge.notify(`${tile.name}: ${stage && stage !== 'generate' ? processingLabels[stage] + ' · ' : ''}${failure.message}`, true);
                    if (failure.stop) this.stopped = true;
                }
                this.persist();
            }
            this.status = `${this.stopped ? 'Stopped' : 'Finished'} · ${completed} complete${failed ? ` · ${failed} failed` : ''}.`;
        } catch (error) {
            this.status = error instanceof Error ? error.message : String(error);
            this.bridge.notify(this.status, true);
        } finally {
            this.currentId = '';
            this.currentStage = null;
            this.runController = null;
            this.livePreview = '';
            this.persist(true);
            await this.saving;
            this.running = false;
            this.draw();
        }
    }
    private async saveTile(name: string, result: ExpressionImage): Promise<void> { const image = await imageFrom(result.image); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d')!.drawImage(image, 0, 0); await this.bridge.save(canvas.toDataURL('image/png'), `${slug(name)}.png`); }
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
