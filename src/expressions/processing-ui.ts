import {
    describeImageGraph, MAX_WORKFLOW_LENGTH, processingLabels, prepareProcessing,
    type ProcessingBackend, type ProcessingRecipe, type ProcessingStage, type SavedProcessingWorkflow, type WorkflowImageInput,
} from './processing';

export interface ProcessingHost {
    connected(): boolean;
    inventory(): Promise<ProcessingBackend>;
    listWorkflows(): Promise<string[]>;
    savedWorkflow(name: string): Promise<SavedProcessingWorkflow>;
}

export interface ProcessingChoices {
    inventory?: ProcessingBackend;
    workflows?: string[];
    imageInputs?: { workflow: string; values: WorkflowImageInput[] };
}

export const escapeMarkup = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export async function resolveProcessing(host: ProcessingHost, stage: ProcessingStage, recipe: ProcessingRecipe) {
    const inventory = recipe.mode === 'builtin' ? await host.inventory() : undefined;
    const saved = recipe.mode === 'saved' && recipe.workflow ? await host.savedWorkflow(recipe.workflow) : undefined;
    return prepareProcessing(stage, recipe, inventory, saved);
}

function options(choices: WorkflowImageInput[], selected: string, placeholder: string): string {
    const values = selected && !choices.some(choice => choice.id === selected)
        ? [...choices, { id: selected, name: selected }]
        : choices;
    return `<option value="">${placeholder}</option>` + values.map(({ id, name }) =>
        `<option value="${escapeMarkup(id)}" ${id === selected ? 'selected' : ''}>${escapeMarkup(name)}</option>`).join('');
}

export function bindProcessingFields(
    root: HTMLElement, host: ProcessingHost, stage: ProcessingStage,
    initial: ProcessingRecipe, onChange: (recipe: ProcessingRecipe) => void,
    choices: ProcessingChoices, optional: boolean, disabled: boolean, workflowOnly = false,
): void {
    let recipe = initial;
    let loading = false;
    let error = '';
    let revision = 0;
    const update = (next: Partial<ProcessingRecipe>) => {
        recipe = { ...recipe, ...next };
        onChange(recipe);
    };
    const graphStatus = () => {
        if (!recipe.graph.trim()) return 'Export in API format with one image loader and one image output. Studio connects the source and result.';
        try { return describeImageGraph(recipe.graph); }
        catch (error) { return (error as Error).message; }
    };
    const refresh = async () => {
        const request = ++revision;
        if (disabled || recipe.mode === 'off' || recipe.mode === 'json') return;
        loading = true;
        error = '';
        const active = root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.recipe : undefined;
        render();
        restoreFocus(active);
        try {
            if (!host.connected()) throw new Error('Connect to Swarm to load backend options.');
            if (recipe.mode === 'builtin') {
                const data = await host.inventory();
                if (request !== revision || !root.isConnected) return;
                choices.inventory = data;
            } else {
                const name = recipe.workflow;
                const [names, workflow] = await Promise.allSettled([host.listWorkflows(), name ? host.savedWorkflow(name) : undefined]);
                if (request !== revision || !root.isConnected) return;
                if (names.status === 'fulfilled') choices.workflows = names.value;
                if (workflow.status === 'fulfilled') choices.imageInputs = { workflow: name, values: workflow.value?.imageInputs ?? [] };
                if (names.status === 'rejected') throw names.reason;
                if (workflow.status === 'rejected') throw workflow.reason;
            }
        } catch (failure) {
            if (request === revision) error = failure instanceof Error ? failure.message : String(failure);
        } finally {
            if (request === revision && root.isConnected) {
                loading = false;
                const focused = root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.recipe : undefined;
                render();
                restoreFocus(focused);
            }
        }
    };
    const restoreFocus = (key?: string) => {
        if (key) root.querySelector<HTMLElement>(`[data-recipe="${key}"]`)?.focus({ preventScroll: true });
    };
    const render = () => {
        const mode = recipe.mode;
        const inventory = choices.inventory;
        const workflowInputs = choices.imageInputs?.workflow === recipe.workflow ? choices.imageInputs.values : undefined;
        const lock = disabled ? 'disabled' : '';
        const methodChoices = [
            ...(optional ? [['off', 'Skip this stage']] : []),
            ...(workflowOnly ? [] : [['builtin', stage === 'refine' ? 'Upscale model' : 'Built-in · BiRefNet']]),
            ['saved', 'Saved Swarm workflow'], ['json', 'ComfyUI API JSON'],
        ];
        let fields = '';
        if (mode === 'builtin' && stage === 'refine') {
            fields = `<label class="field"><span>Upscale model</span><select aria-label="Upscale model" data-recipe="model" ${lock}>${options((inventory?.upscaleModels ?? []).map(id => ({ id, name: id })), recipe.model, 'Auto · first installed model')}</select></label>
                <label class="field"><span>Output scale</span><select aria-label="Output scale" data-recipe="factor" ${lock}>${[1, 2, 3, 4].map(n => `<option value="${n}" ${n === recipe.factor ? 'selected' : ''}>${n}×</option>`).join('')}</select></label>
                <p class="helper-copy">${inventory && !inventory.upscaleModels.length ? 'No models found. ' : ''}ComfyUI reads these models from <code>models/upscale_models</code>.</p>`;
        }
        if (mode === 'builtin' && stage === 'background') {
            fields = `<p class="helper-copy">${inventory?.backgroundReady ? 'BiRefNet is ready. ' : inventory ? 'BiRefNet is unavailable on this backend. ' : ''}Install <a href="https://huggingface.co/Comfy-Org/BiRefNet" target="_blank" rel="noopener noreferrer">birefnet.safetensors</a> in <code>models/background_removal</code>. The built-in workflow outputs a transparent PNG.</p>`;
        }
        if (mode === 'saved') {
            fields = `<label class="field"><span>Saved workflow</span><select aria-label="Saved workflow" data-recipe="workflow" ${lock}>${options((choices.workflows ?? []).map(id => ({ id, name: id })), recipe.workflow, 'Choose a workflow')}</select></label>
                <label class="field"><span>Source image input</span><select aria-label="Source image input" data-recipe="imageInput" ${lock}>${options(workflowInputs ?? [], recipe.imageInput || (workflowInputs?.length === 1 ? workflowInputs[0]!.id : ''), 'Choose an image input')}</select></label>
                <p class="helper-copy">${recipe.workflow && !loading && workflowInputs?.length === 0 ? 'This workflow must expose an image parameter in Swarm. ' : ''}Use a workflow with a single image output.${stage === 'background' && !workflowOnly ? ' The output must include an alpha channel for transparency.' : ''}</p>`;
        }
        if (mode === 'json') {
            fields = `<button type="button" class="secondary-button processing-file" data-recipe-upload ${lock}>Load workflow JSON</button>
                <input type="file" accept="application/json,.json" data-recipe-file hidden ${lock}/>
                <label class="field"><span>API workflow JSON</span><textarea data-recipe="graph" rows="5" spellcheck="false" maxlength="${MAX_WORKFLOW_LENGTH}" ${lock}>${escapeMarkup(recipe.graph)}</textarea></label>
                <p class="helper-copy" data-graph-status>${escapeMarkup(graphStatus())}</p>${stage === 'background' && !workflowOnly ? '<p class="helper-copy">Connect an output with an alpha channel to keep transparency.</p>' : ''}`;
        }
        root.innerHTML = `<label class="field"><span>${workflowOnly ? "Workflow method" : processingLabels[stage] + " method"}</span><select aria-label="${workflowOnly ? "Workflow method" : processingLabels[stage] + " method"}" data-recipe="mode" ${lock}>${methodChoices.map(([value, label]) => `<option value="${value}" ${mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${fields}
            ${mode === 'builtin' || mode === 'saved' ? `<button type="button" class="ghost-button processing-refresh" data-recipe-refresh ${disabled || loading ? 'disabled' : ''}>${loading ? 'Loading…' : 'Refresh backend options'}</button>` : ''}
            ${error ? `<p class="expression-error" role="status">${escapeMarkup(error)}</p>` : ''}`;
        root.querySelectorAll<HTMLSelectElement>('select[data-recipe]').forEach(select => select.addEventListener('change', () => {
            const key = select.dataset.recipe as keyof ProcessingRecipe;
            if (key === 'workflow') {
                update({ workflow: select.value, imageInput: '' });
                void refresh();
            } else if (key === 'mode') {
                update({ mode: select.value as ProcessingRecipe['mode'] });
                loading = false;
                error = '';
                render();
                root.querySelector('select')?.focus();
                void refresh();
            } else update({ [key]: key === 'factor' ? Number(select.value) : select.value });
        }));
        root.querySelector('[data-recipe-refresh]')?.addEventListener('click', () => void refresh());
        root.querySelector('[data-recipe-upload]')?.addEventListener('click', () => root.querySelector<HTMLInputElement>('[data-recipe-file]')?.click());
        root.querySelector<HTMLTextAreaElement>('[data-recipe="graph"]')?.addEventListener('input', event => {
            update({ graph: (event.currentTarget as HTMLTextAreaElement).value });
            root.querySelector('[data-graph-status]')!.textContent = graphStatus();
        });
        root.querySelector<HTMLInputElement>('[data-recipe-file]')?.addEventListener('change', async event => {
            const file = (event.currentTarget as HTMLInputElement).files?.[0];
            if (!file) return;
            const request = ++revision;
            try {
                if (file.size > MAX_WORKFLOW_LENGTH) throw new Error('Choose an API workflow JSON under 256 KB.');
                const graph = await file.text();
                if (root.isConnected && request === revision) {
                    update({ graph });
                    error = '';
                    render();
                }
            } catch (failure) {
                if (root.isConnected && request === revision) {
                    error = String(failure);
                    render();
                }
            }
        });
    };
    render();
}
