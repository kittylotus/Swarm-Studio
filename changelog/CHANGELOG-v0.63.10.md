# Swarm Studio v0.63.10

## Generation wire hardening

- Added a final generation request normalization boundary for both Create and Inpaint.
- `swarm_version` is now stripped immediately before API transmission even if stale metadata or an old draft somehow reintroduces it.
- Enumerated generation values are canonicalized against the connected Swarm server's currently advertised parameter options.
- Added compatibility for the retired Scheduler value `beta5`, mapping it to Swarm's current `beta` option when available.
- Other stale enumerated values fall back to the server-advertised default rather than causing the entire generation request to be rejected.
- Persisted advanced-parameter migration also scrubs stale `swarm_version` metadata.
- Added a generation-request contract test covering transient fields, enum canonicalization, `beta5 -> beta`, and safe default fallback.

## Pretty runner cleanup

- Pretty runner mode no longer dumps raw Swarm/Comfy compiler diagnostics, Python tracebacks, optional accelerator warnings, or repetitive backend stderr into the terminal.
- Important backend failures are reduced to concise one-line `SWARM`, `COMFY`, or `REQUEST` summaries.
- The complete unfiltered backend/dev stream remains available in `.swarm-studio-runner.log` and Studio's Logs tab.
- `-VerboseRunner` still restores the full live firehose when debugging requires it.
