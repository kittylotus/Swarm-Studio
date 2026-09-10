# Swarm Studio v0.8 — last-mile sync pass

- Reserves a real mobile safe area so fixed bottom navigation no longer sits over library/model content.
- Splits live-preview and final-output sizing. Both now fill the stage box and use `object-fit: contain`, fixing tiny mobile previews without cropping portrait outputs on desktop.
- Preserves a seed sent directly by Swarm image events, polls newly indexed history metadata, normalizes Swarm paths, and falls back to the default seed suffix in output filenames. The random/last-output seed toggle can now reuse the latest resolved `-1` generation.
- `Reuse all` prefers the resolved output seed instead of restoring the original request's `-1`.
- Mobile Civitai/Hugging Face metadata lookups use a dedicated allow-listed host-side relay rather than accidentally routing external URLs into Swarm.
- Connection/Refresh now performs a strong Swarm inventory refresh before listing checkpoints and LoRAs.
- LoRA downloads trigger a strong inventory refresh and poll until the new model is indexed, with an explicit waiting state when Swarm has not indexed it yet.
