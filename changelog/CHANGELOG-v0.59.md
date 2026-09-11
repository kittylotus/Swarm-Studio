# Swarm Studio v0.59.0

## Fixed
- CivitAI queued installs no longer rerender the full browser when the queue appears, advances, finishes, or disappears; queue rows and install buttons update in place so the current scroll position stays put.
- queued CivitAI downloads no longer trigger the generic LoRA downloader rerenders during start/completion.
- LoRA batch actions are rendered at the app root and fixed to the viewport again, matching the Library selection rail on desktop and mobile.
- LoRA batch mode reserves bottom runway so the fixed action rail cannot cover the final cards.

## Added
- Installed LoRA metadata editor now has a CivitAI source field and **Pull from CivitAI** action. Studio hydrates title, author, description, usage notes, architecture, triggers, tags, date, and preview from the selected CivitAI version before you save it back to Swarm.
- Added an **Orphaned LoRAs** pseudo-checkpoint/library view. It shows LoRAs that do not match any installed checkpoint according to Swarm metadata/family compatibility, while preserving folder browsing, search, batch select, and move actions.
- Models summary now reports the orphaned LoRA count directly.
