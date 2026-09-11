# v0.16 — resolved reuse + variation seed

- Added Variation Seed as a first-class compact drawer above Init Image.
- Added latest-output seed reuse and randomize actions for the variation seed.
- Added variation strength control and Swarm request/preset support.
- Reuse All now hydrates from final Swarm/PNG metadata, including resolved prompt/negative prompt and exact generated seed.
- Reuse All clears source preset tokens after materializing the resolved prompt so presets cannot be applied twice.
- Inspect now exposes resolved prompt metadata, variation values, LoRAs, and copy-prompt.
