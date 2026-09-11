# Swarm Studio v0.22

## CivitAI pager + preview repair

- Moves CivitAI Previous/Next controls into the sticky browser toolbar so pagination is always reachable without scrolling to the end of a long card grid.
- Keeps the existing cursor/nextPage pagination behavior; only the controls moved.
- Hydrates every visible CivitAI card that is missing preview media from the full model-detail endpoint instead of probing only the first eight missing cards.
- Detail preview hydration runs in small batches to avoid hammering CivitAI while still repairing the whole visible 24-card page.
- Failed detail probes remain retryable instead of permanently marking a card as resolved.
