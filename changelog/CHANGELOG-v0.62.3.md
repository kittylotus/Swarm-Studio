# Swarm Studio v0.62.3

## Review-before-save loop controls

- adds a dedicated `Discard` action next to `Regen` and `Save` so you can bail out of the review loop without rerunning or saving
- changes `Regen` to use the **current Create tab state** instead of the frozen approval snapshot, so prompt edits, negative changes, preset removals, steps, orientation, and other live tweaks all carry into the reroll
- keeps the regenerated output inside the same review-before-save flow after the rerun finishes
- updates the review copy to explain the new `Discard / Regen / Save` behavior
- expands the mobile approval footer layout to fit all three actions cleanly without going back to the giant-button problem

## Validation

- `npm run check --silent`
