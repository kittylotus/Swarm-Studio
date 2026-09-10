import assert from "node:assert/strict";
import {
  STUDIO_SWARM_PORT_PARAM,
  studioSwarmRelayUrl,
  resolveStudioSwarmRelayRequest,
  swarmPortFromUrl,
} from "../src/runtime/relay.ts";

const studioOrigin = "http://192.168.1.50:1420";

assert.equal(swarmPortFromUrl("http://127.0.0.1:8801"), 8801, "custom Swarm ports must survive normalization");
assert.equal(swarmPortFromUrl("http://127.0.0.1:7801"), 7801);

{
  const relayed = new URL(studioSwarmRelayUrl("http://127.0.0.1:8801/API/GetNewSession", studioOrigin));
  assert.equal(relayed.origin, studioOrigin, "browser Swarm traffic must stay same-origin with Studio");
  assert.equal(relayed.pathname, "/__swarm/API/GetNewSession");
  assert.equal(relayed.searchParams.get(STUDIO_SWARM_PORT_PARAM), "8801", "relay URL must carry the configured Swarm port");
}

{
  const existing = new URL(studioSwarmRelayUrl(`${studioOrigin}/__swarm/View/2026-09-10/example.png`, studioOrigin, "http://127.0.0.1:8801"));
  assert.equal(existing.pathname, "/__swarm/View/2026-09-10/example.png");
  assert.equal(existing.searchParams.get(STUDIO_SWARM_PORT_PARAM), "8801", "already-relayed image URLs must gain the configured port instead of being double-relayed");
}

{
  const request = resolveStudioSwarmRelayRequest(`/__swarm/API/ListImages?path=2026-09-10&${STUDIO_SWARM_PORT_PARAM}=8801`, "http://127.0.0.1:7801");
  assert.equal(request.target, "http://127.0.0.1:8801", "Vite relay target must switch to the browser-selected Swarm port");
  assert.equal(request.path, "/__swarm/API/ListImages?path=2026-09-10", "private relay routing parameter must never reach Swarm");
}

{
  const malicious = resolveStudioSwarmRelayRequest(`/__swarm/API/ListImages?${STUDIO_SWARM_PORT_PARAM}=https%3A%2F%2Fevil.example`, "http://127.0.0.1:7801");
  assert.equal(malicious.target, "http://127.0.0.1:7801", "relay selector accepts only numeric ports and cannot replace the host");
}

console.log("Browser relay contract OK.");
