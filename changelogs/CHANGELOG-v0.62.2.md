# Swarm Studio v0.62.2

## Review-before-save compact pass

- shrinks the mobile review-before-save action buttons so the approval card stops eating the same chunk of space as before
- trims the mobile approval card padding and footer offset so the final output preview gets a little more breathing room
- swaps the temporary-result `Discard` action for `Regen`, which throws away the unsaved render and immediately reruns the same generation settings
- keeps the regenerated result in the same review-before-save flow instead of forcing you to save first or manually restart the generation
- updates the approval copy so the action language matches the new `Save / Regen` behavior

## Validation

- `npm run check --silent`
