import type { SwarmGenerationRequest, SwarmParamDefinition } from "./types";

export interface GenerationRequestNormalization {
  request: SwarmGenerationRequest;
  notes: string[];
}

const TRANSIENT_REQUEST_KEYS = new Set(["swarmversion"]);
const CORE_LIST_REQUEST_KEYS = new Set(["loras", "loraweights", "loratencweights", "lorasectionconfinement"]);

function isListParameter(param: SwarmParamDefinition | undefined, normalizedKey: string): boolean {
  return String(param?.type ?? "").toLowerCase() === "list" || CORE_LIST_REQUEST_KEYS.has(normalizedKey);
}

/**
 * Swarm 0.9.7 stringifies raw JSON arrays before LIST validation, which leaves bracket/quote
 * syntax in the value and makes otherwise-valid list entries fail validation. Newer Swarm builds
 * accept arrays directly, but both generations accept the historical comma-delimited LIST wire
 * format. Keep arrays inside Studio and collapse only at the final API boundary.
 */
function listWireValue(value: unknown[]): string {
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).join(",");
}

export function normalizeParamKey(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function valueLabel(value: string | { name?: string; value?: string; title?: string }): string {
  if (typeof value === "string") return value;
  return String(value.value ?? value.name ?? value.title ?? "");
}

function definitionForKey(params: SwarmParamDefinition[], key: string): SwarmParamDefinition | undefined {
  const wanted = normalizeParamKey(key);
  return params.find((param) => [param.id, param.name]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalizeParamKey(value) === wanted));
}

function canonicalAllowedValue(raw: unknown, param: SwarmParamDefinition): string | undefined {
  if (raw == null || typeof raw === "object") return undefined;
  const allowed = Array.isArray(param.values) ? param.values.map(valueLabel).filter(Boolean) : [];
  if (!allowed.length) return undefined;

  const requestedKey = normalizeParamKey(raw);
  return allowed.find((candidate) => normalizeParamKey(candidate) === requestedKey);
}

/**
 * Final wire-contract normalization for generation requests.
 *
 * Strip transient Studio/history metadata and normalize spelling/case only when the connected
 * server advertises an exact semantic match. Unknown enum values are intentionally preserved:
 * extension-owned samplers/schedulers can be valid even when Swarm's base parameter list is stale.
 */
export function normalizeGenerationRequest(
  request: SwarmGenerationRequest,
  params: SwarmParamDefinition[],
): GenerationRequestNormalization {
  const output: Record<string, unknown> = {};
  const notes: string[] = [];

  for (const [key, value] of Object.entries(request)) {
    if (value === undefined) continue;
    const normalizedKey = normalizeParamKey(key);
    if (TRANSIENT_REQUEST_KEYS.has(normalizedKey)) {
      notes.push(`Dropped transient ${key}.`);
      continue;
    }

    const param = definitionForKey(params, key);
    if (Array.isArray(value)) {
      if (isListParameter(param, normalizedKey)) {
        output[key] = listWireValue(value);
        continue;
      }
      output[key] = value;
      continue;
    }
    if (!param || value == null || typeof value === "object" || !Array.isArray(param.values) || !param.values.length) {
      output[key] = value;
      continue;
    }

    const canonical = canonicalAllowedValue(value, param);
    output[key] = canonical ?? value;
    if (canonical !== undefined && String(value) !== canonical) {
      notes.push(`${param.name ?? param.id ?? key}: ${String(value)} -> ${canonical}.`);
    }
  }

  return { request: output as SwarmGenerationRequest, notes };
}
