# Swarm Studio v0.39.0

## Fixed
- Native/Tauri Studio now always uses loopback (`127.0.0.1`) for Swarm transport. Persisted LAN/Tailscale hosts can no longer hijack desktop startup, connection, or output image URLs.
- Auto-start local Swarm now runs on native desktop even when an older saved connection mode was `remote`.
- The desktop Connect action now probes loopback and launches Swarm when it is unavailable instead of only trying the stale configured host.
- Native connection settings migrate back to Local + loopback so the UI and persisted state match actual desktop transport.
- System launch mode with no explicit PowerShell function/launcher now falls back to managed Swarm launcher discovery instead of immediately failing.

## Notes
- Remote/LAN/Tailscale access remains a browser/PWA relay concern; native desktop is intentionally local-hosted.
- This archive contains only this release changelog.
