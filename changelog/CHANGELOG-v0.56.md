# Swarm Studio v0.56.0

## What changed

- decoupled inpaint inference from the mounted Create-tab form by snapshotting the source output's generation context (model, seed, sampler/scheduler, LoRAs, presets, advanced params) when opening the editor
- inpaint requests now reuse that source context, so Library / Inspector launches no longer depend on whichever draft happens to be live in Create
- expanded inpaint logging to include the active source-stack count for easier debugging
- restored mobile modal scrolling by letting the inpaint backdrop own vertical scrolling on narrow screens
- eliminated the stray horizontal inpaint overflow by forcing x-overflow hidden on the modal layout, sidebar, footer, and status regions
- stabilized themed scrollbars with a shared gutter so the desktop panel no longer jitters sideways

## Validation

- `npm run check`
