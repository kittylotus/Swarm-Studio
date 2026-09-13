import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_SWARM_RELAY_TARGET, resolveStudioSwarmRelayRequest } from "./src/runtime/relay";

const swarmRelayFallbackTarget = process.env.SWARM_STUDIO_RELAY_TARGET || DEFAULT_SWARM_RELAY_TARGET;

const execFileAsync = promisify(execFile);
const configRoot = path.dirname(fileURLToPath(import.meta.url));
const hostControlScript = path.join(configRoot, "scripts", "host-control.ps1");
const hostControlToken = randomBytes(24).toString("hex");

function hostControlCookie(req: import("node:http").IncomingMessage): string {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === "swarm_studio_host") return rest.join("=");
  }
  return "";
}

function sameOriginRequest(req: import("node:http").IncomingMessage): boolean {
  const origin = String(req.headers.origin || "");
  if (!origin) return false;
  try { return new URL(origin).host === String(req.headers.host || ""); } catch { return false; }
}

async function readJsonBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > 16_384) throw new Error("Host-control request body is too large.");
    chunks.push(value);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function invokeHostControl(args: string[]): Promise<Record<string, unknown>> {
  if (process.platform !== "win32") return { available: false, installed: false, message: "Host control currently targets Windows." };
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", hostControlScript, ...args, "-Json",
  ], { cwd: configRoot, windowsHide: true, maxBuffer: 256 * 1024 });
  const text = String(stdout || "").trim();
  if (!text) throw new Error("Host control returned an empty response.");
  return JSON.parse(text) as Record<string, unknown>;
}

export default defineConfig({
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/__swarm": {
        target: swarmRelayFallbackTarget,
        changeOrigin: true,
        ws: true,
        configure(_proxy, options) {
          // The PWA can be configured for Swarm on any local port (7801, 8801, ...). Carry only
          // that numeric port through the same-origin relay and retarget the existing proxy per
          // request. The relay host itself stays fixed by SWARM_STUDIO_RELAY_TARGET, so a browser
          // cannot turn Studio into an arbitrary-network SSRF proxy.
          options.rewrite = (path) => {
            const resolved = resolveStudioSwarmRelayRequest(path, swarmRelayFallbackTarget);
            options.target = resolved.target;
            return resolved.path.replace(/^\/__swarm/, "");
          };
        },
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
  plugins: [
    {
      name: "studio-host-control-bridge",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/__studio/host-control")) return next();
          res.setHeader("cache-control", "no-store");
          res.setHeader("content-type", "application/json; charset=utf-8");
          const requestUrl = new URL(req.url, "http://127.0.0.1");

          if (requestUrl.pathname === "/__studio/host-control/session" && req.method === "GET") {
            res.setHeader("set-cookie", `swarm_studio_host=${hostControlToken}; HttpOnly; SameSite=Strict; Path=/__studio/host-control`);
            res.end(JSON.stringify({ available: process.platform === "win32" }));
            return;
          }

          if (hostControlCookie(req) !== hostControlToken) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Host-control session is not authorized." }));
            return;
          }

          try {
            if (requestUrl.pathname === "/__studio/host-control/status" && req.method === "GET") {
              res.end(JSON.stringify(await invokeHostControl(["status"])));
              return;
            }
            if (requestUrl.pathname === "/__studio/host-control/action" && req.method === "POST") {
              if (!sameOriginRequest(req)) {
                res.statusCode = 403;
                res.end(JSON.stringify({ error: "Host-control actions require a same-origin Studio request." }));
                return;
              }
              const body = await readJsonBody(req);
              const target = String(body.target || "");
              const action = String(body.action || "");
              if (target !== "swarm" || !["start", "stop", "restart", "status"].includes(action)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Only fixed Swarm lifecycle actions are exposed to the PWA." }));
                return;
              }
              const workingDirectory = String(body.workingDirectory || "").trim();
              const port = Number(body.port || 7801);
              if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid Swarm port.");
              const args = ["swarm", action, "-SwarmPort", String(port)];
              if (workingDirectory) args.push("-SwarmDirectory", workingDirectory);
              res.end(JSON.stringify(await invokeHostControl(args)));
              return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Unknown host-control route." }));
          } catch (error) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          }
        });
      },
    },
    {
      name: "studio-external-metadata-relay",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/__studio/fetch-text")) return next();
          try {
            const requestUrl = new URL(req.url, "http://127.0.0.1");
            const raw = requestUrl.searchParams.get("url") || "";
            const target = new URL(raw);
            const host = target.hostname.toLowerCase();
            const allowed = host === "civitai.com" || host.endsWith(".civitai.com")
              || host === "civitai.red" || host.endsWith(".civitai.red")
              || host === "huggingface.co" || host.endsWith(".huggingface.co");
            if (!allowed || target.protocol !== "https:") {
              res.statusCode = 403;
              res.end("External metadata host is not allowed.");
              return;
            }
            const upstream = await fetch(target, {
              redirect: "follow",
              headers: {
                "accept": "application/json,text/plain;q=0.9,*/*;q=0.5",
                "user-agent": "Swarm-Studio/0.22",
              },
            });
            res.statusCode = upstream.status;
            res.setHeader("content-type", upstream.headers.get("content-type") || "text/plain; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(Buffer.from(await upstream.arrayBuffer()));
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end(error instanceof Error ? error.message : String(error));
          }
        });
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["studio-mark.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Swarm Studio",
        short_name: "Swarm Studio",
        description: "A cozy standalone creative client for SwarmUI.",
        theme_color: "#18131f",
        background_color: "#100d15",
        display: "standalone",
        orientation: "any",
        start_url: ".",
        icons: [
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/API\//, /^\/View\//, /^\/__swarm\//, /^\/__studio\//],
      }
    })
  ]
});
