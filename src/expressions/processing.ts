import type { SwarmGenerationRequest } from '../swarm/types';

export const processingLabels = { refine: 'Refine', background: 'Remove background' } as const;
export type ProcessingStage = keyof typeof processingLabels;
export type PipelineStage = 'generate' | ProcessingStage;
export type ProcessingMode = 'off' | 'builtin' | 'json' | 'saved';

export interface ProcessingRecipe {
    mode: ProcessingMode;
    model: string;
    factor: number;
    graph: string;
    workflow: string;
    imageInput: string;
}

export interface WorkflowImageInput { id: string; name: string }
export interface SavedProcessingWorkflow {
    imageInputs: WorkflowImageInput[];
    metadata: Record<string, unknown>;
}
export interface ProcessingBackend {
    upscaleModels: string[];
    backgroundReady: boolean;
}
export interface ProcessingSource {
    image: string;
    width: number;
    height: number;
}

export const BIREFNET_MODEL = 'birefnet.safetensors';
export const MAX_WORKFLOW_LENGTH = 256_000;

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeRecipe(value?: unknown): ProcessingRecipe {
    const data = record(value);
    const string = (key: string, max = 500) => typeof data[key] === 'string' ? data[key].slice(0, max) : '';
    const mode = data.mode;
    return {
        mode: mode === 'builtin' || mode === 'json' || mode === 'saved' ? mode : 'off',
        model: string('model'),
        factor: [1, 2, 3, 4].includes(Number(data.factor)) ? Number(data.factor) : 2,
        graph: string('graph', MAX_WORKFLOW_LENGTH),
        workflow: string('workflow'),
        imageInput: string('imageInput'),
    };
}

export function pendingStages(image: string, stage: PipelineStage | undefined, refine: ProcessingRecipe, background: ProcessingRecipe): PipelineStage[] {
    const result: PipelineStage[] = [];
    if (!image) {
        stage = undefined;
        result.push('generate');
    }
    if (stage === 'background') return result;
    if (stage !== 'refine' && refine.mode !== 'off') result.push('refine');
    if (background.mode !== 'off') result.push('background');
    return result;
}

export function readSavedProcessingWorkflow(raw: unknown): SavedProcessingWorkflow {
    const data = typeof raw === 'string' && raw.trim() ? JSON.parse(raw) as unknown : raw;
    const metadata = record(data);
    const imageInputs = Object.values(metadata).flatMap(value => {
        const item = record(value);
        const type = [item.type, item.view_type].some(field => String(field).toLowerCase() === 'image');
        const id = typeof item.id === 'string' ? item.id : '';
        if (!type || !/^[a-z][a-z0-9_]*$/i.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id.toLowerCase())) return [];
        return [{ id, name: typeof item.name === 'string' && item.name ? item.name : id }];
    });
    return { metadata, imageInputs };
}

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

function readImageGraph(json: string): { graph: Graph; source: string; output: string } {
    if (!json.trim() || json.length > MAX_WORKFLOW_LENGTH) throw new Error('Load or paste a ComfyUI API workflow under 256 KB.');
    let raw: unknown;
    try { raw = JSON.parse(json); }
    catch { throw new Error('The workflow contains invalid JSON.'); }
    const graph = record(record(raw).prompt ?? raw);
    const nodes = Object.entries(graph);
    if (!nodes.length || nodes.length > 200 || nodes.some(([id, value]) => {
        const { class_type, inputs } = record(value);
        return !/^[\w.:-]+$/.test(id) || typeof class_type !== 'string' || !class_type.trim() || !inputs || record(inputs) !== inputs;
    })) throw new Error('Export the workflow in ComfyUI API format (up to 200 nodes).');
    const typed = graph as Graph;
    const sources = nodes.filter(([id]) => ['LoadImage', 'SwarmLoadImageB64'].includes(typed[id]!.class_type));
    const outputs = nodes.filter(([id]) => ['SaveImage', 'SwarmSaveImageWS'].includes(typed[id]!.class_type));
    if (sources.length !== 1 || outputs.length !== 1) {
        throw new Error('Use one LoadImage or SwarmLoadImageB64 node and one SaveImage or SwarmSaveImageWS node.');
    }
    const source = sources[0]![0];
    const output = outputs[0]![0];
    if (!Array.isArray(typed[output]!.inputs.images)) throw new Error('Connect an image to the workflow output.');
    const visited = new Set<string>();
    const visiting = new Set<string>();
    function retain(id: string): void {
        if (visiting.has(id)) throw new Error('The workflow has a circular node connection.');
        if (visited.has(id)) return;
        if (!Object.hasOwn(typed, id)) throw new Error(`The workflow is missing node ${id}.`);
        visiting.add(id);
        for (const link of Object.values(typed[id]!.inputs)) {
            if (Array.isArray(link) && typeof link[0] === 'string' && Number.isInteger(link[1]) && link.length === 2) retain(link[0]);
        }
        visiting.delete(id);
        visited.add(id);
    }
    retain(output);
    if (!visited.has(source)) throw new Error('Connect the source image to the workflow output.');
    return { graph: Object.fromEntries([...visited].map(id => [id, typed[id]!])), source, output };
}

export function describeImageGraph(json: string): string {
    const { source, output } = readImageGraph(json);
    return `Studio replaces image input #${source} and reads image output #${output}.`;
}

export function prepareProcessing(
    stage: ProcessingStage, recipe: ProcessingRecipe, backend?: ProcessingBackend, saved?: SavedProcessingWorkflow,
): (source: ProcessingSource) => Record<string, unknown> {
    if (recipe.mode === 'saved') {
        const inputs = saved?.imageInputs ?? [];
        const imageInput = recipe.imageInput || (inputs.length === 1 ? inputs[0]!.id : '');
        if (!recipe.workflow || !saved || !inputs.some(input => input.id === imageInput)) {
            throw new Error('Choose a saved Swarm workflow and its exposed image input.');
        }
        return source => ({
            comfyuicustomworkflow: recipe.workflow,
            comfyworkflowparammetadata: JSON.stringify(saved.metadata),
            [imageInput]: source.image,
        });
    }
    if (recipe.mode === 'json') {
        const { graph, source, output } = readImageGraph(recipe.graph);
        return ({ image }) => ({
            comfyworkflowraw: JSON.stringify({
                ...graph,
                [source]: loadImage(image),
                [output]: saveImage(graph[output]!.inputs.images),
            }),
        });
    }
    if (recipe.mode !== 'builtin' || !backend) throw new Error('Choose a processing method and check the connected backend.');
    const upscaleModel = recipe.model || backend.upscaleModels[0];
    if (stage === 'refine' && (!upscaleModel || !backend.upscaleModels.includes(upscaleModel))) {
        throw new Error('Choose an installed upscale model. Add models to ComfyUI’s models/upscale_models folder and refresh the inventory.');
    }
    if (stage === 'background' && !backend.backgroundReady) {
        throw new Error(`BiRefNet is unavailable. Update ComfyUI and install ${BIREFNET_MODEL} in models/background_removal, then refresh.`);
    }
    return ({ image, width, height }) => {
        if (stage === 'background') return { comfyworkflowraw: JSON.stringify({
            '1': loadImage(image),
            '2': { class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: BIREFNET_MODEL } },
            '3': { class_type: 'RemoveBackground', inputs: { image: ['1', 0], bg_removal_model: ['2', 0] } },
            '4': { class_type: 'InvertMask', inputs: { mask: ['3', 0] } },
            '5': { class_type: 'JoinImageWithAlpha', inputs: { image: ['1', 0], alpha: ['4', 0] } },
            '6': saveImage(['5', 0]),
        }) };
        const targetWidth = width * recipe.factor, targetHeight = height * recipe.factor;
        if (Math.max(targetWidth, targetHeight) > 8192 || targetWidth * targetHeight > 36_000_000) {
            throw new Error('Choose a smaller source image or scale. Refine supports outputs up to 8192 px per side and 36 megapixels.');
        }
        return { comfyworkflowraw: JSON.stringify({
            '1': loadImage(image),
            '2': { class_type: 'UpscaleModelLoader', inputs: { model_name: upscaleModel } },
            '3': { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['2', 0], image: ['1', 0] } },
            '4': { class_type: 'ImageScale', inputs: { image: ['3', 0], upscale_method: 'lanczos', width: targetWidth, height: targetHeight, crop: 'disabled' } },
            '5': saveImage(['4', 0]),
        }) };
    };
}

function loadImage(image: string): Graph[string] {
    if (!/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(image)) throw new Error('Choose a PNG, JPEG, or WebP image.');
    return { class_type: 'SwarmLoadImageB64', inputs: { image_base64: image.slice(image.indexOf(',') + 1) } };
}

function saveImage(images: unknown): Graph[string] {
    return { class_type: 'SwarmSaveImageWS', inputs: { images } };
}

export async function readProcessingImage(image: string): Promise<ProcessingSource> {
    const element = new Image();
    element.src = image;
    await element.decode();
    return { image, width: element.naturalWidth, height: element.naturalHeight };
}

export function processingRequest(
    source: ProcessingSource, params: Record<string, unknown>,
    context: { model: string; seed?: number; prompt?: string; negativeprompt?: string },
): SwarmGenerationRequest {
    return {
        model: context.model, seed: context.seed ?? -1,
        prompt: context.prompt ?? '', negativeprompt: context.negativeprompt ?? '',
        width: Math.max(64, Math.min(16384, source.width)), height: Math.max(64, Math.min(16384, source.height)),
        steps: 1, cfgscale: 1, images: 1, batchsize: 1,
        imageformat: 'PNG', ...params,
    };
}
