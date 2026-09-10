import assert from "node:assert/strict";
import { normalizeLibraryFolderSelection, shouldAutoSyncLibraryHistory } from "../src/library/session.ts";

const folders = [{ id: "folder-unfiled" }, { id: "folder-favorites" }, { id: "folder-lior" }];
assert.equal(normalizeLibraryFolderSelection("folder-lior", folders), "folder-lior", "existing Studio folders must remain selected");
assert.equal(normalizeLibraryFolderSelection("folder-deleted", folders), "all", "stale/deleted folder ids must recover to All outputs");

assert.equal(shouldAutoSyncLibraryHistory({
  view: "library",
  connected: true,
  syncing: false,
  autoSyncStarted: false,
  outputCount: 189,
  persistedCacheLimit: 220,
}), true, "a compact persisted cache should hydrate from Swarm on first Library open");

assert.equal(shouldAutoSyncLibraryHistory({
  view: "library",
  connected: true,
  syncing: false,
  autoSyncStarted: false,
  outputCount: 7863,
  persistedCacheLimit: 220,
}), false, "an already-hydrated large library must not immediately resync itself");

assert.equal(shouldAutoSyncLibraryHistory({
  view: "create",
  connected: true,
  syncing: false,
  autoSyncStarted: false,
  outputCount: 189,
  persistedCacheLimit: 220,
}), false, "Create must not pay the full library crawl cost in the background");

console.log("Library session contract OK.");
