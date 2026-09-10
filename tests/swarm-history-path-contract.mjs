import assert from "node:assert/strict";
import { normalizeSwarmImageViewPath } from "../src/swarm/history.ts";
import { STUDIO_SWARM_PORT_PARAM, studioSwarmRelayUrl } from "../src/runtime/relay.ts";

const datedPath = "2026-09-10/2026-09-10_16-27_1627669525.png";

assert.equal(
  normalizeSwarmImageViewPath(datedPath),
  `View/local/raw/${datedPath}`,
  "ListImages history-relative src values must be projected through View/local/raw",
);
assert.equal(normalizeSwarmImageViewPath(`raw/${datedPath}`), `View/local/raw/${datedPath}`);
assert.equal(normalizeSwarmImageViewPath(`local/raw/${datedPath}`), `View/local/raw/${datedPath}`);
assert.equal(normalizeSwarmImageViewPath(`View/raw/${datedPath}`), `View/local/raw/${datedPath}`);
assert.equal(normalizeSwarmImageViewPath(`View/local/raw/${datedPath}`), `View/local/raw/${datedPath}`);
assert.equal(
  normalizeSwarmImageViewPath(`http://127.0.0.1:8801/${datedPath}?cache=1`),
  `View/local/raw/${datedPath}`,
  "legacy persisted bare URLs must self-heal after restart",
);

const studioOrigin = "http://192.168.1.50:1420";
const relayed = new URL(studioSwarmRelayUrl(
  `http://127.0.0.1:8801/${normalizeSwarmImageViewPath(datedPath)}`,
  studioOrigin,
  "http://127.0.0.1:8801",
));
assert.equal(relayed.origin, studioOrigin);
assert.equal(relayed.pathname, `/__swarm/View/local/raw/${datedPath}`);
assert.equal(relayed.searchParams.get(STUDIO_SWARM_PORT_PARAM), "8801");

console.log("Swarm history image path contract OK.");
