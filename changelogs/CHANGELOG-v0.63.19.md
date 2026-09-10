# Swarm Studio v0.63.19

## Composer hierarchy pass

- Simplified the checkpoint area to a single metadata-name dropdown with a compact model-family pill instead of repeating the selected checkpoint below it.
- Raised the resolution controls into a dedicated bordered surface so width, height, link state, sizing sliders, and aspect-ratio controls read as one coherent unit.

## LoRA stack semantics

- Moved saved-stack selection to the top of the LoRA section where it belongs semantically: selecting a saved stack now loads it immediately without a separate **Load** button.
- Moved **Add LoRA** below the current stack into a collapsible placeholder card, so adding an item no longer visually interrupts the stack itself.
- Normal LoRA rows now show only the metadata display name plus a compact author/family line. Raw filenames and fake drag handles are gone from the composer.
- Reorder handles remain exclusively inside the actual drag-and-drop reorder modal.

## Regression guard

- Added a composer UI contract test covering checkpoint deduplication, stack-level LoRA loading, Add LoRA placement, metadata-only row presentation, and the raised resolution surface.
