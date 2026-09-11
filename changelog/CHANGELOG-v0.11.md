# v0.11 — layout + runtime pass

- Removed preset drag/drop and replaced cramped row actions with Apply + overflow controls.
- Wider desktop control rails and single-column advanced controls.
- Optional Swarm parameter groups now expose native-style enable switches when the server marks a group as toggleable. Disabled groups are omitted from generation requests.
- Final-image arrival no longer blocks Studio while waiting for Swarm's close handshake; socket cleanup continues in the background.
- Mobile final images remain centered/contained instead of jumping to the top when their aspect ratio does not fill the stage.
- Mobile header is sticky.
- Mobile navigation is hierarchical: Create → Generation/Output/Tune; Visuals → Identities/Models; Library; Settings → Logs/Connection/Remote/Appearance.
- Horizontal swipe cycles the active bottom context on mobile.
