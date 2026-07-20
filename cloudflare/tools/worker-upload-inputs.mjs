import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const UPLOAD_INPUT_SCHEMA = "uvlt-worker-upload-inputs-1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function regularFileEntry(logicalPath, physicalPath) {
  const metadata = await lstat(physicalPath);
  assert(metadata.isFile() && !metadata.isSymbolicLink(),
    `Worker upload input must be a regular non-symlink file: ${logicalPath}`);
  const bytes = await readFile(physicalPath);
  return {
    path: logicalPath,
    bytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
    physicalPath,
    contents: bytes
  };
}

function publicEntry(entry) {
  return { path: entry.path, bytes: entry.bytes, sha256: entry.sha256 };
}

export function workerUploadInputsSha256(manifest) {
  return sha256Hex(Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8"));
}

export async function collectWorkerUploadInputs({ project, wranglerConfigPath }) {
  const configBytes = await readFile(wranglerConfigPath);
  let wrangler;
  try {
    wrangler = JSON.parse(configBytes.toString("utf8"));
  } catch {
    throw new Error("Production Wrangler config must be strict JSON");
  }

  const configDirectory = path.dirname(wranglerConfigPath);
  const workerPath = path.resolve(configDirectory, wrangler.main || "");
  const assetsDirectory = path.resolve(configDirectory, wrangler.assets?.directory || "");
  assert(workerPath === path.join(project, "cloudflare", "worker", "index.ts"),
    "Worker upload inputs require the reviewed standalone cloudflare/worker/index.ts entry point");
  assert(assetsDirectory === path.join(project, "dist"),
    "Worker upload inputs require the reviewed dist asset directory");

  const workerBytes = await readFile(workerPath, "utf8");
  assert(!/(?:^|\n)\s*(?:import|export)\s+(?:[^"'`\n]*?\sfrom\s*)?["']\.{1,2}\//u.test(workerBytes) &&
    !/\bimport\s*\(\s*["']\.{1,2}\//u.test(workerBytes),
  "Standalone Worker entry point gained a local module dependency; extend the upload-input manifest before release");

  const assetNames = await readdir(assetsDirectory, { withFileTypes: true });
  assert(assetNames.length > 0, "Built Worker asset directory is empty");
  assert(assetNames.every(entry => entry.isFile() && !entry.isSymbolicLink()),
    "Built Worker assets must be regular top-level files without directories or symlinks");
  const migrationsDirectory = path.join(project, "cloudflare", "migrations");
  const migrationNames = await readdir(migrationsDirectory, { withFileTypes: true });
  assert(migrationNames.length > 0 && migrationNames.every(entry =>
    entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".sql")),
  "Worker upload snapshot requires regular top-level SQL migration files");

  const entries = await Promise.all([
    regularFileEntry("package.json", path.join(project, "package.json")),
    regularFileEntry("package-lock.json", path.join(project, "package-lock.json")),
    regularFileEntry("cloudflare/private/wrangler.production.json", wranglerConfigPath),
    regularFileEntry("cloudflare/tsconfig.json", path.join(project, "cloudflare", "tsconfig.json")),
    regularFileEntry("cloudflare/worker/index.ts", workerPath),
    ...migrationNames
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right))
      .map(name => regularFileEntry(`cloudflare/migrations/${name}`, path.join(migrationsDirectory, name))),
    ...assetNames
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right))
      .map(name => regularFileEntry(`dist/${name}`, path.join(assetsDirectory, name)))
  ]);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schemaVersion: UPLOAD_INPUT_SCHEMA,
    files: entries.map(publicEntry)
  };
  return {
    manifest,
    sha256: workerUploadInputsSha256(manifest),
    entries
  };
}

function stableJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    assert(Number.isFinite(value), "Release identity cannot contain a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  assert(value && typeof value === "object", "Release identity contains an unsupported value");
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

export function releaseHandoffIdentitySha256(release) {
  assert(release && typeof release === "object" && !Array.isArray(release),
    "Release handoff identity requires an object");
  const projection = structuredClone(release);
  delete projection.workerVersionId;
  delete projection.frozenAt;
  delete projection.active;
  if (projection.approvals && typeof projection.approvals === "object" && !Array.isArray(projection.approvals)) {
    delete projection.approvals.independentPrelaunchReviewCompleted;
  }
  if (Array.isArray(projection.studies)) {
    projection.studies = projection.studies.map(study => {
      const projectedStudy = structuredClone(study);
      delete projectedStudy.active;
      return projectedStudy;
    });
  }
  return sha256Hex(Buffer.from(stableJson(projection), "utf8"));
}
