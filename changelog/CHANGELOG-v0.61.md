# Swarm Studio v0.61.0

## Fixed

- fixed the real cause of the Library bottom clipping on desktop: non-Create pages were allocating a 100%-height content scroller *in addition to* their page header, pushing the final portion of the scrollport below the visible app area
- converted the desktop main area into an explicit `header + minmax(0, 1fr)` grid so Library, Models, Logs, Settings, and other titled views end at the actual usable viewport
- kept Create occupying the full main area because it does not render the compact section header
- preserved the existing document-flow behavior below 1040px so tablet/mobile layout remains unchanged

## Validation

- `npx tsc --noEmit`
