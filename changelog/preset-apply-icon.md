# Preset stack — restore Apply action

- Restores the preset stack’s explicit Apply action as a compact icon beside Edit.
- Apply uses the existing `applyPresetFromStack()` path, expanding the selected Swarm preset into the prompt and saved controls, then removing that preset token from the active stack.
- Keeps Edit and Remove unchanged.
- Adds a composer contract guard so the action cannot silently disappear during future UI cleanup.
