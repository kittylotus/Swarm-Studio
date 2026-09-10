# Swarm Studio v0.38.0

## Fixed
- Force native desktop local connections through `127.0.0.1` whenever Studio is launching or auto-starting Swarm, so stale remote/Tailscale hosts no longer break local startup and connect.
- Remove the failing runtime `setIcon` call that was producing the Windows `os error 2` warning.
- Rebuild the app/PWA/Tauri icon set from the corrected moth SVG and replace the bundled icon assets.

## Changed
- Updated the public app mark to the corrected square moth/signal icon.

## Notes
- This archive contains only this changelog file for the current release.
