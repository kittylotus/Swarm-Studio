# Swarm Studio v0.63.0

## Pre-v1 cleanup

- Consolidated the Review Before Save workflow around a single compact review strip under the image and above the editable prompts; removed the retired image-overlay review implementation.
- Centralized CivitAI host detection, URL canonicalization, and `.red` routing in one module while preserving `.com` input compatibility and the hash metadata fallback.
- Made Library Browse ownership explicit: the right dock only exists on Library, yields completely to Inspect, preserves filter-scroll state, and reserves real desktop layout width instead of overlaying content.
- Removed abandoned SortableJS declarations and drag-state CSS left behind by older preset implementations.
- Kept LoRA organizer move/delete behavior, folder staging, hash metadata repair, stack import/export, and mobile modal positioning on their current paths instead of layered compatibility UI.
- Kept transient PNG/JPEG drag-to-Inspect support and Swarm historical prep/generation timing fallback, with Tauri configured to let the frontend receive HTML5 drop payloads.
- Replaced the version-history-style README with current-state project documentation.
- Added `npm run preflight` release checks for version alignment, single-changelog packaging, drag/drop configuration, Browse ownership, retired review UI, SortableJS cleanup, and centralized CivitAI routing.

## Release intent

This is a behavior-preserving consolidation release intended as the stable runway for v1. No deliberate workflow redesign is included.
