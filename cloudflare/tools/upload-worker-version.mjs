import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, link, mkdir, mkdtemp, open, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateVersionUploadRecords,
  validateVersionView
} from "./version-workflow-validation.mjs";
import {
  collectWorkerUploadInputs,
  releaseHandoffIdentitySha256
} from "./worker-upload-inputs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const privateDirectory = path.join(project, "cloudflare", "private");
const zeroSha256 = "0".repeat(64);
const reviewedNodeVersion = "24.9.0";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolvePrivatePath(value, fallback, label) {
  const resolved = path.resolve(project, value || fallback);
  const relative = path.relative(privateDirectory, resolved);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `${label} must be a file inside cloudflare/private`);
  return resolved;
}

function parseArguments(argv) {
  const supported = new Set(["--release-config", "--wrangler-config", "--output"]);
  const values = new Map();
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") {
      assert(!dryRun, "--dry-run may be supplied only once");
      dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    assert(supported.has(key), `Unsupported argument ${key || "(missing)"}`);
    assert(value && !value.startsWith("--"), `${key} requires a path`);
    assert(!values.has(key), `${key} may be supplied only once`);
    values.set(key, value);
    index += 1;
  }
  return {
    releaseConfigPath: resolvePrivatePath(values.get("--release-config"), "cloudflare/private/release-config.json", "Release config"),
    wranglerConfigPath: resolvePrivatePath(values.get("--wrangler-config"), "cloudflare/private/wrangler.production.json", "Wrangler config"),
    outputPath: resolvePrivatePath(values.get("--output"), "cloudflare/private/worker-version-attestation.json", "Attestation output"),
    dryRun
  };
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertCanonicalIsoDateTime(value, label) {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), `${label} must be an ISO date-time`);
  assert(new Date(value).toISOString() === value, `${label} must be a canonical UTC ISO date-time`);
}

export function canonicalRemoteVersionCreatedAt(version) {
  const createdOn = version?.metadata?.created_on;
  assert(
    typeof createdOn === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(createdOn) &&
      Number.isFinite(Date.parse(createdOn)),
    "Remote Worker version metadata.created_on must be a UTC ISO date-time"
  );
  const canonical = new Date(createdOn).toISOString();
  assertCanonicalIsoDateTime(canonical, "Remote Worker version creation time");
  return canonical;
}

export function assertPreloadedUploadInputsMatch(inputs, { packageBytes, wranglerConfigBytes }) {
  assert(inputs && Array.isArray(inputs.entries), "Worker upload inputs must contain captured entries");
  for (const [logicalPath, expectedBytes, label] of [
    ["package.json", packageBytes, "package.json"],
    ["cloudflare/private/wrangler.production.json", wranglerConfigBytes, "production Wrangler config"]
  ]) {
    const matches = inputs.entries.filter(entry => entry?.path === logicalPath);
    assert(matches.length === 1, `Worker upload snapshot must contain exactly one ${label}`);
    assert(Buffer.isBuffer(matches[0].contents) && matches[0].contents.equals(Buffer.from(expectedBytes)),
      `${label} changed between validation and upload snapshot capture`);
  }
  return inputs;
}

async function assertAbsent(file, label) {
  try {
    await access(file, constants.F_OK);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} already exists; no Worker version was uploaded`);
}

async function runWrangler(executable, argumentsList, { outputFilePath, captureStdout = false } = {}) {
  const childEnvironment = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  if (outputFilePath) childEnvironment.WRANGLER_OUTPUT_FILE_PATH = outputFilePath;
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [executable, ...argumentsList], {
      cwd: project,
      env: childEnvironment,
      encoding: captureStdout ? "utf8" : undefined,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      windowsHide: true
    }, captureStdout ? (error, stdout, stderr) => {
      if (stderr) process.stderr.write(stderr);
      if (error) reject(error);
      else resolve(stdout);
    } : undefined);
    if (captureStdout) return;
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve("");
      else reject(new Error(`Wrangler version upload failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function createUploadSnapshot(inputs) {
  const snapshotRoot = await mkdtemp(path.join(privateDirectory, ".worker-version-upload-snapshot-"));
  await chmod(snapshotRoot, 0o700);
  for (const entry of inputs.entries) {
    const destination = path.join(snapshotRoot, entry.path);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, entry.contents, { flag: "wx", mode: 0o400 });
  }
  const snapshotConfigPath = path.join(snapshotRoot, "cloudflare", "private", "wrangler.production.json");
  const snapshotInputs = await collectWorkerUploadInputs({
    project: snapshotRoot,
    wranglerConfigPath: snapshotConfigPath
  });
  assert(snapshotInputs.sha256 === inputs.sha256,
    "Frozen upload snapshot does not match the reviewed Worker inputs");
  return { snapshotRoot, snapshotConfigPath };
}

async function syncDirectoryEntry(directory) {
  let directoryHandle;
  try {
    directoryHandle = await open(directory, "r");
    await directoryHandle.sync();
    return true;
  } catch (error) {
    if (["EACCES", "EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(error?.code)) return false;
    throw error;
  } finally {
    await directoryHandle?.close().catch(() => {});
  }
}

export async function writeAttemptMarker(lockPath, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  let markerHandle;
  let created = false;
  try {
    markerHandle = await open(lockPath, "wx", 0o600);
    created = true;
    await markerHandle.writeFile(bytes);
    await markerHandle.chmod(0o600);
    await markerHandle.sync();
    await markerHandle.close();
    markerHandle = undefined;
    await syncDirectoryEntry(path.dirname(lockPath));
  } catch (error) {
    await markerHandle?.close().catch(() => {});
    if (created) {
      await unlink(lockPath).catch(() => {});
      await syncDirectoryEntry(path.dirname(lockPath)).catch(() => {});
    }
    throw error;
  }
}

const invokedAsScript = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
const {
  releaseConfigPath,
  wranglerConfigPath: sourceWranglerConfigPath,
  outputPath,
  dryRun
} = parseArguments(process.argv.slice(2));

const lockPath = `${outputPath}.lock`;
let lockCreated = false;
let wranglerOutputPath;
let temporaryAttestationPath;
let snapshotRoot;
let remoteAttemptStarted = false;
let attestationFrozen = false;
try {
  assert(process.versions.node === reviewedNodeVersion,
    `Worker version upload requires Node ${reviewedNodeVersion}; found ${process.versions.node}`);
  const [releaseConfigBytes, wranglerConfigBytes, packageBytes, wranglerPackageBytes] = await Promise.all([
    readFile(releaseConfigPath),
    readFile(sourceWranglerConfigPath),
    readFile(path.join(project, "package.json")),
    readFile(path.join(project, "node_modules", "wrangler", "package.json"))
  ]);
  let release;
  let wrangler;
  let packageMetadata;
  let wranglerPackage;
  try {
    release = JSON.parse(releaseConfigBytes.toString("utf8"));
    wrangler = JSON.parse(wranglerConfigBytes.toString("utf8"));
    packageMetadata = JSON.parse(packageBytes.toString("utf8"));
    wranglerPackage = JSON.parse(wranglerPackageBytes.toString("utf8"));
  } catch {
    throw new Error("Release, Wrangler, package, and local Wrangler metadata must be valid strict JSON");
  }

  assert(release?.schemaVersion === "uvlt-fixed-ab-field-release-config-5", "Private release config schema is unsupported");
  assert(release.active === false, "Version upload requires an inactive release; activation occurs only after ID capture and D1 preparation");
  assert(release.workerVersionId === null, "Version upload requires workerVersionId to be null before Cloudflare assigns it");
  assert(release.frozenAt === null, "Version upload requires frozenAt to remain null until Cloudflare assigns the immutable version ID");
  assert(Array.isArray(release.studies) && release.studies.length === 2 &&
    release.studies.every(study => study?.active === false),
  "Version upload requires exactly two inactive study authorities");
  assert(typeof release.releaseId === "string" && /^[a-z0-9][a-z0-9._-]{7,127}$/.test(release.releaseId), "Private release ID is invalid");
  assert(release.appVersion === packageMetadata?.version, "Private release appVersion must exactly match package.json version");
  for (const field of [
    "runtimeManifestPayloadSha256",
    "bankPayloadSha256",
    "routesPayloadSha256",
    "runtimeBankProjectionSha256",
    "runtimeRoutesProjectionSha256",
    "allocationScheduleSha256",
    "publicBuildManifestSha256"
  ]) {
    const value = release.expectedHashes?.[field];
    assert(/^[0-9a-f]{64}$/.test(value || "") && value !== zeroSha256, `Private release expectedHashes.${field} is invalid`);
  }
  assert(wrangler?.name === "uvlt-fixed-ab-calibration", "Production Worker name is invalid");
  assert(wrangler.main === "../worker/index.ts", "Production Wrangler entry point is invalid");
  assert(wrangler.vars?.COLLECTION_MODE === "field", "Production Wrangler COLLECTION_MODE must be field");
  assert(wrangler.vars?.EXPECTED_RELEASE_ID === release.releaseId, "Production Wrangler release ID does not match the upload release");
  assert(wrangler.vars?.EXPECTED_APP_VERSION === release.appVersion, "Production Wrangler appVersion does not match the upload release");
  for (const [variable, value] of [
    ["EXPECTED_PUBLIC_BUILD_MANIFEST_SHA256", release.expectedHashes.publicBuildManifestSha256],
    ["EXPECTED_RUNTIME_MANIFEST_SHA256", release.expectedHashes.runtimeManifestPayloadSha256],
    ["EXPECTED_BANK_SHA256", release.expectedHashes.bankPayloadSha256],
    ["EXPECTED_ROUTES_SHA256", release.expectedHashes.routesPayloadSha256],
    ["EXPECTED_RUNTIME_BANK_PROJECTION_SHA256", release.expectedHashes.runtimeBankProjectionSha256],
    ["EXPECTED_RUNTIME_ROUTES_PROJECTION_SHA256", release.expectedHashes.runtimeRoutesProjectionSha256],
    ["EXPECTED_ALLOCATION_SCHEDULE_SHA256", release.expectedHashes.allocationScheduleSha256],
    ["EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT", release.participantHmacKeyFingerprint],
    ["EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT", release.prolificCompletionCodeFingerprint],
    ["EXPECTED_PROLIFIC_COMPLETION_ACTION", release.prolificCompletionAction]
  ]) {
    assert(wrangler.vars?.[variable] === value,
      `Production Wrangler ${variable} does not match the upload release`);
  }
  assert(wrangler.version_metadata?.binding === "CF_VERSION_METADATA", "Production Wrangler config must bind CF_VERSION_METADATA");
  assert(packageMetadata?.devDependencies?.wrangler === "4.112.0", "package.json must pin the reviewed Wrangler version exactly");
  assert(wranglerPackage?.version === packageMetadata.devDependencies.wrangler, "Installed local Wrangler does not match the exact package.json pin");
  assert(typeof wranglerPackage?.bin?.wrangler === "string", "Pinned local Wrangler executable is missing");

  const wranglerPackageDirectory = path.join(project, "node_modules", "wrangler");
  const wranglerExecutable = path.resolve(wranglerPackageDirectory, wranglerPackage.bin.wrangler);
  const executableRelative = path.relative(wranglerPackageDirectory, wranglerExecutable);
  assert(executableRelative && !executableRelative.startsWith("..") && !path.isAbsolute(executableRelative), "Pinned local Wrangler executable resolved outside its package");
  await access(wranglerExecutable, constants.R_OK);

  const sourceInputs = await collectWorkerUploadInputs({
    project,
    wranglerConfigPath: sourceWranglerConfigPath
  });
  assertPreloadedUploadInputsMatch(sourceInputs, { packageBytes, wranglerConfigBytes });
  const handoffIdentitySha256 = releaseHandoffIdentitySha256(release);
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  await chmod(privateDirectory, 0o700);
  const snapshot = await createUploadSnapshot(sourceInputs);
  snapshotRoot = snapshot.snapshotRoot;
  const uploadWranglerConfigPath = snapshot.snapshotConfigPath;

  const uploadArguments = [
    "versions",
    "upload",
    "--strict",
    "--config",
    uploadWranglerConfigPath,
    "--tag",
    release.releaseId,
    "--message",
    `Frozen release upload ${release.releaseId}`
  ];
  if (dryRun) {
    await runWrangler(wranglerExecutable, [
      ...uploadArguments,
      "--dry-run",
      "--outdir",
      path.join(project, ".wrangler-dry-run")
    ]);
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      uploaded: false,
      deployed: false,
      releaseId: release.releaseId,
      workerVersionTag: release.releaseId,
      uploadInputsSha256: sourceInputs.sha256
    }, null, 2));
  } else {
    await assertAbsent(outputPath, "Worker-version attestation");
    wranglerOutputPath = path.join(privateDirectory, `.worker-version-upload-${process.pid}-${Date.now()}.jsonl`);
    await assertAbsent(wranglerOutputPath, "Temporary Wrangler output");
    await writeAttemptMarker(lockPath, {
      schemaVersion: "uvlt-worker-version-upload-attempt-1",
      state: "remote-call-started",
      releaseId: release.releaseId,
      uploadInputsSha256: sourceInputs.sha256,
      receipt: path.relative(project, wranglerOutputPath),
      snapshot: path.relative(project, snapshotRoot),
      recovery: "Do not rerun. Inspect the preserved Wrangler receipt and remote versions, then recover or abandon this release ID explicitly."
    });
    lockCreated = true;
    await assertAbsent(outputPath, "Worker-version attestation");
    remoteAttemptStarted = true;
    await runWrangler(wranglerExecutable, uploadArguments, { outputFilePath: wranglerOutputPath });

    const records = (await readFile(wranglerOutputPath, "utf8"))
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const upload = validateVersionUploadRecords(records, {
      workerName: wrangler.name,
      releaseId: release.releaseId
    });
    const versionJson = await runWrangler(wranglerExecutable, [
      "versions",
      "view",
      upload.version_id,
      "--config",
      uploadWranglerConfigPath,
      "--json"
    ], { captureStdout: true });
    let uploadedVersion;
    try {
      uploadedVersion = JSON.parse(versionJson);
    } catch {
      throw new Error("Wrangler returned invalid JSON while verifying the uploaded Worker version annotation");
    }
    validateVersionView(uploadedVersion, {
      workerVersionId: upload.version_id,
      releaseId: release.releaseId
    });
    const uploadedAt = canonicalRemoteVersionCreatedAt(uploadedVersion);
    const postUploadInputs = await collectWorkerUploadInputs({
      project,
      wranglerConfigPath: sourceWranglerConfigPath
    });
    assert(postUploadInputs.sha256 === sourceInputs.sha256,
      "Worker upload inputs changed during the remote upload; preserve the attempt marker and do not rerun");

    const attestation = {
      schemaVersion: "uvlt-worker-version-upload-attestation-2",
      releaseId: release.releaseId,
      appVersion: release.appVersion,
      workerName: upload.worker_name,
      workerVersionId: upload.version_id,
      workerVersionTag: release.releaseId,
      uploadedAt,
      preuploadReleaseConfigSha256: sha256Hex(releaseConfigBytes),
      releaseHandoffIdentitySha256: handoffIdentitySha256,
      productionWranglerConfigSha256: sha256Hex(wranglerConfigBytes),
      uploadInputs: sourceInputs.manifest,
      uploadInputsSha256: sourceInputs.sha256,
      nodeVersion: process.versions.node,
      wranglerVersion: wranglerPackage.version
    };
    const attestationBytes = Buffer.from(`${JSON.stringify(attestation, null, 2)}\n`, "utf8");
    temporaryAttestationPath = path.join(privateDirectory, `.worker-version-attestation-${process.pid}-${Date.now()}.tmp`);
    await writeFile(temporaryAttestationPath, attestationBytes, { flag: "wx", mode: 0o600 });
    await link(temporaryAttestationPath, outputPath);
    await chmod(outputPath, 0o600);
    attestationFrozen = true;

    console.log(JSON.stringify({
      ok: true,
      dryRun: false,
      uploaded: true,
      deployed: false,
      releaseId: release.releaseId,
      workerVersionId: upload.version_id,
      workerVersionTag: release.releaseId,
      uploadInputsSha256: sourceInputs.sha256,
      attestation: path.relative(project, outputPath),
      nextStep: "Copy workerVersionId into the schema-v5 release config, freeze it, then build and review the inactive D1 seed."
    }, null, 2));
  }
} finally {
  const safeToClean = !remoteAttemptStarted || attestationFrozen;
  if (safeToClean && temporaryAttestationPath) await unlink(temporaryAttestationPath).catch(() => {});
  if (safeToClean && wranglerOutputPath) await unlink(wranglerOutputPath).catch(() => {});
  if (safeToClean && lockCreated) await unlink(lockPath).catch(() => {});
  if (safeToClean && snapshotRoot) await rm(snapshotRoot, { recursive: true, force: true }).catch(() => {});
}
}
