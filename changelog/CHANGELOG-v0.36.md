# Swarm Studio v0.36.0

## Runtime repair
- Fixed remote Swarm image URLs in Tauri/dev mode so output cards and the floating generation monitor no longer route remote `/raw` assets through Vite's localhost Swarm proxy.
- Auto-start now probes the configured local endpoint first, launches Swarm immediately when it is absent, and polls until Swarm accepts a session.
- Clicking **Connect** in desktop Local mode now performs the same probe-and-launch flow even when Auto-start is disabled. Remote/PWA connections never spawn a process.
- Tightened the Runtime Logs process header so the idle "No owned process" state no longer consumes a large empty block.

## Branding
- Rebuilt the supplied moth/signal concept as fitted SVG geometry rather than embedding the reference raster.
- Replaced the in-app mark, PWA icons, and Tauri desktop icons with the fitted vector-based moth mark so it fills the normal icon footprint.

## Output images
- Output/history cards and the floating generation monitor now resolve Swarm image assets against the configured server rather than implicitly assuming `127.0.0.1:7801`.
