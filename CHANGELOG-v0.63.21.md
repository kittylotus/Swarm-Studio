# Swarm Studio v0.63.21

## Swarm-owned history image routing

- Replaced the hard-coded `View/local/raw/...` history projection with the routing contract returned by Swarm's `GetNewSession` response.
- `ListImages.src` is now treated as relative to the user's configured output root: `output_append_user=true` maps it to `View/<user_id>/<src>`, while `false` maps it to `Output/<src>`.
- Existing `View/...` and `Output/...` generation URLs remain authoritative and are never rewritten into a guessed folder layout.
- Removed implicit `raw/`, `local/`, and `inputs/` topology guesses, so custom Swarm output paths work without Studio knowing where the files live on disk.
- History mutation paths now round-trip both `View/<user>/...` and `Output/...` correctly instead of assuming the `local` user.
- Library rendering prefers the persisted Swarm source path and re-projects it through the live session, allowing v0.63.20's over-normalized cached routes to self-heal immediately after reconnect.
- Generation fallbacks sourced from `ListImages` now use the same session-aware display projection before rendering.
- Expanded routing regression coverage for custom port `8801`, named users, both `output_append_user` modes, custom subfolders, direct generation routes, legacy absolute URLs, and mutation round-trips.

## Mobile composer density

- Kept LoRA stack header actions on the same row on mobile instead of expanding them into a second full-width toolbar.
- Collapsed each mobile LoRA card from three control rows to two: metadata on top, weight + trigger below, with enable/remove actions pinned at the right.
- Reduced mobile thumbnail, control, card, selector, add-card, footer, and composer padding so larger stacks stay scannable without changing the desktop layout.
- Added an extra narrow-phone fallback below 380px that trims icon/thumb sizing and hides the redundant Weight label while retaining the numeric control.

## Post-release Studio maintenance

The v0.63.21 working tree also includes the following Studio fixes and quality-of-life improvements. These remain part of the current source version rather than spawning separate changelog fragments.

- Fixed inpaint mask export across browser/PWA and Tauri runtimes.
- Added opt-in editable Studio keybinds, including Ctrl/Cmd+Enter generation and navigation shortcuts.
- Added opt-in background generation notifications for supported PWA/browser runtimes.
- Added a LoRA stack manager with in-place rename, edit, load, overwrite, and delete flows.
- Restored embedded output metadata hydration for historical images, including resolved prompts, negative prompts, exact seeds, and generation timing.
- Updated Reuse All to prefer the final embedded resolved prompt payload while preserving the original source request separately.
- Fixed mobile Current Output Inspect text alignment by removing an unnecessary flex display override.

Historical per-patch changelog fragments were intentionally retired. Git history remains the archive for older implementation notes.
