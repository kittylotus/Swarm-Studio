import type { SwarmGenerationRequest } from '../swarm/types';
import { normalizeRecipe, processingLabels, processingRequest, readProcessingImage, type ProcessingSource, type ProcessingStage } from './processing';
import { bindProcessingFields, escapeMarkup as esc, resolveProcessing, type ProcessingChoices, type ProcessingHost } from './processing-ui';

export interface EditorImage extends ProcessingSource {
    name: string;
    id?: string;
    model?: string;
    seed?: number;
    prompt?: string;
    negativeprompt?: string;
}

interface EditorHost extends ProcessingHost {
    busy(): boolean;
    checkpoint(): string;
    browseLibrary(): void;
    inpaintBusy(): boolean;
    load(id: string): Promise<EditorImage>;
    generate(request: SwarmGenerationRequest, progress: (value: number) => void, stage?: ProcessingStage): Promise<EditorImage>;
    generationRequest(prompt: string): SwarmGenerationRequest;
    inpaint(source: EditorImage | null): void;
    save(image: string, name: string): Promise<void>;
}

const tools = { generate: 'Generate', ...processingLabels, inpaint: 'Inpaint' } as const;
type EditorTool = keyof typeof tools;

export class ImageEditor {
    private host: HTMLElement | null = null;
    private inpaintPanel: HTMLElement | null = null;
    private source: EditorImage | null = null;
    private previous: EditorImage | null = null;
    private tool: EditorTool = 'refine';
    private recipes = {
        refine: normalizeRecipe({ mode: 'builtin' }),
        background: normalizeRecipe({ mode: 'builtin' }),
    };
    private choices: Record<ProcessingStage, ProcessingChoices> = { refine: {}, background: {} };
    private prompt = '';
    private running = false;
    private loading = false;
    private fraction: number | null = null;
    private status = '';
    private error = '';

    constructor(private readonly bridge: EditorHost) { }
    get busy(): boolean { return this.running || this.loading; }

    mount(host: HTMLElement, inpaintPanel: HTMLElement | null): void {
        this.host = host;
        this.inpaintPanel = inpaintPanel;
        this.draw();
    }

    async loadOutput(id: string, inpaint = false): Promise<void> {
        if (!id || this.busy || this.bridge.inpaintBusy()) return;
        await this.load(() => this.bridge.load(id), inpaint);
    }

    useInpaintResult(source: EditorImage): void {
        this.setSource(source);
        this.status = 'Inpaint result loaded.';
        this.draw();
    }

    private setSource(next: EditorImage): void {
        this.previous = this.source;
        this.source = next;
    }

    private syncInpaint(): void {
        this.bridge.inpaint(this.tool === 'inpaint' ? this.source : null);
    }

    private async load(read: () => Promise<EditorImage>, inpaint = false): Promise<void> {
        this.loading = true;
        this.error = '';
        this.status = 'Loading image…';
        this.draw();
        try {
            this.setSource(await read());
            if (inpaint) this.tool = 'inpaint';
            this.status = '';
        } catch (error) {
            this.status = '';
            this.error = error instanceof Error ? error.message : String(error);
        } finally {
            this.loading = false;
            this.draw();
            this.syncInpaint();
        }
    }

    private upload(file: File | undefined): void {
        if (!file || this.busy || this.bridge.inpaintBusy()) return;
        void this.load(async () => {
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 30 * 1024 * 1024) {
                throw new Error('Choose a PNG, JPEG, or WebP image under 30 MB.');
            }
            const image = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error('Could not read the selected image.'));
                reader.readAsDataURL(file);
            });
            return { ...await readProcessingImage(image), name: file.name };
        });
    }

    private draw(): void {
        const host = this.host;
        if (!host?.isConnected) return;
        const source = this.source;
        const tool = this.tool;
        const disabled = this.running || this.loading || this.bridge.inpaintBusy();
        const inlineInpaint = tool === 'inpaint' && Boolean(source);
        const lock = disabled ? 'disabled' : '';
        const checkpoint = this.bridge.checkpoint();
        const canRun = !disabled && (tool === 'generate' ? Boolean(checkpoint && this.prompt.trim()) : Boolean(source));
        const sourceActions = `
            <button type="button" class="ghost-button" data-editor-undo ${!this.previous || disabled ? 'disabled' : ''}>Previous image</button>
            <button type="button" class="secondary-button" data-editor-save ${!source || disabled ? 'disabled' : ''}>Download image</button>`;
        this.inpaintPanel?.remove();
        host.innerHTML = `<div class="expression-studio">
            <header class="expression-hero"><div><div class="expression-heading"><h1>Image editor</h1></div></div></header>
            <div class="expression-layout editor-layout">
                <aside class="expression-controls editor-sidebar" aria-label="Editor tools">
                    <section class="expression-section">
                        <div class="expression-section-head"><b>Source image</b></div>
                        <div class="editor-source-actions">
                            <button type="button" class="secondary-button" data-editor-upload-button ${lock}>Upload image</button>
                            <button type="button" class="secondary-button" data-editor-browse ${lock}>Browse Library</button>
                        </div>
                        <input data-editor-upload type="file" accept="image/png,image/jpeg,image/webp" hidden ${lock}/>
                    </section>
                    <section class="expression-section">
                        <div class="expression-section-head"><b>Tool</b></div>
                        <div class="editor-tools" role="group" aria-label="Image tools">
                            ${Object.entries(tools).map(([id, name]) => `<button type="button" class="secondary-button" data-editor-tool="${id}" aria-pressed="${id === tool}" ${lock}>${name}</button>`).join('')}
                        </div>
                        ${tool === 'generate' ? `<label class="field"><span>Prompt</span><textarea rows="4" data-editor-prompt ${lock}>${esc(this.prompt)}</textarea></label>
                            <p class="helper-copy">${checkpoint ? `Using the Create checkpoint and sampling settings · ${esc(checkpoint)}` : 'Choose a checkpoint in Create to generate an image.'}</p>` : ''}
                        ${tool === 'refine' || tool === 'background' ? '<div class="processing-fields" data-editor-recipe></div>' : ''}
                        ${!this.bridge.connected() && tool !== 'inpaint' ? '<p class="helper-copy">Connect to Swarm to run this tool.</p>' : ''}
                        ${tool === 'inpaint' ? '' : `<button type="button" class="primary-button" data-editor-run ${canRun ? '' : 'disabled'}>${tools[tool]}</button>`}
                    </section>
                </aside>
                <section class="editor-board expression-board ${inlineInpaint ? 'editor-board--inpaint' : ''}">
                    ${inlineInpaint ? '<div data-editor-inpaint-slot></div>' : `<div class="expression-toolbar">
                        <div><b>${source ? esc(source.name) : 'Preview'}</b>${source ? `<p>${source.width} × ${source.height}</p>` : ''}</div>
                        <div class="expression-toolbar-actions">${sourceActions}</div>
                    </div>
                    <div class="editor-preview">${source ? `<img src="${esc(source.image)}" alt="${esc(source.name)}"/>` : '<p>Upload an image, choose one from Library, or generate one here.</p>'}</div>`}
                    <div class="editor-status" role="status">${esc(this.status)}</div>
                    ${this.running ? `<progress data-editor-progress aria-label="${tools[tool]} progress" max="1" ${this.fraction === null ? '' : `value="${this.fraction}"`}></progress>` : ''}
                    ${this.error ? `<p class="expression-error" role="alert">${esc(this.error)}</p>` : ''}
                </section>
            </div>
        </div>`;
        if (inlineInpaint && this.inpaintPanel) {
            const actions = this.inpaintPanel.querySelector('[data-inpaint-source-actions]');
            if (actions) actions.innerHTML = sourceActions;
            host.querySelector('[data-editor-inpaint-slot]')?.append(this.inpaintPanel);
        }
        const recipeRoot = host.querySelector<HTMLElement>('[data-editor-recipe]');
        if (recipeRoot && (tool === 'refine' || tool === 'background')) {
            bindProcessingFields(recipeRoot, this.bridge, tool, this.recipes[tool], recipe => { this.recipes[tool] = recipe; }, this.choices[tool], false, disabled);
        }
        host.querySelectorAll<HTMLButtonElement>('[data-editor-tool]').forEach(button => button.addEventListener('click', () => {
            this.tool = button.dataset.editorTool as EditorTool;
            this.error = '';
            this.status = '';
            this.draw();
            this.syncInpaint();
            this.host?.querySelector<HTMLElement>(`[data-editor-tool="${this.tool}"]`)?.focus({ preventScroll: true });
        }));
        const fileInput = host.querySelector<HTMLInputElement>('[data-editor-upload]');
        host.querySelector('[data-editor-upload-button]')?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', event => this.upload((event.currentTarget as HTMLInputElement).files?.[0]));
        host.querySelector('[data-editor-browse]')?.addEventListener('click', () => this.bridge.browseLibrary());
        host.querySelector<HTMLTextAreaElement>('[data-editor-prompt]')?.addEventListener('input', event => {
            this.prompt = (event.currentTarget as HTMLTextAreaElement).value;
            const run = host.querySelector<HTMLButtonElement>('[data-editor-run]')!;
            run.disabled = !this.prompt.trim() || !checkpoint;
        });
        host.querySelector('[data-editor-run]')?.addEventListener('click', () => void this.run());
        host.querySelector('[data-editor-undo]')?.addEventListener('click', () => {
            [this.source, this.previous] = [this.previous, this.source];
            this.status = '';
            this.error = '';
            this.draw();
            this.syncInpaint();
            host.querySelector<HTMLElement>('[data-editor-undo]')?.focus();
        });
        host.querySelector('[data-editor-save]')?.addEventListener('click', async () => {
            if (!source) return;
            try { await this.bridge.save(source.image, source.name); }
            catch (error) { this.error = String(error); this.draw(); }
        });
    }

    private async run(): Promise<void> {
        const tool = this.tool;
        const source = this.source;
        if (this.running || this.loading || tool === 'inpaint' || (tool !== 'generate' && !source)) return;
        this.error = '';
        if (this.bridge.busy()) {
            this.error = 'Wait for the current Studio generation to finish.';
            this.draw();
            return;
        }
        if (!this.bridge.connected()) {
            this.error = 'Connect to Swarm to run this tool.';
            this.draw();
            return;
        }
        this.running = true;
        this.fraction = null;
        this.status = `${tools[tool]} · preparing…`;
        this.draw();
        try {
            let request: SwarmGenerationRequest;
            let stage: ProcessingStage | undefined;
            if (tool === 'generate') {
                request = this.bridge.generationRequest(this.prompt.trim());
            } else if (source && (tool === 'refine' || tool === 'background')) {
                stage = tool;
                const workflow = await resolveProcessing(this.bridge, tool, this.recipes[tool]);
                request = processingRequest(source, workflow(source), {
                    ...source, model: source.model || this.bridge.checkpoint(),
                });
            } else return;
            this.status = `${tools[tool]} · running…`;
            if (this.host?.isConnected) this.host.querySelector('.editor-status')!.textContent = this.status;
            this.setSource(await this.bridge.generate(request, value => {
                this.fraction = value;
                const meter = this.host?.querySelector<HTMLProgressElement>('[data-editor-progress]');
                if (meter) meter.value = value;
            }, stage));
            this.status = `${tools[tool]} complete.`;
        } catch (error) {
            this.status = '';
            this.error = error instanceof Error ? error.message : String(error);
        } finally {
            this.running = false;
            this.draw();
        }
    }
}
