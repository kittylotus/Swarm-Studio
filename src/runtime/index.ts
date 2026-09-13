import { isCivitaiHost } from "../civitai/urls";
import { createId } from "../id";
import { studioSwarmRelayUrl } from "./relay";
import type { ConnectionSettings } from "../types";

export interface RuntimeLogEvent {
  source: "swarm" | "runtime";
  level: "info" | "warn" | "error";
  message: string;
}

export interface RuntimeProcessStatus {
  owned: boolean;
  running: boolean;
  pid: number | null;
}

export interface RuntimeHostControlStatus {
  available: boolean;
  installed: boolean;
  taskInstalled: boolean;
  cliInstalled: boolean;
  command: string;
  message: string;
  actionMessage?: string;
  studio: { running: boolean; pid: number | null };
  swarm: { running: boolean; pid: number | null };
}

export interface RuntimeRepoRef {
  value: string;
  label: string;
  kind: "tag" | "commit" | "branch";
}

export interface RuntimeRepoStatus {
  path: string;
  branch: string;
  commit: string;
  describe: string;
  dirty: boolean;
  origin: string;
  defaultBranch: string;
  launchAutoPull: boolean | null;
  refs: RuntimeRepoRef[];
}

export interface StudioUpdateStatus {
  supported: boolean;
  available: boolean;
  canApply: boolean;
  dirty: boolean;
  repoPath: string;
  currentVersion: string;
  latestVersion: string;
  currentCommit: string;
  latestCommit: string;
  commitsBehind: number;
  branch: string;
  origin: string;
  message: string;
  highlights: string[];
}

export interface RuntimeBridge {
  readonly kind: "browser" | "tauri";
  postJson<T>(url: string, body: Record<string, unknown>, authToken?: string): Promise<T>;
  streamJson(url: string, body: Record<string, unknown>, expectedImages: number, onEvent: (payload: unknown) => void, authToken?: string): Promise<void>;
  getText(url: string, authToken?: string): Promise<string>;
  probe(url: string, authToken?: string): Promise<boolean>;
  fetchDataUrl(url: string, authToken?: string): Promise<string>;
  hostControlStatus(): Promise<RuntimeHostControlStatus>;
  installHostControl(): Promise<RuntimeHostControlStatus>;
  startLocalSwarm(settings: ConnectionSettings): Promise<string>;
  stopLocalSwarm(): Promise<string>;
  processStatus(): Promise<RuntimeProcessStatus>;
  repoStatus(kind: "swarm" | "comfy", pathHint?: string): Promise<RuntimeRepoStatus>;
  fetchRepoVersions(kind: "swarm" | "comfy", pathHint?: string): Promise<RuntimeRepoStatus>;
  switchRepoVersion(kind: "swarm" | "comfy", pathHint: string | undefined, target: string): Promise<RuntimeRepoStatus>;
  updateRepoLatest(kind: "swarm" | "comfy", pathHint?: string): Promise<RuntimeRepoStatus>;
  setSwarmLaunchAutoPull(pathHint: string | undefined, enabled: boolean): Promise<RuntimeRepoStatus>;
  checkStudioUpdate(): Promise<StudioUpdateStatus>;
  applyStudioUpdate(): Promise<string>;
  subscribeLogs(listener: (event: RuntimeLogEvent) => void): void;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function parseJsonText<T>(text: string, url: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = String(text ?? "").replace(/\s+/g, " ").slice(0, 220);
    throw new Error(`Expected JSON from ${url}, but received: ${preview || "an empty response"}`);
  }
}

function websocketUrl(url: string): string {
  return String(url ?? "").replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

function syncBrowserToken(authToken?: string): void {
  if (typeof document === "undefined") return;
  const token = String(authToken ?? "").trim();
  document.cookie = token
    ? `swarm_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax`
    : "swarm_token=; Max-Age=0; Path=/; SameSite=Lax";
}

function isExternalMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return isCivitaiHost(host)
    || host === "huggingface.co" || host.endsWith(".huggingface.co");
}

let browserHostControlSessionReady = false;

async function browserHostControlFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!browserHostControlSessionReady) {
    const session = await fetch("/__studio/host-control/session", { credentials: "same-origin", cache: "no-store" });
    if (!session.ok) throw new Error(`Host control session failed with ${session.status}.`);
    browserHostControlSessionReady = true;
  }
  const response = await fetch(`/__studio/host-control/${path}`, { ...init, credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.error) throw new Error(String(payload.error || `Host control returned ${response.status}.`));
  return payload as T;
}

function connectionPort(settings: ConnectionSettings): number {
  try {
    const value = Number(new URL(settings.baseUrl || "http://127.0.0.1:7801").port || 7801);
    return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 7801;
  } catch {
    return 7801;
  }
}

function browserRelayUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    // External metadata gets its own allowlisted relay. Swarm traffic instead carries only the
    // configured Swarm *port* to the Studio host; the host remains fixed by vite.config so this
    // cannot become an arbitrary LAN proxy.
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/__studio/")) return parsed.href;
    if (isExternalMetadataHost(parsed.hostname)) {
      return `${window.location.origin}/__studio/fetch-text?url=${encodeURIComponent(parsed.href)}`;
    }
    // Preserve the actual configured Swarm port through the same-origin relay. Previously the
    // browser always landed on the runner's default :7801 target, so a perfectly valid :8801
    // Swarm worked in native Studio but the PWA quietly talked to the wrong socket.
    return studioSwarmRelayUrl(parsed.href, window.location.origin);
  } catch {
    return url;
  }
}

async function browserStreamJson(
  url: string,
  body: Record<string, unknown>,
  expectedImages: number,
  onEvent: (payload: unknown) => void,
  authToken?: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let opened = false;
    let foregroundSettled = false;
    let imageCount = 0;
    let closeTimer = 0;
    syncBrowserToken(authToken);
    const socket = new WebSocket(websocketUrl(browserRelayUrl(url)));

    const resolveForeground = () => {
      if (foregroundSettled) return;
      foregroundSettled = true;
      resolve();
    };
    const gracefulClose = () => {
      window.clearTimeout(closeTimer);
      try { if (socket.readyState === WebSocket.OPEN) socket.close(1000, "generation complete"); } catch { /* noop */ }
    };
    const fail = (error: Error) => {
      if (foregroundSettled) return;
      foregroundSettled = true;
      window.clearTimeout(closeTimer);
      try { socket.close(); } catch { /* noop */ }
      reject(error);
    };

    socket.addEventListener("open", () => { opened = true; socket.send(JSON.stringify(body)); });
    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
        // Keep forwarding late finalization events after the foreground promise resolves.
        // Swarm normally embeds metadata in the image event, but extensions/backends can emit
        // useful final metadata immediately afterwards (notably the resolved random seed).
        onEvent(payload);
        if (payload.success === true) { gracefulClose(); resolveForeground(); return; }
        if (payload.image) {
          imageCount += 1;
          if (imageCount >= Math.max(1, expectedImages)) {
            // The final image is enough for Studio to continue indexing/rendering. Keep the
            // socket alive in the background so Swarm can finish its own close handshake.
            resolveForeground();
            window.clearTimeout(closeTimer);
            closeTimer = window.setTimeout(gracefulClose, 8_000);
          }
        }
      } catch (error) {
        fail(new Error(`Could not parse Swarm WebSocket event: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    socket.addEventListener("error", () => {
      fail(new Error(opened ? "The Swarm generation WebSocket failed. Check Logs for the endpoint and remote transport details." : "Could not open the Swarm generation WebSocket."));
    });
    socket.addEventListener("close", (event) => {
      window.clearTimeout(closeTimer);
      if (foregroundSettled) return;
      foregroundSettled = true;
      if (event.code === 1000 || event.code === 1005 || imageCount >= Math.max(1, expectedImages)) resolve();
      else reject(new Error(`Swarm generation WebSocket closed with code ${event.code}.`));
    });
  });
}

const browserRuntime: RuntimeBridge = {
  kind: "browser",
  async postJson<T>(url: string, body: Record<string, unknown>, authToken?: string): Promise<T> {
    syncBrowserToken(authToken);
    const response = await fetch(browserRelayUrl(url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Swarm returned ${response.status}: ${text.slice(0, 240)}`);
    }
    return parseJsonText<T>(text, url);
  },
  streamJson: browserStreamJson,
  async getText(url, authToken) {
    syncBrowserToken(authToken);
    const response = await fetch(browserRelayUrl(url), { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Request returned ${response.status}.`);
    return response.text();
  },
  async probe(url, authToken) {
    try {
      syncBrowserToken(authToken);
      const response = await fetch(browserRelayUrl(url), { method: "GET", mode: "cors", credentials: "same-origin" });
      return response.ok;
    } catch {
      return false;
    }
  },
  async fetchDataUrl(url, authToken) {
    syncBrowserToken(authToken);
    const response = await fetch(browserRelayUrl(url), { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Could not read image: ${response.status}`);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Could not encode image."));
      reader.readAsDataURL(blob);
    });
  },
  async hostControlStatus() {
    return browserHostControlFetch<RuntimeHostControlStatus>("status");
  },
  async installHostControl() {
    throw new Error("Install or repair the SSH launcher from desktop Studio on the host PC.");
  },
  async startLocalSwarm(settings) {
    const status = await browserHostControlFetch<RuntimeHostControlStatus>("action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "swarm", action: "start", workingDirectory: settings.workingDirectory, port: connectionPort(settings) }),
    });
    return status.actionMessage || status.message || "Swarm start requested.";
  },
  async stopLocalSwarm() {
    const status = await browserHostControlFetch<RuntimeHostControlStatus>("action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "swarm", action: "stop" }),
    });
    return status.actionMessage || status.message || "Swarm stop requested.";
  },
  async processStatus() {
    try {
      const status = await browserHostControlFetch<RuntimeHostControlStatus>("status");
      return { owned: status.swarm.running, running: status.swarm.running, pid: status.swarm.pid };
    } catch {
      return { owned: false, running: false, pid: null };
    }
  },
  async repoStatus() {
    throw new Error("Backend source version controls are only available in the desktop app.");
  },
  async fetchRepoVersions() {
    throw new Error("Backend source version controls are only available in the desktop app.");
  },
  async switchRepoVersion() {
    throw new Error("Backend source version controls are only available in the desktop app.");
  },
  async updateRepoLatest() {
    throw new Error("Backend source version controls are only available in the desktop app.");
  },
  async setSwarmLaunchAutoPull() {
    throw new Error("Swarm launch policy controls are only available in the desktop app.");
  },
  async checkStudioUpdate() {
    return {
      supported: false,
      available: false,
      canApply: false,
      dirty: false,
      repoPath: "",
      currentVersion: "PWA",
      latestVersion: "",
      currentCommit: "",
      latestCommit: "",
      commitsBehind: 0,
      branch: "",
      origin: "",
      message: "Source updates are only available in desktop Studio Git checkouts.",
      highlights: [],
    };
  },
  async applyStudioUpdate() {
    throw new Error("Source updates are only available in desktop Studio Git checkouts.");
  },
  subscribeLogs() {
    // Browser mode has no child process to subscribe to.
  },
};

const tauriRuntime: RuntimeBridge = {
  kind: "tauri",
  async postJson<T>(url: string, body: Record<string, unknown>, authToken?: string): Promise<T> {
    const text = await tauriInvoke<string>("http_post_json", {
      url,
      body: JSON.stringify(body),
      authToken: authToken || null,
    });
    return parseJsonText<T>(text, url);
  },
  async streamJson(url, body, expectedImages, onEvent, authToken) {
    const requestId = createId();
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<{ request_id: string; payload: unknown }>("swarm-generation-event", (event) => {
      if (event.payload.request_id === requestId) onEvent(event.payload.payload);
    });
    try {
      await tauriInvoke<void>("websocket_json", {
        url: websocketUrl(url),
        body: JSON.stringify(body),
        requestId,
        expectedImages: Math.max(0, expectedImages),
        authToken: authToken || null,
      });
    } finally {
      unlisten();
    }
  },
  async getText(url, authToken) {
    return tauriInvoke<string>("http_get_text", { url, authToken: authToken || null });
  },
  async probe(url, authToken) {
    return tauriInvoke<boolean>("probe_url", { url, authToken: authToken || null });
  },
  async fetchDataUrl(url, authToken) {
    return tauriInvoke<string>("http_get_data_url", { url, authToken: authToken || null });
  },
  async hostControlStatus() {
    return tauriInvoke<RuntimeHostControlStatus>("host_control_status");
  },
  async installHostControl() {
    return tauriInvoke<RuntimeHostControlStatus>("host_control_install");
  },
  async startLocalSwarm(settings) {
    // System mode needs an explicit PowerShell function/launcher. If that field is blank,
    // fall back to managed discovery so Auto-start can still find a normal SwarmUI install
    // without requiring the user to configure anything first.
    if (settings.launchMode === "system" && settings.launchCommand.trim()) {
      return tauriInvoke<string>("open_swarm_system", {
        command: settings.launchCommand,
        args: settings.launchArgs,
      });
    }
    return tauriInvoke<string>("start_swarm", {
      command: settings.launchCommand,
      args: settings.launchArgs,
      cwd: settings.workingDirectory || null,
    });
  },
  async stopLocalSwarm() {
    return tauriInvoke<string>("stop_swarm");
  },
  async processStatus() {
    return tauriInvoke<RuntimeProcessStatus>("swarm_process_status");
  },
  async repoStatus(kind, pathHint) {
    return tauriInvoke<RuntimeRepoStatus>("backend_repo_status", { kind, pathHint: pathHint || null });
  },
  async fetchRepoVersions(kind, pathHint) {
    return tauriInvoke<RuntimeRepoStatus>("backend_repo_fetch", { kind, pathHint: pathHint || null });
  },
  async switchRepoVersion(kind, pathHint, target) {
    return tauriInvoke<RuntimeRepoStatus>("backend_repo_switch", { kind, pathHint: pathHint || null, target });
  },
  async updateRepoLatest(kind, pathHint) {
    return tauriInvoke<RuntimeRepoStatus>("backend_repo_latest", { kind, pathHint: pathHint || null });
  },
  async setSwarmLaunchAutoPull(pathHint, enabled) {
    return tauriInvoke<RuntimeRepoStatus>("swarm_repo_set_launch_auto_pull", { pathHint: pathHint || null, enabled });
  },
  async checkStudioUpdate() {
    return tauriInvoke<StudioUpdateStatus>("studio_update_check");
  },
  async applyStudioUpdate() {
    return tauriInvoke<string>("studio_update_apply");
  },
  subscribeLogs(listener) {
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      await listen<RuntimeLogEvent>("swarm-log", (event) => listener(event.payload));
    });
  },
};

export const runtime: RuntimeBridge = isTauriRuntime() ? tauriRuntime : browserRuntime;
