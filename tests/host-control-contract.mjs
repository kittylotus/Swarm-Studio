import fs from "node:fs";
import assert from "node:assert/strict";

const runtime = fs.readFileSync("src/runtime/index.ts", "utf8");
const app = fs.readFileSync("src/app.ts", "utf8");
const vite = fs.readFileSync("vite.config.ts", "utf8");
const native = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
const runner = fs.readFileSync("start.ps1", "utf8");
const helper = fs.readFileSync("scripts/host-control.ps1", "utf8");

assert.match(helper, /ValidateSet\("install", "uninstall", "start", "stop", "restart", "status", "runner", "swarm"\)/, "host CLI must expose fixed verbs only, including the interactive remote runner");
assert.match(helper, /ValidateSet\("start", "stop", "restart", "status"\)/, "Swarm host actions must be fixed verbs");
assert.doesNotMatch(helper, /Invoke-Expression|\biex\b/i, "host helper must not evaluate arbitrary shell text");
assert.match(helper, /Swarm Studio Remote Launch/, "host helper must register the interactive launch task");
assert.match(helper, /LogonType Interactive/, "scheduled Studio launch must target the logged-in interactive session");
assert.match(helper, /studio\.cmd/, "host helper must install the SSH-friendly CLI shim");
assert.match(helper, /launch-windows\.bat.*launch-windows\.cmd.*launch-windows\.ps1.*SwarmUI\.exe/s, "host Swarm discovery must be limited to known launcher names");
assert.match(helper, /taskkill\.exe \/PID \$pidValue \/T \/F/, "host stops must target the recorded process tree");

assert.match(helper, /swarm-studio-desktop\.pid/, "host control must track the Tauri desktop child separately from the persistent runner");
assert.match(helper, /swarm-studio-runner-command\.txt/, "host control must use a narrow local command mailbox for remote runner actions");
assert.match(helper, /function Send-StudioRunnerCommand/, "SSH host control must send fixed runner commands instead of arbitrary shell text");
assert.match(helper, /function Invoke-RemoteRunner/, "SSH CLI must expose the interactive studio runner cockpit");
assert.match(helper, /\[W\] Open window.*\[R\] Restart window.*\[C\] Close window/s, "remote runner must expose Studio window controls");
assert.match(helper, /\[S\] Restart Swarm.*\[L\] Logs.*\[F\] Refresh/s, "remote runner must expose Swarm restart, log tail, and status refresh controls");
assert.match(helper, /\[Q\] Detach.*\[X\] Stop all \+ quit/s, "remote runner must support safe detach and explicit stop-all");
assert.match(helper, /Q detaches without stopping anything/, "remote runner must make detach semantics explicit");
assert.doesNotMatch(helper, / · /, "remote runner status must stay ASCII-clean for Windows PowerShell over SSH/Termux");
assert.match(helper, /Get-Content -LiteralPath \$RunnerLog -Tail \$Lines/, "remote runner log view must tail the existing forensic runner log");
assert.match(helper, /Start-StudioHost[\s\S]*Send-StudioRunnerCommand "W"/, "studio start must reopen the desktop window when the persistent runner is already alive");
assert.match(runner, /swarm-studio-runner\.pid/, "runner must publish a host-readable PID");
assert.match(runner, /SWARM_STUDIO_RUNNER_PID_FILE/, "runner PID path must be available to descendants");
assert.match(runner, /\[switch\]\$DesktopChild/, "runner must expose an internal desktop-child mode so the control console can survive window exits");
assert.match(runner, /function Invoke-StudioDesktopControlLoop/, "desktop mode must run through the persistent keyboard-control loop");
assert.match(runner, /\[Console\]::KeyAvailable/, "runner controls must be non-blocking single-key actions");
assert.match(runner, /\[W\] Open Studio.*\[R\] Restart Studio.*\[C\] Stop Studio/s, "runner must advertise open, restart, and stop desktop-shell actions");
assert.match(runner, /\[S\] Restart Swarm.*\[Q\] Quit when Studio is closed.*\[X\] Stop all \+ quit/s, "runner must advertise backend restart and safe exit actions");
assert.match(runner, /switch \(\$Key\).*"W".*"R".*"C".*"S".*"Q".*"X"/s, "runner key handler must wire every advertised action");
assert.match(runner, /Start-Process .*?-NoNewWindow -PassThru/s, "desktop child must share the runner console while remaining independently restartable");
assert.match(runner, /taskkill\.exe \/PID \$WindowPid \/F/, "Close/restart must terminate only the native Studio window PID");
assert.doesNotMatch(runner, /taskkill\.exe \/PID \$WindowPid \/T \/F/, "Window close must not recursively kill Vite, Swarm, or other descendants");
assert.match(runner, /Test-StudioDevServerStable[\s\S]*src-tauri\\target\\debug\\swarm-studio\.exe/, "reopen/restart must reuse the live Studio dev server by launching the native debug shell directly");
assert.match(runner, /function Stop-StudioDevServer/, "stop-all must be able to clean an orphaned Studio Vite server deliberately");
assert.match(runner, /Stop-StudioOwnedBackendTree[\s\S]*Stop-StudioDesktopLauncherTree/, "stop-all must clean backend and dev-server processes while ordinary window close leaves them alone");
assert.match(runner, /host-control\.ps1.*"swarm", "restart"/s, "runner Swarm restart must reuse the fixed host-control verb instead of inventing shell execution");
assert.match(runner, /Desktop shell exited\$Suffix\. Press W to reopen it; the runner stays alive\./, "closing the desktop shell must leave the runner available for reopening");

assert.match(runner, /swarm-studio-desktop\.pid/, "local runner must publish the current desktop child PID for SSH status");
assert.match(runner, /swarm-studio-runner-command\.txt/, "local runner must consume the SSH command mailbox");
assert.match(runner, /function Read-StudioRunnerCommand/, "local runner must poll fixed remote commands without exposing arbitrary shell execution");
assert.match(runner, /if \(-not \$Key\) \{ \$Key = Read-StudioRunnerCommand \}/, "local runner must merge keyboard and SSH control inputs into the same action handler");
assert.match(vite, /studio-host-control-bridge/, "PWA host bridge must be installed in Vite");
assert.match(vite, /swarm_studio_host=.*HttpOnly; SameSite=Strict/, "host bridge must protect actions with an HttpOnly same-site session cookie");
assert.match(vite, /sameOriginRequest\(req\)/, "host bridge POST actions must enforce same-origin requests");
assert.match(vite, /target !== "swarm"/, "PWA bridge must expose only fixed Swarm lifecycle actions");
assert.match(vite, /execFileAsync\("powershell\.exe"/, "Vite bridge must call the fixed host helper without a shell command string");
assert.doesNotMatch(vite, /exec\(|spawn\([^,]+,\s*\{\s*shell:\s*true/i, "host bridge must not use shell-string execution");

assert.match(runtime, /hostControlStatus\(\): Promise<RuntimeHostControlStatus>/, "runtime bridge must expose host-control status");
assert.match(runtime, /browserHostControlFetch<RuntimeHostControlStatus>\("action"/, "PWA runtime must use the host bridge for Swarm lifecycle actions");
assert.doesNotMatch(runtime, /The PWA cannot launch desktop processes/, "old PWA process-control dead end must be removed");

assert.match(native, /fn publish_desktop_pid\(\)/, "native Studio shell must own desktop PID publication");
assert.match(native, /SWARM_STUDIO_DESKTOP_PID_FILE/, "native Studio shell must publish its real window PID for runner and SSH lifecycle control");
assert.match(native, /fn host_control_status\(\)/, "Tauri must expose host-control status");
assert.match(native, /fn host_control_install\(\)/, "Tauri must expose SSH-launcher installation");
assert.match(native, /host_control_status,\s*host_control_install,/s, "host-control commands must be registered with Tauri");

assert.match(app, /<b>Host control<\/b>/, "Connection settings must surface host-control state");
assert.match(app, /Install SSH launcher|Repair SSH launcher/, "desktop settings must provide install\/repair UX");
assert.match(app, /runtime\.kind === "tauri" \|\| this\.hostControlStatus\?\.available === true/, "PWA host control must enable local Swarm controls");
assert.doesNotMatch(app, /Swarm process restart is only available in desktop Studio/, "PWA Swarm restart must no longer be categorically blocked");
assert.match(app, /data-action="restart-comfy-backend"/, "Comfy restart remains available through Swarm's backend API");

console.log("Host control contract OK");
