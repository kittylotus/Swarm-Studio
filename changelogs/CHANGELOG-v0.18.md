# Swarm Studio v0.18 — CivitAI browser + metadata editor

## Added

- Dedicated CivitAI LoRA browser with search, sorting, period filters, pagination, previews, checkpoint-family compatibility filtering, and version details.
- Mobile Visuals navigation now exposes **Identities / Models / CivitAI**.
- Direct CivitAI installation into SwarmUI using the existing server-side model download pipeline.
- Direct-install metadata preview with CivitAI base model, mapped Swarm family/architecture, file details, triggers, description, and preview image.
- Installed LoRA metadata editor with preview replacement.

## Kept

- The existing manual CivitAI/Hugging Face URL downloader remains available and shares the same post-install refresh and metadata-repair path.

## Notes

Studio queries CivitAI's public REST API for discovery only. Model bytes are downloaded by SwarmUI itself, so remote/PWA clients do not transfer model files through the phone/browser.
