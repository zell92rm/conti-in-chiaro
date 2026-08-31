import { createHash } from "node:crypto";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { npmCommand, projectRoot, runtimeRoot, sitesEnvironment } from "./sites-env.mjs";

const cache = join(runtimeRoot, "npm-cache");
const lockPath = join(runtimeRoot, "install.lock");
const lockfilePath = join(projectRoot, "package-lock.json");
const markerPath = join(projectRoot, "node_modules", ".sites-install.json");
const env = sitesEnvironment();

console.log(`[sites] validating writable install environment: ${runtimeRoot}`);
const probe = join(cache, `.write-test-${process.pid}`);
writeFileSync(probe, "ok");
rmSync(probe);

let lockHandle;
try {
  lockHandle = openSync(lockPath, "wx");
  writeFileSync(lockHandle, String(process.pid));
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  const owner = Number.parseInt(readFileSync(lockPath, "utf8"), 10);
  try {
    process.kill(owner, 0);
    console.error(`Another dependency install is already running (PID ${owner}).`);
    process.exit(75);
  } catch {
    rmSync(lockPath, { force: true });
    lockHandle = openSync(lockPath, "wx");
    writeFileSync(lockHandle, String(process.pid));
  }
}

try {
  const lockfile = readFileSync(lockfilePath);
  const lockfileSha256 = createHash("sha256").update(lockfile).digest("hex");
  const lock = JSON.parse(lockfile);
  const vinext = lock.packages?.["node_modules/vinext"];
  if (!vinext?.resolved || !vinext?.integrity) {
    throw new Error("package-lock.json does not contain an integrity-pinned vinext tarball");
  }

  let preferOffline = false;
  const seed = process.env.SITES_NPM_CACHE_SEED;
  if (seed && existsSync(seed)) {
    const seedMarker = join(seed, ".sites-lockfile-sha256");
    if (existsSync(seedMarker) && readFileSync(seedMarker, "utf8").trim() === lockfileSha256) {
      console.log("[sites] restoring image-seeded npm cache");
      cpSync(seed, cache, { recursive: true, force: true });
      preferOffline = true;
    }
  }

  const args = ["ci", "--cache", cache, "--maxsockets", "1", "--fetch-retries", "0", "--fetch-timeout", "30000"];
  if (preferOffline) args.push("--prefer-offline");
  const timeout = Number.parseInt(process.env.SITES_INSTALL_TIMEOUT_MS || "480000", 10);
  console.log("[sites] running one bounded npm ci");
  const result = spawnSync(npmCommand, args, {
    cwd: projectRoot,
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
    timeout,
    windowsHide: true,
  });
  if (result.error?.code === "ETIMEDOUT") {
    console.error(`npm ci exceeded ${timeout}ms.`);
    process.exitCode = 124;
  } else if (result.error) {
    throw result.error;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    const binary = join(projectRoot, "node_modules", ".bin", process.platform === "win32" ? "vinext.cmd" : "vinext");
    if (!existsSync(binary)) throw new Error("npm ci succeeded but vinext is unavailable");
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, `${JSON.stringify({
      lockfile_sha256: lockfileSha256,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    }, null, 2)}\n`);
    console.log("[sites] npm ci passed and vinext is available");
  }
} finally {
  if (lockHandle !== undefined) closeSync(lockHandle);
  rmSync(lockPath, { force: true });
}
