import assert from "node:assert/strict";
import { loraRequestValue, resolveLoraModelName } from "../src/lora/request.ts";

// Minimal mock of Swarm ListModels("LoRA") after some models were organized into folders.
const liveModels = [
  "Chibi/Calendarnew.safetensors",
  "Anima/Artist-Cutesexyrobusts_-v1-0_-Anima.safetensors",
  "Characters/Duplicate.safetensors",
  "Styles/Duplicate.safetensors",
  "RootOnly.safetensors",
];

assert.equal(
  loraRequestValue("Calendarnew.safetensors", liveModels),
  "Chibi/Calendarnew.safetensors",
  "legacy leaf-only stack entries must repair to the exact current ListModels path",
);
assert.equal(
  loraRequestValue("Chibi\\Calendarnew.safetensors", liveModels),
  "Chibi/Calendarnew.safetensors",
  "Windows separators normalize while the live filename and extension are preserved",
);
assert.equal(
  loraRequestValue("Anima/Artist-Cutesexyrobusts_-v1-0_-Anima", liveModels),
  "Anima/Artist-Cutesexyrobusts_-v1-0_-Anima.safetensors",
  "extensionless saved values resolve back to the live Swarm model filename",
);
assert.equal(
  loraRequestValue("RootOnly", liveModels),
  "RootOnly.safetensors",
  "root-level LoRAs preserve Swarm's live filename on the generation wire",
);
assert.equal(
  loraRequestValue("Duplicate.safetensors", liveModels),
  undefined,
  "ambiguous leaf-only names must fail rather than selecting a random folder",
);
assert.equal(
  loraRequestValue("Characters/Duplicate", liveModels),
  "Characters/Duplicate.safetensors",
  "an explicit folder path disambiguates duplicate leaves",
);
assert.equal(resolveLoraModelName("Missing.safetensors", liveModels), undefined, "missing LoRAs stay missing");

console.log("LoRA request contract OK.");
