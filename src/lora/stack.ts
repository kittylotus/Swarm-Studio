import { createId } from "../id.ts";
import type { LoraStackItem } from "../types";

export function cloneLoraStack(items: unknown): LoraStackItem[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item.name !== "string") return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : createId(),
      name: item.name,
      title: typeof item.title === "string" ? item.title : item.name,
      weight: Number.isFinite(Number(item.weight)) ? Number(item.weight) : 1,
      enabled: item.enabled !== false,
      useTrigger: item.useTrigger === true,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "",
    }];
  });
}
