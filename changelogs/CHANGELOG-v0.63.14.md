# Swarm Studio v0.63.14

## Improvements

- Expanded **Settings → Backends** with structured Comfy runtime controls for the exact knobs that kept mattering during the recent crash safari: **CUDA device override**, **disable dynamic VRAM**, **disable pinned memory**, and **disable async offload**.
- Added one-click Comfy runtime presets, including **Known-good: CUDA 0** and a diagnostic preset for deliberate crash-testing, so the current working workaround no longer lives only in user memory.
- Studio now parses those managed flags out of **ExtraArgs**, keeps unrelated CLI arguments intact, and rewrites the final command line safely when the backend policy form is saved.
- Added a clearer Comfy launch-path/runtime readout so the backend control room shows the active self-start script plus the effective managed runtime state at a glance.

## Why this matters

The backend control room already handled repo pinning, restart policy, and raw ExtraArgs, but the real-world recovery flow kept coming down to a few buried Comfy flags. This pass turns the known workaround knobs into first-class controls instead of making users spelunk through CLI syntax every time a backend regression decides to become sentient.
