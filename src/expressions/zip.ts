/** Minimal uncompressed ZIP writer; no network dependency for project exports. */
export function zipStore(files: Array<{
    name: string;
    data: Uint8Array;
}>): Blob {
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    const crc = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    } return (crc ^ 0xffffffff) >>> 0; };
    for (const file of files) {
        const name = new TextEncoder().encode(file.name);
        const checksum = crc(file.data);
        const header = new Uint8Array(30 + name.length);
        const h = new DataView(header.buffer);
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint16(6, 0x0800, true);
        h.setUint32(14, checksum, true);
        h.setUint32(18, file.data.length, true);
        h.setUint32(22, file.data.length, true);
        h.setUint16(26, name.length, true);
        header.set(name, 30);
        parts.push(header, file.data);
        const entry = new Uint8Array(46 + name.length);
        const e = new DataView(entry.buffer);
        e.setUint32(0, 0x02014b50, true);
        e.setUint16(4, 20, true);
        e.setUint16(6, 20, true);
        e.setUint16(8, 0x0800, true);
        e.setUint32(16, checksum, true);
        e.setUint32(20, file.data.length, true);
        e.setUint32(24, file.data.length, true);
        e.setUint16(28, name.length, true);
        e.setUint32(42, offset, true);
        entry.set(name, 46);
        central.push(entry);
        offset += header.length + file.data.length;
    }
    const length = central.reduce((sum, p) => sum + p.length, 0);
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, length, true);
    e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end].map(p => new Uint8Array(p)), { type: 'application/zip' });
}
