import { readStudioMetadata } from './provenance.ts';
import { exactOutputPath } from './inventory.ts';
import type { OutputRecord } from '../types';
import type { VacuumFile, VacuumRow } from './vacuum';

export const LUMI_LIBRARY_VIEW = 'virtual:lumiswarm';
/** A collection of saved Swarm outputs with valid embedded Lumi provenance, not request hints. */
export function isLumiSwarmOutput(output: Pick<OutputRecord, 'metadata' | 'swarmSourcePath'>): boolean {
    try { return Boolean(output.swarmSourcePath && exactOutputPath(output.swarmSourcePath)
        && readStudioMetadata(output.metadata)?.studio_origin === 'lumiswarm'); }
    catch { return false; }
}
export interface VacuumView {
    search: string; status: string; origin: string; sort: string;
}
export const defaultVacuumView = (): VacuumView => ({ search: '', status: 'all', origin: 'all', sort: 'newest' });

function createdAt(file: VacuumFile | undefined, path: string): number {
    const tag = readStudioMetadata(file?.metadata);
    const stamped = Number(tag?.studio_created_at);
    if (Number.isFinite(stamped) && stamped > 0) return stamped;
    const match = /(?:^|\/)(\d{4})-(\d{2})-(\d{2})\/(\d{2})(\d{2})(\d{2})/.exec(path);
    return match ? new Date(+match[1]!, +match[2]! - 1, +match[3]!, +match[4]!, +match[5]!, +match[6]!).getTime() : 0;
}

/** Presentation only: retains the original row objects so exclusions cannot target another file. */
export function vacuumViewRows(rows: VacuumRow[], files: VacuumFile[], view: VacuumView): VacuumRow[] {
    const byPath = new Map(files.map(file => [file.path, file]));
    const query = view.search.trim().toLowerCase();
    const rank = { candidate: 0, review: 1, protected: 2 };
    return rows.map(row => {
        const file = byPath.get(row.path), tag = readStudioMetadata(file?.metadata);
        return { row, tag, time: createdAt(file, row.path) };
    }).filter(({ row, tag }) => (view.status === 'all' || row.status === view.status)
        && (view.origin === 'all' || (view.origin === 'tagged' ? Boolean(tag) : view.origin === 'untagged' ? !tag : tag?.studio_origin === view.origin))
        && (!query || [row.path, row.assetId, row.stage, row.stage.replaceAll('_', ' '), row.reason, tag?.studio_pipeline_id, tag?.studio_origin].join(' ').toLowerCase().includes(query)))
        .sort((a, b) => (view.sort === 'priority' ? rank[a.row.status] - rank[b.row.status] : 0)
            || (view.sort === 'oldest' ? a.time - b.time : b.time - a.time)
            || (view.sort === 'oldest' ? a.row.path.localeCompare(b.row.path, undefined, { numeric: true }) : b.row.path.localeCompare(a.row.path, undefined, { numeric: true })))
        .map(item => item.row);
}
