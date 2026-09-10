# Swarm Studio v0.63.16

## Fixes

- Fixed browser/PWA relay routing for Swarm installations on non-default ports such as `8801`. Studio now carries the configured Swarm port through the same-origin `/__swarm` relay instead of silently sending every phone/browser request to `127.0.0.1:7801`.
- Kept the relay target host locked to the runner-configured backend host while allowing only the numeric port to vary, so the fix does not turn Studio into an arbitrary network proxy.
- Large Swarm libraries now automatically rehydrate on the first connected Library visit when Studio is still holding only its intentionally compact persisted output cache. The manual Sync Swarm History button remains available for explicit refreshes.
- Stale/deleted persisted Studio folder selections now recover to **All outputs** instead of leaving the Library at `0 matching outputs` while the header still reports cached images.
- Fixed advanced-parameter clue controls being stretched into “clue sausages” by an older `summary > span { flex: 1 }` rule. The question-mark controls now remain true 18 × 18 circles.
- Replaced clue pseudo-element popovers with a viewport-positioned tooltip layer so desktop clue text can escape the scrolling control rail without being clipped. Mobile keeps the existing tap-to-toast behavior.

## Tests

- Added a browser relay contract covering custom port `8801`, already-relayed image URLs, private relay-parameter stripping, and rejection of arbitrary target injection.
- Added a Library session contract covering stale folder recovery, compact-cache auto hydration, large already-hydrated libraries, and avoiding background history crawls while the user is in Create.
