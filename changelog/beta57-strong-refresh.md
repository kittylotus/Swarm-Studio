# beta57 strong backend refresh

## Summary

Correct Studio's sampler/scheduler capability recovery to use Swarm's actual full backend refresh path.

### What changed
- `SwarmClient.refreshCapabilities()` is now strong by default.
- Post-connect hydration performs one strong refresh after Comfy reports ready.
- Missing sampler/scheduler generation recovery performs one strong refresh, then only bounded cheap parameter reads while Swarm finishes backend value loading.
- Added capability-diff logging so newly discovered schedulers such as `beta57` are visible in Studio logs.
- Studio still preserves extension-owned values and never silently rewrites or deletes them.

## Why

Swarm documents `TriggerRefresh(strong=false)` as only returning the current parameter list after pending refreshes. It does not initiate a full backend refresh.

A strong refresh causes Swarm's Comfy extension to expire cached `object_info` and reload each running backend's value set, which is the path that repopulates Swarm's sampler/scheduler validation lists from Comfy.

## Validation

```text
npm run preflight
# PASS

npm run check
# PASS
```
