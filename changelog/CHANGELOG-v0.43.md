# Swarm Studio v0.43.0

## Fixed
- Library history sync no longer stops at Swarm's per-call image history limit. Sync now walks the Swarm output folder tree incrementally and merges direct files from each folder, allowing archives larger than 1000 outputs to hydrate.
- Delete and Favorite actions now use Swarm's output-root-relative history path (`raw/...`) instead of the HTTP viewing path (`View/local/raw/...`).
- Synced outputs retain both a display/fetch path and the exact history mutation path returned by Swarm.
- Newly generated Studio outputs immediately store the correct mutation path as well.

## Changed
- History sync skips Swarm's `Starred/` mirror while crawling to avoid duplicate Library records.
- Sync progress reports folders walked and files found while the archive is being enumerated.

## Notes
- This archive contains only this changelog file for the current release.
