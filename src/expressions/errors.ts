export function expressionFailure(raw: string): { message: string; stop: boolean; setup: boolean } {
    const visionMismatch = /Resampler|proj_in\.weight/i.test(raw) && /size mismatch/i.test(raw) && /1280/.test(raw) && /1664/.test(raw);
    if (visionMismatch) return {
        message: 'IPAdapter and CLIP Vision do not match. PLUS / PLUS FACE needs the ViT-H encoder (1280 features); this backend loaded bigG (1664). Download the actual CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors into ComfyUI/models/clip_vision, replace any incorrectly named copy, then restart the backend and retry. Renaming bigG to ViT-H will not work.',
        stop: true,
        setup: true,
    };
    return { message: raw, stop: /out of memory|cuda|checkpoint|adapter.*not found/i.test(raw), setup: false };
}
