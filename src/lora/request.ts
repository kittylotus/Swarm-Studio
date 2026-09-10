function normalizePath(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

function modelKey(value: unknown): string {
  return normalizePath(value)
    .replace(/\.(safetensors|ckpt|pt)$/i, "")
    .toLowerCase();
}

function leafKey(value: unknown): string {
  return modelKey(value).split("/").pop() ?? "";
}

/**
 * Resolve a saved LoRA stack entry against Swarm's live ListModels("LoRA") inventory.
 *
 * The live model name is the wire authority. This intentionally preserves Swarm's folder path
 * and filename extension instead of reconstructing a value from ListT2IParams metadata. Swarm's
 * own LoRA parameter cleaner/validator handles the model filename. Legacy leaf-only stack entries
 * are repaired only when that leaf is unique in the current inventory.
 */
export function resolveLoraModelName(itemName: string, modelNames: string[]): string | undefined {
  const itemKey = modelKey(itemName);
  const exact = modelNames.find((name) => modelKey(name) === itemKey);
  if (exact) return normalizePath(exact);

  const leaf = leafKey(itemName);
  if (!leaf) return undefined;
  const matches = modelNames.filter((name) => leafKey(name) === leaf);
  return matches.length === 1 ? normalizePath(matches[0]) : undefined;
}

export function loraRequestValue(itemName: string, modelNames: string[]): string | undefined {
  return resolveLoraModelName(itemName, modelNames);
}
