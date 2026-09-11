# Local CivitAI facets

- Promotes installed LoRA tags from invisible search metadata into local tag, creator, family, and metadata-state facets.
- Adds local sorting by name, creator, tag count, cached CivitAI downloads/rating, and CivitAI creation date.
- Adds an explicit, bounded metadata enrichment action: up to 24 LoRAs per pass with three concurrent hash lookups, cached locally instead of hammering CivitAI whenever Models opens.
- Enrichment starts from Swarm's own model hash, resolves the CivitAI version/model, and caches tags, creator, base family, popularity/rating stats, and source IDs. Unmatched/error entries remain visible and retry on shorter lifetimes.
- Tag selection is OR within the Tags facet and AND across creator/family/metadata facets.
- Adds local counts for tags and enrichment state plus a mobile filter sheet so dense facet controls do not crush the LoRA card grid.
- Existing Swarm tags work immediately even when no CivitAI lookup has ever been run; unmatched LoRAs never disappear from the library.
