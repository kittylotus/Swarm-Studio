export const STUDIO_SWARM_PORT_PARAM = "__studio_swarm_port";
export const DEFAULT_SWARM_RELAY_TARGET = "http://127.0.0.1:7801";

function validPort(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : null;
}

export function swarmPortFromUrl(value: unknown, fallback = 7801): number {
  try {
    const parsed = new URL(String(value ?? ""));
    if (parsed.port) return validPort(parsed.port) ?? fallback;
    if (parsed.protocol === "https:") return 443;
    if (parsed.protocol === "http:") return 80;
  } catch { /* fall through */ }
  return fallback;
}

export function studioSwarmRelayUrl(targetUrl: string, studioOrigin: string, configuredBaseUrl?: string): string {
  const origin = String(studioOrigin ?? "").replace(/\/+$/, "");
  const parsed = new URL(targetUrl, `${origin}/`);

  if (parsed.origin === origin && parsed.pathname.startsWith("/__swarm/")) {
    if (!parsed.searchParams.has(STUDIO_SWARM_PORT_PARAM)) {
      parsed.searchParams.set(STUDIO_SWARM_PORT_PARAM, String(swarmPortFromUrl(configuredBaseUrl || DEFAULT_SWARM_RELAY_TARGET)));
    }
    return parsed.href;
  }

  const relay = new URL(`${origin}/__swarm${parsed.pathname}`);
  for (const [key, value] of parsed.searchParams) relay.searchParams.append(key, value);
  relay.searchParams.set(STUDIO_SWARM_PORT_PARAM, String(swarmPortFromUrl(configuredBaseUrl || parsed.href)));
  return relay.href;
}

export function resolveStudioSwarmRelayRequest(path: string, fallbackTarget = DEFAULT_SWARM_RELAY_TARGET): { target: string; path: string; port: number } {
  const requestUrl = new URL(path, "http://studio.invalid");
  const fallbackPort = swarmPortFromUrl(fallbackTarget, 7801);
  const requestedPort = validPort(requestUrl.searchParams.get(STUDIO_SWARM_PORT_PARAM)) ?? fallbackPort;
  requestUrl.searchParams.delete(STUDIO_SWARM_PORT_PARAM);

  let target = DEFAULT_SWARM_RELAY_TARGET;
  try {
    const parsedTarget = new URL(fallbackTarget);
    parsedTarget.port = String(requestedPort);
    target = parsedTarget.origin;
  } catch {
    target = `http://127.0.0.1:${requestedPort}`;
  }

  return {
    target,
    path: `${requestUrl.pathname}${requestUrl.search}`,
    port: requestedPort,
  };
}
