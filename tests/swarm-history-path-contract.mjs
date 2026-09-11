import assert from "node:assert/strict";
import { swarmImageMutationPath, swarmImageViewPath } from "../src/swarm/history.ts";
import { STUDIO_SWARM_PORT_PARAM, studioSwarmRelayUrl } from "../src/runtime/relay.ts";

const datedPath = "2026-09-10/2026-09-10_16-27_1627669525.png";
const localSession = { session_id: "test", user_id: "local", output_append_user: true };
const namedSession = { session_id: "test", user_id: "eleisea", output_append_user: true };
const outputSession = { session_id: "test", user_id: "local", output_append_user: false };

assert.equal(
  swarmImageViewPath(datedPath, localSession),
  `View/local/${datedPath}`,
  "ListImages paths must be rooted at View/<user>/ without inventing a raw folder",
);
assert.equal(swarmImageViewPath(`raw/${datedPath}`, localSession), `View/local/raw/${datedPath}`);
assert.equal(swarmImageViewPath(`inputs/${datedPath}`, localSession), `View/local/inputs/${datedPath}`);
assert.equal(swarmImageViewPath(datedPath, namedSession), `View/eleisea/${datedPath}`);
assert.equal(swarmImageViewPath(datedPath, outputSession), `Output/${datedPath}`);
assert.equal(swarmImageViewPath(`raw/${datedPath}`, outputSession), `Output/raw/${datedPath}`);

assert.equal(
  swarmImageViewPath(`View/local/${datedPath}`, outputSession),
  `View/local/${datedPath}`,
  "GenerateText2Image View routes are already fetchable and must be trusted",
);
assert.equal(
  swarmImageViewPath(`Output/${datedPath}`, localSession),
  `Output/${datedPath}`,
  "GenerateText2Image Output routes are already fetchable and must be trusted",
);
assert.equal(
  swarmImageViewPath(`http://127.0.0.1:8801/${datedPath}?cache=1`, localSession),
  `View/local/${datedPath}`,
  "legacy persisted bare URLs must re-project using the live session contract",
);
assert.equal(
  swarmImageViewPath(datedPath, null),
  datedPath,
  "without GetNewSession routing data Studio must not guess local/raw/Output topology",
);
assert.equal(swarmImageViewPath("data:image/png;base64,abc", localSession), "data:image/png;base64,abc");
assert.equal(swarmImageViewPath(`View/local/${datedPath}`, null), `View/local/${datedPath}`);

// Minimal persisted-record mock for the v0.63.20 desynchronization: the cached display path may
// contain the guessed raw/ segment, but the exact ListImages source path remains authoritative.
const staleCachedRecord = {
  swarmSourcePath: datedPath,
  swarmPath: `View/local/raw/${datedPath}`,
  url: `http://127.0.0.1:8801/View/local/raw/${datedPath}`,
};
const authoritativeSource = staleCachedRecord.swarmSourcePath || staleCachedRecord.swarmPath || staleCachedRecord.url;
assert.equal(
  swarmImageViewPath(authoritativeSource, localSession),
  `View/local/${datedPath}`,
  "a stale v0.63.20 display route must self-heal from its persisted ListImages source path",
);

assert.equal(swarmImageMutationPath(`View/local/${datedPath}`, localSession), datedPath);
assert.equal(swarmImageMutationPath(`View/local/raw/${datedPath}`, localSession), `raw/${datedPath}`);
assert.equal(swarmImageMutationPath(`Output/${datedPath}`, outputSession), datedPath);
assert.equal(swarmImageMutationPath(datedPath, localSession), datedPath);
assert.equal(
  swarmImageMutationPath(`View/someone-else/${datedPath}`, localSession),
  `View/someone-else/${datedPath}`,
  "mutation routing must not strip another user's View prefix",
);
assert.equal(swarmImageMutationPath("data:image/png;base64,abc", localSession), "");

const studioOrigin = "http://192.168.1.50:1420";
for (const [session, expectedPath] of [
  [localSession, `/__swarm/View/local/${datedPath}`],
  [outputSession, `/__swarm/Output/${datedPath}`],
]) {
  const relayed = new URL(studioSwarmRelayUrl(
    `http://127.0.0.1:8801/${swarmImageViewPath(datedPath, session)}`,
    studioOrigin,
    "http://127.0.0.1:8801",
  ));
  assert.equal(relayed.origin, studioOrigin);
  assert.equal(relayed.pathname, expectedPath);
  assert.equal(relayed.searchParams.get(STUDIO_SWARM_PORT_PARAM), "8801");
}

console.log("Swarm session image routing contract OK.");
