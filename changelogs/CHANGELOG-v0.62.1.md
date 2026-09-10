# Swarm Studio v0.62.1

## Review-before-save polish

- moves `Review before saving` out of the advanced Swarm parameter drawer into its own `Output handling` control so it no longer hides in the prompting graveyard
- removes the underlying `Do Not Save` field from the advanced parameter browser and updates the advanced-count badge accordingly
- gives the output-handling row a dedicated Studio-style treatment and wires it directly to the real Swarm parameter without leaving stale `false` overrides behind
- tightens the approval card copy to `Keep this render?` with `Discard` / `Save` actions, and shortens the save button so mobile does not waste width on stacked text
- hides the extra explanatory approval text on mobile to reclaim space while keeping the desktop explanation intact
- adds paging controls only when multiple unsaved results exist, instead of always spending room on an `Unsaved` badge
- reworks the small `?` clue pills into actual circular help chips instead of the stretched sausage version

## Validation

- `npm run check --silent`
