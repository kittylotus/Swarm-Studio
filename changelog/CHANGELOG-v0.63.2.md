# Swarm Studio v0.63.2

## Memory diagnostics

- Added a compact live **Memory debug** panel to Runtime Logs with a five-second sample cadence.
- Reports Chromium JS heap usage when WebView2 exposes it, native image-cache entries and payload bytes, pending native image fetches, tracked Blob URLs/bytes, mounted/native/lazy image counts, Library output count, and bounded log count.
- Tracks session peaks for JS heap and Studio-owned Blob payloads, with a **Reset peaks** control for before/after reproduction tests.
- Native image cache entries now retain their exact Blob byte sizes so diagnostics report real cached payload size rather than guessing from image dimensions.
- Clarifies in the panel that Task Manager RSS includes native WebView/GPU memory that page JavaScript cannot directly measure.

## Notes

- No intended generation, Library, model, CivitAI, or review-loop behavior changes.
- Keeps the v0.63.1 bounded native image-cache hotfix intact.
