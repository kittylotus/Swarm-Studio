import type { OutputRecord } from '../types';
import type { SwarmImageList } from '../swarm/types';

const key = (path: string) => path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '').toLowerCase();

export function historyListingLimit(settings: Record<string, unknown>): number {
    for (const [name, raw] of Object.entries(settings)) {
        if (name.replace(/[^a-z]/gi, '').toLowerCase() !== 'maximagesinhistory') continue;
        const value = Number(raw && typeof raw === 'object' ? (raw as { value?: unknown }).value : raw);
        if (Number.isSafeInteger(value) && value > 0) return value;
    }
    throw new Error('Could not verify the Swarm history listing limit. Nothing was deleted.');
}

/** A complete Starred scan is required: capped listings must never imply "not favorite". */
export async function readSwarmFavorites(list: (path: string, depth: number) => Promise<SwarmImageList>, limit: number, join: (parent: string, child: string) => string): Promise<Set<string>> {
    const root = await list('', 0);
    const queue = (root.folders ?? []).filter(path => key(path) === 'starred');
    const visited = new Set<string>();
    const favorites = new Set<string>();
    while (queue.length) {
        const path = queue.shift()!;
        if (visited.has(key(path))) continue;
        visited.add(key(path));
        const result = await list(path, 0);
        if ((result.files?.length ?? 0) >= limit) throw new Error('Swarm capped a Starred folder listing. Increase “Max images in history” in Swarm settings, then retry. Nothing was deleted.');
        for (const file of result.files ?? []) favorites.add(key(join(path, file.src)).replace(/^starred\//, ''));
        for (const folder of result.folders ?? []) {
            const child = join(path, folder);
            if (!key(child).startsWith('starred/')) throw new Error('Unexpected Starred folder path. Nothing was deleted.');
            queue.push(child);
        }
    }
    return favorites;
}

export function nonFavoriteTargets(matching: OutputRecord[], all: OutputRecord[], favorites: Set<string>, pathFor: (output: OutputRecord) => string): Array<{ path: string; ids: string[] }> {
    const protectedPaths = new Set<string>();
    const aliases = new Map<string, string[]>();
    for (const output of all) {
        const path = key(pathFor(output));
        if (output.starred) protectedPaths.add(path);
        const ids = aliases.get(path) ?? [];
        ids.push(output.id);
        aliases.set(path, ids);
    }
    const favoriteLeaves = new Set([...favorites].map(path => path.split('/').pop()!));
    const groups = new Map<string, { path: string; ids: string[] }>();
    for (const output of matching) {
        if (output.starred || (!output.swarmSourcePath && !output.swarmPath)) continue;
        const path = pathFor(output), normalized = key(path);
        if (!normalized || /^(data:|https?:|blob:|starred(?:\/|$))/.test(normalized) || normalized.split('/').some(part => part === '..' || part === '.')) continue;
        // Swarm can keep folder mirrors or flatten all folders into a Starred filename.
        if (protectedPaths.has(normalized) || favorites.has(normalized) || favorites.has(normalized.replaceAll('/', '')) || favoriteLeaves.has(normalized.split('/').pop()!)) continue;
        if (!groups.has(normalized)) groups.set(normalized, { path, ids: aliases.get(normalized) ?? [output.id] });
    }
    return [...groups.values()];
}
