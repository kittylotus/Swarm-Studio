# Swarm Studio v0.62.6

## Added

- Added hash-based CivitAI metadata recovery for installed LoRAs. When a LoRA has no usable CivitAI URL, Studio now asks SwarmUI for the model hash and resolves the matching CivitAI model version automatically.
- Added hash fallback when an existing stored CivitAI URL is stale or fails, so metadata repair can still recover title, creator, triggers, tags, architecture mapping, description, version notes, preview, and a canonical `.red` source URL. Hash lookup is `.red`-first with a `.com` metadata compatibility fallback while keeping resolved links canonicalized to `.red`.
- Added **Delete** to LoRA batch organization with a dedicated destructive confirmation modal and multi-file deletion through SwarmUI.

## Fixed

- Fixed the main **Generate image** button being visually rebuilt as available while a Review Before Save result was still pending. It now remains disabled, dimmed, and labeled **Review pending** across normal Create re-renders until the approval loop is resolved.
- Batch deletion now removes successfully deleted LoRAs from the active Create stack and leaves failed deletions selected for easy retry.

## Visuals

- Added an explanatory hash-fallback hint to the LoRA metadata editor while keeping the CivitAI URL field available as an explicit override.
- Reflowed the mobile LoRA organizer rail into a compact 2×2 action grid now that **Delete** joins Select visible, Clear, and Move to folder.
