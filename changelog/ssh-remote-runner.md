# SSH remote runner

## Summary

Turn the installed `studio` SSH shim into an interactive remote cockpit instead of a one-shot launcher only.

## What changed

- Added `studio runner` with non-blocking single-key controls:
  - `W` open/reopen the Tauri window
  - `R` restart only the Tauri window
  - `C` close only the Tauri window
  - `S` restart Swarm through the existing fixed host-control verb
  - `L` toggle the existing runner-log tail
  - `F` refresh status
  - `Q` detach without stopping Studio or Swarm
  - `X` request the local runner's existing stop-all action and detach
- Added a narrow temp-file command mailbox between the SSH helper and the already-running desktop runner. Only `W`, `R`, `C`, `S`, and `X` are accepted; no shell text or arbitrary command is evaluated.
- Added a separate desktop-child PID marker so SSH status can distinguish the persistent runner from the Tauri window.
- `studio start` now reopens the Tauri window when the persistent desktop runner is already alive, instead of reporting that Studio is merely already running.
- The SSH runner can tail `.swarm-studio-runner.log` without creating a second log pipeline.

## Validation

```text
npm run preflight
# PASS

npm run check
# PASS
```

Windows/OpenSSH remains the runtime gate for terminal key handling and the interactive-session command mailbox.
