# Swarm Studio v0.53.0

## Inpaint pass two
- Adds rectangle and freeform lasso mask tools alongside Brush, Erase, and Pan.
- Adds mask feathering, grow/shrink shaping, overlay opacity, and shaping reset controls.
- Adds mask PNG import and export. Imported masks are normalized to the source image dimensions and converted to a black/white mask.
- Adds desktop shortcuts: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, B/E/R/L/H, and bracket keys for brush sizing.
- Wheel zoom now anchors around the cursor; two-finger touch still owns pan/zoom on mobile.
- Mask processing is debounced while shaping sliders move so large images do not recompute on every raw input event.

## Native reliability
- Fixes the MVP source-image path so Tauri canvas loading uses the already-working Rust image bridge rather than asking WebView2 to fetch Swarm images directly.
- Re-renders the editor after the native source prefetch completes.

## Generation
- Keeps the iterative edit loop from v0.52: a successful result becomes the next source image and the previous mask is cleared.
- Continues to auto-detect the live Swarm mask parameter and likely inpaint/edit mode from `ListT2IParams`, with `maskimage` as the compatibility fallback.

## Deliberately not included yet
- Crop-to-mask recomposition is not shipped in this pass. Studio needs a clean way to persist the recomposed full-resolution image back through Swarm before that workflow is safe to expose.
