/** Header length is a physical image size only for an unencoded, successful original response. */
export function originalImageByteSize(status: number, type: string | null, length: string | null, encoding: string | null): number | null {
    if (status !== 200 || !type?.startsWith('image/') || (encoding && encoding !== 'identity') || !length || !/^\d+$/.test(length)) return null;
    const bytes = Number(length); return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
}

/** A one-byte range response reports the original length in Content-Range, not Content-Length. */
export function originalImageRangeByteSize(status:number,type:string|null,length:string|null,encoding:string|null,range:string|null):number|null {
    if(status===200)return originalImageByteSize(status,type,length,encoding);
    if(status!==206||!type?.startsWith('image/')||(encoding&&encoding!=='identity')||length!=='1')return null;
    const match=/^bytes 0-0\/(\d+)$/.exec(range||'');
    const bytes=match?Number(match[1]):NaN;
    return Number.isSafeInteger(bytes)&&bytes>0?bytes:null;
}
