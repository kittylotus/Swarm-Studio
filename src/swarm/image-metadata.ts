/** Read Swarm parameters from image bytes, independent of HTTP Content-Type. */
export async function imageMetadata(bytes: Uint8Array): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
  const inflate = async (data: Uint8Array) => {
    const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Response(stream).text();
  };
  try {
    if (bytes.length >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
      for (let at = 8; at + 12 <= bytes.length;) {
        const size = view.getUint32(at);
        const kind = text(at + 4, at + 8);
        const start = at + 8;
        const end = start + size;
        if (end + 4 > bytes.length) break;
        if (["tEXt", "zTXt", "iTXt"].includes(kind)) {
          const nul = bytes.indexOf(0, start);
          if (nul >= start && nul < end && text(start, nul) === "parameters") {
            if (kind === "tEXt") return text(nul + 1, end);
            if (kind === "zTXt" && bytes[nul + 1] === 0) return await inflate(bytes.subarray(nul + 2, end));
            if (kind === "iTXt") {
              const languageEnd = bytes.indexOf(0, nul + 3);
              const translatedEnd = languageEnd < 0 ? -1 : bytes.indexOf(0, languageEnd + 1);
              if (translatedEnd >= 0 && translatedEnd < end) {
                const data = bytes.subarray(translatedEnd + 1, end);
                if (bytes[nul + 1] === 0) return new TextDecoder().decode(data);
                if (bytes[nul + 1] === 1 && bytes[nul + 2] === 0) return await inflate(data);
              }
            }
          }
        }
        at = end + 4;
      }
    } else if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
      for (let at = 12; at + 8 <= bytes.length;) {
        const size = view.getUint32(at + 4, true);
        const end = at + 8 + size;
        if (end > bytes.length) break;
        if (text(at, at + 4) === "EXIF") {
          const metadata = exifUserComment(bytes.subarray(at + 8, end));
          if (metadata) return metadata;
        }
        at = end + (size % 2);
      }
    } else if (bytes.length >= 2 && view.getUint16(0) === 0xffd8) {
      for (let at = 2; at + 4 <= bytes.length;) {
        if (bytes[at++] !== 0xff) break;
        while (bytes[at] === 0xff) at++;
        const marker = bytes[at++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker != null && marker >= 0xd0 && marker <= 0xd7)) continue;
        const size = view.getUint16(at);
        if (size < 2 || at + size > bytes.length) break;
        if (marker === 0xe1) {
          const metadata = exifUserComment(bytes.subarray(at + 2, at + size));
          if (metadata) return metadata;
        }
        if (marker === 0xfe) {
          const comment = text(at + 2, at + size).replace(/\0+$/g, "").trim();
          if (/sui_image_params|"prompt"/i.test(comment)) return comment;
        }
        at += size;
      }
    }
  } catch { /* Missing, unsupported, or malformed metadata is recoverable. */ }
  return "";
}

function exifUserComment(raw: Uint8Array): string {
  const bytes = new TextDecoder().decode(raw.subarray(0, 6)) === "Exif\0\0" ? raw.subarray(6) : raw;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8) return "";
  const little = view.getUint16(0) === 0x4949;
  if (!little && view.getUint16(0) !== 0x4d4d) return "";
  if (view.getUint16(2, little) !== 42) return "";
  const visited = new Set<number>();
  const readIfd = (start: number): string => {
    if (visited.has(start) || visited.size >= 8 || start < 8 || start + 2 > bytes.length) return "";
    visited.add(start);
    const count = view.getUint16(start, little);
    for (let index = 0; index < count; index++) {
      const at = start + 2 + index * 12;
      if (at + 12 > bytes.length) break;
      const tag = view.getUint16(at, little);
      if (tag === 0x8769) {
        const found = readIfd(view.getUint32(at + 8, little));
        if (found) return found;
      }
      if (tag !== 0x9286) continue;
      const size = view.getUint32(at + 4, little);
      const offset = size <= 4 ? at + 8 : view.getUint32(at + 8, little);
      if (offset + size > bytes.length) continue;
      let data = bytes.subarray(offset, offset + size);
      const prefix = new TextDecoder().decode(data.subarray(0, 8));
      let encoding = "utf-8";
      if (prefix.startsWith("ASCII")) data = data.subarray(8);
      else if (prefix.startsWith("UNICODE")) {
        data = data.subarray(8);
        // The comment's encoding can differ from the TIFF directory byte order.
        encoding = data[0] === 0xfe && data[1] === 0xff ? "utf-16be"
          : data[0] === 0xff && data[1] === 0xfe ? "utf-16le"
          : data[0] === 0 && data[1] !== 0 ? "utf-16be"
          : data[0] !== 0 && data[1] === 0 ? "utf-16le" : little ? "utf-16le" : "utf-16be";
      }
      return new TextDecoder(encoding).decode(data).replace(/\0+$/g, "").trim();
    }
    return "";
  };
  return readIfd(view.getUint32(4, little));
}
