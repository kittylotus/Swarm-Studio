# Delayed backend capability hydration

## Summary

Fix Studio's live sampler/scheduler UI when Studio connects before Comfy exists or before Comfy finishes starting.

### Root cause

Studio's post-connect capability watcher used to exit immediately when `ListBackends` returned no enabled backend. It also only watched for roughly twelve seconds. In a self-start/manual-start flow, Studio can connect to Swarm minutes before Comfy becomes ready, leaving Studio's in-memory `ListT2IParams` snapshot stale even after Swarm itself correctly learns extension schedulers such as `beta57` and `bong_tangent`.

A successful later capability refresh also updated Studio's parameter data without patching the already-rendered native `<select>` elements, so the dropdown could remain visually stale until an unrelated full render.

### What changed

- Keep the post-connect backend readiness watcher alive when no backend is enabled yet.
- Extend the bounded readiness window to roughly six minutes for delayed/manual Comfy startup.
- Strong-refresh Swarm capabilities once an enabled backend reports ready.
- Update the live Create and Inpaint sampler/scheduler selects in place after capability refreshes.
- Preserve the currently selected value while inserting newly advertised options.
- Keep generation-time strong refresh + bounded cheap follow-up reads as a fallback.
- Add a dedicated capability hydration contract to prevent the early-exit/stale-DOM regression.

## Validation

```text
npm run check
# PASS

npm run preflight
# PASS
```
