# Swarm Studio

<img width="1918" height="1007" alt="image" src="https://github.com/user-attachments/assets/f50b6db4-6930-4f48-b500-3e30f114be94" />



Swarm Studio is a standalone PWA and Tauri creative client for SwarmUI. It provides a focused generation workspace, local library and inspector, LoRA management, CivitAI discovery/install tools, identity/preset workflows, inpainting, and runtime diagnostics without replacing SwarmUI as the generation backend.

## Start on Windows

Run:

```powershell
.\start.ps1
```

The launcher installs JavaScript dependencies when needed, creates/refreshes the desktop shortcut plus a separate **Swarm Studio - Emergency Stop** shortcut, and starts the Tauri desktop app in one PowerShell window. Normal launches do not modify Windows Firewall or open an elevated secondary shell.

If Windows Firewall genuinely blocks phone/LAN access to port 1420, run `.\start.ps1 -SetupFirewall` once from the project folder. That optional setup may request elevation; subsequent normal launches stay unelevated. For browser/PWA development, use `npm run dev`. The normal PowerShell runner keeps Tauri/Vite/Cargo output compact and records captured dev/backend output in `.swarm-studio-runner.log`; launch `.\start.ps1 -VerboseRunner` when you want the raw dev firehose live.

Browser/PWA Swarm traffic is relayed through Studio on port 1420. The relay now preserves the **configured local Swarm port**, so installations running on non-default ports such as `8801` no longer get silently redirected to `7801`; the relay still keeps its host fixed to the runner-configured backend host rather than accepting arbitrary browser-selected hosts.

If a Studio-owned Swarm/Comfy process tree starts crash-looping, use the **Swarm Studio - Emergency Stop** desktop shortcut or run `.\start.ps1 -EmergencyStop`. The panic path only acts on the PID recorded by Studio's managed launcher and refuses to kill a recycled PID that no longer looks like Swarm.

## Studio updates

Desktop Studio can update its own source checkout after the repository has been cloned once. A bounded startup check fetches the checkout's `origin` and shows a small **Update available** card only when the remote default branch is ahead. **Update & restart** refuses local edits, untracked files, or divergent history, fast-forwards with `git merge --ff-only`, then restarts through `start.ps1`; it never runs `git reset --hard` or `git clean`.

The same status and a manual **Check for updates** button live under **Settings → Backends**. If Studio owns the running Swarm process, it stops that process tree before the update so the old log pipes are not orphaned, then normal startup reconnects or relaunches it. ZIP-only copies without a `.git` checkout simply report that source updating is unavailable rather than attempting to overwrite themselves.

If a future release changes JavaScript dependencies, the detached updater asks the restarted runner to refresh them. Update diagnostics are written to `.swarm-studio-update.log`, which is intentionally ignored by Git.

## Current workflow

- **Create:** checkpoint/LoRA controls, presets, prompt editing, advanced Swarm parameters, live generation progress, and optional Review Before Save with a compact approve/regenerate/discard strip.
- **Library:** locally indexed Swarm outputs, search/filtering, Studio folders, Swarm date folders, batch actions, favorites, history sync, and a desktop right-docked Browse panel.
<img width="1915" height="1000" alt="image" src="https://github.com/user-attachments/assets/0ed882db-7e4f-4401-86e4-644956299af7" />
<img width="1916" height="1009" alt="image" src="https://github.com/user-attachments/assets/c53b5e8b-96ee-4127-a54a-947d845d61e7" />

- **Inspect:** prompt/model/seed/LoRA metadata, historical Swarm prep/generation timing when present, reuse/init/inpaint actions, and transient inspection of dropped Swarm PNG/JPEG files.
<img width="1341" height="956" alt="image" src="https://github.com/user-attachments/assets/73bd7856-231b-4f0f-830b-25b9f616b940" />


- **Models / LoRAs:** compatibility browsing, folder navigation, batch move/delete, metadata editing, hash-assisted CivitAI recovery, LoRA stack import/export, and saved stacks.
<img width="1918" height="1002" alt="image" src="https://github.com/user-attachments/assets/44d96872-b509-45d6-a158-6e1b60cddf2c" />


- **CivitAI:** search/detail/pagination and direct install through the `civitai.red` route, while still accepting copied `civitai.com` URLs as input.
<img width="1917" height="1005" alt="image" src="https://github.com/user-attachments/assets/6dbaa265-50ed-4175-875d-c5bb980f2ade" />
<img width="661" height="446" alt="image" src="https://github.com/user-attachments/assets/fe7f352d-5eb9-4309-93bd-ea6be24ff890" />


- **Inpaint:** mask editing and Swarm-backed edit generation.
<img width="1463" height="908" alt="image" src="https://github.com/user-attachments/assets/54fcb6e3-7afa-430f-9567-2993a990648f" />


- **Logs / Settings:** runtime and memory diagnostics, relay/origin configuration, appearance, desktop process controls, and a backend control room for Swarm/Comfy restart, disable, memory release, update policy, and local Git ref selection.
<img width="1918" height="1009" alt="image" src="https://github.com/user-attachments/assets/83777616-5429-40ff-94af-43fc88fed776" />
<img width="1919" height="1005" alt="image" src="https://github.com/user-attachments/assets/80c2d634-de02-40e4-ac1c-ebf4f2a81bce" />



## Backend control room

On desktop Studio, **Settings → Backends** can inspect the local SwarmUI and ComfyUI Git checkouts, fetch tags/recent commits, pin a tag/commit/remote branch, or return a repo to the latest fast-forward state of its origin default branch. Tracked local modifications block version changes; Studio does not run destructive `git reset --hard` or `git clean` operations. Pinning Swarm automatically disables its `src/bin/always_pull` launch marker, and the panel exposes that launch auto-pull policy directly so a pinned checkout cannot silently update itself on restart.

The same panel uses Swarm's backend controls to restart, disable/re-enable, or request RAM cleanup from the self-starting Comfy backend. **ExtraArgs**, **AutoUpdate**, and **AutoRestart** are editable there as well, and Studio now surfaces the runtime knobs that keep being relevant during Comfy archaeology: a structured **CUDA device override**, toggles for **disable dynamic VRAM**, **disable pinned memory**, and **disable async offload**, plus quick-fill presets like **Known-good: CUDA 0**. Studio preserves unrelated CLI args while owning those managed flags so you can stop retyping them by hand. Pinning Comfy automatically changes **AutoUpdate** to **Don't update** when needed so Swarm cannot undo the selected checkout during backend initialization. Source checkout changes are host-local and therefore disabled in the browser/PWA, while Swarm API backend controls can still work remotely when the account has permission.

## Persistence and metadata

Studio keeps its own lightweight UI/library state locally while Swarm remains authoritative for model files and generated output history. The persisted browser cache intentionally keeps only the newest 220 output records; on the first connected **Library** visit of a session, Studio automatically rehydrates that compact cache from Swarm history so large libraries do not appear truncated after restart. Manual **Sync Swarm History** remains available for an explicit refresh. Dropped images are inspected transiently and are not automatically added to the Library.

Swarm PNG `parameters` metadata and supported JPEG `UserComment` metadata are parsed locally. When available, Swarm timing fields such as `prep_time` and `generation_time` are surfaced in Inspect.

## CivitAI routing

Studio canonicalizes CivitAI model/API navigation through `https://civitai.red`. Existing `.com` URLs remain valid input and are normalized internally. Asset/CDN URLs returned by the service are left untouched.

## Development

```bash
npm install
npm run check
npm run preflight
npm run build
```

Desktop development/build commands:

```bash
npm run tauri:dev
npm run tauri:build
```

`npm run preflight` checks release/version invariants, changelog hygiene, the Tauri HTML5 drag/drop setting, CivitAI routing ownership, and retired pre-v1 UI paths.

## Repository hygiene

Generated builds, dependency folders, runtime logs, local recovery backups, editor state, and Tauri target output are ignored by Git. Source lockfiles are intentionally **not** ignored: after the first normal `npm install`, commit `package-lock.json`; after Cargo/Tauri resolves the Rust application, commit `src-tauri/Cargo.lock` as well. Those files make a known-good desktop build substantially easier to reproduce.

The repository enforces LF line endings for source files (including `start.ps1`) through `.gitattributes`, so Windows checkouts do not silently rewrite the editable tree to CRLF.
