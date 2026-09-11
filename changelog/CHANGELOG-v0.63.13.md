# Swarm Studio v0.63.13

## Fixes

- Restored generation compatibility with SwarmUI 0.9.7 for LoRAs and other LIST-valued T2I parameters. Studio now keeps arrays internally but serializes LIST parameters as the comma-delimited wire format accepted by both Swarm 0.9.7 and current Swarm builds.
- Preserved the v0.63.12 bounded backend-capability hydration; extension schedulers such as `beta57` remain untouched and registered normally.
- Expanded the generation request contract test so it catches JSON-array LIST regressions instead of validating only LoRA name resolution.

## Why this broke

SwarmUI 0.9.7 converts a JSON array token to text before LIST validation. That leaves the brackets/quotes in the value, so the full array is rejected as if it were one missing option. Newer Swarm builds added native JArray handling. The historical comma-delimited LIST representation works across both parser generations.
