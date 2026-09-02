import vinext from "vinext";
import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import hostingConfig from "./.deployment/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00496783-18d0-4f56-9f6d-63f9920e2add";
const WORKER_COMPATIBILITY_DATE = "2026-05-22";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_date: WORKER_COMPATIBILITY_DATE,
  compatibility_flags: ["nodejs_compat"],
  // OPEN_BANKING_ENCRYPTION_KEY is supplied only as a Wrangler/Sites secret.
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "conti-in-chiaro-db",
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
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: ["localhost", "127.0.0.1", "terminal.local", "pcs5.reply"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      {
        ...basicSsl({
          name: "conti-in-chiaro-local",
          domains: ["localhost", "terminal.local"],
          ttlDays: 365,
        }),
        apply: "serve" as const,
      },
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
