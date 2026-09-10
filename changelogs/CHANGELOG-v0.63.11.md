# Swarm Studio v0.63.11

## Request contract repair

- Stopped treating Swarm's base enum list as authority over extension-owned sampler/scheduler values. Unknown values such as custom `beta57` schedulers are preserved on the wire; only exact advertised spelling/case matches are canonicalized.
- Kept `swarm_version` stripping at the final generation boundary without rewriting unrelated generation options.
- Fixed Create requests to use Create sampler/scheduler state, while Inpaint now correctly uses its own sampling controls.
- Retained the model catalog returned by Swarm parameter refreshes and made `models.LoRA` the preferred authority for LoRA request values, with the LoRAs parameter list as a compatibility fallback.
- Refreshes after LoRA download, metadata edits, moves, and deletes now refresh the retained wire-value catalog too.

## Regression coverage

- Generation request contract now verifies extension-owned enum values survive normalization while transient metadata is stripped.
- LoRA request contract now verifies the live model catalog wins over stale parameter values and retains the fallback path for older servers.
