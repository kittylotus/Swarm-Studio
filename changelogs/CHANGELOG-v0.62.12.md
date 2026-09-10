# Swarm Studio v0.62.12

## Review workflow polish

- Replaced the mobile prompt-covering Review Before Save card and desktop image overlay with one shared compact review strip.
- The strip now sits directly below the output image and above the editable prompt controls, keeping positive and negative prompts accessible before Regen.
- Removed the large review header/copy treatment in favor of a small `Unsaved` state indicator and compact Discard, Regen, and Save buttons.
- Kept multi-result review navigation inline with the compact strip.
- Regen continues to use the current Create state, including prompt edits made while the pending render is being reviewed.

## Notes

- Keeps the v0.62.11 Library-scoped Browse behavior and all previous v0.62.x workflow fixes intact.
