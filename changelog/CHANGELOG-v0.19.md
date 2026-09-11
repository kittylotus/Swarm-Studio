# Swarm Studio v0.19 — CivitAI deep browse + Swarm metadata proxy

## Fixed

- Compatible-only browsing now fills Studio pages by scanning larger upstream CivitAI batches instead of filtering only the first 24 global LoRAs.
- Pagination operates over the accumulated compatible result pool and continues scanning upstream pages as needed.
- Result counts now distinguish upstream models scanned from compatible models loaded.

## Changed

- CivitAI JSON lookups prefer SwarmUI's `ForwardMetadataRequest` API when the connected user has `edit_model_metadata`. This keeps provider transport on the Swarm host and falls back to Studio's metadata relay when unavailable.
- Direct downloads remain Swarm-owned, preserving SwarmUI's configured CivitAI authentication behavior.
