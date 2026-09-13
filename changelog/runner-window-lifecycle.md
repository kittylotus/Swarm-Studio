# Runner window lifecycle fix

## Summary

Fix the runner's `C` (close Studio) and `R` (restart Studio) actions so they manage the actual Tauri window process instead of recursively killing the bootstrap process tree.

## What changed

- Native Tauri now publishes its real process ID through `SWARM_STUDIO_DESKTOP_PID_FILE`.
- The runner treats that native PID as the desktop-window authority.
- `C` kills only the native Studio window process; it does not recursively terminate the Vite dev server or Studio-owned Swarm backend.
- `R` refuses to relaunch if the current window did not stop cleanly.
- When the Vite server on port 1420 is still alive, `W`/`R` reopen the already-built debug Tauri shell directly instead of launching another `tauri dev` stack and colliding with the existing port.
- `X` remains the explicit stop-everything action and cleans the backend plus any remaining Studio Vite launcher/server.
- SSH runner status text is ASCII-clean to avoid the `Â·` mojibake seen in Windows PowerShell over Termux/SSH.

## Validation

```text
npm run check
# PASS

npm run preflight
# PASS

node tests/host-control-contract.mjs
# Host control contract OK
```

Cargo/Windows process behavior cannot be executed in this Linux sandbox, so the real Windows runner remains the runtime gate for PID publication, direct debug-shell reopening, and task termination semantics.
