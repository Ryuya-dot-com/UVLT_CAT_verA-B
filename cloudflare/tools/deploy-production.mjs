import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateDeploymentStatus,
  validateUploadAttestation,
  validateVersionView
} from "./version-workflow-validation.mjs";
import {
  collectWorkerUploadInputs,
  releaseHandoffIdentitySha256,
  workerUploadInputsSha256
} from "./worker-upload-inputs.mjs";
import { validateRecruitmentPolicy } from "./randomization-design.mjs";
import {
  ADMINISTRATION_POLICY_APPROVAL_GATES,
  validateAdministrationPolicy,
  validateAdministrationPolicySha256
} from "./administration-policy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const releaseConfigPath = path.join(project, "cloudflare", "private", "release-config.json");
const wranglerConfigPath = path.join(project, "cloudflare", "private", "wrangler.production.json");
const wranglerPackageDirectory = path.join(project, "node_modules", "wrangler");
const wranglerPackagePath = path.join(wranglerPackageDirectory, "package.json");
const workerVersionAttestationPath = path.join(project, "cloudflare", "private", "worker-version-attestation.json");
const reviewedNodeVersion = "24.9.0";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function withFrozenWranglerConfig(sourceConfigPath, configBytes, action) {
  assert(typeof action === "function", "Frozen Wrangler config action must be a function");
  const frozenConfigPath = path.join(
    path.dirname(sourceConfigPath),
    `.${path.basename(sourceConfigPath)}.deploy-${process.pid}-${randomUUID()}.json`
  );
  let configHandle;
  let created = false;
  try {
    configHandle = await open(frozenConfigPath, "wx", 0o400);
    created = true;
    await configHandle.writeFile(configBytes);
    await configHandle.chmod(0o400);
    await configHandle.sync();
    await configHandle.close();
    configHandle = undefined;
    const frozenBytes = await readFile(frozenConfigPath);
    assert(frozenBytes.equals(Buffer.from(configBytes)),
      "Frozen production Wrangler config differs from the validated bytes");
    return await action(frozenConfigPath);
  } finally {
    await configHandle?.close().catch(() => {});
    if (created) await unlink(frozenConfigPath);
  }
}

const invokedAsScript = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
const argumentsList = process.argv.slice(2);
assert(
  argumentsList.length === 0 || (argumentsList.length === 1 && argumentsList[0] === "--dry-run"),
  "The deployment wrapper accepts only an optional --dry-run flag"
);
const dryRun = argumentsList[0] === "--dry-run";
assert(process.versions.node === reviewedNodeVersion,
  `Production deployment requires Node ${reviewedNodeVersion}; found ${process.versions.node}`);

let release;
let packageMetadata;
let wranglerPackage;
let wranglerConfigBytes;
let wrangler;
let workerVersionAttestation;
let uploadInputs;
try {
  [release, packageMetadata, wranglerPackage, wranglerConfigBytes, workerVersionAttestation] = await Promise.all([
    readFile(releaseConfigPath, "utf8").then(JSON.parse),
    readFile(path.join(project, "package.json"), "utf8").then(JSON.parse),
    readFile(wranglerPackagePath, "utf8").then(JSON.parse),
    readFile(wranglerConfigPath),
    readFile(workerVersionAttestationPath, "utf8").then(JSON.parse)
  ]);
  wrangler = JSON.parse(wranglerConfigBytes.toString("utf8"));
} catch {
  throw new Error("Private release config, Worker-version attestation, production Wrangler config, package.json, and the installed local Wrangler package must be present and valid");
}

try {
  uploadInputs = await collectWorkerUploadInputs({ project, wranglerConfigPath });
} catch (error) {
  throw new Error(`Current Worker upload inputs could not be frozen: ${error instanceof Error ? error.message : "unknown error"}`);
}

assert(release?.schemaVersion === "uvlt-fixed-ab-field-release-config-7", "Private release config schema is unsupported");
validateRecruitmentPolicy(release.recruitmentPolicy);
validateAdministrationPolicy(release.administrationPolicy);
assert(release.active === true, "Private release config must be active before deployment");
assert(typeof release.releaseId === "string" && /^[a-z0-9][a-z0-9._-]{7,127}$/.test(release.releaseId), "Private release ID is invalid");
assert(release.appVersion === packageMetadata?.version, "Private release appVersion must exactly match package.json version");
assert(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(release.workerVersionId || ""),
  "Private active release workerVersionId must be a canonical lowercase Cloudflare Worker version UUID"
);
for (const field of [
  "administrationPolicySha256",
  "runtimeManifestPayloadSha256",
  "bankPayloadSha256",
  "routesPayloadSha256",
  "runtimeBankProjectionSha256",
  "runtimeRoutesProjectionSha256",
  "allocationScheduleSha256",
  "publicBuildManifestSha256"
]) {
  const value = release.expectedHashes?.[field];
  assert(
    /^[0-9a-f]{64}$/.test(value || "") && value !== "0".repeat(64),
    `Private release expectedHashes.${field} is invalid`
  );
}
validateAdministrationPolicySha256(
  release.expectedHashes.administrationPolicySha256
);
assert(
  wrangler.vars?.EXPECTED_ADMINISTRATION_POLICY_SHA256 ===
    release.expectedHashes.administrationPolicySha256,
  "Production Wrangler EXPECTED_ADMINISTRATION_POLICY_SHA256 does not match the release"
);
assert(
  /^sha256:[0-9a-f]{64}$/.test(release.randomizationSeedFingerprint || "") &&
    release.randomizationSeedFingerprint !== `sha256:${"0".repeat(64)}`,
  "Private release randomization seed fingerprint is invalid"
);
assert(
  release.randomizationAlgorithm === "hmac-sha256-permuted-blocks-10-crossed-option-williams-6-v1" &&
    release.optionLayoutAlgorithm === "even-order-williams-square-6-canonical-first-v1",
  "Private release randomization algorithms are unsupported"
);
for (const approval of [
  "contentOwnerApprovalRecorded",
  "authoritativeAnswerKeyApprovalRecorded",
  "participantInformationAndConsentApproved",
  "japaneseAndVietnameseInstructionReviewRecorded",
  "timingPilotCompleted",
  "ethicsApprovalRecorded",
  "privacyRetentionDeletionPlanRecorded",
  "protectedDataReceiptVerified",
  "privateWorkspaceApprovalRecorded",
  "randomizationScheduleReviewRecorded",
  "attritionReplacementPolicyRecorded",
  ...ADMINISTRATION_POLICY_APPROVAL_GATES,
  "independentPrelaunchReviewCompleted"
]) {
  assert(release.approvals?.[approval] === true, `Private release approval ${approval} is not recorded`);
}
for (const [field, value] of [
  ["participant HMAC-key fingerprint", release.participantHmacKeyFingerprint],
  ["Prolific completion-code fingerprint", release.prolificCompletionCodeFingerprint]
]) {
  assert(
    /^sha256:[0-9a-f]{64}$/.test(value || "") && value !== `sha256:${"0".repeat(64)}`,
    `Private release ${field} is invalid`
  );
}
assert(packageMetadata?.devDependencies?.wrangler === "4.112.0", "package.json must pin the reviewed Wrangler version exactly");
assert(wranglerPackage?.version === packageMetadata.devDependencies.wrangler, "Installed local Wrangler does not match the exact package.json pin");
assert(typeof wranglerPackage?.bin?.wrangler === "string", "Pinned local Wrangler executable is missing");
validateUploadAttestation(workerVersionAttestation, {
  releaseId: release.releaseId,
  appVersion: release.appVersion,
  workerName: "uvlt-fixed-ab-calibration",
  workerVersionId: release.workerVersionId,
  nodeVersion: process.versions.node,
  wranglerVersion: wranglerPackage.version,
  productionWranglerConfigSha256: createHash("sha256").update(wranglerConfigBytes).digest("hex"),
  releaseHandoffIdentitySha256: releaseHandoffIdentitySha256(release),
  uploadInputsSha256: uploadInputs.sha256,
  workerUploadInputsSha256
});
const wranglerExecutable = path.resolve(wranglerPackageDirectory, wranglerPackage.bin.wrangler);
const wranglerExecutableRelative = path.relative(wranglerPackageDirectory, wranglerExecutable);
assert(
  wranglerExecutableRelative && !wranglerExecutableRelative.startsWith("..") && !path.isAbsolute(wranglerExecutableRelative),
  "Pinned local Wrangler executable resolved outside its package"
);
await access(wranglerExecutable, constants.R_OK);
await access(wranglerConfigPath, constants.R_OK);

function runWrangler(argumentsList, { captureStdout = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [wranglerExecutable, ...argumentsList], {
      cwd: project,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      encoding: "utf8",
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
      else reject(new Error(`Wrangler command failed (${signal ?? `exit ${code}`})`));
    });
  });
}

await withFrozenWranglerConfig(wranglerConfigPath, wranglerConfigBytes, async frozenWranglerConfigPath => {
  if (dryRun) {
    await runWrangler([
      "versions",
      "upload",
      "--strict",
      "--config",
      frozenWranglerConfigPath,
      "--tag",
      release.releaseId,
      "--dry-run",
      "--outdir",
      path.join(project, ".wrangler-dry-run")
    ]);
  } else {
    const versionJson = await runWrangler([
      "versions",
      "view",
      release.workerVersionId,
      "--config",
      frozenWranglerConfigPath,
      "--json"
    ], { captureStdout: true });
    let uploadedVersion;
    try {
      uploadedVersion = JSON.parse(versionJson);
    } catch {
      throw new Error("Wrangler returned invalid JSON while verifying the frozen Worker version");
    }
    validateVersionView(uploadedVersion, {
      workerVersionId: release.workerVersionId,
      releaseId: release.releaseId
    });
    await runWrangler([
      "versions",
      "deploy",
      `${release.workerVersionId}@100%`,
      "--config",
      frozenWranglerConfigPath,
      "--message",
      `Deploy frozen release ${release.releaseId}`,
      "-y"
    ]);
    const deploymentStatusJson = await runWrangler([
      "deployments",
      "status",
      "--config",
      frozenWranglerConfigPath,
      "--json"
    ], { captureStdout: true });
    let latestDeployment;
    try {
      latestDeployment = JSON.parse(deploymentStatusJson);
    } catch {
      throw new Error("Wrangler returned invalid JSON while verifying the production deployment");
    }
    validateDeploymentStatus(latestDeployment, release.workerVersionId);
  }
});

/*
 * Versions deployments do not apply routes/custom domains. The controlled
 * route must be applied and verified as a separate launch step before D1
 * activation; this wrapper intentionally does not silently mutate triggers.
 */

console.log(JSON.stringify({
  ok: true,
  dryRun,
  appVersion: release.appVersion,
  workerVersionId: release.workerVersionId,
  workerVersionTag: release.releaseId,
  productionTrafficVerified: dryRun ? false : true,
  action: dryRun ? "local-version-upload-dry-run" : "exact-version-deploy"
}, null, 2));
}
