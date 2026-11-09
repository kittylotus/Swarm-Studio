# Standalone startup on Windows

Studio, SwarmUI and ComfyUI can run from separate checkouts without StabilityMatrix. Studio connects to SwarmUI; SwarmUI connects to ComfyUI.

## Let Swarm manage ComfyUI

For a normal local install, use Swarm's **Server → Backends → ComfyUI Self-Starting** backend. Set **StartScript** to your ComfyUI `main.py`. Studio's **Settings → Connection → Auto-start local Swarm** can start Swarm, which then owns its Comfy backend. This requires no separate Comfy launcher. See [Swarm's backend setup](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/src/BuiltinExtensions/ComfyUIBackend/README.md#installation-self-start).

## Start an independently managed ComfyUI first

Use this when you deliberately manage ComfyUI outside Swarm. Configure these once:

1. In Swarm's **Server → Backends**, add **ComfyUI API By URL**, pointing to `http://127.0.0.1:8188`. Disable the self-start backend for that same Comfy installation to avoid launching a duplicate.
2. Match the relative checkpoint/LoRA paths in both applications. Make Swarm's `DLNodes` and `ExtraNodes` available to the external Comfy installation, as described in [Swarm's API backend instructions](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/src/BuiltinExtensions/ComfyUIBackend/README.md#installation-api). Studio's expression workflows also use Swarm's image bridge nodes.
3. In Studio's **Settings → Connection**, set the local Swarm URL, **Launch command** (for example `D:\SwarmUI\launch-windows.bat`), and **Working directory**. Enable **Auto-start local Swarm** and save. Verify that Studio can launch Swarm with these settings first.

From the Studio checkout, run:

```powershell
.\scripts\start-standalone.ps1 -ComfyRoot 'D:\ComfyUI' -ComfyPython 'D:\ComfyUI\.venv\Scripts\python.exe'
```

Use the Python executable belonging to your Comfy environment. For a portable install, this may be `D:\ComfyUI_windows_portable\python_embeded\python.exe`, while `ComfyRoot` points to its `ComfyUI` subfolder. Pass `-ComfyArguments '--windows-standalone-build'` if that is part of your normal portable launch command. Existing installations and dependencies must already work; this helper does not install ComfyUI or change its configuration.

The helper starts Comfy in the background and waits for a valid [`/system_stats` response](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py) before opening Studio. Studio then starts Swarm using its saved setting. A Comfy instance already answering on that port is reused. An early exit or readiness timeout stops the sequence before Studio starts. This uses readiness checks instead of a fixed delay, so slower custom-node imports get time to finish.

Optional arguments:

| Argument | Default | Purpose |
| --- | --- | --- |
| `-ComfyPort` | `8188` | Change the port; match it in Swarm's backend URL. |
| `-ComfyArguments` | empty | Additional Python command-line arguments, such as `--lowvram`. Quote paths inside this string as you would in a normal command. |
| `-TimeoutSeconds` | `180` | Wait up to this many seconds for readiness. |
| `-WebOnly` | off | Open Studio's browser/PWA runner. Enable Studio's host-control bridge before relying on browser auto-start. |

Comfy output goes to `.swarm-studio-comfy.stdout.log` and `.swarm-studio-comfy.stderr.log` in the Studio checkout. This independently started Comfy process remains running when Studio closes. Studio's Emergency Stop only stops its own managed Swarm process tree; it does not own this external Comfy process. Stop Comfy separately when needed.

For everyday use, create a shortcut targeting `powershell.exe` with arguments such as `-NoProfile -ExecutionPolicy Bypass -File "D:\Swarm Studio\scripts\start-standalone.ps1" -ComfyRoot "D:\ComfyUI" -ComfyPython "D:\ComfyUI\.venv\Scripts\python.exe"`. Replace the paths with your own installations.
