# Swarm Studio v0.44.0

## Large library performance
- Deep Swarm history sync now replaces the Library grid with a lightweight indexing screen while reconciliation runs.
- Increased reconciliation chunks, reads independent Swarm history folders in small parallel batches, and reduced unnecessary UI yields for large archives.
- The Library index may contain thousands of outputs, but only 240 cards are mounted at once. `Load more` expands the rendered window without changing search/filter coverage.
- Swarm `Starred/` is now crawled as a favorite-state index rather than ignored or hydrated as duplicate image cards.

## Library browser
- Replaced the permanent folder sidebar and scattered date/search controls with one `Browse` modal.
- Added search, checkpoint filtering, Favorite/unstarred filtering, quick date ranges, arbitrary From/To dates, Studio folder navigation, and indexed Swarm date-folder shortcuts.
- Studio folders and Swarm date folders show indexed counts in the Browse modal.

## Batch selection
- Selection actions now live in a fixed bottom rail so they stay reachable in very long libraries.
- Added Favorite, Unfavorite, Move, Delete, Clear, Done, and Select shown actions.
- Shift-click enters selection mode from the normal Library; Shift-click while selecting extends the selection across the output range.
- Batch Favorite/Delete operations are network-chunked and persist Studio state once after the batch instead of serializing the Library after every item.
- Batch Move updates Studio folders in one persisted operation.

## Validation
- `tsc --noEmit` passes.
