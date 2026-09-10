import { createId } from "../id";
import type { LoraStackItem } from "../types";
import type { SwarmModel } from "../swarm/types";
import { serverModelKey } from "./compat";

interface ImportedStackItem {
  name?: unknown;
  title?: unknown;
  weight?: unknown;
  enabled?: unknown;
  useTrigger?: unknown;
  sourceUrl?: unknown;
}

interface ImportedStackPayload {
  version?: unknown;
  type?: unknown;
  stack?: {
    name?: unknown;
    items?: unknown;
  };
}

export interface ImportedLoraStack {
  name: string;
  items: LoraStackItem[];
  missing: string[];
}

function finiteWeight(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-4, Math.min(4, number)) : 1;
}

export function importLumiSwarmStack(raw: unknown, available: SwarmModel[]): ImportedLoraStack {
  const payload = raw as ImportedStackPayload;
  if (payload?.type !== "swarm_studio_lora_stack" || !payload.stack || !Array.isArray(payload.stack.items)) {
    throw new Error("That file is not a LumiSwarm Studio LoRA stack export.");
  }

  const byKey = new Map<string, SwarmModel>();
  for (const model of available) {
    byKey.set(serverModelKey(model.name), model);
  }

  const missing: string[] = [];
  const items = (payload.stack.items as ImportedStackItem[]).flatMap((item) => {
    const originalName = typeof item.name === "string" ? item.name.trim() : "";
    if (!originalName) return [];
    const matched = byKey.get(serverModelKey(originalName));
    if (!matched) missing.push(originalName);
    return [{
      id: createId(),
      name: matched?.name ?? originalName.replace(/\.(safetensors|ckpt|pt)$/i, ""),
      title: typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : matched?.title ?? originalName,
      weight: finiteWeight(item.weight),
      enabled: matched ? item.enabled !== false : false,
      useTrigger: item.useTrigger === true,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "",
    } satisfies LoraStackItem];
  });

  return {
    name: typeof payload.stack.name === "string" && payload.stack.name.trim()
      ? payload.stack.name.trim()
      : "Imported LoRA stack",
    items,
    missing,
  };
}
