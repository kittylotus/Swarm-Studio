import assert from "node:assert/strict";
import { dimensionsForRatio, ratioReversedForDimensions, swapResolutionDimensions } from "../src/resolution.ts";

assert.equal(ratioReversedForDimensions("2:3", 960, 768), true, "Landscape dimensions must preserve landscape orientation for portrait-authored presets.");
assert.equal(ratioReversedForDimensions("2:3", 768, 960), false, "Portrait dimensions must preserve portrait orientation for portrait-authored presets.");
assert.equal(ratioReversedForDimensions("1:1", 960, 768), false, "Square presets are never reversed.");

assert.deepEqual(
  dimensionsForRatio("2:3", true, 960, 768),
  { width: 960, height: 640 },
  "Selecting 2:3 from a landscape draft must produce 3:2 landscape geometry.",
);
assert.deepEqual(
  dimensionsForRatio("2:3", false, 768, 960),
  { width: 640, height: 960 },
  "Selecting 2:3 from a portrait draft must preserve portrait geometry.",
);
assert.deepEqual(
  dimensionsForRatio("4:5", true, 768, 960),
  { width: 960, height: 768 },
  "Reversing a 4:5 preset must produce 5:4 geometry at the same long side.",
);
assert.deepEqual(
  swapResolutionDimensions(768, 960),
  { width: 960, height: 768 },
  "Reverse ratio must swap the actual dimensions exactly.",
);

console.log("Resolution contract OK");
