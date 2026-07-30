import vinext from "vinext";
import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const LOCAL_AI_PROXY_PATH = "/__local_ai_proxy/chat/completions";
const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      localAIProxy(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});

function localAIProxy(): Plugin {
  return {
    name: "local-ai-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(LOCAL_AI_PROXY_PATH, async (request, response) => {
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
        response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: { message: "local AI proxy only accepts POST" } }));
          return;
        }
        const requestUrl = new URL(request.url || "", "http://localhost");
        const targetValue = requestUrl.searchParams.get("target");
        if (!targetValue) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: { message: "missing target endpoint" } }));
          return;
        }
        let target: URL;
        try {
          target = new URL(targetValue);
          if (!["https:", "http:"].includes(target.protocol)) throw new Error("unsupported protocol");
        } catch {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: { message: "invalid target endpoint" } }));
          return;
        }
        try {
          const body = await readRequestBody(request);
          const upstream = await fetch(target, {
            method: "POST",
            headers: {
              "Content-Type": request.headers["content-type"] || "application/json",
              ...(request.headers.authorization ? { Authorization: request.headers.authorization } : {}),
            },
            body,
          });
          response.statusCode = upstream.status;
          response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
          response.end(Buffer.from(await upstream.arrayBuffer()));
        } catch {
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: { message: "local AI proxy failed to reach target endpoint" } }));
        }
      });
    },
  };
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
