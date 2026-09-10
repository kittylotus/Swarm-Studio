# Swarm Studio v0.62.0

## Ephemeral review-before-save generation

- turns Swarm's `Do Not Save` generation parameter into a Studio approval workflow instead of treating returned data URLs like normal history files
- unsaved outputs are converted immediately from giant base64 strings into temporary Blob URLs and are never inserted into Library persistence
- adds an inline Create review card with Save to Swarm / Discard controls and batch navigation
- blocks another generation while ephemeral results are awaiting review, bounding browser memory to one review batch
- Save to Swarm uses Swarm's `AddImageToHistory` API to persist the approved image with its original generation parameters without rerunning inference
- Discard revokes the temporary Blob URL immediately and releases the result from Studio memory
- re-labels Swarm's advanced `Do Not Save` toggle as `Review before saving` inside Studio while keeping the same underlying server parameter
- disables history-recovery polling for intentional do-not-save generations, because no history entry should exist yet

## Validation

- `npx tsc --noEmit`
