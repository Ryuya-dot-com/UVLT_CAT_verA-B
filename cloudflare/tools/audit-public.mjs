import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const output = path.join(project, "dist");
const packageMetadata = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
const appVersion = packageMetadata.version;
const allowed = new Set([
  "build-manifest.json",
  "field.css",
  "field-app.js",
  "field-task.js",
  "index.html",
  "styles.css"
]);
const declaredAssets = ["index.html", "styles.css", "field.css", "field-app.js", "field-task.js"];
const maximumBytes = new Map([
  ["build-manifest.json", 32 * 1024],
  ["index.html", 32 * 1024],
  ["styles.css", 96 * 1024],
  ["field.css", 64 * 1024],
  ["field-app.js", 160 * 1024],
  ["field-task.js", 96 * 1024]
]);
const MAXIMUM_TOTAL_BYTES = 384 * 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(typeof appVersion === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(appVersion), "package.json version is not a valid field appVersion");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactKeys(value, expected, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted), `${label} fields must be exactly ${wanted.join(", ")}`);
}

function assertSafeRelativePath(value, label) {
  assert(typeof value === "string" && value.length > 0 && value.length <= 128, `${label} is invalid`);
  assert(value === value.normalize("NFC"), `${label} must use NFC Unicode normalization`);
  assert(!value.includes("\\") && !value.includes("\0"), `${label} contains an unsafe character`);
  assert(!path.posix.isAbsolute(value), `${label} must be relative`);
  assert(path.posix.normalize(value) === value && !value.startsWith("../") && value !== "..", `${label} is not canonical`);
}

async function walk(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    assertSafeRelativePath(relative, "public asset path");
    if (entry.isSymbolicLink()) throw new Error(`Public output must not contain a symbolic link: ${relative}`);
    if (entry.isDirectory()) paths.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) paths.push(relative);
    else throw new Error(`Public output contains an unsupported filesystem entry: ${relative}`);
  }
  return paths.sort();
}

const found = await walk(output);
const unexpected = found.filter(file => !allowed.has(file));
const missing = [...allowed].filter(file => !found.includes(file));
if (unexpected.length || missing.length) {
  throw new Error(`Public allowlist mismatch; unexpected=[${unexpected.join(", ")}], missing=[${missing.join(", ")}]`);
}

const fileBytes = new Map();
let totalBytes = 0;
for (const file of found) {
  const bytes = await readFile(path.join(output, file));
  const limit = maximumBytes.get(file);
  assert(Number.isSafeInteger(limit), `No byte limit is configured for ${file}`);
  assert(bytes.byteLength > 0, `${file} must not be empty`);
  assert(bytes.byteLength <= limit, `${file} exceeds its ${limit}-byte public size limit`);
  totalBytes += bytes.byteLength;
  fileBytes.set(file, bytes);
}
assert(totalBytes <= MAXIMUM_TOTAL_BYTES, `Public assets exceed the ${MAXIMUM_TOTAL_BYTES}-byte total size limit`);

const manifestBytes = fileBytes.get("build-manifest.json");
let manifest;
try {
  manifest = JSON.parse(manifestBytes.toString("utf8"));
} catch {
  throw new Error("build-manifest.json is not valid JSON");
}
assertExactKeys(manifest, ["schemaVersion", "appVersion", "files"], "Public build manifest");
assert(manifest.schemaVersion === "uvlt-field-public-build-2", "Unsupported public build manifest schema");
assert(manifest.appVersion === appVersion, "Public build manifest appVersion does not match package.json");
assert(Array.isArray(manifest.files), "Public build manifest files must be an array");
assert(manifest.files.length === declaredAssets.length, "Public build manifest has the wrong number of asset rows");

const manifestPaths = new Set();
for (const [index, entry] of manifest.files.entries()) {
  const label = `Public build manifest files[${index}]`;
  assertExactKeys(entry, ["path", "bytes", "sha256"], label);
  assertSafeRelativePath(entry.path, `${label}.path`);
  assert(declaredAssets[index] === entry.path, `${label}.path is out of canonical build order`);
  assert(!manifestPaths.has(entry.path), `${label}.path is duplicated`);
  manifestPaths.add(entry.path);
  assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `${label}.bytes is invalid`);
  assert(/^[0-9a-f]{64}$/.test(entry.sha256 || ""), `${label}.sha256 is invalid`);
  const bytes = fileBytes.get(entry.path);
  assert(bytes, `${label}.path does not identify a built asset`);
  assert(entry.bytes === bytes.byteLength, `${entry.path} byte count does not match the manifest`);
  assert(entry.sha256 === sha256(bytes), `${entry.path} SHA-256 does not match the manifest`);
}
assert(declaredAssets.every(file => manifestPaths.has(file)), "Public build manifest omits an allowlisted asset");

const forbiddenPatterns = [
  /uvlt_bank\.ab\.content/i,
  /uvlt_routes\.ab\.williams/i,
  /runtime-manifest\.dev/i,
  /practice-testlets\.json/i,
  /correctOption/i,
  /answer[_ -]?key/i,
  /sourceItemId/i,
  /\btheta\b/i,
  /\bscoring\b/i,
  /uvlt_[ab]_[1-5]k_t\d{2}/i,
  /\b[0-9a-f]{24}\b/i,
  /PARTICIPANT_HMAC_KEY/,
  /PROLIFIC_API_TOKEN/,
  /PROLIFIC_COMPLETION_CODE/
];

for (const file of found) {
  const bytes = fileBytes.get(file);
  if (bytes.includes(0)) throw new Error(`${file} is unexpectedly binary`);
  const text = bytes.toString("utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) throw new Error(`${file} contains forbidden public content matching ${pattern}`);
  }
}

console.log(`Public asset audit passed for ${found.length} files (${totalBytes} bytes); appVersion ${appVersion}, paths, sizes, and manifest SHA-256 values match.`);
