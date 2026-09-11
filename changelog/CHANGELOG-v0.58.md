# Swarm Studio v0.58.0

## Inpaint result approval

- changed inpaint completion flow to require approval before the editor switches to the new result
- added a compact result review popup with preview, reject, and accept actions
- rejecting a result now keeps the current base image and current mask intact so you can rerun quickly
- accepting a result promotes it to the new base image and clears the previous mask state

## Mobile + iOS polish

- added an iOS zoom guard for inpaint text inputs and settings controls
- opted the app viewport out of focus zoom behavior that was blowing up the page on iPhone
- kept the reviewed result popup mobile-safe with bottom anchored placement and safe-area spacing

## Notes

- edited outputs are still indexed in Library immediately, even before you approve them in the inpaint editor
- source checkpoint and LoRA stack inheritance behavior is unchanged
