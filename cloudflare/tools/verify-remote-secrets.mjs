import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const privateDirectory = path.join(project, "cloudflare", "private");
const expectedSecretNames = [
  "PARTICIPANT_HMAC_KEY",
  "PROLIFIC_API_TOKEN",
  "PROLIFIC_COMPLETION_CODE"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolvePrivateConfig(value) {
  const resolved = path.resolve(project, value || "cloudflare/private/wrangler.production.json");
  const relative = path.relative(privateDirectory, resolved);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Wrangler config must be a file inside cloudflare/private");
  return resolved;
}

function parseArguments(argv) {
  assert(argv.length === 0 || (argv.length === 2 && argv[0] === "--wrangler-config"), "Only --wrangler-config <path> is supported");
  if (argv.length === 2) assert(argv[1] && !argv[1].startsWith("--"), "--wrangler-config requires a path");
  return resolvePrivateConfig(argv[1]);
}

async function readJson(file, label) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new Error(`${label} is missing`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

const wranglerConfigPath = parseArguments(process.argv.slice(2));
const projectPackagePath = path.join(project, "package.json");
const wranglerPackageDirectory = path.join(project, "node_modules", "wrangler");
const wranglerPackagePath = path.join(wranglerPackageDirectory, "package.json");
const [projectPackage, wranglerPackage] = await Promise.all([
  readJson(projectPackagePath, "Project package.json"),
  readJson(wranglerPackagePath, "Pinned local Wrangler package")
]);

const pinnedWranglerVersion = projectPackage?.devDependencies?.wrangler;
assert(/^4\.\d+\.\d+$/.test(pinnedWranglerVersion || ""), "package.json must pin an exact Wrangler 4 version");
assert(wranglerPackage.version === pinnedWranglerVersion, "Installed local Wrangler does not match the exact package.json pin");
assert(typeof wranglerPackage.bin?.wrangler === "string", "Pinned local Wrangler executable is missing");
const wranglerExecutable = path.resolve(wranglerPackageDirectory, wranglerPackage.bin.wrangler);
const executableRelative = path.relative(wranglerPackageDirectory, wranglerExecutable);
assert(executableRelative && !executableRelative.startsWith("..") && !path.isAbsolute(executableRelative), "Pinned local Wrangler executable resolved outside its package");

let stdout;
try {
  ({ stdout } = await execFileAsync(process.execPath, [
    wranglerExecutable,
    "secret",
    "list",
    "--format",
    "json",
    "--config",
    wranglerConfigPath
  ], {
    cwd: project,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    maxBuffer: 1024 * 1024,
    shell: false,
    timeout: 60_000,
    windowsHide: true
  }));
} catch {
  throw new Error("Remote Worker secret names could not be verified with the pinned local Wrangler 4; confirm Cloudflare authentication, Worker existence, and the private production config");
}

let remoteSecrets;
try {
  remoteSecrets = JSON.parse(stdout.trim());
} catch {
  throw new Error("Pinned Wrangler returned an unreadable remote secret list");
}
assert(Array.isArray(remoteSecrets), "Pinned Wrangler remote secret list must be an array");
const remoteNames = remoteSecrets.map((entry, index) => {
  assert(entry && typeof entry === "object" && !Array.isArray(entry), `Remote secret row ${index + 1} is invalid`);
  assert(typeof entry.name === "string" && /^[A-Z][A-Z0-9_]+$/.test(entry.name), `Remote secret row ${index + 1} has an invalid name`);
  return entry.name;
});
assert(new Set(remoteNames).size === remoteNames.length, "Remote Worker secret list contains duplicate names");
assert(
  JSON.stringify([...remoteNames].sort()) === JSON.stringify([...expectedSecretNames].sort()),
  "Remote Worker must contain exactly the three approved secret names"
);

console.log(JSON.stringify({
  ok: true,
  wranglerVersion: pinnedWranglerVersion,
  requiredRemoteSecretsPresent: expectedSecretNames.length,
  exactRemoteSecretSet: true,
  secretValuesRequested: false,
  secretValuesPrinted: false
}, null, 2));
