# Swarm Studio v0.63.7

## Fixes

- Fixed Settings → Backend control room policy saves failing with SwarmUI `EditBackend: Missing settings.`
- Matched SwarmUI's real browser/API contract: backend `settings` are now sent as a top-level request field so Swarm's generic binder places them into its internal `raw_inp` object correctly.
- Backend policy edits now refresh the current backend first and merge only Studio's intended changes, preserving unrelated Swarm/Comfy backend settings.
- Comfy version pinning keeps the safe order: disable backend → disable AutoUpdate → switch checkout → re-enable backend.
- Added release preflight guards against reintroducing the incorrect nested `raw_inp: { settings }` request shape.

## Notes

- Keeps the v0.63.6 backend control room, emergency-stop runner, native runner logging, memory diagnostics, and all previous pre-v1 cleanup behavior intact.
