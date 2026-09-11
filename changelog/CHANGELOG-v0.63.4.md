# Swarm Studio v0.63.4

## Runner polish

- Replaced the ambiguous large ASCII wordmark with a deliberately spaced block-letter `SWARM STUDIO` banner so the runner no longer reads like “Swan Studio.”
- Made the normal PowerShell runner compact by filtering routine npm, Vite, Cargo, and Tauri boilerplate into small Studio status lines.
- Preserved the complete unfiltered development stream in `.swarm-studio-runner.log` for diagnostics.
- Added `-VerboseRunner` to restore the full live raw development output whenever deeper debugging is needed.
- Kept explicit one-time `-SetupFirewall` behavior and the existing no-elevation normal startup path intact.

## Notes

- No Studio UI, generation, Library, model, or runtime behavior is intentionally changed by this release.
