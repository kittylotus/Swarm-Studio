# Swarm Studio v0.41.0

## Fixed
- Repair legacy Library image paths saved as `/raw/...`, `local/raw/...`, `View/raw/...`, or absolute URLs from older Studio builds back to Swarm's canonical `View/local/raw/...` path.
- Rebase historic output images onto the currently connected Swarm host before sending them through the native image bridge.
- Use canonical image-history paths for Starred and delete actions so repaired historic cards remain fully manageable.

## Changed
- Automatically reconcile Studio Library records against live Swarm `ListImages` after a successful connection.
- Hydration now matches exact canonical paths first, then uniquely matching filenames, repairs stale records in place, preserves Studio folders/Favorites, and indexes Swarm generations missing from local Studio state.
- Native image cache is cleared after reconciliation so repaired cards are fetched again using their corrected path.

## Notes
- This archive contains only this changelog file for the current release.
