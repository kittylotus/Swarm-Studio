# Swarm Studio v0.63.18

## Create / composer cleanup

- Simplified the checkpoint card into a lighter metadata readout so the selected model is still visible without eating vertical space.
- Reworked the preset stack flow: choosing a preset in the dropdown now adds it straight to the stack, each row gets direct **edit** and **remove** icon actions, and common actions live in a cleaner footer.
- Added a dedicated **Reorder** flow for presets so the main composer stops looking like a tiny crime scene.

## LoRA stack cleanup

- Refreshed the LoRA stack rows with cleaner icon actions, lighter metadata, and direct enable/disable toggles without the old up/down button clutter.
- Promoted **import**, **export**, and **save stack** into compact header actions and split saved-stack loading / common actions into clearer rows.
- Added a dedicated **Reorder LoRA stack** action.

## Reorder modal

- Added drag-and-drop reorder modals for both preset stacks and LoRA stacks.
- Dropping an item rewrites the live stack order immediately, so the modal acts like a proper positioning surface instead of fake ceremony.

## Resolution controls

- The width/height link toggle now has distinct linked and unlinked behavior.
- When linked, the composer shows one shared size slider that preserves the selected aspect ratio.
- When unlinked, the shared slider splits into independent width and height sliders so unlinking actually does something useful.

## Small UI polish

- Tightened seed field alignment, kept advanced clue pills circular, and added SVG-based iconography across the refreshed stack controls for a cleaner overall composer.
