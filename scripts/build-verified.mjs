import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { npmCommand, projectRoot, sitesEnvironment } from "./sites-env.mjs";

const vinext = join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vinext.cmd" : "vinext",
);
if (!existsSync(vinext)) {
  console.error("vinext is unavailable. Run npm run install:ci before building.");
  process.exit(69);
}

console.log("Running bounded vinext build...");
const timeout = Number.parseInt(process.env.SITES_BUILD_TIMEOUT_MS || "180000", 10);
const result = spawnSync(npmCommand, ["exec", "--offline", "--", "vinext", "build"], {
  cwd: projectRoot,
  env: sitesEnvironment(),
  shell: process.platform === "win32",
  stdio: "inherit",
  timeout,
  windowsHide: true,
});

if (result.error?.code === "ETIMEDOUT") {
  console.error(`vinext build exceeded ${timeout}ms.`);
  process.exit(124);
}
if (result.error) throw result.error;
process.exit(result.status ?? 1);
