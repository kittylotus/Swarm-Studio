# Swarm Studio v0.55.0

## Fixed
- Reworked Studio inpaint requests around Swarm’s actual mask contract instead of heuristic “inpaint mode” detection.
- Studio now defaults to Swarm’s Simple Latent mask behavior for broader checkpoint compatibility, with Differential and Inpainting VAE Encode available explicitly.
- Strips stale init/mask/custom-workflow advanced state from inpaint requests so an old Create setting cannot silently reduce an edit to ordinary img2img.
- Adds mask coverage validation before generation and asks Swarm to report which parameters the generated workflow actually queried.
- Adds an in-editor generation progress/live-preview overlay while an edit is running.
- Removes the desktop one-pixel horizontal scrollbar/overflow from the inpaint layout.

## UI
- Inpainter surfaces, borders, selected tools, canvas accents, mobile header, and generation progress now inherit Studio theme variables.
- Added themed thin vertical scrollbars for the inpaint editor/sidebar.
- Brush/selection previews now use the active Studio accent colors.
- Added an explicit Mask Engine selector with Simple Latent, Differential Diffusion, and Inpainting VAE Encode modes.

## Diagnostics
- Inpaint logs include exported mask coverage and engine choice.
- When supported by the server, logs confirm whether `maskimage` was actually queried by Swarm’s generated workflow.
