# Advanced → Studio prototype

Open `index.html` in a browser. Self-contained; no dependencies or backend calls.
Mock settings and pins live in memory and reset on reload.
The mock starts in Studio; use Advanced features to open the catalog.

## Proposed design contract

- Preserve Studio's dark lavender identity and common controls.
- Advanced owns a searchable feature catalog with Pinned, In Studio, and Browse views.
- Browse groups features by shared usage; original server groups still own enablement in production.
- Desktop: catalog alongside a feature editor. Mobile at 700px and below: catalog → editor, with a back action and full-screen dialog.
- Pinning changes discovery only. Sending commits editor values, closes the dialog, and adds or updates an icon pill in Studio.
- Pills identify their source as Advanced and reopen the same editor. Disabled features keep a pill marked Off. Removing a feature stops including it in mock requests.
- Edits remain staged until Send/Update. Closing discards staged edits; pins survive closing. Reset restores the mock field default in the editor only.
- Common-control search results point toward Studio instead of creating duplicate editors.
- Native dialog supplies modal focus containment and Escape. Closing restores the opener or falls back to the Advanced button.

## Deliberate limits

The feature catalog, defaults, choices, field resets and request preview are illustrative. No server capability validation, image uploads, generation, persistence or real request wiring is implemented. Common-control results close the modal and report their existing location; they do not navigate to production controls. ControlNet slot selection is illustrative, not independent per-slot state. Those behaviors require real capability metadata and canonical parameter ownership during integration.

## Verification

`node prototypes/advanced-studio/verify.mjs`: PASS for button callbacks opening, closing and reopening; Escape cancellation; focus return; pill opening; browser API isolation; repeated initialization; and model/render smoke checks. These use a minimal DOM stub, not a browser engine.

The script is isolated in a closure and uses named Advanced handlers so it does not overwrite browser `open`/`close` APIs or leak declarations into an embedding preview.

Fixed startup failure: the SVG search symbol and search input previously shared `id="search"`, so catalog initialization read `.value` from an SVG symbol. All icon symbol IDs now use an `icon-` prefix. Verification checks ID uniqueness and icon references in the actual markup.

Browser visual, keyboard and mobile QA: NOT RUN. The browser tool rejected the local file URL because only HTTP/HTTPS protocols are permitted. No alternate route was attempted.

## Files and rollback

Only this directory is added: `index.html`, `verify.mjs`, `README.md`. Production source is untouched. Remove this prototype directory to roll back.
