# Swarm Studio v0.62.4

## CivitAI `.red` routing

- routes the built-in CivitAI LoRA browser through `civitai.red`, including search, checkpoint-family filtering, pagination, model-detail hydration, and version metadata
- pins CivitAI pagination back to `.red` even when an upstream `nextPage` URL points at another CivitAI root domain
- routes browser install-queue downloads and manual CivitAI URL downloads through `civitai.red`
- continues accepting pasted `civitai.com` links, but canonicalizes their model metadata/source and root download URLs to `civitai.red`
- changes CivitAI source links and URL placeholders in Studio to prefer `civitai.red`
- leaves CivitAI CDN/media hosts untouched so preview-image URLs continue using the host returned by the API

## Validation

- `npm run check --silent`
