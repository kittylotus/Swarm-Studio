# Swarm Studio v0.52.1

## Fixed
- Route native desktop inpaint source images through the existing Rust image bridge before loading them into the canvas.
- Re-render the editor after native image prefetch so the canvas leaves its loading state reliably.

## Included
- Mobile-first brush / erase / pan mask editor.
- Undo / redo, invert, clear, mask visibility, creativity, and iterative edit generation.
- Inpaint entry points from Create, Library, and Inspector.
