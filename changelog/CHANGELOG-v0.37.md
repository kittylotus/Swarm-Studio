# Swarm Studio v0.37.0

## Runtime repair, round two

- Desktop `local` mode now always talks to Swarm over loopback (`127.0.0.1`) while preserving the configured scheme, port, and path. A stale Tailscale/LAN address can no longer make a locally launched Swarm look offline.
- Connect and Auto-start probe the effective local endpoint, launch when it is absent, and poll the session API until Swarm is ready.
- Managed Windows launch now understands PowerShell functions and aliases in addition to `.bat`, `.cmd`, `.ps1`, `.exe`, and normal paths.
- When no launcher command is configured, Studio attempts a conservative SwarmUI launcher discovery from the configured working directory, Swarm environment variables, common user folders, and common Windows install roots before asking for a command.
- Existing library/history records no longer trust stale persisted `/raw/...` URLs. Any output with a Swarm path rebuilds its image URL through the currently active Swarm client, and relative legacy URLs are normalized the same way.
- Output inspector, library cards, PNG metadata reads, init-image reuse, and generation-derived image reads now share that normalized output URL path.

## Icon pipeline

- Replaced the approximated moth with the supplied vector path geometry.
- Applied Studio's pink/purple/cyan accent gradient while keeping the dark icon field.
- Regenerated PWA PNGs plus Tauri PNG/ICO/ICNS assets from the same SVG source.
- Desktop Tauri now also sets the live window icon at runtime, helping Windows/Tauri dev sessions escape stale taskbar icon caching.
- Fixed the HTML favicon reference to use the real SVG asset.
