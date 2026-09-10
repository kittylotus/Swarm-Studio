# Swarm Studio v0.31

- Fix Swarm preset saving by sending `param_map` at the AddNewPreset request root, matching SwarmUI's raw JObject API contract.
- Preserve Models-page scroll position when adding a LoRA to the shared composer.
- Add a desktop Models bottom safe area so the final LoRA row can scroll fully above the window edge.
- Restyle desktop LoRA grid cards around portrait 3:4 previews for tall model artwork.
