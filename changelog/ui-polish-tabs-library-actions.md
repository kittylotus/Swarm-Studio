# UI polish — tabs, Library actions, generation chrome

- Moved the regional Swarm syntax preview beneath Regional prompts so the layout side stays focused on geometry.
- Replaced the Regions glyph with a panel-layout SVG and gave Prompt Clear an eraser SVG.
- Replaced Studio navigation/context/settings tab text glyphs with inline Lucide-style SVGs.
- Reworked Library card actions into a compact SVG action row plus a dedicated folder control, including mobile-safe stacking and an SVG favorite heart.
- Kept Library batch-selection behavior unchanged.
- Simplified live generation progress to a single sampler-step chip instead of duplicating the same step counter beside `starting`.
- On mobile Current Output, keep Inspect / Use as init / Inpaint and drop the redundant Reuse / Library buttons; Library is already available in mobile navigation.
