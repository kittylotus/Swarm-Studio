# v0.14 — init image, seed metadata, clue polish

- Fixes PWA `Use as init` double-relaying `/__swarm` image URLs.
- Keeps late generation metadata events alive after the foreground image resolves.
- Adds a short native finalization grace window, then closes the WebSocket in background.
- Resolves random seeds from generation metadata and falls back to reading Swarm's embedded PNG `parameters` metadata directly from the final file.
- Normalizes advanced-control clue pills beside the collapse arrow and before the group title.
- Mobile clue taps use the Studio toast surface; long URLs wrap instead of escaping the popover.
- Mobile context changes reset the document scroll so Output cannot inherit a deep Generation/Tune scroll position.
