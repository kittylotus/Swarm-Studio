# Swarm Studio v0.42.0

## Library sync
- Removed automatic Swarm-history reconciliation from the connection/startup path. Studio now connects and becomes usable without trying to repair the entire historical Library.
- Renamed the Library action to **Sync Swarm history** and made that button the explicit trigger for legacy path repair and history hydration.
- Reworked history reconciliation into small UI-yielding chunks with live Matching/Repairing progress on the sync button.
- History matching and legacy path repair now mutate an in-memory working set and persist once at the end instead of serializing the entire Library to localStorage for every repaired output.
- Library thumbnails are rerendered and the native image cache is invalidated only after reconciliation completes, avoiding an image-fetch/decode storm during the repair pass.

## Notes
- Existing Studio folders and Favorites remain attached to matched records.
- Only this changelog is included in the replacement archive.
