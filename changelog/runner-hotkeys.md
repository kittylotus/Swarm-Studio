# Runner keyboard controls

## Summary

Keep the PowerShell runner alive when the Tauri desktop shell exits and add single-key lifecycle controls.

### Controls

- `W` — open/reopen the Tauri desktop shell.
- `R` — restart the tracked desktop shell process tree.
- `C` — stop the tracked desktop shell process tree (Ctrl+C-style runner action).
- `S` — restart Swarm through the existing fixed host-control helper.
- `Q` — quit the runner once the desktop shell is already closed; backend processes are left alone.
- `X` — stop the tracked desktop shell, stop Studio-owned Swarm/Comfy, and quit.

## Architecture

The main `start.ps1` process is now the persistent control console. It launches the existing `npm run tauri:dev` stream through an internal `-DesktopChild` mode in a child PowerShell process that shares the same console.

Closing the Tauri window can therefore end the desktop child without ending the runner. The runner reports the exit and waits for `W` to launch a fresh desktop shell.

The internal child never overwrites the host-readable runner PID file, and the Swarm restart action reuses `scripts/host-control.ps1` rather than creating another shell-control path.

## Validation

```text
npm run preflight
# PASS

npm run check
# PASS
```

Windows remains the runtime gate for actual console-key handling and `Start-Process -NoNewWindow` behavior.
