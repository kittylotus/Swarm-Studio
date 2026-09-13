import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const app = readFileSync(join(root, "src/app.ts"), "utf8");
const client = readFileSync(join(root, "src/swarm/client.ts"), "utf8");

assert.ok(
  client.includes("async refreshCapabilities(strong = true)") && client.includes("return this.parameterData(true, strong);"),
  "Capability refresh must use Swarm TriggerRefresh and default to a strong backend refresh.",
);
assert.ok(app.includes("for (let attempt = 0; attempt < 180; attempt += 1)"), "Post-connect hydration must survive delayed/manual Comfy startup for several minutes.");
assert.ok(app.includes("if (!enabled.length) continue;"), "No enabled backend must keep the readiness watcher alive rather than terminate it.");
assert.ok(!app.includes("if (!enabled.length) return;"), "The old early-exit backend watcher must not regress.");
assert.ok(app.includes("this.applyParameterData(await client.refreshCapabilities(true));"), "Ready backends must trigger a strong capability refresh.");
assert.ok(app.includes("private syncDynamicParameterControls(): void"), "Studio must patch live sampler/scheduler controls after capability refreshes.");
assert.ok(app.includes('syncSelect("#scheduler"') && app.includes('syncSelect("#sampler"'), "Create sampler/scheduler selects must receive refreshed capability values.");
assert.ok(app.includes('syncSelect("#inpaint-config-scheduler"') && app.includes('syncSelect("#inpaint-config-sampler"'), "Inpaint sampler/scheduler selects must receive refreshed capability values.");
assert.ok(app.includes("this.syncDynamicParameterControls();"), "Capability refresh paths must synchronize visible controls without a full render.");
assert.ok(app.includes("attempt < 5"), "Generation-time post-refresh reads must remain bounded.");

console.log("Capability hydration contract OK.");
