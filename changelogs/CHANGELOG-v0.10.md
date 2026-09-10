# v0.10 — Presets and persistence

- Fixed quota exhaustion from bulky local state. Embedded init-image data is session-only, oversized request values are stripped from persistence, old v5 storage is removed before migration, and quota errors degrade gracefully instead of escaping input handlers and freezing the app.
- Added first-class Swarm preset creation through `AddNewPreset` with a Studio modal for selecting exactly which current values are saved.
- Prompt and negative-prompt preset values use `{value}` composition so saved presets remain stack-friendly.
- LoRA stacks are selectable in the preset editor and save both `loras` and `loraweights`.
- Added preset editing/deletion through Swarm itself, plus Apply actions that materialize a preset into the current prompt/model/core controls/LoRA stack/advanced values and remove that preset from the active syntax stack.
- Added an edit action for the currently selected preset without requiring it to be active first.
- Reworked preset drag-and-drop to persist the DOM order on Sortable `onEnd` rather than rerendering during Sortable's update phase; touch dragging uses a short handle delay and arrow controls remain available.
- Advanced Swarm parameters are now grouped using the server-provided parameter groups, with descriptions and override indicators.
- Refiner controls are promoted inside their group; if Swarm does not provide explicit Refiner Model choices, Studio falls back to the connected checkpoint inventory so selecting a refiner is actually possible.
