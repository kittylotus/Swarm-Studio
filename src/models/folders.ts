export function normalizeModelPath(value: string): string {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

export function modelFolder(name: string): string {
  return normalizeModelPath(name).split("/").slice(0, -1).join("/");
}

export function modelFolderPaths(models: { name: string }[]): string[] {
  const folders = new Set<string>();
  for (const model of models) {
    const parts = modelFolder(model.name).split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
  }
  return [...folders].sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}

export function folderDepth(value: unknown, fallback = 0): number {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return fallback;
  return Math.max(0, Math.min(20, Math.floor(Number(value))));
}

export function modelInFolder(name: string, selected: string, depth: number): boolean {
  const folder = modelFolder(name);
  const current = normalizeModelPath(selected);
  if (folder === current) return true;
  if (current && !folder.startsWith(`${current}/`)) return false;
  const relative = current ? folder.slice(current.length + 1) : folder;
  return Boolean(relative) && relative.split("/").length <= folderDepth(depth);
}
