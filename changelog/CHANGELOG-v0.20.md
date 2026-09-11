# v0.20 — CivitAI cap + local startup/network reliability

- CivitAI browse requests now respect the live API maximum of 100 models per upstream page while retaining compatibility deep-scanning.
- Auto-start Local Swarm performs a fast reachability probe and launches the configured local launcher immediately when the server is absent, with explicit startup diagnostics.
- Native HTTP probes now have short connect/request timeouts so auto-start cannot sit behind a slow dead endpoint.
- `start.ps1` refreshes the existing Windows Firewall rule instead of leaving an older rule untouched. Port 1420 is allowed from RFC1918 LAN ranges plus Tailscale/private IPv6 ranges, fixing LAN IPv4 access on machines where Windows does not classify peers as `LocalSubnet`.
- Startup output now calls out that a Vite-advertised virtual-adapter address may not be the actual Wi-Fi/LAN address.
