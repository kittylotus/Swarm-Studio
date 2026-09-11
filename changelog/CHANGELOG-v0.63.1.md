# Swarm Studio v0.63.1

## Memory hotfix

- Reworked the native/Tauri image bridge so Swarm thumbnails are no longer retained forever as full base64 data URLs.
- Native image responses are converted to short-lived Blob object URLs immediately, removing the long base64 strings from the JavaScript heap.
- Added a bounded 48-entry LRU-style native image cache and explicit Blob URL revocation on eviction/clear.
- Lazy Library/model thumbnails are unloaded after leaving the extended viewport and rehydrated when needed instead of leaving every scrolled image decoded in the WebView.
- Disconnects the native image IntersectionObserver before full app rerenders so detached image nodes cannot remain observed across UI rebuilds.

## Diagnosis

- This fixes an older image-retention path that predates v0.63.0 and could allow long browsing sessions to climb into multi-gigabyte WebView memory usage.
- Swarm/ComfyUI process supervision is unchanged in this hotfix.
