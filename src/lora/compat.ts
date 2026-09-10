import type { SwarmModel } from "../swarm/types";

export type CompatibilityStatus = "compatible" | "unknown" | "incompatible";

function normalized(value?: string): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function family(model: SwarmModel): string {
  const haystack = [
    model.name,
    model.title,
    model.description,
    model.usage_hint,
    model.compat_class,
    model.architecture,
    model.class,
    ...(model.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/anima/.test(haystack)) return "anima";
  if (/krea/.test(haystack)) return "krea";
  if (/flux/.test(haystack)) return "flux";
  if (/illustrious|noobai|noob ai|illust/.test(haystack)) return "illustrious";
  if (/pony/.test(haystack)) return "pony";
  if (/sdxl|stable.?diffusion.?xl|xl base/.test(haystack)) return "sdxl";
  if (/sd3|stable.?diffusion.?3/.test(haystack)) return "sd3";
  if (/sd2|stable.?diffusion.?2/.test(haystack)) return "sd2";
  if (/sd1|stable.?diffusion.?1|sd15|1\.5/.test(haystack)) return "sd1";
  return "";
}

export function modelFamily(model?: SwarmModel): string {
  return model ? family(model) : "";
}

export function loraCompatibility(lora: SwarmModel, checkpoint?: SwarmModel): CompatibilityStatus {
  if (!checkpoint) return "unknown";

  const loraCompat = normalized(lora.compat_class);
  const checkpointCompat = normalized(checkpoint.compat_class);
  if (loraCompat && checkpointCompat) {
    return loraCompat === checkpointCompat ? "compatible" : "incompatible";
  }

  const loraArchitecture = normalized(lora.architecture);
  const checkpointArchitecture = normalized(checkpoint.architecture);
  if (loraArchitecture && checkpointArchitecture) {
    return loraArchitecture === checkpointArchitecture ? "compatible" : "incompatible";
  }

  const loraFamily = family(lora);
  const checkpointFamily = family(checkpoint);
  if (loraFamily && checkpointFamily) {
    return loraFamily === checkpointFamily ? "compatible" : "incompatible";
  }

  return "unknown";
}

export function serverModelKey(value: unknown): string {
  const safe = String(value ?? "");
  const slashNormalized = safe.replaceAll("\\", "/");
  const leaf = slashNormalized.split("/").pop() ?? slashNormalized;
  return leaf.replace(/\.(safetensors|ckpt|pt)$/i, "").toLowerCase();
}
