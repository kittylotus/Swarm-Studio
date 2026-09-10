# Swarm Studio v0.62.10

## Polish

- Temporarily hides the docked Library Browse pane whenever an output Inspector is open, giving Inspect the full viewport instead of allowing the dock to overlap its metadata/actions.
- Keeps Browse open state and dock preference intact while Inspect is active, so closing Inspect restores the dock automatically.
- Releases the Library dock layout reservation while Inspect is open, then restores it with the dock.

## Notes

- Keeps all v0.62.9 drag-to-inspect, real dock layout, and historical Swarm timing metadata behavior intact.
