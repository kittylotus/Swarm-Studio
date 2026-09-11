# Regional preset gutter

- Adds a 0–20% Gutter control to preset regional layouts.
- Gutter space is created by insetting only shared internal edges, preserving the outer canvas boundary.
- Left/right and top/bottom layouts get one unclaimed strip; three-column/row layouts get two; 2×2 gets a cross-shaped gap.
- Existing drafts default to 0% gutter for backward compatibility.
- Gutter changes update the visual preview and compiled Swarm region coordinates live; no new Swarm syntax is introduced.
- Freeform drag/resize remains out of scope for this patch.
