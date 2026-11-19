# Advanced features

The approved Advanced modal replaces the long accordion in Create. Common Studio controls retain their existing editors. The catalog uses the connected server's visible parameter definitions and original feature groups; workflow categories organize browsing without merging server enablement.

## Behavior

- Browse searches feature names, descriptions and parameter IDs. Pinned and In Studio are alternate catalog views.
- Pins persist in `ui.advancedPinnedFeatures`; pinning never changes generation settings.
- Send to Studio commits only the selected feature's staged overrides and enablement. The feature gets an icon pill in Create. Selecting its pill reopens its editor.
- Update changes the same feature. Turning it off retains its values and pill but suppresses them from requests. Remove clears that feature's overrides and enablement.
- Closing or pressing Escape discards uncommitted edits. Reset removes an override so the server default applies.
- Existing overrides and enabled groups are discovered automatically, without rewriting legacy state. Presets and output reuse restore feature enablement alongside values; unrelated disabled features stay disabled when applying a preset.
- Each ControlNet server group remains independent. Common-control search results return to the owning Studio editor.
- Server descriptions support basic formatting and absolute HTTP/HTTPS documentation links. Other attributes and executable markup are discarded. Links open with `noopener noreferrer`.
- Single-image controls support local image upload and reset. Uploaded image pixels remain session-only, matching Studio's existing compact draft storage. The interface explains that files must be reattached after reload. Persisted omission markers never enter a generation request.
- A changed server or capability snapshot blocks sending stale settings and asks the user to reopen the dialog.

## Architecture

`src/advanced/catalog.ts` owns common-control exclusions, server-group identity, workflow classification, feature state transitions and request inclusion. Request generation never depends on the current search, view, pins or selected category.

`src/advanced/dialog.ts` owns the native modal and staged editor. It mounts outside the rerendered app root so background Studio renders cannot erase a draft. Closing removes it and returns focus. Desktop uses adjacent catalog/editor panes. At 700px and below, Browse and Edit are separate full-screen views; the footer stays visible while settings scroll.

`src/advanced/styles.css` is the canonical stylesheet. Superseded accordion markup, event handlers and CSS were removed, including their historical overrides. Theme tokens and existing brand assets are preserved.

## Verification

- **PASS:** `npm run build`, including TypeScript and PWA assets. Vite reports the existing large main-chunk advisory.
- **PASS:** `npm run preflight`, including the Advanced request/state contract and existing updater, composer, resolution, history, capability hydration, inpaint, notification, LoRA, expression, enhancer and Anima checks.
- **PASS:** `npm run test:advanced-ui` in headless Chromium using isolated mock server definitions at 1440×1000, 800×700, 390×844 and 390×600. Covers opening/reopening, native keyboard focus containment, staged edits, Send/Update, disabling/re-enabling, removal, image input/reset, persisted pins/values, common-control search and focus return, safe rich descriptions, preset restoration, and changed-capability rejection. No browser script errors.
- **PASS:** inspected desktop and mobile captures under `test-results/advanced/`. Editor footer geometry stays inside the viewport, with no modal horizontal overflow at tested sizes.
- **NOT RUN:** real Swarm generation, native Tauri packaging, physical mobile device or notched-device interaction. Fixture tests prove frontend wiring and request construction, not server execution.

Browser checks use the environment's `puppeteer-core`. Set `ADVANCED_TEST_BROWSER` to a Chrome/Edge executable if auto-discovery does not find an existing Chromium installation. No browser installation is performed by the test.

## Intended source manifest

Modified:

- `package.json`
- `scripts/preflight.mjs`
- `src/app.ts`
- `src/library/store.ts`
- `src/styles.css`
- `src/types.ts`

Added:

- `src/advanced/catalog.ts`
- `src/advanced/description.ts`
- `src/advanced/dialog.ts`
- `src/advanced/icons.ts`
- `src/advanced/styles.css`
- `tests/advanced-features-contract.mjs`
- `tests/advanced-features-ui.mjs`
- `docs/ADVANCED-FEATURES.md`

The previously approved `prototypes/advanced-studio/` files are preserved separately. No extension checkout, credentials, private configuration or Git history was changed.

## Rollback

Reverse only this implementation's changes in the six modified files and remove the eight added files listed above. Preserve the prototype and unrelated work. No commits, branch changes, resets or automatic data migrations were performed. Older Studio versions ignore the additional UI/draft preference arrays; legacy extra parameters and enabled groups retain their original representation.
