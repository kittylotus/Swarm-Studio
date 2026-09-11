import type { SwarmModel } from "../swarm/types";

function serverModelKey(value: unknown): string {
  const safe = String(value ?? "");
  const slashNormalized = safe.replaceAll("\\", "/");
  const leaf = slashNormalized.split("/").pop() ?? slashNormalized;
  return leaf.replace(/\.(safetensors|ckpt|pt)$/i, "").toLowerCase();
}

function modelFamily(model: SwarmModel): string {
  const haystack = [model.name, model.title, model.description, model.usage_hint, model.compat_class, model.architecture, model.class, ...(model.tags ?? [])]
    .filter(Boolean).join(" ").toLowerCase();
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

export type CivitaiFacetStatus = "matched" | "unmatched" | "error";
export type LoraFacetMetadataFilter = "all" | "tagged" | "matched" | "unclassified" | "stats-uncached";
export type LoraFacetSort = "name" | "creator" | "tag-count" | "downloads" | "rating" | "newest";

export interface CivitaiFacetRecord {
  modelKey: string;
  hash?: string;
  modelId?: number;
  versionId?: number;
  tags: string[];
  creator?: string;
  baseModel?: string;
  family?: string;
  downloads?: number;
  rating?: number;
  ratingCount?: number;
  createdAt?: string;
  fetchedAt: number;
  status: CivitaiFacetStatus;
  error?: string;
}

export interface CivitaiFacetCache {
  version: 1;
  records: Record<string, CivitaiFacetRecord>;
}

export interface LoraFacetFilters {
  tags: string[];
  creator: string;
  family: string;
  metadata: LoraFacetMetadataFilter;
  sort: LoraFacetSort;
}

export interface LoraFacetMetadata {
  tags: string[];
  creator: string;
  family: string;
  record?: CivitaiFacetRecord;
  matched: boolean;
  statsUncached: boolean;
}

export interface LoraFacetCounts {
  tags: Array<{ name: string; count: number }>;
  creators: Array<{ name: string; count: number }>;
  families: Array<{ name: string; count: number }>;
  tagged: number;
  matched: number;
  unclassified: number;
  unclassifiedLookupDue: number;
  statsUncached: number;
}

const finite = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function normalizeFacetTag(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeFacetTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value) {
    const tag = normalizeFacetTag(typeof raw === "string" ? raw : (raw && typeof raw === "object" ? (raw as Record<string, unknown>).name : ""));
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function emptyCivitaiFacetCache(): CivitaiFacetCache {
  return { version: 1, records: {} };
}

export function normalizeCivitaiFacetCache(value: unknown): CivitaiFacetCache {
  const cache = emptyCivitaiFacetCache();
  if (!value || typeof value !== "object" || Array.isArray(value)) return cache;
  const source = value as Record<string, unknown>;
  const records = source.records && typeof source.records === "object" && !Array.isArray(source.records)
    ? source.records as Record<string, unknown>
    : source;
  for (const [rawKey, rawRecord] of Object.entries(records)) {
    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) continue;
    const record = rawRecord as Record<string, unknown>;
    const modelKey = serverModelKey(record.modelKey ?? rawKey);
    if (!modelKey) continue;
    const status = record.status === "unmatched" || record.status === "error" ? record.status : "matched";
    cache.records[modelKey] = {
      modelKey,
      hash: String(record.hash ?? "").trim() || undefined,
      modelId: finite(record.modelId),
      versionId: finite(record.versionId),
      tags: normalizeFacetTags(record.tags),
      creator: String(record.creator ?? "").trim() || undefined,
      baseModel: String(record.baseModel ?? "").trim() || undefined,
      family: String(record.family ?? "").trim().toLowerCase() || undefined,
      downloads: finite(record.downloads),
      rating: finite(record.rating),
      ratingCount: finite(record.ratingCount),
      createdAt: String(record.createdAt ?? "").trim() || undefined,
      fetchedAt: finite(record.fetchedAt) ?? 0,
      status,
      error: String(record.error ?? "").trim() || undefined,
    };
  }
  return cache;
}

export function effectiveFacetMetadata(model: SwarmModel, cache: CivitaiFacetCache): LoraFacetMetadata {
  const record = cache.records[serverModelKey(model.name)];
  const tags = normalizeFacetTags([...(model.tags ?? []), ...(record?.tags ?? [])]);
  const creator = String(record?.creator || model.author || "").trim();
  const family = String(record?.family || modelFamily(model) || "").trim().toLowerCase();
  return {
    tags,
    creator,
    family,
    record,
    matched: record?.status === "matched",
    statsUncached: !isFacetRecordFresh(record),
  };
}

function selectedTagSet(tags: string[]): Set<string> {
  return new Set(normalizeFacetTags(tags).map((tag) => tag.toLowerCase()));
}

export function modelMatchesFacetFilters(model: SwarmModel, cache: CivitaiFacetCache, filters: LoraFacetFilters): boolean {
  const meta = effectiveFacetMetadata(model, cache);
  const selectedTags = selectedTagSet(filters.tags);
  if (selectedTags.size) {
    const modelTags = new Set(meta.tags.map((tag) => tag.toLowerCase()));
    if (![...selectedTags].some((tag) => modelTags.has(tag))) return false;
  }
  if (filters.creator && meta.creator.toLowerCase() !== filters.creator.toLowerCase()) return false;
  if (filters.family && meta.family !== filters.family.toLowerCase()) return false;
  if (filters.metadata === "tagged" && !meta.tags.length) return false;
  if (filters.metadata === "matched" && !meta.matched) return false;
  if (filters.metadata === "unclassified" && meta.tags.length) return false;
  if (filters.metadata === "stats-uncached" && !meta.statsUncached) return false;
  return true;
}

export function sortModelsByFacets(models: SwarmModel[], cache: CivitaiFacetCache, sort: LoraFacetSort): SwarmModel[] {
  const copy = [...models];
  const meta = (model: SwarmModel) => effectiveFacetMetadata(model, cache);
  const name = (model: SwarmModel) => String(model.title || model.name).toLocaleLowerCase();
  const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  const compareNumberDesc = (a: number | undefined, b: number | undefined) => (b ?? Number.NEGATIVE_INFINITY) - (a ?? Number.NEGATIVE_INFINITY);
  const dateMs = (model: SwarmModel) => {
    const raw = meta(model).record?.createdAt || model.date || "";
    const value = Date.parse(raw);
    return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
  };

  copy.sort((a, b) => {
    const aMeta = meta(a);
    const bMeta = meta(b);
    let result = 0;
    if (sort === "creator") result = compareText(aMeta.creator || "zzzz", bMeta.creator || "zzzz");
    else if (sort === "tag-count") result = bMeta.tags.length - aMeta.tags.length;
    else if (sort === "downloads") result = compareNumberDesc(aMeta.record?.downloads, bMeta.record?.downloads);
    else if (sort === "rating") result = compareNumberDesc(aMeta.record?.rating, bMeta.record?.rating);
    else if (sort === "newest") result = dateMs(b) - dateMs(a);
    if (!result) result = compareText(name(a), name(b));
    return result;
  });
  return copy;
}

export function applyLoraFacetView(models: SwarmModel[], cache: CivitaiFacetCache, filters: LoraFacetFilters): SwarmModel[] {
  return sortModelsByFacets(models.filter((model) => modelMatchesFacetFilters(model, cache, filters)), cache, filters.sort);
}

export function buildLoraFacetCounts(models: SwarmModel[], cache: CivitaiFacetCache): LoraFacetCounts {
  const tags = new Map<string, { name: string; count: number }>();
  const creators = new Map<string, { name: string; count: number }>();
  const families = new Map<string, { name: string; count: number }>();
  let tagged = 0;
  let matched = 0;
  let unclassified = 0;
  let unclassifiedLookupDue = 0;
  let statsUncached = 0;

  const bump = (map: Map<string, { name: string; count: number }>, label: string) => {
    const name = normalizeFacetTag(label);
    if (!name) return;
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { name, count: 1 });
  };

  for (const model of models) {
    const meta = effectiveFacetMetadata(model, cache);
    if (meta.tags.length) tagged += 1;
    else unclassified += 1;
    if (meta.matched) matched += 1;
    if (!meta.tags.length && meta.statsUncached) unclassifiedLookupDue += 1;
    if (meta.statsUncached) statsUncached += 1;
    for (const tag of meta.tags) bump(tags, tag);
    bump(creators, meta.creator);
    bump(families, meta.family);
  }

  const ranked = (map: Map<string, { name: string; count: number }>) => [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return {
    tags: ranked(tags),
    creators: ranked(creators),
    families: ranked(families),
    tagged,
    matched,
    unclassified,
    unclassifiedLookupDue,
    statsUncached,
  };
}

export type FacetEnrichmentMode = "classification" | "stats";

export function selectFacetEnrichmentCandidates(
  models: SwarmModel[],
  cache: CivitaiFacetCache,
  mode: FacetEnrichmentMode,
  preferredModelNames: string[] = [],
  limit = 24,
): SwarmModel[] {
  const preferred = new Set(preferredModelNames.map(serverModelKey));
  return models
    .filter((model) => {
      const meta = effectiveFacetMetadata(model, cache);
      return meta.statsUncached && (mode === "stats" || !meta.tags.length);
    })
    .sort((a, b) => {
      const aMeta = effectiveFacetMetadata(a, cache);
      const bMeta = effectiveFacetMetadata(b, cache);
      const preferredDelta = Number(preferred.has(serverModelKey(b.name))) - Number(preferred.has(serverModelKey(a.name)));
      if (preferredDelta) return preferredDelta;
      const unclassifiedDelta = Number(!bMeta.tags.length) - Number(!aMeta.tags.length);
      if (unclassifiedDelta) return unclassifiedDelta;
      return String(a.title || a.name).localeCompare(String(b.title || b.name), undefined, { sensitivity: "base", numeric: true });
    })
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function isFacetRecordFresh(record: CivitaiFacetRecord | undefined, maxAgeMs = 14 * 24 * 60 * 60 * 1000, now = Date.now()): boolean {
  if (!record || record.fetchedAt <= 0) return false;
  const statusAge = record.status === "error"
    ? Math.min(maxAgeMs, 30 * 60 * 1000)
    : record.status === "unmatched"
      ? Math.min(maxAgeMs, 7 * 24 * 60 * 60 * 1000)
      : maxAgeMs;
  return now - record.fetchedAt <= statusAge;
}
