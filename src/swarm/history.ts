import type { SwarmSession } from "./types";

/**
 * Reduce a Swarm media reference to its server-relative path without inventing storage topology.
 * Swarm owns the output root; Studio should only remove transport wrappers (origin, relay prefix,
 * query/hash fragments) before applying the routing data returned by GetNewSession.
 */
function normalizeSwarmMediaPath(path: unknown): string {
  const original = String(path ?? "").trim();
  if (!original) return "";
  if (/^(data:|blob:)/i.test(original)) return original;

  let normalized = original
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^__swarm\//i, "")
    .split(/[?#]/, 1)[0] ?? "";

  normalized = normalized.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return normalized;
}

function sessionUserId(session: Pick<SwarmSession, "user_id"> | null | undefined): string {
  return String(session?.user_id ?? "").trim().replace(/^\/+|\/+$/g, "");
}

/**
 * Resolve a Swarm image/history reference into the route used to GET the media itself.
 *
 * GenerateText2Image already returns a fetchable `View/<user>/...` or `Output/...` route and is
 * therefore trusted as-is. ListImages returns a path relative to the active user's OutputDirectory;
 * GetNewSession tells us which public route exposes that root:
 *
 *   output_append_user=true  -> View/<user_id>/<src>
 *   output_append_user=false -> Output/<src>
 *
 * If session routing data is unavailable, leave a relative path relative. Guessing `local`, `raw`,
 * or any other folder would turn a missing fact into a broken URL on customized Swarm installs.
 */
export function swarmImageViewPath(
  path: unknown,
  session: Pick<SwarmSession, "user_id" | "output_append_user"> | null | undefined,
): string {
  const normalized = normalizeSwarmMediaPath(path);
  if (!normalized || /^(data:|blob:)/i.test(normalized)) return normalized;

  if (/^(View|Output)\//i.test(normalized)) return normalized;

  if (session?.output_append_user === true) {
    const userId = sessionUserId(session);
    return userId ? `View/${userId}/${normalized}` : normalized;
  }
  if (session?.output_append_user === false) return `Output/${normalized}`;

  return normalized;
}

/**
 * Convert a fetchable Swarm media route back to the path expected by history mutation APIs such as
 * DeleteImage and ToggleImageStarred. Those APIs operate relative to the user's OutputDirectory.
 * Only strip a `View/<user>/` prefix when it belongs to the active session; never guess another
 * user's route. `Output/` is unambiguous and can always be removed.
 */
export function swarmImageMutationPath(
  path: unknown,
  session: Pick<SwarmSession, "user_id"> | null | undefined,
): string {
  const normalized = normalizeSwarmMediaPath(path);
  if (!normalized || /^(data:|blob:)/i.test(normalized)) return "";

  if (/^Output\//i.test(normalized)) return normalized.replace(/^Output\//i, "");

  const userId = sessionUserId(session);
  if (userId) {
    const prefix = `View/${userId}/`;
    if (normalized.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
      return normalized.slice(prefix.length);
    }
  }

  return normalized;
}
