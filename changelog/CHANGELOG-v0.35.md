# Swarm Studio v0.35.0

## Generation
- Added an optional draggable bottom-right generation mini-monitor with a live preview.
- Generation progress is displayed as sampler steps (`Step N / total`) instead of Swarm workflow-node percentages.
- Added an Appearance setting to disable the floating generation monitor.

## LoRA organization
- Moved batch LoRA actions into a sticky bottom rail so selection controls remain reachable while browsing long folders.

## Library
- Added output search and date-range filtering.
- Added a compact mobile Filter + select sheet with search, date, folder scope, and multiselect controls.
- Added batch selection and destructive batch deletion from Swarm history.
- Favoriting now toggles Swarm's own starred state instead of only changing Studio's local index.
- Single-image delete now deletes from Swarm history after confirmation.
- Renamed history synchronization to Hydrate Swarm history and preserve historic dates parsed from Swarm output paths when available.

## Identities
- Added per-identity `...` actions for Edit, Picture, and Delete.
- Identity pictures can be selected from a local image file and are persisted with the identity.
- The identity editor now supports editing existing profiles rather than create-only behavior.

## Models
- Checkpoints are now collapsible and remember their open/closed state.

## CivitAI
- Replaced the text external-link arrow with a centered SVG icon on CivitAI source buttons.

## Branding
- Replaced the previous Studio mark with the supplied moth/wireless mark across the app, PWA icons, and desktop application icons.
