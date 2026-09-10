# Swarm Studio v0.9 — metadata + seed repair pass

- Civitai downloads now resolve model/version metadata before download and show a Swarm-style preview card with cover, base model, author, tags, and trigger phrases.
- LoRA downloads use Civitai `baseModel` as the compatibility authority and map it to a live Swarm LoRA architecture ID where possible, instead of guessing from titles.
- After download, Studio reconciles the indexed LoRA with Swarm metadata and, when the connected account has `edit_model_metadata`, repairs an incorrect architecture and writes the preview/title/author/triggers/tags through `EditModelMetadata`.
- Metadata objects returned directly by Swarm are now serialized rather than discarded. This fixes seed extraction on servers that do not stringify generation/history metadata.
- Latest-seed reuse now targets the actual latest output. If its seed is unresolved, Studio queries Swarm history on demand and patches the local output record before toggling the draft seed.
- Random generations also perform a post-save seed-resolution pass so the resolved seed is usually ready before the user taps the shortcut.
- LoRA search keeps the full compatible library in the DOM; clearing or changing a query immediately restores/re-filters cards without leaving and reopening the tab.
