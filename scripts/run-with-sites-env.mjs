import { spawnSync } from "node:child_process";
import { projectRoot, sitesEnvironment } from "./sites-env.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node scripts/run-with-sites-env.mjs command [args...]");
  process.exit(64);
}

const result = spawnSync(command, args, {
  cwd: projectRoot,
  env: sitesEnvironment(),
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

