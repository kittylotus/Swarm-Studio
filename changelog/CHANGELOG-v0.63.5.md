# Swarm Studio v0.63.5

## Runner polish

- Replaced the compact ASCII wordmark with the full block-glyph **SWARM STUDIO** banner.
- Added a truecolor horizontal runner gradient: hot pink → purple → baby blue.
- Added graceful color fallback for terminals without virtual-terminal / truecolor support.
- Made the launcher script UTF-8-with-BOM so Windows PowerShell 5.1 can parse and render the banner glyphs reliably.
- Kept the condensed pretty runner, raw `.swarm-studio-runner.log`, `-VerboseRunner`, and opt-in `-SetupFirewall` behavior unchanged.
