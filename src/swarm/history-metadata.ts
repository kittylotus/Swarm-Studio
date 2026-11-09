import type { OutputRecord } from "../types";

function object(value: unknown): Record<string, unknown> {
  for (let i = 0; i < 4 && typeof value === "string"; i++) {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Bare numbers in Swarm metadata are seconds; explicit units always take precedence. */
export function durationSeconds(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:total\s+)?(milliseconds?|msecs?|ms|minutes?|mins?|m|seconds?|secs?|s|hours?|hrs?|h)?(?=\s|$|\()/i);
  if (!match) return undefined;
  const unit = (match[2] || "s").toLowerCase();
  const multiplier = /^(ms|millisecond|msec)/.test(unit) ? .001 : /^(m|min)/.test(unit) ? 60 : /^(h|hr|hour)/.test(unit) ? 3600 : 1;
  const seconds = Number(match[1]) * multiplier;
  return Number.isFinite(seconds) ? seconds : undefined;
}

export function generationTiming(metadata: unknown): Pick<OutputRecord, "prepTimeMs" | "generationTimeMs" | "totalTimeMs"> {
  const root = object(metadata);
  const extra = object(root.sui_extra_data ?? root.suiExtraData);
  const entries = new Map([...Object.entries(root), ...Object.entries(extra)].map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), value]));
  const read = (...keys: string[]) => keys.map(key => entries.get(key)).find(value => value != null);
  let prep = durationSeconds(read("preptime", "preparetime", "preparationtime"));
  let gen = durationSeconds(read("generationtime", "gentime"));
  let total = durationSeconds(read("totaltime"));
  let text = typeof metadata === "string" ? metadata : "";
  if (!text) { try { text = JSON.stringify(root); } catch { /* Structured metadata can be malformed. */ } }
  // Both current "2 sec (prep) and 3.70 min (gen)" and legacy shared-unit reports.
  const amount = "(\\d+(?:\\.\\d+)?\\s*(?:milliseconds?|msecs?|ms|minutes?|mins?|m|seconds?|secs?|s|hours?|hrs?|h)?)";
  const combined = text.match(new RegExp(`${amount}\\s*\\(prep\\)\\s*(?:and|\\+)\\s*${amount}\\s*\\((?:gen|generation)\\)\\s*(seconds?|minutes?)?`, "i"));
  if (combined) {
    prep ??= durationSeconds(`${combined[1]} ${combined[3] || ""}`.trim());
    gen ??= durationSeconds(`${combined[2]} ${combined[3] || ""}`.trim());
  }
  const prepOnly = text.match(new RegExp(`(?:prep(?:aration)?[_\\s-]*time|prepping)[^0-9]{0,12}${amount}`, "i"));
  const genOnly = text.match(new RegExp(`(?:generation[_\\s-]*time|generating|gen[_\\s-]*time)[^0-9]{0,12}${amount}`, "i"));
  prep ??= durationSeconds(prepOnly?.[1]);
  gen ??= durationSeconds(genOnly?.[1]);
  if (total == null && prep != null && gen != null) total = prep + gen;
  return { prepTimeMs: prep == null ? undefined : prep * 1000, generationTimeMs: gen == null ? undefined : gen * 1000, totalTimeMs: total == null ? undefined : total * 1000 };
}

function localDate(parts: string[], time: string[] = []): number | undefined {
  const [year, month, day] = parts.map(Number);
  const [hour = 0, minute = 0, second = 0] = time.map(Number);
  if (!year || !month || !day || hour > 23 || minute > 59 || second > 59) return undefined;
  const date = new Date(year, month - 1, day, hour, minute, second);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : undefined;
}

/** Prefer a real timestamp. A date-only archive never acquires today's sync time. */
export function historyCreatedAt(path: string, metadata: unknown, previous?: number): number {
  const root = object(metadata);
  const extra = object(root.sui_extra_data ?? root.suiExtraData);
  const values = { ...root, ...extra };
  const dateText = String(values.date ?? "");
  const clock = String(values.time ?? "");
  for (const raw of [values.datetime, values.created_at, values.createdAt, values.timestamp, clock ? `${dateText}T${clock}` : values.date]) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw < 1e12 ? raw * 1000 : raw;
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) continue;
    const timestamp = Date.parse(raw);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  let source = path.replaceAll("\\", "/");
  try { source = decodeURIComponent(source); } catch { /* Preserve an unescaped filename. */ }
  const day = source.match(/(?:^|\/)(\d{4})-(\d{2})-(\d{2})(?:\/|$)/);
  const leaf = source.split("/").pop() || "";
  const dayStart = day ? localDate(day.slice(1)) : undefined;
  const legacyNoon = dayStart != null && previous === localDate(day!.slice(1), ["12", "0", "0"]);
  // A live Studio capture can have seconds/milliseconds absent from the filename. Keep them.
  if (Number.isFinite(previous) && previous! > 0 && !legacyNoon) return previous!;
  // Swarm's standard output template begins with [hour][minute]-, with optional seconds.
  const clockMatch = leaf.match(/^(\d{2})[-_](\d{2})[-_](\d{2})(?=[-_. ])/)
    ?? leaf.match(/^(\d{2})(\d{2})(\d{2})(?=[-_. ])/)
    ?? leaf.match(/^(\d{2})(\d{2})(?=[-_ ])/);
  if (day && clockMatch) {
    const time = localDate(day.slice(1), clockMatch.slice(1));
    if (time != null) return time;
  }
  const metadataDay = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return localDate((day ?? metadataDay)?.slice(1) ?? []) ?? 0;
}

export function compareOutputDates(a: OutputRecord, b: OutputRecord): number {
  return b.createdAt - a.createdAt || (b.swarmSourcePath || b.swarmPath || b.id).localeCompare(a.swarmSourcePath || a.swarmPath || a.id, "en", { numeric: true }) || b.id.localeCompare(a.id);
}
