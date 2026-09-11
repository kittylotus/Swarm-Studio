# Swarm Studio v0.63.8

## Settings polish

- Replaced the mostly explanatory **Remote Access** settings tab with a dedicated **Backends** tab for the SwarmUI / ComfyUI control room.
- Moved the useful direct browser-to-Swarm origin / host controls into a compact **Remote / browser access** advanced section under Connection.
- Existing persisted `settingsPane: "remote"` state now migrates safely to Connection.
- Settings rerenders now preserve the current scroll position, so backend refreshes, policy saves, version actions, and other state updates no longer jump the page back to the top. Intentional tab changes on mobile still reset normally.
- Removed the now-dead Remote Access guide / relay diagram CSS.

## Preserved

- Backend version pinning, update-policy safety, Comfy start/stop/restart/free-RAM controls, Emergency Stop runner tooling, memory diagnostics, and the v0.63.7 EditBackend contract fix remain unchanged.
