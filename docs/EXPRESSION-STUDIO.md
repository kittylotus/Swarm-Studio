# Expression Studio (staging)

Open **Expressions** in desktop navigation, or **Visuals → Expressions** on mobile. Click the circle-help button beside the heading for the in-app usage guide.

## Machine and pipeline choice

This machine reports an NVIDIA RTX 5060 Laptop GPU with 8151 MiB VRAM. Start at 768 × 768, 24 steps, one image per request. This is a conservative starting point, not a measured guarantee. The sheet queue is sequential to avoid loading a whole grid into GPU memory.

The local Comfy installation has IPAdapter Plus, SDXL Plus weights, and ViT-H CLIP Vision. Its live object_info also exposes IPAdapterUnifiedLoader and Swarm image bridge nodes. Available SDXL checkpoints include WAI Illustrious and aDollsVoice. Anima checkpoints are excluded from IPAdapter mode because SDXL/SD1.5 IPAdapter weights do not patch Anima.

Default: **IPAdapter → SDXL**, semirealism preset, adapter PLUS, strength 0.65, start 0, end 0.8. Raise strength for identity fidelity; reduce it or shorten end time if the reference expression dominates. Checkpoint choice matters more than the style preset alone.

**LivePortrait** directly edits facial geometry on the reference. **Hybrid** first generates an expression with IPAdapter, then refines the generated face with LivePortrait. These require the AdvancedLivePortrait ExpressionEditor node, which is not currently installed. Use ComfyUI Manager to install ComfyUI-AdvancedLivePortrait and its required models, restart the backend, and use Check loaded nodes. Face detection can fail on heavily stylized or obstructed faces.

**Image-to-image** and **Prompt only** provide fallback and baseline paths. Image-to-image retains composition more strongly but can also retain the original emotion.

## Workflow

1. Upload a clean front-facing portrait. It is resized to at most 1024 pixels on its longest side. Alternatively generate a neutral card in Prompt only mode, then use its **Ref** action.
2. Choose the compatible checkpoint and a semireal, realistic, or illustrated style. Edit the shared character/framing description and negative prompt.
3. Choose 6, 12, or 24 expression presets, or add custom cards. Each card has an editable label and expression prompt. LivePortrait/Hybrid additionally exposes face controls.
4. Optionally enable composer LoRAs. Studio checks model compatibility and snapshots the enabled stack at the start of the queue, so composer changes cannot alter later cards. Enabled Trigger toggles also append the LoRA trigger phrases to each expression prompt.
5. Render missing cards. Every expression starts with the shared seed; a card reroll changes only its own seed offset. Lock approved portraits. Up to eight previous takes remain available as thumbnails.
6. Change order, exclude unwanted expressions, choose columns/gutter/paper color, and export a labeled PNG sheet.
7. Export a ZIP portrait pack for individual PNGs, the sheet (if all selected cards are complete), and the project manifest. Save/open project JSON to transfer reference images, expressions, settings, outputs, and previous takes.

Stop after current finishes the active portrait and prevents later submissions. It does not interrupt unrelated Swarm jobs. A render failure stays visible on its card. CUDA/OOM failures stop the remaining queue.

## Persistence and exports

The project, reference, output images, and prior takes live in IndexedDB, separate from Studio's small localStorage library cache. Changes autosave. Imported images must be embedded data URLs; imported remote URLs are discarded. Generated outputs also appear in Studio Library.

API workflow export supports one selected expression in IPAdapter or LivePortrait mode. The graph uses SwarmLoadImageB64 and SwarmSaveImageWS, so it requires those installed Comfy nodes. It is an API graph, not a Comfy frontend layout. Checkpoint names are matched against the live Comfy inventory. Standalone IPAdapter workflow export rejects the composer-LoRA toggle rather than silently omitting the stack; the live Studio pipeline supports it.

The face-edit path is deterministic: Apply face reapplies the card controls; changing a seed does not create a different LivePortrait face edit. Semireal faces generally fit its intended use better than extreme anime faces. Identity consistency remains model-dependent.

## Research sources

- [IPAdapter Plus implementation and model setup](https://github.com/cubiq/ComfyUI_IPAdapter_plus)
- [AdvancedLivePortrait expression editor](https://github.com/PowerHouseMan/ComfyUI-AdvancedLivePortrait)
- [LivePortrait upstream](https://github.com/KlingAIResearch/LivePortrait)
- [PuLID-FLUX memory/offload configurations](https://github.com/ToTheBeginning/PuLID/blob/main/docs/pulid_for_flux.md): the documented 12 GB aggressive-offload configuration still targets more VRAM than this GPU, so it is not the default.

## Validation

Offline contract: `npm run test:expressions`. TypeScript: `npm run check`. Production bundle: `npm run build`.

Real GPU generation and face-edit quality should be checked manually. No inference, plugin installation, or model download is required by the offline contracts.
