# UI polish — LoRA organize rail + Comfy runtime help

## LoRA organizer
- Hide the fixed LoRA batch-action rail while Move/Delete organizer dialogs are open, preventing the mobile rail from painting above its own modal.
- Add a nearby **Done** action to the sticky organizer rail so batch mode can be exited without scrolling back to the library toolbar.
- Preserve the existing top-level Organize/Done control and selection-clearing behavior.

## Comfy runtime settings
- Replace incident-specific troubleshooting jokes with durable descriptions of what each managed runtime flag does and when to try it.
- Rename the runtime presets to clearer user-facing labels: **GPU 0 baseline**, **VRAM diagnostic**, and **Reset managed flags**.
- Clarify CUDA device selection, dynamic VRAM, pinned-memory, and asynchronous-offload behavior, including likely trade-offs.
- Rewrite the active dynamic-VRAM warning as a general stability/performance note rather than a reference to one machine's crash investigation.

## Validation
- `npm run check`
- `npm run preflight`

Both pass on the patched tree.

## Overlay manifest
- `src/app.ts`
- `src/styles.css`
- `tests/composer-ui-contract.mjs`
- `changelog/ui-polish-organize-runtime-help.md`
