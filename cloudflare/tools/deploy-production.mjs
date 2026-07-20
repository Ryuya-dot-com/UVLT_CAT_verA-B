import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const releaseConfigPath = path.join(project, "cloudflare", "private", "release-config.json");
const wranglerConfigPath = path.join(project, "cloudflare", "private", "wrangler.production.json");
const wranglerPackageDirectory = path.join(project, "node_modules", "wrangler");
const wranglerPackagePath = path.join(wranglerPackageDirectory, "package.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const argumentsList = process.argv.slice(2);
assert(
  argumentsList.length === 0 || (argumentsList.length === 1 && argumentsList[0] === "--dry-run"),
  "The deployment wrapper accepts only an optional --dry-run flag"
);
const dryRun = argumentsList[0] === "--dry-run";

let release;
let packageMetadata;
let wranglerPackage;
try {
  [release, packageMetadata, wranglerPackage] = await Promise.all([
    readFile(releaseConfigPath, "utf8").then(JSON.parse),
    readFile(path.join(project, "package.json"), "utf8").then(JSON.parse),
    readFile(wranglerPackagePath, "utf8").then(JSON.parse)
  ]);
} catch {
  throw new Error("Private release config, package.json, and the installed local Wrangler package must be present and valid JSON");
}

assert(release?.schemaVersion === "uvlt-fixed-ab-field-release-config-2", "Private release config schema is unsupported");
assert(release.active === true, "Private release config must be active before deployment");
assert(typeof release.releaseId === "string" && /^[a-z0-9][a-z0-9._-]{7,127}$/.test(release.releaseId), "Private release ID is invalid");
assert(release.appVersion === packageMetadata?.version, "Private release appVersion must exactly match package.json version");
assert(packageMetadata?.devDependencies?.wrangler === "4.112.0", "package.json must pin the reviewed Wrangler version exactly");
assert(wranglerPackage?.version === packageMetadata.devDependencies.wrangler, "Installed local Wrangler does not match the exact package.json pin");
assert(typeof wranglerPackage?.bin?.wrangler === "string", "Pinned local Wrangler executable is missing");
const wranglerExecutable = path.resolve(wranglerPackageDirectory, wranglerPackage.bin.wrangler);
const wranglerExecutableRelative = path.relative(wranglerPackageDirectory, wranglerExecutable);
assert(
  wranglerExecutableRelative && !wranglerExecutableRelative.startsWith("..") && !path.isAbsolute(wranglerExecutableRelative),
  "Pinned local Wrangler executable resolved outside its package"
);
await access(wranglerExecutable, constants.R_OK);
await access(wranglerConfigPath, constants.R_OK);

const wranglerArguments = [
  "deploy",
  "--strict",
  "--config",
  wranglerConfigPath,
  "--tag",
  release.releaseId
];
if (dryRun) {
  wranglerArguments.push("--dry-run", "--outdir", path.join(project, ".wrangler-dry-run"));
}

await new Promise((resolve, reject) => {
  const child = execFile(process.execPath, [wranglerExecutable, ...wranglerArguments], {
    cwd: project,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    shell: false,
    windowsHide: true
  });
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`Wrangler ${dryRun ? "dry run" : "deployment"} failed (${signal ?? `exit ${code}`})`));
  });
});

console.log(JSON.stringify({
  ok: true,
  dryRun,
  appVersion: release.appVersion,
  workerVersionTag: release.releaseId
}, null, 2));
