# Swarm Studio v0.6 — relay + diagnostics pass

- Browser/PWA Swarm traffic is now unconditionally routed through Studio's `/__swarm` relay whenever the app is served on port 1420. The desktop-saved Swarm hostname no longer needs to resolve on the phone.
- Swarm image/model/output URLs follow the same relay rule.
- Single-user Swarm account `local` is treated as a legitimate account identity rather than an anonymous fallback.
- Server-settings permissions are shown separately from the `ListServerSettings` probe result.
- `ListServerSettings` failures are surfaced verbatim in Remote Access diagnostics.
- If the session reports `edit_server_settings`, Studio can attempt direct writes to `Network.Host` and `Network.AccessControlAllowOrigin` even when metadata discovery fails.
- Mobile bottom navigation no longer duplicates Library, and More is wired as a compact Logs/Settings sheet.
- The minimal built-in theme is genuinely monochrome, and several remaining fixed surface/text colors now derive from theme tokens.
- Cargo and Tauri package versions bumped to 0.6.0.
