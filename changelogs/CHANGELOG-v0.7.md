# Swarm Studio v0.7 — mobile polish pass

- Live generation previews now upscale to the full output stage while preserving aspect ratio; low-resolution progress previews no longer render at their tiny native size on phones.
- Mobile Create navigation is reduced to Generation, Output, Tune, and More. Library remains in the top navigation and no longer displaces the Create panes.
- Added compact SVG seed and syntax actions beside the mobile prompt controls.
- Seed action now toggles between `-1` and the most recent resolved output seed instead of inventing an unrelated random integer. Studio resolves final seed metadata from the generated output/history when available.
- LoRA library cards visibly switch from Add to a dimmed Added state once present in the shared stack.
- Refreshed app/PWA mark with a transparent normal icon and a separate maskable icon so launchers do not force the artwork into an opaque square blob.
- Package, Cargo, and Tauri versions bumped to 0.7.0.
