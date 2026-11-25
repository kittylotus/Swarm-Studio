import { editDespill, EDIT_MAX_PIXELS, EDIT_MAX_SIDE } from './pixels.ts';

/** Read a full-resolution cutout, not a gallery preview. Unchanged pixels keep the original bytes. */
export async function despillImage(image: string, channel: 'green' | 'blue', strength = .7, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    if (!/^data:image\/(png|jpeg|webp);base64,/i.test(image)) throw new Error('Expected an embedded PNG, JPEG or WebP cutout.');
    const bitmap = new Image(); bitmap.src = image; await bitmap.decode();
    signal?.throwIfAborted();
    const w = bitmap.naturalWidth, h = bitmap.naturalHeight;
    if (!w || !h || w*h > EDIT_MAX_PIXELS || Math.max(w,h) > EDIT_MAX_SIDE) throw new Error('Despill supports up to 16 megapixels and 8192px per side.');
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas is unavailable.');
        ctx.drawImage(bitmap,0,0); const pixels=ctx.getImageData(0,0,w,h);
        if (!editDespill(pixels.data,w,h,new Uint8Array(w*h),channel,Math.max(0,Math.min(1,strength)))) return image;
        ctx.putImageData(pixels,0,0); signal?.throwIfAborted();
        return canvas.toDataURL('image/png');
    } finally { canvas.width=canvas.height=1; }
}
