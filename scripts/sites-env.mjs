import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const projectRoot = resolve(import.meta.dirname, "..");
export const runtimeRoot = resolve(
  process.env.SITES_RUNTIME_ROOT || join(projectRoot, ".sites-runtime"),
);

export function sitesEnvironment(overrides = {}) {
  const paths = {
    home: join(runtimeRoot, "home"),
    cache: join(runtimeRoot, "npm-cache"),
    config: join(runtimeRoot, "xdg-config"),
    temp: join(runtimeRoot, "tmp"),
    logs: join(runtimeRoot, "wrangler", "logs"),
  };

  for (const directory of Object.values(paths)) {
    mkdirSync(directory, { recursive: true });
  }

  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "npm_config_cache") delete env[key];
  }

  return {
    ...env,
    SITES_ENV_READY: "1",
    SITES_PROJECT_ROOT: projectRoot,
    HOME: paths.home,
    USERPROFILE: paths.home,
    XDG_CONFIG_HOME: paths.config,
    TMPDIR: paths.temp,
    TEMP: paths.temp,
    TMP: paths.temp,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: paths.logs,
    MINIFLARE_REGISTRY_PATH: join(runtimeRoot, "wrangler", "registry"),
    npm_config_cache: paths.cache,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    ...overrides,
  };
}

export const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

