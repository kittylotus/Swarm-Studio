# Resolution orientation + seed alignment

- Preserve the current portrait/landscape orientation when applying ratio presets instead of forcing portrait-oriented presets every time.
- Reverse ratio now swaps the actual width and height exactly, so `768 × 960` becomes `960 × 768`.
- Removed duplicate ratio/reverse event bindings that made the reverse action fire twice and visually flicker back to its starting state.
- Keep ratio orientation metadata in sync when width/height are edited manually while unlocked.
- Keep the Seed random/last-seed toggle visually attached to the label without letting its height push the Seed input below Steps and CFG.
- Added an executable resolution geometry regression contract.
