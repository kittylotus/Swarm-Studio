# Swarm Studio v0.4 — usability pass

## Workspace

- Tall and portrait outputs now fit inside the center stage without cropping.
- Models and LoRAs share the same model/stack composer used by Create on desktop.
- Preset stacks support drag-and-drop reordering while keeping arrow controls as a fallback.
- The prompt-syntax palette has an explicit close control.

## Mobile

- Persistent bottom navigation splits Create into Generation, Output, and Tune surfaces.
- Library folders collapse into a native details panel.
- Identities expose a top-right create action and a mobile editor sheet.
- The desktop composer is hidden from the Models inventory on narrow screens.

## Network and launch

- Settings can read and update Swarm's server settings when the connected account exposes the admin APIs.
- LAN and Tailscale Studio origins can be saved as presets and selected as the active CORS origin.
- Host binding can be switched between localhost and `0.0.0.0` from Studio.
- `start.ps1` installs dependencies when needed, creates a desktop shortcut, starts the desktop client, and exposes the same development surface on port 1420 for mobile.

## Appearance

- Theme modal for accent, glow, background, panel, text, muted text, radius, and surface opacity.
- Theme values persist locally and apply immediately.

## Build

- Added the missing Tokio runtime dependency required by native WebSocket timeout handling.
- Persisted state schema is now v4 with automatic migration from v1–v3.
