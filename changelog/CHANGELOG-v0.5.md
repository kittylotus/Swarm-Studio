# v0.5 — usable remote + library pass

## Connection and remote access

- Added Swarm auth-token support to desktop HTTP, WebSocket generation, and server-settings calls.
- Connection diagnostics now expose the detected Swarm account and server-settings permissions.
- Added the `:1420` same-origin Studio relay for browser/PWA HTTP and WebSocket calls to local Swarm.
- Swarm image and model-preview URLs are relayed too, so phone clients no longer try to load `127.0.0.1:7801` on the phone itself.
- Same-host `PC_IP:7801` values are also folded through the relay when Studio is open on `PC_IP:1420`.
- `start.ps1` can create the Windows Firewall rule for port 1420 automatically on first run.
- Renamed the settings surface to simply **Remote Access**; direct CORS/host editing is now an advanced fallback instead of the default workflow.

## Settings and appearance

- Settings now has a sticky Connection / Remote Access / Appearance sidebar instead of a theme modal below a giant settings page.
- Clicking the top-right gear while already in Settings returns to the previous Studio section.
- Theme controls now drive the actual accent, outlines, focus states, gradients, controls, and shape tokens.
- Added Studio, Mint terminal, Bubbly McBubbles, and Don't touch me built-in profiles.
- Added custom theme profile save/load/delete.
- Added independent panel radius, control/button radius, outline strength, and surface opacity.
- Launcher arguments now accept ordinary one-line shell syntax such as `--launch_mode none`.

## Presets and LoRAs

- Replaced fragile native HTML drag/drop with SortableJS, including touch handles and animation.
- Added search across matching LoRA names, authors, descriptions, tags, and trigger phrases.
- Added a LoRA downloader modal for Civitai and Hugging Face.
- Civitai downloads resolve the model version and pass title, description, author, tags, trigger phrase, source, and (desktop) preview metadata to Swarm's downloader.
- The LoRA inventory refreshes immediately after a successful download.

## Native/runtime

- Tokio remains explicitly declared in Cargo.toml.
- Auth cookies are attached to native WebSocket handshakes.
- Successful WebSocket runs now wait briefly for the close handshake instead of dropping the socket immediately.
