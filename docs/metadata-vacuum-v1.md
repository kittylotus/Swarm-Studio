# Vacuum preview V1

Current execution status: [Reviewed original cleanup](reviewed-cleanup.md) is implemented. Earlier preview-only statements below describe historical revisions. Automatic deletion remains off; Lumi library cleanup is separate.

Current policy: [Metadata lifecycle settings](lifecycle-policy.md) supersede the earlier mandatory complete-Lumi-coverage gate. Complete-reference mode remains available; known references still protect assets. Vacuum remains preview-only.

Open **Library → Tools → Vacuum preview**. Pair **Connect LumiSwarm** with Lumi **Settings → Metadata → Live references**, then scan. Manual reference JSON import remains a fallback; see [the live connection and coverage guide](reference-coverage.md). The report reviews Swarm originals independently from Lumi copies. It never deletes an image. Existing **Delete drafts** stays a separate Lumi operation; the former standalone mass-delete command now opens a preview.

Generation tagging covers Create, expressions, Editor processing, inpaint and AddImageToHistory, using schema-1 string metadata with origin, asset/pipeline IDs, stage, parent and creation time. Expression `donotsave` behavior is preserved. Older or untagged outputs are never inferred. Multi-output batches have job-level identity and are held for review. Legacy sources without provenance start a new lineage.

`src/library/inventory.ts` is shared by Library history sync and Vacuum. Detectable caps, malformed listings, invalid paths and cancellation prevent a partial result from appearing complete. The walk uses depth one for folder discovery and six-request concurrency. API walk completion is not filesystem completeness: Swarm can omit entries or truncate before filtering without reporting that fact. This is another gate before execution. `src/library/vacuum.ts` is pure classification logic. Favorites, exclusions, active jobs, finals, scope uncertainty, collisions, stale/missing/incomplete Lumi claims and missing replacements all block candidates. The minimum grace period is seven days; a draft needs an unambiguous saved replacement. Unknown sizes stay unknown.

Exclusions and the last 20 dry-run summaries persist per server/user/output routing scope. All rows can be paged and exported. Optional scans run once when opening Library while idle, per connection scope. Execution is unavailable, including automatic deletion.

Actual Lumi snapshots still declare incomplete host-wide coverage and therefore block eligibility. The authenticated feed and bounded full-original copy decoding are implemented; per-source and per-copy checks remain distinct. No persisted-copy-only cleanup policy or real-file execution is implemented. Further work requires authoritative host and standalone reference coverage, a live metadata round trip and fresh authenticated checks immediately before deletion. Recycle-bin behavior is server configuration, not assumed.

PASS: `npm run build`, `npm run check`, full `npm run preflight`, `npm run test:vacuum`, desktop/mobile-sized browser tests (1440×1000 and 390×844). Browser tests exercise the former bulk-delete route, import, scan, exclusions, export, changed references, capped listings, cancellation, Escape and overflow, with zero deletion calls. They use mock data. Installed Tauri, live Swarm/Lumiverse generation and real mobile devices were not tested.

Use `npm run test:vacuum-ui`; set `PLAYWRIGHT_MODULE` if Playwright is supplied from another local project and `PLAYWRIGHT_CHANNEL` to choose a browser. `tests/library-cleanup-ui.mjs` now runs this replacement contract.

Full architecture, provider gate evidence, exact cross-repository file list and existing Lumi test limitations are documented in LumiSwarm's `docs/metadata-vacuum-v1.md`. Lumi's source checkpoint is `be6d573`; this app started clean at `34e6435`. To roll back, preserve later edits and restore only the implementation files listed in that cross-repository report, then rebuild. Do not reset user state or remove images.


## Vacuum design revision — 2026-11-23

Replaced the initial modal markup and canonical `src/library/vacuum.css`: Studio typography/tokens, deliberate header and persistent action footer, scrollable review body, custom import button with hidden file input, explicit successful-import/incomplete-coverage feedback, real unscanned/scanning/empty states, result statistics and rows, and a styled history button with expanded-state semantics. No native details disclosure remains. Classification, snapshot format, exclusions, exports and non-destructive behavior are preserved.

PASS: build/TypeScript, pure Vacuum tests, and mock Edge UI at 1440×1000, 782×893, 390×844, 320×640 and 1024×600. Verified five imported claims with incomplete coverage, history toggle/ARIA, import, scan, exclusion persistence, export, changed references, caps, cancellation, Escape and horizontal overflow; zero deletion calls/browser errors. Screenshots inspected under `test-results/vacuum-{empty,imported}-WIDTH.png` and `vacuum-WIDTH.png`. NOT RUN: installed Tauri, physical mobile devices or live backend operations during this design pass.

This revision touches only this report, `src/app.ts`, `src/library/vacuum.css` and `tests/vacuum-ui.mjs`. Rollback: preserve later work, then restore only these UI changes from a saved pre-revision copy; the earlier V1 backend and classifier do not require changes. No commits or pushes were made.


## Archive navigation revision — 2026-11-23

Vacuum defaults to newest first using Studio creation metadata, then the Swarm date/time filename when available, with deterministic path tie-breaking. Search covers paths, stages, asset/pipeline IDs, origins and reasons. Status and source selectors and oldest/candidates-first ordering apply before 100-row pagination. Match counts are separate from archive-wide safety statistics. Reset returns to newest first. Export still includes the full inventory. Exclusions retain original file identity after filtering/sorting; no eligibility rule changed.

Library → Browse → Collections & folders → LumiSwarm is a persistent virtual view. It includes indexed outputs with valid schema-1 embedded LumiSwarm provenance and a valid output-relative path. Request-only hints and untagged historical outputs are excluded. No snapshot import or Vacuum scan is needed for the collection; normal Library sync indexes saved metadata. This verifies recorded provenance, not copy readability or reference completeness. It neither creates a storage folder nor moves/duplicates files, and ordinary folder assignments remain unchanged.

Files for this revision: `src/library/views.ts` (new pure projection and membership helpers), `src/library/session.ts` (virtual selection persistence), `src/app.ts`, `src/library/vacuum.css`, `src/styles.css` (correct Browse mobile height for its existing bottom padding), `tests/library-views-contract.mjs`, `tests/vacuum-ui.mjs`, `package.json`, and this report. Roll back only this revision's changes after preserving later work; do not restore the whole app over the prior uncommitted implementation.

PASS: production build/TypeScript, pure Vacuum and 4,001-row projection/membership tests, Library session tests, mock-browser search/status/source/sort/reset/exclusions and virtual collection selection at five viewports. Checked unchanged physical folder IDs, retained virtual selection and absence of a delete-folder action for the collection. Browser evidence: `test-results/vacuum-WIDTH.png` and `library-lumiswarm-WIDTH.png`. NOT RUN: real-device or installed Tauri testing. No commits, pushes or physical deletions.


## Processing retention and version review — 2026-11-23

Inspect actions now use a canonical two-column grid. Review versions shows thumbnail-based parent-first pipeline versions, branches, current image, exact asset IDs in tooltips, missing parents and ambiguous duplicate IDs. Navigation uses indexed outputs; no prompt/seed inference. Local request provenance is allowed for in-session versions; virtual Library provenance continues to require saved embedded metadata.

Keep final only is opt-in in Editor and Inspect, scoped to the active Swarm connection/user. It queues direct source→replacement pairs in a separate localStorage retention ledger after the replacement successfully decodes. Upscale/background processing queues on success; inpaint queues only after Use edit succeeds. Failure, cancellation, rejected edits, unknown parent/scope, missing saved paths, self-replacement and ambiguous parent IDs do not queue. Sources stay saved. The existing expression pipeline keeps its own donotsave policy. Future work may reconcile saved expression intermediates; the new shared Editor setting does not silently override that pipeline's choices.

Vacuum annotates queued source files without changing eligibility. Queueing is not approval to delete; protected/favorite/reference/grace-period checks remain in force. Exclusions remain available in Vacuum.

Lumi snapshots now audit returned current-account character/persona/chat fields and full returned swipes/extras, along with extension-owned visual references. Standalone audits browser projects, disk projects/variants and current sources. The authenticated feed, original-copy decoder and original-file size checks are described in [the current audit](reference-coverage.md), including exact public-API gaps. Complete coverage remains false and deletion stays unavailable.

PASS: standalone build/typecheck; pure lineage branches/missing/duplicate parents and retention safety tests; existing expression and Vacuum tests; mock inspector browser checks at 1440×1000, 782×893, 390×844, 320×640 for action grid, versions, persistent opt-in queue, failed decode, navigation and overflow. PASS: extension build, metadata registry/provider tests and backend contracts. Extension typecheck retains its previously reproduced BlobPart failure. NOT RUN: live host audit, real generation/approval through this revision, installed Tauri/device validation.

The earlier extension-HTTP-route blocker is resolved by a scoped credential-paired push feed to standalone, using public spindle.cors; Lumiverse core was not modified. Setup, tests, current files and rollback for this follow-up are in [reference-coverage.md](reference-coverage.md).

This revision's files: src/app.ts, src/styles.css, src/expressions/editor.ts, new src/library/lifecycle.ts, package.json, new tests/lifecycle-contract.mjs and tests/inspector-lifecycle-ui.mjs, and this report. Extension changes: src/backend.ts, tests/metadata-registry-contract.mjs, docs/metadata-vacuum-v1.md, required dist/backend.js and integrity entries. Preserve prior uncommitted work when reverting only this revision; do not reset to the original base or discard the earlier Vacuum implementation. No commits/pushes or deletions.
