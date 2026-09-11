# Regional prompting — preset layouts v1

Preset-only regional prompting foundation. Freeform dragging/resizing is intentionally deferred.

## Added
- Structured regional prompt state on the generation draft, persisted through Studio draft storage.
- Five normalized layout presets: Left / Right, Top / Bottom, Three columns, Three rows, and 2 × 2 grid.
- Prompt-dock Regions control and a dedicated editor with static aspect-ratio preview.
- Per-region name, enabled state, prompt, and numeric strength.
- Optional Swarm background region prompt.
- Read-only compiled Swarm syntax preview.
- Request-time compilation into `<region:x,y,width,height,strength>` / `<region:background>` syntax without mutating the authored global prompt.
- Structured regional state saved into Studio output request snapshots for later round-trip work.
- Regression contract covering layout geometry, syntax compilation, persistence normalization, and the preset-only UI boundary.

## Guardrails
- No drag / resize implementation in this patch.
- Layout changes preserve prompt/strength/enabled state by index and preserve custom names; untouched default names remap to the new layout.
- Switching to a layout with fewer regions confirms before discarding populated overflow regions.
- No undocumented upper cap is imposed on Swarm region strength.
