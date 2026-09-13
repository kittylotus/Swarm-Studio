# beta57 capability refresh

## Summary

Fix Studio's sampler/scheduler capability catch-up path so extension-provided values like `beta57` can recover after Comfy finishes booting.

### What changed
- Added `SwarmClient.refreshCapabilities()` as a weak `TriggerRefresh` helper (`strong=false`).
- Switched post-connect sampler/scheduler hydration from stale `ListT2IParams` reads to `refreshCapabilities()`.
- Switched generation-time missing sampler/scheduler hydration to the same refresh path.
- Added capability-diff logging so Studio can report when samplers or schedulers were added during hydration.
- Updated preflight assertions to lock the new refresh behavior in place.

## Why

Studio already preserved unknown scheduler names on the outgoing generation request, but the hydration path was only rereading Swarm's current cached parameter list. If Swarm had not refreshed after RES4LYF finished registering `beta57`, Studio could still send `beta57` to a server that had never updated its own scheduler registry snapshot, which made Swarm reject the request as invalid.

Using a bounded `TriggerRefresh`-backed capability refresh gives Swarm a chance to rebuild its live sampler/scheduler metadata before Studio generates.

## Validation

```text
npm run preflight
# PASS

npm run check
# PASS
```
