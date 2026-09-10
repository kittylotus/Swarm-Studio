# Swarm Studio v0.63.15

## Repository readiness

- Expanded `.gitignore` to cover dependency/build output, Tauri targets, Studio runtime logs, PID/shortcut debris, local wrench backups, environment files, test artifacts, editor state, and common Windows/macOS junk while deliberately keeping package lockfiles trackable.
- Added `.gitattributes` with explicit LF rules for the editable source surface, including PowerShell, to keep Windows checkouts from silently introducing CRLF churn.
- Removed the shipped `.wrench-backups` fossil tree and the internal `PRE_V1_CLEANUP_MANIFEST.txt` reconstruction note from the public-ready source tree.
- Updated preflight traversal to ignore local/build artifact directories and added Git-hygiene invariants for the critical ignore/line-ending rules.
- Documented lockfile expectations: commit `package-lock.json` after the first normal npm install and `src-tauri/Cargo.lock` after Cargo/Tauri resolves the desktop application.

## Behavior

No intentional application behavior changes. This is a source/repository hygiene pass so the current tree can become the first Git baseline without committing local archaeology alongside it.
