# Reviewed Swarm original cleanup

Implemented 2026-11-24 in standalone Swarm Studio. This adds user-approved execution to Vacuum. The later opt-in idle execution and branch overrides are documented in retention-improvements.md; Lumi database cleanup remains separate.

## Use

1. Open Library → Tools → Vacuum. The What to keep tab contains independent LumiSwarm/standalone settings, optional reference connection, automatic preview preference and scan history. Scan Swarm history to continue to Select files; an existing scan also enables Next: select files.
2. Select any unblocked row individually. Select matching candidates uses automatic policy; Select matching for manual review includes legacy and policy-retained files across the current filters and all their pages. Existing selections survive filter changes; Clear selection removes them. Favorites, exclusions, active jobs, known direct references and incomplete verification remain blocked. Lifecycle-retained and untagged files are selectable for explicit manual review; their overrides are labeled in the approval.
3. Choose Review N selected. The Review tab shows cancellable verification progress. A fresh complete history/favorites walk, global job status, standalone project audit and configured reference evidence are checked. Original-file headers must verify non-empty image files. HEAD is attempted first; servers returning 405/501 use a one-byte Range GET. Inaccessible or unverifiable headers cause omission. No deletion occurs here.
4. Review the exact relative paths, full asset IDs, stages/origins, server/user identity, frozen policy, measured sizes and recycle status. Omitted selections and their reasons are listed. The review expires after ten minutes. A policy change invalidates it.
5. Check the approval box and choose Delete N reviewed originals in the footer. Only that frozen list can execute. Every file is revalidated immediately before its request.
6. The Results tab shows progress during execution, then Cleanup history and its exportable JSON log. Confirmed deletions leave the local index, including path aliases and any selected inspector record. Unconfirmed requests remain explicitly uncertain; rescan before another attempt. No retry or resume runs automatically.

The former non-favorite bulk-delete shortcut still opens Vacuum. Ordinary existing per-image Library deletion is independent. No user images were deleted during implementation; all execution tests used an in-memory fake Swarm server.

## What execution checks

- Exact server URL/user/output routing and process server_id, rebound through GetNewSession. Server identity, policy and recycle behavior must still match the review.
- GetGlobalStatus: all live/waiting generation, backend-waiting and model-loading counters must be numeric and zero. The account needs read-server-status permission. Unknown/unavailable activity blocks execution; it is not treated as idle.
- A full folder walk for every original, honoring history limits and all existing cap/malformed/path/duplicate guards. Favorites include Starred mirrors and local protection. Current exclusions are reread, including additions from other tabs.
- Full metadata identity, including embedded parameters, and the measured original length. A changed/missing original is skipped. Automatic selections are reclassified under the frozen policy. Manual selections override lifecycle/grace/copy-binding rules or absent Studio tags, while complete inventory/local audit, positive reference protections, active workspace sources, jobs and exact file/size identity remain mandatory.
- Live paired evidence must remain fresh (150-second receiver window); unavailable or expired paired evidence blocks. Imported evidence has a fifteen-minute lifetime. No relay is required when metadata policy is deliberately used without a connection/snapshot. These are bounded snapshots, not atomic remote database locks.
- Chain-mode sources require at least one actual saved direct replacement with verifiable original-image response headers. Successful planned ancestors are retained as immutable in-memory ancestry evidence only within this approved run, allowing draft → upscale cleanup while the final survives. They are never considered surviving replacements. A deleted source path reappearing stops the run. Cancelling mid-chain may leave an incomplete lineage for later review; it is not silently repaired or automatically resumed.
- Immediately before sending, the tab lease, current local jobs, policy, reference freshness, exclusions and known reference classification are checked again. Generation/processing starts are blocked in this Studio while checking/executing. Other clients remain outside this local lock.

## Server deletion and recycle behavior

The implementation uses the existing Swarm DeleteImage endpoint with the exact output-relative path. It requires success=true and disables the client's invalid-session retry for reviewed mutations. No Lumiverse images.delete call exists in this workflow.

Checked Swarm source: src/WebAPI/T2IAPI.cs DeleteImage removes the chosen image plus same-stem .txt, .metadata.js, .swarm.json, .swarmpreview.jpg and .swarmpreview.webp sidecars, then removes its tracked metadata. ListServerSettings exposes Paths.RecycleDeletedImages when permitted. Enabled, disabled and unknown are displayed distinctly; disabled/unknown are explicitly treated as potentially permanent in the approval view. Server settings are never changed. Recycle recovery and OS behavior are not promised or tested on the private server.

API size estimates cover original image bytes only, not sidecars or an assurance of physical reclaimed disk space. HEAD or the validated one-byte range response confirms current image access/length, not full bitmap decoding or byte-for-byte identity. Metadata, API inventory and server identity remain the ownership evidence. Swarm's API walk has no authoritative filesystem completeness marker, and the API has no atomic compare-and-delete or transaction spanning reference systems. External changes after the final check cannot be eliminated by this client.

## Cancellation, uncertainty and history

Deletion is sequential and parent-first where applicable. Cancel stops further requests; it cannot retract one already sent. Closing/Escape during execution requests cancellation and keeps results visible. Verification reads are cancellable with fifteen-second deadlines (individual image-header HTTP requests already have eight-second deadlines). An in-flight deletion gets up to thirty seconds for its response; a timeout/rejection is unconfirmed, stops further deletion and is not retried. The server may finish after a timeout. Only acknowledged successes remove local records. A missing replacement, new favorite or reference becomes a skip; connection/policy/recycle/check failures halt the remainder.

The exact reviewed paths, server/scope, policy, reference timestamp, recycle status, pending request and per-file results are saved in a per-scope localStorage log before requests and after each outcome (last twenty runs). Storage failure blocks/stops execution. A heartbeat lease prevents ordinary competing runs in another tab of the same browser origin/scope; it is not a cross-machine server lock. An interrupted browser session retains a pending/unfinished warning and never resumes automatically. Export preserves this evidence for review. Cleanup history is separate from dry-run scan history and does not contain image bytes or session credentials.

A complete history walk and local audit run before each deletion. This deliberately favors fresh evidence over throughput; large selections can be slow. Review smaller filtered batches when needed.

## Validation

PASS: production build/TypeScript, full npm run preflight, existing Vacuum, live-reference and inspector graph browser regressions. PASS: new pure runner tests for frozen exact plans, replacement/ancestry handling, favorites, metadata changes, policy/server/recycle changes, missing files, active/check failures, write-ahead storage failure, uncertain responses, index persistence failure and cancellation before/during a request; deadline semantics distinguish cancelled reads from uncertain mutations.

PASS: real production SwarmClient against an in-memory HTTP fake, at 1440, 782, 390 and 320 px. Tests verify no mutation before approval, exact selected paths, protected omission, index alias removal, audit export, fresh favorites/references/project bindings, missing replacements, global jobs, changed metadata/settings, no invalid-session mutation retry, cancellation, another-tab lease, unreadable audit/storage and capped history. Mobile confirmation action bounds and document overflow are checked. Evidence: test-results/cleanup-review-WIDTH.png and cleanup-results-WIDTH.png. No real images, private database or private Swarm server were mutated.

NOT RUN: live reviewed deletion/recycle recovery against the user's installed Swarm, installed native UI, actual device interaction, or multi-machine lock/race testing. Native HTTP requests use the existing generic bridge; this revision changes no Rust APIs. No claim of atomic safety across unrelated clients is made.

Commands: npm run test:cleanup, npm run test:cleanup-ui, npm run test:vacuum, npm run test:vacuum-ui and npm run test:references-ui. Browser tests accept PLAYWRIGHT_MODULE / PLAYWRIGHT_CHANNEL as in the existing harness; this workstation uses the extension's installed Playwright and headless Edge. The new deletion test obtains an ephemeral fixture port and is independent of user services.

## Files and rollback

Changed: src/app.ts, src/swarm/client.ts, canonical src/library/vacuum.css, package.json, tests/vacuum-ui.mjs (complete state fixture and updated shortcut wording). Added: src/library/reviewed-cleanup.ts, tests/reviewed-cleanup-contract.mjs, tests/reviewed-cleanup-ui.mjs and this guide. Existing standalone metadata/reference/lifecycle reports link here as their current execution status. Generated standalone dist and local test evidence remain excluded from source delivery.

To disable execution, remove/revert only this revision's selection, review and execution wiring after preserving other edits, then rebuild. Earlier uncommitted metadata, policies, reference feed and graph work must remain intact; do not reset the repository. Preserve cleanup logs for audit. Source rollback cannot restore deleted files; any recovery depends on the actual server's recycle configuration. No commit or push was performed.

## Manual review revision — 2026-11-24

Fixed the selection model that mistakenly made automatic-candidate classification a prerequisite for manual deletion. Scan rows now distinguish hard protection from manual-reviewable lifecycle suggestions. A recent draft, a tag not selected by policy, a retained branch end, a Lumi copy binding or an untagged legacy output can be selected manually. Automatic candidate selection remains unchanged and never infers legacy provenance. No grace period, stage configuration or source metadata is rewritten to enable manual selection.

The exact-path approval counts manual overrides and records each original policy reason. Legacy paths explicitly show No Studio ID and unknown origin rather than fabricated asset IDs. Blank/non-JSON legacy metadata is retained as an exact identity value; original-image header length/access, scope/server, complete history, local references, favorites, exclusions and active-job checks are still enforced. Manual approval does not require a surviving replacement because it explicitly authorizes disposal of that chosen original. Automatic chain selections still require their replacement and are skipped if they become branch ends after review. A candidate selection is never silently upgraded to manual override during execution.

Manual review is rechecked before each request and at the final pre-send boundary. It cannot override known favorites, direct Swarm-path references, project/workspace sources, exclusions, active jobs, unknown/incomplete scope/scans/audits or physical-header failures. These positive blocks disable selection. Copy UUID bindings alone are not direct path dependencies; their optional retention policy can be explicitly overridden in manual review. The cleanup log retains the manual flag and reason.

PASS: tests for recent Lumi drafts with an empty stage selection, seven-day grace, copy protection enabled and incomplete host snapshot; legacy valid/blank metadata; individual and bulk manual selection; exact approval of two manual overrides; favorites disabled; direct references still block. Browser execution used fake in-memory originals only. Updated files: src/library/vacuum.ts, src/library/reviewed-cleanup.ts, src/app.ts, tests/reviewed-cleanup-contract.mjs, tests/reviewed-cleanup-ui.mjs and this guide. Existing automatic policy remains available; source rollback should reverse only this revision after preserving other uncommitted work. No real files deleted, commits or pushes.

## Staged workflow revision — 2026-11-24

Scope: standalone Vacuum layout, navigation and presentation state. Existing branding, Library navigation, inspector graph, metadata generation, Lumi extension and cleanup engine contracts are preserved.

Replaced the stacked modal with four accessible tabs: What to keep → Select files → Review → Results. The footer presents stage-specific actions; scan/export are secondary tools during selection. Policy settings are directly visible in their own stage, with the optional Lumi relay last. Moving back to configuration/selection invalidates the frozen review and its acknowledgement. Review remains unavailable until its checks prepare a plan. Execution locks stage navigation and exposes cancellation; results persist in the same existing scope-local audit log.

Each stage retains its body scroll across global app renders, live receiver updates, row selection, exclusions, filter changes and pagination. The modal render lifecycle captures the previous DOM stage before replacement and restores after showModal. Stable control/region selectors restore focus without scrolling; text selection is retained. Review path and outcome lists now use the main pane scroller rather than nested scrolling boxes. Arrow keys, Home and End navigate available tabs. Header, navigation, feedback and contextual footer remain fixed around the scrolling pane.

Canonical styles are in src/library/vacuum.css. The former collapsed policy and stacked review/history presentation are removed. Desktop uses parallel origin settings; the 600px width breakpoint stacks them and compacts navigation/statistics. The 600px height breakpoint reduces header/chrome for short or zoomed layouts. Theme tokens still supply all colors and typography.

PASS: production build, pure cleanup/Vacuum/lineage/policy contracts; production-client mocked cleanup browser flow including a 4,382-file archive; settings/import/filter/exclusion/export/cancel/Escape regressions; authenticated receiver refresh preserving stage, scroll and focus; inspector lineage regression. Workflow tests cover 1440×1000, 782×893, 390×844, 320×640 and 720×450 CSS viewports (the last is a short layout comparable to 200% zoom), reduced-motion preference, keyboard tabs, caret retention, independent stage positions, cancellable review checks and zero mutations before exact-path approval. Screenshots: test-results/vacuum-workflow-configure-WIDTH.png, vacuum-workflow-select-WIDTH.png, cleanup-review-WIDTH.png and cleanup-results-WIDTH.png. Real headless Edge rendering with fixture APIs; no user images were deleted. Installed Tauri UI, actual browser zoom controls and touch hardware: NOT RUN.

Files for this UI revision: src/app.ts, src/library/vacuum.css, tests/reviewed-cleanup-ui.mjs, tests/vacuum-ui.mjs, tests/reference-live-ui.mjs and this guide. Existing cumulative uncommitted work remains. Rollback means reversing only this UI revision's tab/state/render/style changes and rebuilding; do not reset cumulative metadata/reference/deletion work or erase audit logs. No commit or push performed.

## Live Swarm HEAD compatibility — 2026-11-24

Root cause confirmed with a read-only request against the installed Swarm: HEAD on an existing /View/local/... original returns 405 with Allow: GET. GET with Range: bytes=0-0 returns 206, Content-Length: 1 and Content-Range: bytes 0-0/658066; the total matches that file's 658066-byte disk length. The prior mock accepted HEAD and failed to model this host contract.

Browser and native readers now fall back only for 405/501, on the same exact authenticated original URL, with redirects still disabled. A valid 206 must identify range 0-0, a one-byte transfer, an image MIME type, an unencoded response and a positive safe integer total. A server ignoring Range may return a full 200 response with a valid original Content-Length. The reader cancels/drops the body after headers. Missing/auth/error responses, malformed ranges and compressed/non-image responses remain unverified. This does not bypass existence or size checks.

A plan with zero verified targets now displays a failure explanation and per-file omission reasons. It has no approval checkbox or deletion button. Selected paths remain available for Retry verification; retry redoes all checks and still requires a fresh exact-path approval before deletion.

PASS: TypeScript/production build; cargo check --offline; cleanup browser regressions (including HEAD rejection/range fallback on all standard deletion scenarios, HEAD-supported server, malformed ranges, unavailable files, no zero-target approval, retained selections and successful retry); reference/header validation contracts; read-only live header/disk comparison. Screenshot: test-results/cleanup-verification-failed-malformed.png. Native code compiled; installed native UI and real deletion NOT RUN. No user images modified/deleted. No commit/push.

Files in this fix: src/library/file-size.ts, src/runtime/index.ts, src-tauri/src/lib.rs, src/app.ts, tests/reference-services-contract.mjs, tests/reviewed-cleanup-ui.mjs, docs/reference-coverage.md and this guide. Rollback is limited to these header-fallback and zero-target-presentation changes; preserve the cumulative uncommitted workflow/deletion work and audit logs.
