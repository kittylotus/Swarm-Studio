import type { SwarmImageList, SwarmImageListItem } from '../swarm/types';

export function exactOutputPath(raw: string): string {
    const path = raw.replaceAll('\\', '/');
    if (!path || path.startsWith('/') || /[:?#%\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..') || /^(View|Output)\//i.test(path))
        throw new Error('Unverified Swarm output-relative path. Scan stopped.');
    return path;
}

/** Shared by Library reconciliation and Vacuum. A cap is uncertainty, never completeness. */
export async function scanSwarmHistory(
    list: (path: string, depth: number) => Promise<SwarmImageList>, limit: number,
    join: (parent: string, child: string) => string, signal?: AbortSignal,
    progress?: (folders: number, files: number) => Promise<void>,
): Promise<{ files: SwarmImageListItem[]; favorites: Set<string>; complete: true; foldersRead: number }> {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Unknown history limit.');
    const queue = [''], visited = new Set<string>(), paths = new Set<string>();
    const files: SwarmImageListItem[] = [], favorites = new Set<string>();
    while (queue.length) {
        signal?.throwIfAborted();
        const batch: string[] = [];
        while (queue.length && batch.length < 6) {
            const folder = queue.shift()!;
            if (visited.has(folder)) continue;
            if (visited.size >= 100000) throw new Error('History folder safety limit reached. Scan incomplete.');
            visited.add(folder);
            batch.push(folder);
        }
        // Depth zero cannot discover ordinary subfolders in Swarm. Depth one returns
        // their names; older servers may also include their files, consumed on the next walk.
        const listings = await Promise.all(batch.map(async folder => ({ folder, listing: await list(folder, 1) })));
        signal?.throwIfAborted();
        for (const { folder, listing } of listings) {
        if (!Array.isArray(listing.files) || !Array.isArray(listing.folders)) throw new Error('Malformed history listing. Scan incomplete.');
        if (listing.files.length >= limit) throw new Error('Swarm capped a folder listing. Increase Max images in history and scan again.');
        for (const child of listing.folders) {
            const path = exactOutputPath(join(folder, child));
            if (folder && !path.startsWith(folder + '/')) throw new Error('History folder escaped its parent.');
            if (path === folder) throw new Error('History folder cycle.');
            queue.push(path);
        }
        for (const file of listing.files) {
            const path = exactOutputPath(join(folder, file.src));
            if (folder && !path.startsWith(folder + '/')) throw new Error('History file escaped its parent.');
            const relative = folder ? path.slice(folder.length + 1) : path;
            if (relative.includes('/')) continue;
            if (paths.has(path)) throw new Error('Duplicate output path. Scan incomplete.');
            paths.add(path);
            if (/^Starred\//i.test(path)) favorites.add(path.slice('Starred/'.length).toLowerCase());
            else files.push({ ...file, src: path });
        }
        }
        await progress?.(visited.size, files.length);
    }
    return { files, favorites, complete: true, foldersRead: visited.size };
}
