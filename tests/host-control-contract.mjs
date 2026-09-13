import fs from "node:fs";
import assert from "node:assert/strict";

const runtime = fs.readFileSync("src/runtime/index.ts", "utf8");
const app = fs.readFileSync("src/app.ts", "utf8");
const vite = fs.readFileSync("vite.config.ts", "utf8");
const native = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
const runner = fs.readFileSync("start.ps1", "utf8");
const helper = fs.readFileSync("scripts/host-control.ps1", "utf8");

assert.match(helper, /ValidateSet\("install", "uninstall", "start", "stop", "restart", "status", "swarm"\)/, "host CLI must expose fixed verbs only");
assert.match(helper, /ValidateSet\("start", "stop", "restart", "status"\)/, "Swarm host actions must be fixed verbs");
assert.doesNotMatch(helper, /Invoke-Expression|\biex\b/i, "host helper must not evaluate arbitrary shell text");
assert.match(helper, /Swarm Studio Remote Launch/, "host helper must register the interactive launch task");
assert.match(helper, /LogonType Interactive/, "scheduled Studio launch must target the logged-in interactive session");
assert.match(helper, /studio\.cmd/, "host helper must install the SSH-friendly CLI shim");
assert.match(helper, /launch-windows\.bat.*launch-windows\.cmd.*launch-windows\.ps1.*SwarmUI\.exe/s, "host Swarm discovery must be limited to known launcher names");
assert.match(helper, /taskkill\.exe \/PID \$pidValue \/T \/F/, "host stops must target the recorded process tree");

assert.match(runner, /swarm-studio-runner\.pid/, "runner must publish a host-readable PID");
assert.match(runner, /SWARM_STUDIO_RUNNER_PID_FILE/, "runner PID path must be available to descendants");

assert.match(vite, /studio-host-control-bridge/, "PWA host bridge must be installed in Vite");
assert.match(vite, /swarm_studio_host=.*HttpOnly; SameSite=Strict/, "host bridge must protect actions with an HttpOnly same-site session cookie");
assert.match(vite, /sameOriginRequest\(req\)/, "host bridge POST actions must enforce same-origin requests");
assert.match(vite, /target !== "swarm"/, "PWA bridge must expose only fixed Swarm lifecycle actions");
assert.match(vite, /execFileAsync\("powershell\.exe"/, "Vite bridge must call the fixed host helper without a shell command string");
assert.doesNotMatch(vite, /exec\(|spawn\([^,]+,\s*\{\s*shell:\s*true/i, "host bridge must not use shell-string execution");

assert.match(runtime, /hostControlStatus\(\): Promise<RuntimeHostControlStatus>/, "runtime bridge must expose host-control status");
assert.match(runtime, /browserHostControlFetch<RuntimeHostControlStatus>\("action"/, "PWA runtime must use the host bridge for Swarm lifecycle actions");
assert.doesNotMatch(runtime, /The PWA cannot launch desktop processes/, "old PWA process-control dead end must be removed");

assert.match(native, /fn host_control_status\(\)/, "Tauri must expose host-control status");
assert.match(native, /fn host_control_install\(\)/, "Tauri must expose SSH-launcher installation");
assert.match(native, /host_control_status,\s*host_control_install,/s, "host-control commands must be registered with Tauri");

assert.match(app, /<b>Host control<\/b>/, "Connection settings must surface host-control state");
assert.match(app, /Install SSH launcher|Repair SSH launcher/, "desktop settings must provide install\/repair UX");
assert.match(app, /runtime\.kind === "tauri" \|\| this\.hostControlStatus\?\.available === true/, "PWA host control must enable local Swarm controls");
assert.doesNotMatch(app, /Swarm process restart is only available in desktop Studio/, "PWA Swarm restart must no longer be categorically blocked");
assert.match(app, /data-action="restart-comfy-backend"/, "Comfy restart remains available through Swarm's backend API");

console.log("Host control contract OK");
