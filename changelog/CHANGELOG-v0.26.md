# Swarm Studio v0.26 — LAN boot fix

- Replaced direct `crypto.randomUUID()` usage with a LAN-safe `createId()` helper.
- Plain private-LAN HTTP origins can now boot Studio without requiring Chromium's insecure-origin-as-secure flag.
- Added a visible boot failure panel so startup exceptions no longer present as an empty themed background.
- Kept PWA/service-worker expectations unchanged: installation still requires a secure context (HTTPS, localhost, or an explicit browser exception), but ordinary LAN browser usage does not.
