# Swarm Studio v0.24

## CivitAI queue + viewport reliability

- Serializes CivitAI installs through a visible queue so multiple install clicks cannot fight over Swarm download progress, inventory refreshes, or metadata repair.
- Install cards show Queued / live percentage states while the toolbar exposes the active queue.
- CivitAI detail modals preserve the browser scroll position while opening, hydrating metadata, and closing.
- CivitAI page changes now scroll the actual Studio content scroller rather than the hidden document body.
- Removes the top padding gap from the CivitAI scroll container and makes the sticky toolbar effectively opaque so card rows no longer peek through above it while pinned.
- Keeps the existing final-row bottom breathing room from v0.23.
