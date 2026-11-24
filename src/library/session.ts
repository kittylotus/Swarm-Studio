import { LUMI_LIBRARY_VIEW } from './views.ts';
export interface LibraryFolderLike {
  id: string;
}

export function normalizeLibraryFolderSelection(value: unknown, folders: LibraryFolderLike[]): string {
  const requested = String(value ?? "all");
  if (requested === "all" || requested === LUMI_LIBRARY_VIEW) return requested;
  return folders.some((folder) => folder.id === requested) ? requested : "all";
}

export function shouldAutoSyncLibraryHistory(input: {
  view: string;
  connected: boolean;
  syncing: boolean;
  autoSyncStarted: boolean;
  outputCount: number;
  persistedCacheLimit: number;
}): boolean {
  return input.view === "library"
    && input.connected
    && !input.syncing
    && !input.autoSyncStarted
    && input.outputCount <= input.persistedCacheLimit;
}
