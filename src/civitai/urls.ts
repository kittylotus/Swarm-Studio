export const CIVITAI_ORIGIN = "https://civitai.red";
export const CIVITAI_FALLBACK_ORIGIN = "https://civitai.com";

export function isCivitaiHost(hostname: string): boolean {
  const host = String(hostname ?? "").trim().toLowerCase();
  return host === "civitai.com" || host.endsWith(".civitai.com")
    || host === "civitai.red" || host.endsWith(".civitai.red");
}

export function routeCivitaiUrl(value: string): string {
  try {
    const url = new URL(value);
    if (isCivitaiHost(url.hostname)) {
      url.protocol = "https:";
      url.hostname = "civitai.red";
      url.port = "";
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function civitaiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${CIVITAI_ORIGIN}${normalized}`;
}
