# v0.17 — randomization contamination hotfix

- Do not materialize resolved `Wildcard Seed` metadata during Reuse All.
- Migrate legacy state to v8 and scrub leaked wildcard-seed values once.
- Keep explicit user-configured Wildcard Seed support after migration.
- Do not treat wildcard seed as the image's resolved main seed.
