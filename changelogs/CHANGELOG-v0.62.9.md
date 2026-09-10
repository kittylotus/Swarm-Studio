# Swarm Studio v0.62.9

## Fixes

- Fixed desktop/Tauri image drag-and-drop on Windows by disabling Tauri's native WebView2 drag-drop interception so Studio's HTML5 drop handler receives the actual file payload.
- Hardened dropped-image detection for Windows files with missing MIME types and added JPEG EXIF `UserComment` metadata support alongside PNG `parameters` metadata.
- Library Browse desktop docking now reserves real layout width and pushes the Library content left instead of floating over cards.
- Inspect now reads historical Swarm timing from `sui_extra_data`, including current `prep_time` + `generation_time` metadata and the older combined `(prep) ... (gen)` timing format.
- Library history sync hydrates timing for both newly indexed and already-indexed historical outputs.

## Preserved from v0.62.8

- Mobile Review Before Save prompt-area placement, Browse scroll preservation, Browse right-dock preference, LoRA folder creation, LoRA stack export, drag-to-Inspect workflow, and Studio-observed generation timing remain intact.
