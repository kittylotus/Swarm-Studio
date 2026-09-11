# Swarm Studio v0.63.3

## Runner cleanup

- Removed the old every-launch Windows Firewall refresh that could spawn a second elevated PowerShell window on every Studio start.
- Made LAN/Tailscale firewall setup explicit and one-time through `./start.ps1 -SetupFirewall`; normal launches leave Windows Firewall untouched.
- Preserved LAN address discovery and the same-origin Studio relay without treating the old `crypto.randomUUID()` failure as a networking problem.
- Reworked the Windows runner presentation with a branded ASCII header, compact colored status rows, cleaner endpoint output, a descriptive window title, and explicit runner exit status.

## Notes

- No generation, Library, model, CivitAI, memory-diagnostics, or Swarm process-control behavior is intentionally changed in this release.
