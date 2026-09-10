# Swarm Studio v0.54.0

## Fixed
- Removed the inpaint source-image race that could show a successful canvas and a contradictory load-error toast at the same time.
- Inpaint Generate/Edit buttons now update immediately when a brush stroke, rectangle, lasso, invert, or imported mask makes the mask valid.
- Brush cursor preview now follows the mouse/pen instead of living in a fixed corner of the canvas.
- Browser/PWA Swarm traffic no longer depends on the visible Studio URL literally using port 1420. API, generated images, Library thumbnails, latest-output previews, and inpaint source images route through the same-origin `/__swarm` bridge even behind Tailscale Serve / HTTPS frontends.
- Swarm display-path normalization strips an accidentally persisted `__swarm/` prefix to avoid double-relayed image URLs.

## Changed
- Replaced the oversized text inpaint tool tabs with compact SVG brush, erase, rectangle, lasso, and pan controls. Desktop tools fill on hover and selection; touch layouts keep a visible resting surface and stronger selected fill.
- Reworked the mobile inpaint modal into a canvas-first scrolling layout with a compact neutral header, single-column mask/generation controls, usable sliders, and non-overlapping bottom actions.
- Mobile no longer exposes giant generated filenames as the primary inpaint header.

## Validation
- `tsc --noEmit` passes.
