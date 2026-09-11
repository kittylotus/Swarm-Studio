# Swarm Studio v0.63.17

## Studio updater

- Added a desktop source updater for Git checkouts. Studio now performs one bounded startup fetch and shows a compact update popup when `origin/<default branch>` is ahead.
- Added **Update & restart**: the native updater requires a clean, fast-forwardable checkout, refuses divergent history, updates with `git merge --ff-only`, and relaunches through `start.ps1` without asking the user to open a terminal.
- Added a persistent updater status card under **Settings → Backends** with manual **Check for updates** and update controls.
- The update popup includes the current/remote version plus a few incoming commit subjects, and **Later** dismisses it for the current Studio session.

## Safety and restart handling

- Studio blocks self-update while generation, inpaint, or unsaved review work is active.
- If Studio owns Swarm, it stops the managed Swarm/Comfy process tree before self-update so old stdout/stderr pipes are not stranded across the restart.
- ZIP-only copies without a `.git` checkout are detected and left untouched; source updating is only enabled for a real Git checkout.
- Git operations disable terminal prompting and never use `reset --hard` or `git clean`.
- The detached Windows updater writes `.swarm-studio-update.log`, waits for the running Studio/Tauri process to exit, fast-forwards the repo, refreshes JavaScript dependencies only when dependency metadata changed, then restarts Studio.
- `start.ps1` now exports `SWARM_STUDIO_ROOT` for reliable checkout discovery and accepts the internal `-RefreshDependencies` handoff used by the updater.

## Tests

- Added a self-contained updater contract test with a temporary bare remote and mock Studio checkout. It verifies update detection, fast-forward eligibility, tracked-edit blocking, and exact landing on `origin/main`.
