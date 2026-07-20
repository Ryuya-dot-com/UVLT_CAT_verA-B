import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildActivationSql } from "./build-activation-sql.mjs";
import {
  validateActivationMutationResult,
  validateActivationReadback,
  validateActiveReleaseReadiness,
  validateInactiveReleasePreflight
} from "./activation-workflow-validation.mjs";
import {
  validateDeploymentStatus,
  validateUploadAttestation,
  validateVersionView
} from "./version-workflow-validation.mjs";
import { writeAttemptMarker } from "./upload-worker-version.mjs";
import {
  collectWorkerUploadInputs,
  releaseHandoffIdentitySha256,
  workerUploadInputsSha256
} from "./worker-upload-inputs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const privateDirectory = path.join(project, "cloudflare", "private");
const releaseConfigPath = path.join(privateDirectory, "release-config.json");
const wranglerConfigPath = path.join(privateDirectory, "wrangler.production.json");
const activationSqlPath = path.join(privateDirectory, "runtime-activate.sql");
const attemptMarkerPath = path.join(privateDirectory, "production-activation-attempt.json");
const workerVersionAttestationPath = path.join(privateDirectory, "worker-version-attestation.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writeFrozenInput(outputPath, bytes, mode) {
  assert(Buffer.isBuffer(bytes), "Frozen activation inputs must be prevalidated byte buffers");
  let handle;
  let created = false;
  try {
    handle = await open(outputPath, "wx", mode);
    created = true;
    await handle.writeFile(bytes);
    await handle.chmod(mode);
    await handle.sync();
    await handle.close();
    handle = undefined;
    assert((await readFile(outputPath)).equals(bytes),
      "Frozen activation input differs from its prevalidated bytes");
    return true;
  } catch (error) {
    await handle?.close().catch(() => {});
    if (created) await unlink(outputPath).catch(() => {});
    throw error;
  }
}

export async function withFrozenActivationInputs({
  sourceConfigPath,
  configBytes,
  sourceSqlPath,
  sqlBytes
}, action) {
  assert(typeof action === "function", "Frozen activation input action must be a function");
  assert(path.dirname(sourceConfigPath) === path.dirname(sourceSqlPath),
    "Activation config and SQL must share one private directory");
  const token = `${process.pid}-${randomUUID()}`;
  const frozenConfigPath = path.join(
    path.dirname(sourceConfigPath),
    `.${path.basename(sourceConfigPath)}.activate-${token}.json`
  );
  const frozenSqlPath = path.join(
    path.dirname(sourceSqlPath),
    `.${path.basename(sourceSqlPath)}.activate-${token}.sql`
  );
  let configCreated = false;
  let sqlCreated = false;
  try {
    configCreated = await writeFrozenInput(frozenConfigPath, configBytes, 0o400);
    sqlCreated = await writeFrozenInput(frozenSqlPath, sqlBytes, 0o400);
    return await action({
      wranglerConfigPath: frozenConfigPath,
      activationSqlPath: frozenSqlPath
    });
  } finally {
    const cleanup = [];
    if (sqlCreated) cleanup.push(unlink(frozenSqlPath));
    if (configCreated) cleanup.push(unlink(frozenConfigPath));
    const results = await Promise.allSettled(cleanup);
    const failures = results.filter(result => result.status === "rejected")
      .map(result => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, "Frozen activation inputs could not be removed");
    }
  }
}

async function main() {
assert(process.argv.length === 3 && process.argv[2] === "--acknowledge-live-activation",
  "Production activation requires the explicit --acknowledge-live-activation flag");
assert(process.versions.node === "24.9.0",
  `Production activation requires Node 24.9.0; found ${process.versions.node}`);

let release;
let wrangler;
let packageMetadata;
let wranglerPackage;
let wranglerConfigBytes;
let activationSqlBytes;
let workerVersionAttestation;
try {
  [release, wranglerConfigBytes, packageMetadata, wranglerPackage, activationSqlBytes,
    workerVersionAttestation] = await Promise.all([
    readFile(releaseConfigPath, "utf8").then(JSON.parse),
    readFile(wranglerConfigPath),
    readFile(path.join(project, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(project, "node_modules", "wrangler", "package.json"), "utf8").then(JSON.parse),
    readFile(activationSqlPath),
    readFile(workerVersionAttestationPath, "utf8").then(JSON.parse)
  ]);
  wrangler = JSON.parse(wranglerConfigBytes.toString("utf8"));
} catch {
  throw new Error("Final release config, Worker-version attestation, production Wrangler config, activation SQL, package metadata, and pinned local Wrangler are required");
}

assert(activationSqlBytes.toString("utf8") === buildActivationSql(release),
  "Private activation SQL is stale or differs from the finalized release config");
assert(packageMetadata?.devDependencies?.wrangler === "4.112.0" &&
  wranglerPackage?.version === "4.112.0" && typeof wranglerPackage.bin?.wrangler === "string",
"Production activation requires the reviewed Wrangler 4.112.0 installation");
assert(wrangler?.name === "uvlt-fixed-ab-calibration" && wrangler.workers_dev === false &&
  wrangler.preview_urls === false,
"Production activation received an invalid Worker configuration");
assert(Array.isArray(wrangler.routes) && wrangler.routes.length === 1 &&
  wrangler.routes[0]?.custom_domain === true,
"Production activation requires exactly one controlled custom domain");
assert(Array.isArray(wrangler.d1_databases) && wrangler.d1_databases.length === 1 &&
  wrangler.d1_databases[0]?.database_name === "uvlt-fixed-ab-calibration-production",
"Production activation requires the dedicated production D1 database");
assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
  wrangler.d1_databases[0]?.database_id || "") &&
  wrangler.d1_databases[0].database_id !== "00000000-0000-0000-0000-000000000000",
"Production activation requires the attested non-placeholder D1 database UUID");
assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
  release.workerVersionId || ""),
"Production activation requires the canonical frozen Worker version ID");
assert(wrangler.vars?.EXPECTED_RELEASE_ID === release.releaseId &&
  wrangler.vars?.EXPECTED_APP_VERSION === release.appVersion &&
  wrangler.vars?.EXPECTED_ADMINISTRATION_POLICY_SHA256 === release.expectedHashes?.administrationPolicySha256 &&
  wrangler.vars?.EXPECTED_PUBLIC_BUILD_MANIFEST_SHA256 === release.expectedHashes?.publicBuildManifestSha256 &&
  wrangler.vars?.EXPECTED_RUNTIME_MANIFEST_SHA256 === release.expectedHashes?.runtimeManifestPayloadSha256 &&
  wrangler.vars?.EXPECTED_BANK_SHA256 === release.expectedHashes?.bankPayloadSha256 &&
  wrangler.vars?.EXPECTED_ROUTES_SHA256 === release.expectedHashes?.routesPayloadSha256 &&
  wrangler.vars?.EXPECTED_RUNTIME_BANK_PROJECTION_SHA256 === release.expectedHashes?.runtimeBankProjectionSha256 &&
  wrangler.vars?.EXPECTED_RUNTIME_ROUTES_PROJECTION_SHA256 === release.expectedHashes?.runtimeRoutesProjectionSha256 &&
  wrangler.vars?.EXPECTED_ALLOCATION_SCHEDULE_SHA256 === release.expectedHashes?.allocationScheduleSha256 &&
  wrangler.vars?.EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT === release.participantHmacKeyFingerprint &&
  wrangler.vars?.EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT === release.prolificCompletionCodeFingerprint &&
  wrangler.vars?.EXPECTED_PROLIFIC_COMPLETION_ACTION === release.prolificCompletionAction,
"Production activation release authority does not match the deployed Worker variables");
const currentUploadInputs = await collectWorkerUploadInputs({
  project,
  wranglerConfigPath
});
validateUploadAttestation(workerVersionAttestation, {
  releaseId: release.releaseId,
  appVersion: release.appVersion,
  workerName: wrangler.name,
  workerVersionId: release.workerVersionId,
  nodeVersion: process.versions.node,
  wranglerVersion: wranglerPackage.version,
  productionWranglerConfigSha256: createHash("sha256").update(wranglerConfigBytes).digest("hex"),
  releaseHandoffIdentitySha256: releaseHandoffIdentitySha256(release),
  uploadInputsSha256: currentUploadInputs.sha256,
  workerUploadInputsSha256
});
const controlledOrigin = new URL(`https://${wrangler.routes[0].pattern}`).origin;
const readinessUrl = new URL("/api/config", controlledOrigin);

const wranglerDirectory = path.join(project, "node_modules", "wrangler");
const wranglerExecutable = path.resolve(wranglerDirectory, wranglerPackage.bin.wrangler);
const executableRelative = path.relative(wranglerDirectory, wranglerExecutable);
assert(executableRelative && !executableRelative.startsWith("..") && !path.isAbsolute(executableRelative),
  "Pinned Wrangler executable resolved outside its package");
await access(wranglerExecutable, constants.R_OK);

async function fetchReadiness() {
  const response = await fetch(readinessUrl, {
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  assert(response.ok && response.headers.get("content-type")?.toLowerCase().startsWith("application/json"),
    "Controlled-domain readiness endpoint did not return successful JSON");
  return response.json();
}

function runWrangler(argumentsList) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [wranglerExecutable, ...argumentsList], {
      cwd: project,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (stderr) process.stderr.write(stderr);
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

function parseWranglerJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Wrangler returned invalid JSON for ${label}`);
  }
}

await withFrozenActivationInputs({
  sourceConfigPath: wranglerConfigPath,
  configBytes: wranglerConfigBytes,
  sourceSqlPath: activationSqlPath,
  sqlBytes: activationSqlBytes
}, async ({
  wranglerConfigPath: frozenWranglerConfigPath,
  activationSqlPath: frozenActivationSqlPath
}) => {
  validateInactiveReleasePreflight(await fetchReadiness(), release);
  const versionView = parseWranglerJson(await runWrangler([
    "versions", "view", release.workerVersionId,
    "--config", frozenWranglerConfigPath,
    "--json"
  ]), "the pre-activation Worker-version check");
  validateVersionView(versionView, {
    workerVersionId: release.workerVersionId,
    databaseId: wrangler.d1_databases[0].database_id,
    releaseId: release.releaseId
  });
  const deploymentStatus = parseWranglerJson(await runWrangler([
    "deployments", "status",
    "--config", frozenWranglerConfigPath,
    "--json"
  ]), "the pre-activation production-deployment check");
  validateDeploymentStatus(deploymentStatus, release.workerVersionId);

  await writeAttemptMarker(attemptMarkerPath, {
    schemaVersion: "uvlt-production-activation-attempt-1",
    state: "remote-mutation-started",
    releaseId: release.releaseId,
    workerVersionId: release.workerVersionId,
    controlledOrigin,
    recovery: "Do not assume success or rerun blindly. Read back D1 and /api/config, then document recovery."
  });

  const mutationResult = parseWranglerJson(await runWrangler([
    "d1", "execute", "uvlt-fixed-ab-calibration-production",
    "--remote", "--yes", "--json",
    "--config", frozenWranglerConfigPath,
    `--file=${frozenActivationSqlPath}`
  ]), "the production D1 activation import");
  validateActivationMutationResult(mutationResult);

  const sqlString = value => `'${String(value).replaceAll("'", "''")}'`;
  const readbackSql = `
SELECT
  r.active AS release_active,
  r.worker_version_id,
  (SELECT COUNT(*) FROM studies s WHERE s.release_id = r.release_id) AS total_study_count,
  (SELECT COUNT(*) FROM studies s WHERE s.release_id = r.release_id AND s.l1 = 'ja' AND s.active = 1) AS ja_active_study_count,
  (SELECT COUNT(*) FROM studies s WHERE s.release_id = r.release_id AND s.l1 = 'vi' AND s.active = 1) AS vi_active_study_count
FROM runtime_releases r
WHERE r.release_id = ${sqlString(release.releaseId)};
`.trim();
  const readbackOutput = await runWrangler([
    "d1", "execute", "uvlt-fixed-ab-calibration-production",
    "--remote", "--yes", "--json",
    "--config", frozenWranglerConfigPath,
    "--command", readbackSql
  ]);
  const readback = parseWranglerJson(readbackOutput,
    "the post-activation D1 readback");
  validateActivationReadback(readback, { workerVersionId: release.workerVersionId });
  validateActiveReleaseReadiness(await fetchReadiness(), release);
  await unlink(attemptMarkerPath);

  console.log(JSON.stringify({
    ok: true,
    releaseId: release.releaseId,
    workerVersionId: release.workerVersionId,
    exactProductionDeploymentReverified: true,
    exactActivationChangesVerified: true,
    exactD1ReadbackVerified: true,
    controlledDomainReadinessVerified: true,
    collectionEnabled: true
  }, null, 2));
});
}

const invokedAsScript = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
