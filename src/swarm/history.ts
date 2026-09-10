/**
 * Convert a Swarm history/image reference into the route used to GET the media itself.
 *
 * Swarm deliberately exposes two related path shapes:
 * - GenerateText2Image returns `View/local/raw/...`, which is directly fetchable.
 * - ListImages returns an output-history-relative `src` such as `2026-09-10/foo.png`.
 *
 * The latter is NOT directly fetchable from the server root. It must be projected through
 * Swarm's View/local/raw route. Keep this display/read form separate from mutation paths used
 * by DeleteImage / ToggleImageStarred / history traversal.
 */
export function normalizeSwarmImageViewPath(path: unknown): string {
  const original = String(path ?? "").trim();
  if (!original) return "";
  if (/^(data:|blob:)/i.test(original)) return original;

  let normalized = original
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^__swarm\//i, "")
    .split(/[?#]/, 1)[0] ?? "";

  normalized = normalized.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!normalized) return "";

  if (/^View\/local\//i.test(normalized)) return normalized;
  if (/^View\/raw\//i.test(normalized)) return normalized.replace(/^View\/raw\//i, "View/local/raw/");
  if (/^View\//i.test(normalized)) return normalized;
  if (/^local\//i.test(normalized)) return `View/${normalized}`;
  if (/^raw\//i.test(normalized)) return `View/local/${normalized}`;
  if (/^inputs\//i.test(normalized)) return `View/local/${normalized}`;

  // ListImages `src` values are relative to the user's output-history root (normally raw/).
  return `View/local/raw/${normalized}`;
}
