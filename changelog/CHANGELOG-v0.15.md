# v0.15 — mobile output + exact reuse

- **Create** now lands on **Output** on mobile, including the brand shortcut.
- **Visuals** now lands on **Models**; Identities stays one context swipe away.
- Tighten the mobile Output image stage so Prompt and Generate remain closer to the viewport.
- Promote the contextual bottom bar to its own compositor layer to prevent Android/PWA scroll-time disappearance and invisible touch interception.
- **Reuse all** now resolves and restores the finished image's actual seed from the output record / Swarm metadata path instead of restoring the original `-1` request.
