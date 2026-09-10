import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/__swarm": {
        target: process.env.SWARM_STUDIO_RELAY_TARGET || "http://127.0.0.1:7801",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/__swarm/, ""),
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
