import assert from "node:assert/strict";
import { normalizeGenerationRequest } from "../src/swarm/request.ts";

const params = [
  { id: "Sampler", name: "Sampler", values: ["euler", "dpmpp_2m"], default: "euler" },
  { id: "Scheduler", name: "Scheduler", values: ["normal", "karras", "beta"], default: "normal" },
  { id: "PreviewMethod", name: "Preview Method", values: ["none", "latent2rgb"], default: "none" },
  { id: "LoRAs", name: "LoRAs", type: "list", values: ["Calendarnew", "Artist-Cutesexyrobusts_-v1-0_-Anima"] },
  { id: "LoRAWeights", name: "LoRA Weights", type: "list" },
];

const base = {
  prompt: "test",
  negativeprompt: "",
  model: "model.safetensors",
  width: 1024,
  height: 1024,
  steps: 20,
  cfgscale: 4,
  seed: 1,
  images: 1,
};

{
  const { request } = normalizeGenerationRequest({ ...base, scheduler: "beta57", swarm_version: "0.9.7" }, params);
  assert.equal(request.scheduler, "beta57", "extension-owned scheduler values must survive even when Swarm's base enum list is stale");
  assert.equal("swarm_version" in request, false, "swarm_version metadata must never cross the generation wire boundary");
}

{
  const { request } = normalizeGenerationRequest({ ...base, sampler: "extension_sampler" }, params);
  assert.equal(request.sampler, "extension_sampler", "unknown enum values must be preserved for extension-provided options");
}

{
  const { request } = normalizeGenerationRequest({ ...base, PreviewMethod: "LATENT2RGB" }, params);
  assert.equal(request.PreviewMethod, "latent2rgb", "enumerated values must preserve the server's canonical spelling/case");
}

{
  const { request } = normalizeGenerationRequest({ ...base, custom_unadvertised_flag: true }, params);
  assert.equal(request.custom_unadvertised_flag, true, "unknown non-transient fields remain available for Swarm API controls/custom extensions");
}

{
  const loras = ["Calendarnew.safetensors", "Artist-Cutesexyrobusts_-v1-0_-Anima.safetensors"];
  const { request } = normalizeGenerationRequest({ ...base, loras, loraweights: ["0.5", "0.6"] }, params);
  assert.equal(request.loras, loras.join(","), "LoRA arrays must use the cross-version comma-delimited LIST wire format");
  assert.equal(request.loraweights, "0.5,0.6", "LoRA weights must use the same cross-version LIST wire format");
  assert.equal(String(request.loras).startsWith("["), false, "LoRAs must never reach old Swarm as a JSON-array string");
}

{
  const extensionParams = [...params, { id: "CustomList", name: "Custom List", type: "list" }];
  const { request } = normalizeGenerationRequest({ ...base, CustomList: ["one", "two"] }, extensionParams);
  assert.equal(request.CustomList, "one,two", "all advertised LIST parameters must use the cross-version wire representation");
}

console.log("Generation request contract OK.");
