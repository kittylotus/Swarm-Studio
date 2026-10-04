import type { SwarmGenerationRequest, SwarmModel, SwarmParamDefinition } from '../swarm/types';
export type SheetEngine = 'ipadapter' | 'liveportrait' | 'hybrid' | 'img2img' | 'text';
export type SheetStyle = 'semireal' | 'realistic' | 'illustrated';
export interface ExpressionMotion {
    smile: number;
    blink: number;
    eyebrow: number;
    wink: number;
    aaa: number;
    eee: number;
    woo: number;
    rotate_yaw: number;
    rotate_pitch: number;
}
export interface ExpressionTile {
    id: string;
    name: string;
    prompt: string;
    enabled: boolean;
    locked: boolean;
    seedOffset: number;
    motion: ExpressionMotion;
    image: string;
    path: string;
    seed: number;
    error: string;
    variants?: Array<{
        image: string;
        path: string;
        seed: number;
    }>;
}
export interface SheetProject {
    version: 1;
    name: string;
    style: SheetStyle;
    engine: SheetEngine;
    model: string;
    subject: string;
    negative: string;
    reference: string;
    referenceName: string;
    width: number;
    height: number;
    steps: number;
    cfg: number;
    seed: number;
    sampler: string;
    scheduler: string;
    adapter: string;
    weight: number;
    start: number;
    end: number;
    denoise: number;
    useLoras: boolean;
    columns: number;
    gutter: number;
    labels: boolean;
    background: string;
    tiles: ExpressionTile[];
}
export const emptyMotion = (): ExpressionMotion => ({ smile: 0, blink: 0, eyebrow: 0, wink: 0, aaa: 0, eee: 0, woo: 0, rotate_yaw: 0, rotate_pitch: 0 });
export const motionLimits: Record<keyof ExpressionMotion, [
    number,
    number
]> = { smile: [-.3, 1.3], blink: [-20, 5], eyebrow: [-10, 15], wink: [0, 25], aaa: [-30, 120], eee: [-20, 15], woo: [-20, 15], rotate_yaw: [-20, 20], rotate_pitch: [-20, 20] };
const expressions: Array<[
    string,
    string,
    Partial<ExpressionMotion>
]> = [
    ['Neutral', 'relaxed face, closed mouth, calm eyes', {}], ['Soft smile', 'gentle warm smile, relaxed eyes', { smile: .45 }],
    ['Joy', 'bright joyful smile, raised cheeks, sparkling eyes', { smile: 1, aaa: 12, eyebrow: 3 }], ['Laughing', 'laughing, open mouth, eyes slightly closed', { smile: 1.1, aaa: 35, blink: -8 }],
    ['Sad', 'sad expression, downturned mouth, sorrowful eyes', { smile: -.2, eyebrow: -6 }], ['Crying', 'teary eyes, distressed expression, trembling lips', { smile: -.25, aaa: 10, eyebrow: -8 }],
    ['Angry', 'angry expression, furrowed brows, tense lips', { eyebrow: -10, eee: 6 }], ['Furious', 'furious expression, clenched teeth, narrowed eyes', { eyebrow: -10, aaa: 18, eee: 10 }],
    ['Surprised', 'surprised, wide eyes, open mouth', { eyebrow: 12, aaa: 40 }], ['Shocked', 'shocked expression, widened eyes, gasping', { eyebrow: 15, aaa: 65 }],
    ['Worried', 'worried expression, knitted eyebrows, hesitant lips', { eyebrow: -4, smile: -.1 }], ['Confused', 'confused expression, raised eyebrow, questioning eyes', { eyebrow: 5, rotate_yaw: 5 }],
    ['Smug', 'smug half smile, confident eyes', { smile: .7, eee: 4 }], ['Shy', 'shy smile, lowered gaze, subtle blush', { smile: .3, rotate_pitch: 5 }],
    ['Wink', 'playful wink, teasing smile', { smile: .6, wink: 18 }], ['Sleepy', 'sleepy expression, heavy eyelids, relaxed mouth', { blink: -12, aaa: 3 }],
    ['Disgust', 'disgusted expression, wrinkled nose, curled lip', { eee: 10, smile: -.25 }], ['Determined', 'determined expression, focused eyes, firm mouth', { eyebrow: -3 }],
    ['Pout', 'pouting, pursed lips, sulky expression', { woo: 10 }], ['Kiss', 'kiss expression, pursed lips, soft eyes', { woo: 15, blink: -3 }],
    ['Pain', 'wincing in pain, eyes squeezed shut', { blink: -16, aaa: 20, eyebrow: -8 }], ['Bored', 'bored expression, half lidded eyes, unimpressed', { blink: -6, smile: -.1 }],
    ['Excited', 'excited expression, eager smile, wide eyes', { smile: 1, eyebrow: 8, aaa: 15 }], ['Tender', 'tender affectionate expression, gentle eyes, small smile', { smile: .4 }],
];
export function expressionTiles(count = 12): ExpressionTile[] { return (count === 6 ? [0, 1, 4, 6, 8, 10].map(index => expressions[index]!) : expressions.slice(0, count)).map(([name, prompt, motion]) => ({ id: crypto.randomUUID(), name, prompt, enabled: true, locked: false, seedOffset: 0, motion: { ...emptyMotion(), ...motion }, image: '', path: '', seed: -1, error: '' })); }
export function defaultSheet(): SheetProject { return { version: 1, name: 'Character expressions', style: 'semireal', engine: 'ipadapter', model: '', subject: 'one character, head and shoulders portrait, facing camera, consistent hairstyle and outfit, soft studio lighting, plain background', negative: 'different person, multiple people, duplicate face, text, watermark, cropped head, deformed face, blurry', reference: '', referenceName: '', width: 768, height: 768, steps: 24, cfg: 5.5, seed: 123456, sampler: 'euler', scheduler: 'normal', adapter: 'PLUS (high strength)', weight: .65, start: 0, end: .8, denoise: .55, useLoras: false, columns: 4, gutter: 24, labels: true, background: '#f4f0eb', tiles: expressionTiles() }; }
export function isAdapterModel(model: SwarmModel): boolean { return /stable-diffusion-xl|sdxl|stable-diffusion-v1|sd1|sd15/i.test([model.architecture, model.compat_class].join(' ')); }
export function advertisedValues(params: SwarmParamDefinition[], id: string): string[] { return (params.find(p => p.id === id)?.values ?? []).map(v => typeof v === 'string' ? v : String(v.value ?? v.name ?? '')).filter(Boolean); }
export function expressionPrompt(project: SheetProject, tile: ExpressionTile): string {
    const styles = { semireal: 'semirealistic character portrait, natural skin shading, detailed expressive eyes', realistic: 'photorealistic portrait, natural skin texture, subtle realistic facial muscles', illustrated: 'illustrated character portrait, expressive face, clean detailed rendering' };
    return [project.subject, styles[project.style], tile.prompt].filter(Boolean).join(', ');
}
export function expressionRequest(project: SheetProject, tile: ExpressionTile, params: SwarmParamDefinition[]): SwarmGenerationRequest {
    const seed = (Math.trunc(project.seed) + tile.seedOffset) % 2147483647;
    const request: SwarmGenerationRequest = { model: project.model, prompt: expressionPrompt(project, tile), negativeprompt: project.negative, width: project.width, height: project.height, steps: project.steps, cfgscale: project.cfg, seed, sampler: project.sampler, scheduler: project.scheduler, images: 1, batchsize: 1, imageformat: 'PNG' };
    if (!project.model && project.engine !== 'liveportrait')
        throw new Error('Choose a checkpoint.');
    if (project.engine === 'ipadapter' || project.engine === 'hybrid') {
        if (!project.reference)
            throw new Error('Add a reference portrait for IPAdapter.');
        if (!advertisedValues(params, 'useipadapter').includes(project.adapter))
            throw new Error('This Swarm backend has not advertised the selected IPAdapter. Refresh backend capabilities.');
        if (project.start >= project.end)
            throw new Error('Adapter start must be less than its end.');
        Object.assign(request, { promptimages: project.reference, useipadapter: project.adapter, ipadapterweight: project.weight, ipadapterstart: project.start, ipadapterend: project.end, ipadapterweighttype: 'prompt is more important' });
    }
    if (project.engine === 'img2img') {
        if (!project.reference)
            throw new Error('Add a reference image.');
        Object.assign(request, { initimage: project.reference, initimagecreativity: project.denoise });
    }
    return request;
}
export interface NodeSchema {
    input?: {
        required?: Record<string, [
            unknown,
            {
                default?: unknown;
            }?
        ]>;
        optional?: Record<string, [
            unknown,
            {
                default?: unknown;
            }?
        ]>;
    };
}
export function ipAdapterWorkflow(project: SheetProject, tile: ExpressionTile, schema: Record<string, NodeSchema>): Record<string, unknown> {
    if (project.useLoras)
        throw new Error('Disable composer LoRAs before exporting a standalone Comfy graph. The live Studio pipeline can apply them.');
    if (!project.reference)
        throw new Error('Add a reference portrait.');
    for (const node of ['CheckpointLoaderSimple', 'IPAdapterUnifiedLoader', 'IPAdapter', 'SwarmLoadImageB64', 'SwarmSaveImageWS']) {
        if (!schema[node])
            throw new Error(`The backend is missing ${node}. Check loaded nodes first.`);
    }
    const names = schema.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
    const modelKey = (name: string) => name.replaceAll('\\', '/').replace(/\.(safetensors|ckpt)$/i, '').toLowerCase();
    const candidates = Array.isArray(names) ? names.map(String) : [];
    const exact = candidates.find(name => modelKey(name) === modelKey(project.model));
    const leaf = candidates.filter(name => modelKey(name).split('/').pop() === modelKey(project.model).split('/').pop());
    const model = exact ?? (leaf.length === 1 ? leaf[0] : undefined);
    if (!model)
        throw new Error('The selected Swarm checkpoint could not be matched to the Comfy checkpoint inventory.');
    return {
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
        '2': { class_type: 'SwarmLoadImageB64', inputs: { image_base64: project.reference.split(',')[1] } },
        '3': { class_type: 'IPAdapterUnifiedLoader', inputs: { model: ['1', 0], preset: project.adapter } },
        '4': { class_type: 'IPAdapter', inputs: { model: ['3', 0], ipadapter: ['3', 1], image: ['2', 0], weight: project.weight, start_at: project.start, end_at: project.end, weight_type: 'prompt is more important' } },
        '5': { class_type: 'CLIPTextEncode', inputs: { text: expressionPrompt(project, tile), clip: ['1', 1] } },
        '6': { class_type: 'CLIPTextEncode', inputs: { text: project.negative, clip: ['1', 1] } },
        '7': { class_type: 'EmptyLatentImage', inputs: { width: project.width, height: project.height, batch_size: 1 } },
        '8': { class_type: 'KSampler', inputs: { model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed: (project.seed + tile.seedOffset) % 2147483647, steps: project.steps, cfg: project.cfg, sampler_name: project.sampler, scheduler: project.scheduler, denoise: 1 } },
        '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['1', 2] } },
        '10': { class_type: 'SwarmSaveImageWS', inputs: { images: ['9', 0] } },
    };
}
export function livePortraitWorkflow(reference: string, motion: ExpressionMotion, schema: Record<string, NodeSchema>): Record<string, unknown> {
    if (!reference)
        throw new Error('Add a reference portrait.');
    if (!schema.ExpressionEditor || !schema.SwarmLoadImageB64 || !schema.SwarmSaveImageWS)
        throw new Error('LivePortrait requires ExpressionEditor and Swarm image bridge nodes. Check setup.');
    const inputs: Record<string, unknown> = {};
    for (const [name, [type, options]] of Object.entries(schema.ExpressionEditor.input?.required ?? {})) {
        if (options?.default !== undefined)
            inputs[name] = options.default;
        else if (Array.isArray(type))
            inputs[name] = type[0];
        else
            throw new Error(`Unsupported required ExpressionEditor input: ${name}`);
    }
    for (const [name, value] of Object.entries(motion)) {
        const [min, max] = motionLimits[name as keyof ExpressionMotion];
        inputs[name] = Math.max(min, Math.min(max, value));
    }
    Object.assign(inputs, { src_image: ['1', 0], src_ratio: 1, sample_ratio: 1, sample_parts: 'OnlyExpression', crop_factor: 1.7 });
    return { '1': { class_type: 'SwarmLoadImageB64', inputs: { image_base64: reference.split(',')[1] } }, '2': { class_type: 'ExpressionEditor', inputs }, '9': { class_type: 'SwarmSaveImageWS', inputs: { images: ['2', 0] } } };
}
export function normalizeSheet(raw: unknown): SheetProject {
    if (!raw || typeof raw !== 'object' || (raw as SheetProject).version !== 1)
        throw new Error('Choose a Studio expression project JSON.');
    const r = raw as Record<string, unknown>, d = defaultSheet();
    const num = (k: string, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(Number(r[k])) ? Number(r[k]) : Number(d[k as keyof SheetProject])));
    const str = (k: string) => typeof r[k] === 'string' ? String(r[k]) : String(d[k as keyof SheetProject] ?? '');
    const reference = str('reference');
    if (reference && !/^data:image\/(png|jpeg|webp);base64,/.test(reference))
        throw new Error('Project reference must be an embedded PNG, JPEG, or WebP.');
    return { ...d, name: str('name').slice(0, 120), subject: str('subject').slice(0, 20000), negative: str('negative').slice(0, 20000), model: str('model'), reference, referenceName: str('referenceName'), style: ['semireal', 'realistic', 'illustrated'].includes(str('style')) ? str('style') as SheetStyle : d.style, engine: ['ipadapter', 'liveportrait', 'hybrid', 'img2img', 'text'].includes(str('engine')) ? str('engine') as SheetEngine : d.engine, adapter: str('adapter'), sampler: str('sampler'), scheduler: str('scheduler'), width: Math.round(num('width', 256, 1536) / 64) * 64, height: Math.round(num('height', 256, 1536) / 64) * 64, steps: Math.round(num('steps', 1, 100)), cfg: num('cfg', 1, 20), seed: Math.round(num('seed', 0, 2147483646)), weight: num('weight', 0, 2), start: num('start', 0, 1), end: num('end', 0, 1), denoise: num('denoise', 0, 1), columns: Math.round(num('columns', 1, 8)), gutter: Math.round(num('gutter', 0, 100)), background: /^#[0-9a-f]{6}$/i.test(str('background')) ? str('background') : d.background, labels: r.labels !== false, useLoras: r.useLoras === true, tiles: Array.isArray(r.tiles) ? r.tiles.slice(0, 48).map((raw) => { const t = raw as Partial<ExpressionTile>; if (!t || typeof t !== 'object')
            throw new Error('Invalid expression card.'); return { id: crypto.randomUUID(), name: String(t.name ?? 'Expression').slice(0, 80), prompt: String(t.prompt ?? '').slice(0, 3000), enabled: t.enabled !== false, locked: t.locked === true, seedOffset: Math.max(0, Math.min(1000000, Number(t.seedOffset) || 0)), variants: Array.isArray(t.variants) ? t.variants.slice(-8).filter(v => v && typeof v.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v.image)).map(v => ({ image: v.image, path: String(v.path ?? ''), seed: Number.isSafeInteger(v.seed) ? v.seed : -1 })) : [], motion: Object.fromEntries(Object.entries(emptyMotion()).map(([k, v]) => [k, Number.isFinite(Number(t.motion?.[k as keyof ExpressionMotion])) ? Math.max(-120, Math.min(120, Number(t.motion?.[k as keyof ExpressionMotion]))) : v])) as unknown as ExpressionMotion, image: typeof t.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(t.image) ? t.image : '', path: typeof t.path === 'string' ? t.path : '', seed: Number.isSafeInteger(t.seed) ? Number(t.seed) : -1, error: '' }; }) : d.tiles };
}
