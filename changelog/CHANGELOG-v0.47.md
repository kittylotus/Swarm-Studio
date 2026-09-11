# Swarm Studio v0.47.0

## Fixed
- Make a completed **Sync Swarm history** authoritative for Swarm-backed Library records.
- Remove stale indexed outputs that are no longer returned by the full live Swarm history crawl instead of retaining them as broken-image ghosts.
- Preserve genuinely local-only/data-backed output records that are not expected to exist in Swarm history.
- Clear pruned records from the current batch-selection set.

## Changed
- The final sync phase now reports **Pruning missing** and the completion summary includes how many stale records were removed.
