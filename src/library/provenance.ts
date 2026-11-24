import { createId } from '../id.ts';

export const studioStages = ['expression_draft', 'expression_final', 'upscale_result', 'background_removed', 'inpaint_variant', 'inline_illustration', 'general_generation', 'quick_create', 'inline_upscale_result', 'inline_background_removed', 'inline_inpaint_variant'] as const;
export function processingStage(stage:string):string {return stage.startsWith('inline_')&&stage!=='inline_illustration'?stage.slice(7):stage;}
export type StudioStage = typeof studioStages[number];
export type StudioMetadata = Record<string, string> & {
    studio_schema: '1'; studio_origin: 'lumiswarm' | 'standalone'; studio_asset_id: string;
    studio_pipeline_id: string; studio_parent_id: string; studio_stage: StudioStage;
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Only the documented extra-data envelope (or an explicit map) is trusted. */
export function readStudioMetadata(value: unknown): StudioMetadata | null {
    try {
        const root = object(typeof value === 'string' ? JSON.parse(value) : value);
        const data = object(root.sui_extra_data ?? root.extra_metadata ?? root);
        const id = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
        if (data.studio_schema !== '1' || !['lumiswarm', 'standalone'].includes(String(data.studio_origin))
            || !id(data.studio_asset_id) || !id(data.studio_pipeline_id)
            || (data.studio_parent_id !== '' && !id(data.studio_parent_id))
            || !studioStages.includes(data.studio_stage as StudioStage)
            || Object.entries(data).some(([key, entry]) => key.startsWith('studio_') && typeof entry !== 'string')) return null;
        return data as StudioMetadata;
    } catch { return null; }
}

export function newStudioMetadata(stage: StudioStage = 'general_generation', parent?: StudioMetadata | null): StudioMetadata {
    const id = createId();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Secure UUID support is required for Studio asset metadata.');
    return { studio_schema: '1', studio_origin: 'standalone', studio_asset_id: id,
        studio_pipeline_id: parent?.studio_pipeline_id || id, studio_parent_id: parent?.studio_asset_id || '',
        studio_stage: stage, studio_surface: stage.startsWith('inline_')?'inline':stage==='quick_create'?'quick_create':stage.startsWith('expression_')?'expression':'main_studio', studio_retention: 'candidate', studio_created_at: String(Date.now()) };
}

/** Mutate once so HTTP fallback and retries keep the same job identity. */
export function tagStudioRequest(request: Record<string, unknown>, stage?: StudioStage, parent?: StudioMetadata | null): StudioMetadata {
    const existing = readStudioMetadata(request.extra_metadata);
    if (existing) return existing;
    const metadata = newStudioMetadata(stage, parent);
    request.extra_metadata = { ...object(request.extra_metadata), ...metadata, studio_batch_size: String(request.images ?? 1) };
    return metadata;
}
