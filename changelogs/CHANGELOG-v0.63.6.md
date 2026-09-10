# Swarm Studio v0.63.6

## Backend control room

- Added a Settings → Connection backend control room for SwarmUI and Swarm-managed self-starting ComfyUI backends.
- Shows local Git checkout/ref information and offers safe **Fetch refs**, **Pin ref**, and **Latest** controls on desktop Studio. Version changes refuse tracked local modifications and never use destructive reset/clean operations.
- Added direct Swarm launch auto-pull control. Pinning Swarm automatically removes its `src/bin/always_pull` marker so `launch-windows.bat` cannot immediately undo the selected version on restart.
- Pinning Comfy automatically changes the self-start backend's **AutoUpdate** policy to **Don't update** when necessary, so the selected checkout survives backend restart.
- Added Studio-owned Swarm restart plus Comfy **Restart**, **Stop / Start**, and **Free RAM** controls using Swarm's backend API. Disabling Comfy prevents AutoRestart from immediately resurrecting a crashing backend.
- Added editable Comfy **ExtraArgs**, **AutoUpdate**, and **AutoRestart** policy controls with Save & re-init.
- Surfaces a warning when the temporary `--disable-dynamic-vram` diagnostic flag is still present.

## Runner panic controls

- Added `.\start.ps1 -EmergencyStop` and a **Swarm Studio - Emergency Stop** desktop shortcut. The panic path reads Studio's recorded owned Swarm PID, verifies it still looks like the Swarm launcher, then kills that process tree (including child Comfy/Python) without touching unrelated processes.
- Studio's native managed launcher now records/clears the owned Swarm PID for the runner panic path.
- The runner exports its log path to the native shell, so captured Swarm backend stdout/stderr is appended directly to `.swarm-studio-runner.log`.
- Routed npm/Tauri startup through a redirected `cmd.exe` handle so nested development output has a better chance of reaching the forensic log instead of bypassing PowerShell's pipeline.

## Runtime hardening

- Throttled managed-process status refreshes triggered by Swarm stdout/stderr instead of making one Tauri IPC status call per backend log line.
- Stopped duplicating routine Swarm info chatter into Chromium's developer console; warnings/errors still surface there and all entries remain available in Studio Logs.

## Diagnostic note

- The `--disable-dynamic-vram` A/B test is not treated as a fix. The supplied crash trace still shows ComfyUI terminating with a Windows access violation while reading checkpoint storage; this release adds recovery/control tooling rather than claiming to repair that backend failure.
