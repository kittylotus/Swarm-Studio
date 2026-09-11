# Swarm Studio v0.62.8

## Create / review workflow

- On mobile, Review Before Save approval now appears over the positive/negative prompt area instead of covering the generated image.
- The desktop approval strip remains attached to the output stage.

## LoRA workflow

- Added **Export** beside LoRA stack Import. Exports use Studio's existing `swarm_studio_lora_stack` JSON format and round-trip through the current importer.
- Added an explicit **Create folder** destination helper to the LoRA Move modal. The staged path is created by Swarm when the selected LoRAs are moved into it.

## Library Browse

- Fixed Swarm date-folder selections jumping the Browse modal back to the top by preserving its internal scroll position across filter rerenders.
- Added a desktop **Dock right** mode for Browse. Docked Browse becomes a non-modal right rail so the Library remains interactive behind it; the preference is remembered locally.

## Inspect

- Image files can now be dragged and dropped anywhere onto Studio. PNGs containing Swarm generation metadata open directly in Inspect without being added to the persistent Library.
- Inspect now shows **Total time**, **Prepping**, and **Generating** timing facts for generations observed by Studio.
- Generation timing is persisted on new normal outputs and Review Before Save outputs after approval.
