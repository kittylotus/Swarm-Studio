# CivitAI facet enrichment semantics

- Separate local classification from optional CivitAI popularity/version enrichment in the installed LoRA facet UI.
- Rename the old "needs enrichment" facet to "CivitAI stats uncached" and migrate the saved legacy filter value automatically.
- Prioritize genuinely unclassified LoRAs for the primary enrichment action; existing tags remain immediately useful without a CivitAI match.
- Add a secondary bounded CivitAI stats lookup that prioritizes the current visible/filter result set.
- Report matched, unavailable, and error outcomes without implying that an unsuccessful CivitAI lookup erased or invalidated local classification.
