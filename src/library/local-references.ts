import type { OutputRecord, PersistedStudioState } from '../types';
import { exactOutputPath } from './inventory.ts';

export interface ReferenceAudit { checkedAt: number; complete: boolean; paths: Set<string>; checks: Array<{ source: string; status: string; records?: number; reason?: string }> }
/** Extract links, including prior takes/stages. Embedded copies do not depend on the original. */
export function projectReferenceStrings(value: unknown, result = new Set<string>(), depth = 0): Set<string> {
    if (depth > 30) throw new Error('Reference structure exceeds audit depth.');
    if (typeof value === 'string') {
        if (value.length < 10000 && !/^(data:|blob:)/i.test(value) && (/^(https?:\/\/|\/?(?:View|Output)\/|raw\/)/i.test(value) || /\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(value))) result.add(value);
    } else if (Array.isArray(value)) for (const item of value) projectReferenceStrings(item, result, depth + 1);
    else if (value && typeof value === 'object') for (const entry of Object.values(value)) projectReferenceStrings(entry, result, depth + 1);
    return result;
}
export function matchReferencePath(raw: string, serverUrl: string, user: string, options: { appendUser?: boolean; studioOrigin?: string } = {}): string | null {
    try {
        let path = raw.replaceAll('\\', '/');
        if (/^https?:/i.test(path)) {
            const url = new URL(path), server = new URL(serverUrl);
            if (url.origin === options.studioOrigin && url.pathname.startsWith('/__swarm/')) path = url.pathname.slice('/__swarm/'.length);
            else {
                const prefix = server.pathname.replace(/\/$/, '') + '/';
                if (url.origin !== server.origin || !url.pathname.startsWith(prefix)) return null;
                path = url.pathname.slice(prefix.length);
            }
        }
        path = path.replace(/^\/+/, '').split(/[?#]/, 1)[0]!.replace(/^__swarm\//, '');
        // Media URLs encode spaces/brackets; decode once before matching inventory identity.
        if (/^(View|Output)\//i.test(path)) path = decodeURIComponent(path);
        else if (/%[a-f0-9]{2}/i.test(path)) path = decodeURIComponent(path);
        if (/^View\//i.test(path)) { const prefix = `View/${user}/`; if (options.appendUser === false || !path.startsWith(prefix)) return null; path = path.slice(prefix.length); }
        if (path.startsWith('Output/')) { if (options.appendUser === true) return null; path = path.slice(7); }
        return exactOutputPath(path);
    } catch { return null; }
}
export function referencesFromStudioState(state: Pick<PersistedStudioState, 'draft' | 'identities'>, workspace: unknown): Set<string> {
    const refs = projectReferenceStrings(workspace);
    projectReferenceStrings(state.draft.initImage, refs);
    projectReferenceStrings(state.identities.map(item => item.avatarUrl), refs);
    return refs;
}
/** Opening a missing DB aborts creation: auditing never initializes or rewrites user projects. */
export function readExpressionWorkspace(): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('swarm-studio-expressions-v1'); let missing = false;
        request.onupgradeneeded = () => { missing = true; request.transaction?.abort(); };
        request.onerror = () => missing ? resolve([]) : reject(new Error('Expression workspace could not be read.'));
        request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('projects')) { db.close(); reject(new Error('Expression workspace schema is unknown.')); return; }
            const tx = db.transaction('projects', 'readonly'), read = tx.objectStore('projects').getAll();
            read.onsuccess = () => resolve(read.result); read.onerror = () => reject(new Error('Expression workspace read failed.'));
            tx.oncomplete = tx.onabort = () => db.close();
        };
    });
}
