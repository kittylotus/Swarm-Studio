# Swarm Studio v0.63.20

## Library image routing hotfix

- Fixed historical Swarm images resolving to the server root after Library sync or page refresh.
- Swarm's `ListImages` route returns history-relative paths such as `2026-09-10/file.png`; Studio now explicitly projects those through the fetchable `View/local/raw/...` image route instead of requesting `/2026-09-10/file.png` and getting a 404.
- Existing persisted records with the old bare-path shape self-heal through the same normalization path, so users should not need to delete or rebuild their Studio library cache.
- The custom-port browser relay keeps the configured Swarm port while forwarding the corrected `View/local/raw/...` image route, covering non-default setups such as port 8801.

## Tests

- Added a Swarm history image-path contract covering bare `ListImages` paths, generated `View/local/raw` paths, legacy absolute bare URLs, and custom-port relay projection.
