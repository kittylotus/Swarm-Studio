# Swarm Studio v0.63.12

## Fixes

- Restored LoRA generation serialization to the proven Swarm contract: resolve each saved stack item against the live `ListModels("LoRA")` inventory and send that exact server model name, including its current folder path and filename extension.
- Legacy leaf-only LoRA stack entries now follow uniquely moved files into folders; ambiguous duplicate leaves fail safely instead of selecting an arbitrary model.
- Removed `ListT2IParams.models` as a competing LoRA wire-value authority. Swarm itself owns LoRA filename cleanup and request validation.
- Added bounded post-connect parameter hydration so a self-starting Comfy backend can publish extension samplers/schedulers after Swarm has already accepted the Studio session.
- Added a generation-time capability catch-up only when the selected sampler or scheduler is not yet advertised. This replaces the need to manually press Connect after backend startup without restoring permanent connection polling.
- Preserved extension-owned sampler/scheduler values unchanged if capability metadata still cannot prove them invalid.

## Tests

- Reworked the LoRA request contract around a minimal live Swarm inventory, including moved-folder repair, Windows separators, extensionless saved values, root models, missing models, and duplicate-leaf ambiguity.
- Preflight now guards both the live-model LoRA authority and the bounded/non-permanent parameter hydration behavior.
