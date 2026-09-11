# Regional prompting — signed spacing & freeform geometry

- Replaces the preset-only `Gutter` value with signed `Region spacing` from -20% to +20%.
  - Positive values leave unclaimed gaps between preset regions.
  - Negative values expand neighboring preset regions into an intentional overlap zone.
  - Existing gutter-only drafts migrate automatically to the positive spacing value.
- Adds direct manipulation to the region preview:
  - drag a region to move it;
  - drag resize handles to change its bounds;
  - coordinates stay normalized and clamped inside the canvas;
  - manual edits mark the geometry as custom, while choosing a preset or changing spacing reapplies deterministic preset geometry.
- Visualizes actual overlap areas in the preview and keeps unclaimed canvas visible for gap/background authoring.
- Removes the `Split the prompt, not your patience.` subtitle in favor of the neutral `Region editor` title.
- Fixes the mobile region editor flow after preset selection by switching the constrained desktop two-pane grid to normal stacked block flow on narrow screens. Prompt cards can no longer paint over the layout/preview panel when preset content appears.
- Mobile freeform editing uses larger corner resize handles and hides the four side handles to avoid a tiny-handle pileup. Hidden handles no longer intercept pointer input before a region is selected.
