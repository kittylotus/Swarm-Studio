# Swarm Studio v0.21

## CivitAI browser reliability pass

- Follow CivitAI's returned `metadata.nextPage` / cursor instead of inventing page numbers. Text searches no longer combine `query` with the rejected `page` parameter.
- Send supported checkpoint-family filters directly to CivitAI with `baseModels` where Studio has a confident mapping (including Anima), producing full compatible pages before client-side fallback filtering.
- Added **Show +18** browsing toggle.
- Added one-shot detail hydration for visible cards whose list response omitted preview images.
- Pagination controls are now sticky and remain reachable in tall desktop/mobile result pages.
- Next/Previous use already-loaded 24-card slices immediately and only fetch another upstream cursor page when needed.
- Dark/native select styling keeps period/sort dropdown options readable.
