# Finalize and Smart Selection

Baseline: Standalone 0.63.21 Inspect UI3. This cumulative source overlay keeps the existing Create, Editing, Inpaint, Library, expression processing and native host paths. No package version bump, migrations or changes to user Projects are required.

## Smart Selection

Open Editing, choose the Smart Selection tool (S). Text mode builds a graph using SwarmClipSeg and MaskToImage; enter a target such as `hair` or `jacket`, and adjust its detection threshold. Foreground mode uses the existing BiRefNet removal graph and reads its output alpha. Custom workflows can use a saved Swarm workflow exposing an image input, or ComfyUI API JSON with one image input/output. Choose grayscale (white = selected) or alpha output as appropriate. Output must match the source pixel dimensions. Text selection requires the relevant Swarm Comfy nodes; foreground requires BiRefNet installed. Node/model availability is backend-dependent. This is not point-click SAM/SAM2.

The returned image is converted to an 8-bit soft selection, optionally inverted and combined using existing replace/add/subtract operations. Pixel data is untouched. Selection undo/redo, morphology, feather, deselect and Inpaint handoff use the existing selection state. Cancellation, invalid output, missing backend capabilities and empty detections leave the selection unchanged. A fully opaque alpha-only result is rejected rather than assumed to be a valid cutout. A saved segmentation artifact may appear in Library; its provenance is `segmentation_result`, and the lineage Vacuum policy does not count it as a replacement of the input. Explicit stage cleanup policies are still respected.

## Finalize

Open from Visuals / Finalize, the Editing footer, or Inspect; or choose a Library image or upload PNG/JPEG/WebP in the workspace. An unsaved Editing document supplies its actual working pixels rather than the original Library bytes. Desktop has a chain rail, persistent preview and settings inspector. Mobile uses Preview / Chain / Settings panels with Run and Cancel above the navigation.

Add, remove or reorder up to eight stages. Choose a stage to configure it. Native stages:

- **Refinement (img2img):** low-creativity diffusion pass with checkpoint, resolution scale (1–2x), steps, CFG, sampler, scheduler, seed and prompt inheritance. Input LoRAs may be reused when the checkpoint matches. A custom workflow is also available.
- **Detailer:** Swarm's native `<segment:target,creativity,threshold>` syntax, with zero base init-image creativity. Set target (e.g. face, hands, or an installed `yolo-...` target), regional prompt and strength. Requires the corresponding backend segmentation nodes. This requests regional correction, not a guarantee of pixel identity outside a region. A custom workflow may implement another detailer or reference-conditioned pass.
- **Upscale:** existing model-based upscale or saved/custom Comfy graph. Former expression-processing "Refine" keeps its existing behavior.
- **Background removal:** existing BiRefNet or custom workflow.

Native refinement does not expose Anima Ref Adapter-specific controls in this release. Use a suitable saved workflow or API graph for custom conditioning. Custom graph sampling settings belong to that graph, not the native stage controls.

Run always starts with the selected original, checks stage configuration, then processes one pass at a time. Each receives the previous pass's decoded image bytes and dimensions. Native requests inherit diffusion context through built-in image-only transforms in the active run. Changing stage settings resets the displayed run; saved output records remain in Library. Previews and completed output thumbnails can be viewed independently. Completed saved outputs can be exported or opened in Editing. A stage with a bad output or an error stops the run; cancellation uses the existing Swarm interrupt transport and prevents further stages. Already completed passes remain available. No automatic retry or crash/restart recovery for an active chain. The chain and image previews are session memory; named recipes store stage settings in browser-local storage (no image bytes). Custom workflow names and model availability are resolved again when a recipe runs; up to 24 recipes.

## Provenance and retention

Every stage uses a distinct Studio asset ID, with its immediate input's tagged asset as parent, retaining its pipeline ID. Untagged uploads begin a new lineage. Edited source bytes are marked as modified where a parent record exists; no original file is overwritten. Stage metadata: `refinement_result`, `detailer_result`, `upscale_result`, `background_removed`, with `studio_surface=finalize` and operation/method. `segmentation_result` uses `studio_surface=editing`. No automatic keep-final-only queue is requested by Finalize; existing Vacuum settings and references still apply. Active jobs and currently referenced outputs are protected by existing Vacuum guards.

## Validation

- `npm run check` (strict TypeScript)
- `npm run test:finalize` (Node 22+ strip-types contracts; actual stage requests, output-byte chaining, lineage, recipes, masks, missing capability, cancellation, second-pass failure)
- `node --no-warnings --experimental-strip-types tests/vacuum-policy-contract.mjs` (including segmentation source protection)
- All 34 `tests/*-contract.mjs` passed in this environment.
- `STUDIO_TEST_CHROMIUM=/usr/bin/chromium python tests/finalize-offline-app.py` (Python Playwright plus Chromium, actual compiled app and stream client with mocked storage/provider, 1440/390/320px). Checks source pixels, selection history, mask handoff, stage settings, ordered native and graph requests, actual previous output bytes, saved recipes, provenance, previews, cancellation/interrupt and competing generation guard, failed chain, and footer clearance on mobile. Fixture artwork is synthetic. Optional `STUDIO_TEST_WIDTH=390` selects one width. On Windows set the equivalent environment variables or use Playwright's installed Chromium.
- Production Vite build attempted: TypeScript passes; Vite unavailable here. Real Swarm/Tauri and real segmentation/detailer model quality remain unverified. Live smoke test: select hair on a known image, undo, run refinement at 0.18 creativity then a face detailer then upscale; inspect each result and its parent. Verify backend node availability before use. Cancel a later pass and inspect earlier results.
