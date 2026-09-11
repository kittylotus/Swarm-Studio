# Swarm Studio v0.63.9

## LoRA request compatibility

- Generation now serializes enabled LoRAs using the exact option values advertised by Swarm's current `LoRAs` T2I parameter instead of sending `ListModels` filenames directly. This preserves Swarm folder paths and uses Swarm's extensionless generation wire format.
- Inpaint uses the same canonical LoRA serialization and keeps LoRA weights aligned with the resolved values.
- Generation and inpaint now stop with an explicit missing-LoRA error instead of silently omitting an enabled stack entry that cannot be matched to the connected Swarm inventory.
- Successful organizer moves rewrite matching active-stack entries to their new server paths, and organizer refreshes retain the refreshed T2I parameter inventory.
- Historical/removed metadata fields are no longer replayed as advanced generation parameters when the connected Swarm server does not advertise them. `swarm_version` is treated as transient metadata during Reuse All.

## Notes

- Backend controls, runner behavior, memory diagnostics, CivitAI routing, and the pre-v1 cleanup remain unchanged.
