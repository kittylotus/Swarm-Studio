/**
 * Create a stable-enough client-side ID without requiring a secure browsing context.
 *
 * crypto.randomUUID() is intentionally restricted to secure contexts in browsers.
 * Studio is also designed to run from plain private-LAN HTTP (eg. 192.168.x.x:1420),
 * so boot-time state/log IDs must not depend on randomUUID being available.
 */
export function createId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }

  // getRandomValues is available in more browser contexts than randomUUID. Use it when
  // possible, but keep a final non-cryptographic fallback because these are UI/database
  // record identifiers, not authentication secrets.
  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    // RFC4122-ish v4 formatting for readability/interoperability; uniqueness is what matters.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
