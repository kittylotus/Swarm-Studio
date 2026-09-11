# Swarm Studio v0.57.0

## Inpaint workflow polish

- fixed mobile scrolling by making the inpaint backdrop the single vertical scroll owner and preventing the right-side controls from becoming a nested scroll island
- moved Undo, Redo, Invert, Clear, Import Mask, and Export Mask below the canvas and converted the row to compact SVG actions
- added a top-right circular help control and moved keyboard/mobile usage notes into a dedicated help modal
- added a dedicated Inpaint Generation Settings modal for width, height, steps, CFG, seed, sampler, scheduler, creativity, and mask engine
- generation settings are initialized from the source output context and remain independent from whatever is currently mounted in Create
- reduced the mobile canvas/tool chrome so the image is reached sooner and the page has more non-canvas surfaces available for normal scrolling
- removed the old always-visible helper copy and the extra Generation control block from the sidebar
- kept the source checkpoint and LoRA stack visible as compact read-only context beside the inpaint prompt
- inpaint progress now uses the inpaint-specific step count instead of the Create draft step count
- preserved iteration behavior: successful edits become the next inpaint source without resetting the user's inpaint generation overrides

## Validation

- `tsc --noEmit`
