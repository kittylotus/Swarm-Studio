# Inspect UI3

Baseline: Standalone Studio 0.63.21, Editing UI2.1 cumulative source.

- The inspector has a persistent header with an Editing action (same native `openOutputInEditor` route as before) and Close.
- Centered, contained artwork occupies its own stage. Reuse, init image, direct Inpaint and Library are compact SVG/text actions below it.
- Prompt, Details and Versions are separate views, with Copy next to the resolved positive prompt. Negative prompt, LoRA stack, timing, seed, source request and original Swarm metadata remain available. Text is selectable, readable and wraps. Details retain raw JSON.
- On desktop the metadata pane scrolls independently; narrow layouts scroll the image and metadata together, with sticky section navigation. Section switches and metadata/branch updates preserve relevant scroll positions.
- The retention checkbox is separated from content and keeps its existing per-scope storage and reviewed-cleanup behavior. No asset deletion or provider logic changes.
- Direct Inpaint retains its current route into Editing. A normal Editing action opens the working canvas without mounting Inpaint.

## Validation

`tsc --noEmit`, lifecycle, retention-improvements and atelier-port contracts passed. The offline full StudioApp browser fixture passed at 1440×1000, 782×893, 390×844 and 320×640 (last width rerun separately following the combined run timeout). Fixture checks icon/action presence, resolved prompt copying, details, version edges and branch navigation, branch keep persistence, retention and original output count, normal Editing and direct Inpaint routing. Clipboard, storage, image fetch and Swarm are mocked. The existing Vite inspector fixture was adjusted for the new flex action rail but not run; Vite dependencies and live Windows/Tauri/Swarm were not exercised.

Run with `python tests/inspector-offline-app.py` (Python Playwright, Chromium and TypeScript required). Set `STUDIO_TEST_CHROMIUM` for a system Chromium executable and optionally `STUDIO_TEST_WIDTH=320` for one viewport.
