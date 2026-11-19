# Expression Studio (staging)

Open **Expressions** in desktop navigation, or **Visuals → Expressions** on mobile. Click the circle-help button beside the heading for the in-app usage guide.

## Machine and pipeline choice

This machine reports an NVIDIA RTX 5060 Laptop GPU with 8151 MiB VRAM. Start at 768 × 768, 24 steps, one image per request. This is a conservative starting point, not a measured guarantee. The sheet queue is sequential to avoid loading a whole grid into GPU memory.

The local Comfy installation has IPAdapter Plus, SDXL Plus weights, and ViT-H CLIP Vision. Its live object_info also exposes IPAdapterUnifiedLoader and Swarm image bridge nodes. Available SDXL checkpoints include WAI Illustrious and aDollsVoice. Anima checkpoints are excluded from IPAdapter mode because SDXL/SD1.5 IPAdapter weights do not patch Anima.

Default: **IPAdapter → SDXL**, semirealism preset, adapter PLUS, strength 0.65, start 0, end 0.8. Raise strength for identity fidelity; reduce it or shorten end time if the reference expression dominates. Checkpoint choice matters more than the style preset alone.

**LivePortrait** directly edits facial geometry on the reference. **Hybrid** first generates an expression with IPAdapter, then refines the generated face with LivePortrait. These require the AdvancedLivePortrait ExpressionEditor node, which is not currently installed. Use ComfyUI Manager to install ComfyUI-AdvancedLivePortrait and its required models, restart the backend, and use Check loaded nodes. Face detection can fail on heavily stylized or obstructed faces.

**Image-to-image** and **Prompt only** provide fallback and baseline paths. Image-to-image retains composition more strongly but can also retain the original emotion.

## Anima Ref Adapter

Choose **Anima Ref Adapter · reference-guided** as the render method for Anima. Install the custom node, restart ComfyUI, and use **Check Anima setup**. Studio shows the matched loader or missing requirements next to the button and records the result in Logs. The adapter may download its v2 weights on first use. [Anima Ref Adapter installation guide](https://github.com/ArcAnima/ComfyUI-Anima-Ref-Adapter/blob/main/docs/guide.en.md)

Studio checks both ComfyUI’s diffusion-model and checkpoint inventories. By default it loads a separate Qwen3 text encoder and Qwen Image VAE, including when the model is listed under checkpoints. For an all-in-one checkpoint that bundles both components, open **Model files** and select **Use checkpoint’s encoder and VAE**. Describe framing and expression in **Character & framing** so the reference can supply appearance and style.

Reference guidance defaults to 4.5, adapter strength to 1 and guidance end to 1, with APG correction. Guidance 1 avoids the extra reference-guidance model call. For Anima base, around 30 steps and CFG 4.5 is an upstream starting point. The model author recommends 8–12 steps and CFG 1 for Turbo. Choose these settings under **Sampling & resolution**. Composer LoRAs are applied before the adapter. [Anima model card](https://huggingface.co/circlestone-labs/Anima)

Anima also supports single-expression **Export API workflow**. Disable composer LoRAs for standalone export. The graph uses Swarm image bridge nodes and requires them in the target backend.

## Workflow

1. Upload a clean front-facing portrait. It is resized to at most 1024 pixels on its longest side. Alternatively generate a neutral card in Prompt only mode, then use its **Ref** action.
2. Choose the compatible checkpoint and a semireal, realistic, or illustrated style. Edit the shared character/framing description and negative prompt.
3. Choose 6, 12, or 24 expression presets, or add custom cards. Each card has an editable label and expression prompt. LivePortrait/Hybrid additionally exposes face controls.
4. Optionally enable composer LoRAs. Studio checks model compatibility and snapshots the enabled stack at the start of the queue, so composer changes cannot alter later cards. Enabled Trigger toggles also append the LoRA trigger phrases to each expression prompt.
5. Use **Render missing** on Generate to make only the base portraits. Every expression starts with the shared seed. A card reroll changes only its own seed offset. Lock approved portraits. Up to eight previous takes remain available as thumbnails.
6. Change order, exclude unwanted expressions, choose columns/gutter/paper color, and export a labeled PNG sheet.
7. Use **Export → Export portrait pack** for individual PNGs, the sheet (if all selected cards are complete), and the project manifest. **Project → Save project / Open project** transfers reference images, expressions, settings, outputs, and previous takes. **Add expressions** groups preset sets and custom cards; **Options → Render unlocked** regenerates selected, unlocked portraits.

Stop after current finishes the active portrait and prevents later submissions. It does not interrupt unrelated Swarm jobs. A render failure stays visible on its card. CUDA/OOM failures stop the remaining queue.

## Refine and remove backgrounds

**Generate**, **Refine**, and **Remove background** each have their own screen. Select a stage tab to see its settings and the images for that step. **Refine selected** and **Remove backgrounds** process the selected portraits whose input is ready. **Run pipeline** runs all remaining enabled steps in order and resumes failed portraits from their last successful image. **Render unlocked** starts over for selected, unlocked portraits. New sheets and older sheets with the original empty processing settings start with built-in methods. Choose **Skip this stage** to opt out.

- **Refine** discovers models in ComfyUI’s `models/upscale_models` folder. Auto uses the first installed model. Refresh backend options to choose another model and set the output scale.
- **Remove background** can use the built-in BiRefNet graph. Install `birefnet.safetensors` in `models/background_removal` and refresh backend options. The portrait PNG and portrait-pack images retain transparency. [ComfyUI BiRefNet setup](https://github.com/Comfy-Org/docs/blob/main/tutorials/utility/remove-background-birefnet.mdx)
- **Saved Swarm workflow** lets you select a workflow and its exposed image parameter. **ComfyUI API JSON** accepts a file or pasted graph with a single image loader and a single image output. Studio connects the current image and displays which nodes it detected. Use an alpha-capable image output for custom cutouts.

Enable **Options → Keep final results only** to save only completed pipeline results to Swarm. Studio keeps earlier stage images while the card is unfinished, then clears those images and older takes after the final stage succeeds. Use **View latest result** to jump to the available image when an earlier step has no saved result. Images already saved in Library are preserved.

Open **Editor** in desktop navigation or **Visuals → Editor** on mobile to generate a single image, refine it, remove its background, or paint an Inpaint mask in the tab. Use **Browse Library** to pick from the searchable thumbnail grid, **Upload image** for a local file, or **Open in Editor** from an image’s inspector. Editor generation uses the checkpoint and sampling settings from Create.

## Persistence and exports

The project, reference, output images, and prior takes live in IndexedDB, separate from Studio's small localStorage library cache. Changes autosave. Imported images must be embedded data URLs; imported remote URLs are discarded. Generated outputs also appear in Studio Library.

API workflow export supports one selected expression in IPAdapter, Anima Ref Adapter or LivePortrait mode. The graph uses SwarmLoadImageB64 and SwarmSaveImageWS, so it requires those installed Comfy nodes. It is an API graph, not a Comfy frontend layout. Checkpoint names are matched against the live Comfy inventory. Standalone IPAdapter workflow export rejects the composer-LoRA toggle rather than silently omitting the stack; the live Studio pipeline supports it.

The face-edit path is deterministic: Apply face reapplies the card controls; changing a seed does not create a different LivePortrait face edit. Semireal faces generally fit its intended use better than extreme anime faces. Identity consistency remains model-dependent.

## Research sources

- [IPAdapter Plus implementation and model setup](https://github.com/cubiq/ComfyUI_IPAdapter_plus)
- [AdvancedLivePortrait expression editor](https://github.com/PowerHouseMan/ComfyUI-AdvancedLivePortrait)
- [LivePortrait upstream](https://github.com/KlingAIResearch/LivePortrait)
- [PuLID-FLUX memory/offload configurations](https://github.com/ToTheBeginning/PuLID/blob/main/docs/pulid_for_flux.md): the documented 12 GB aggressive-offload configuration still targets more VRAM than this GPU, so it is not the default.

## Validation

Offline contract: `npm run test:expressions`. TypeScript: `npm run check`. Production bundle: `npm run build`.

Real GPU generation and face-edit quality should be checked manually. No inference, plugin installation, or model download is required by the offline contracts.
