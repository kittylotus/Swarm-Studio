# Swarm Studio v0.51.0

## Fixed
- Generation completion no longer globally rerenders the active page. Create updates only the output/progress chrome, preserving focused prompt fields and the mobile keyboard.
- Library batch actions are rendered at the app root so the fixed bottom rail remains visible on mobile instead of being captured by transformed/animated view containers.
- Entering Library selection preserves card geometry with hidden action placeholders, preventing the desktop grid from shifting when batch mode starts.

## Performance
- Generation draft persistence is split from the general Studio state snapshot. Prompt/parameter edits now write a small dedicated draft record instead of serializing Library state.
- Continuous prompt input updates in memory immediately and debounces disk/localStorage persistence by 320 ms; change events flush immediately. This removes the heavy persistence work previously attached to every keystroke/backspace repeat.
- Generation start/completion use targeted DOM updates instead of replacing the Create workspace.

## Validation
- `npx tsc --noEmit` passes.
