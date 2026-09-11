# Theme typography + semantic surfaces

No version bump. This overlay extends the existing v0.63.21 appearance system.

## What changed

- Centralized built-in theme definitions, font stacks, normalization/migration, and light/dark detection in `src/theme.ts`.
- Renamed built-ins without changing their stable IDs:
  - `studio` → **Vibecoder Purple**
  - `mint` → **Shrek**
  - `bubblegum` → **Bubbly McBubbles**
  - `minimal` → **Sticky White Substance**
- Shrek now intentionally uses Comic Sans for title/subtitle typography and an aggressively green square-edged palette.
- Bubbly McBubbles is now a true white + pink princess-core light theme.
- Sticky White Substance is now a neutral monochrome light theme.
- Added theme-selectable **Title font** and **Subtitle font** controls. Body/input text intentionally remains on the normal UI font.
- Added semantic/utility theme surfaces for success/online, warning, danger text/icons, danger backgrounds, and utility/console surfaces.
- Swarm online status now gets a colorable success border/glow; linked resolution state now follows the primary theme accent instead of the legacy secondary/purple-ish state.
- Logs and diagnostic previews use the configurable utility surface instead of a fixed black/gray mix.
- Light themes now switch the document/native `color-scheme`, and nested CivitAI selects inherit it instead of forcing dark controls.
- Generic soft/hover surfaces derive from theme text instead of literal white overlays, so pale themes retain visible interaction states.
- Legacy saved themes and saved theme profiles migrate through `normalizeStudioTheme`, receiving safe defaults for all new fields.

## Files in this overlay

- `package.json`
- `src/app.ts`
- `src/library/store.ts`
- `src/styles.css`
- `src/theme.ts`
- `src/types.ts`
- `tests/composer-ui-contract.mjs`
- `tests/theme-contract.mjs`
- `changelog/theme-typography-semantic-surfaces.md`

## Validation performed in staging

- TypeScript source check with TypeScript 5.8.3 using DOM + DOM.Iterable libs: clean.
- `tests/theme-contract.mjs`: pass.
- `tests/composer-ui-contract.mjs`: pass.
- `git diff --no-index --check` against the supplied staging files: clean.

The full repository preflight still runs through `npm run preflight`; `package.json` now includes the new theme contract in that chain.
