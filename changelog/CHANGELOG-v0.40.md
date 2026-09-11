# Swarm Studio v0.40.0

## Fixed
- Route Swarm-backed images through the native Tauri HTTP bridge on desktop instead of letting WebView2 fetch them directly.
- Lazy-load bridged Library thumbnails near the viewport and reuse in-flight/cached image payloads to avoid duplicate native fetches.
- Apply the same native image bridge to the Create output stage, generation mini-monitor, Library inspector, LoRA stack thumbnails, model cards, and model metadata views.
- Resolve the Create stage's latest image from its current Swarm path instead of trusting a stale persisted URL.

## Notes
- Browser/PWA image behavior is unchanged.
- This archive contains only this changelog file for the current release.
