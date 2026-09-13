# Host control: SSH launcher + PWA lifecycle bridge

- Added a Windows host-control helper with fixed lifecycle verbs instead of arbitrary shell execution.
- Added one-click install/repair for the `studio start` SSH launcher. Installation registers an interactive Scheduled Task so SSH can launch Studio into the already logged-in desktop session without changing SSH credentials or certificates.
- Added `studio start`, `studio stop`, `studio restart`, `studio status`, and `studio swarm start|stop|restart|status` host commands.
- Added a same-origin, session-cookie-protected Vite host bridge so PWA clients can start/stop/restart host-managed Swarm without Tauri shell permissions.
- PWA Swarm lifecycle controls now use the host bridge when available; Comfy lifecycle controls continue through Swarm's backend API.
- Added host-control status/install UI under Connection settings.
- Added runner PID publication so the SSH shim can detect/stop the Studio process tree it launched.
- Added a host-control contract covering fixed verbs, origin/session protection, PWA wiring, scheduled-task registration, and the no-arbitrary-shell boundary.
