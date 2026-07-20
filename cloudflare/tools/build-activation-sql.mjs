#!/usr/bin/env node

import { constants } from "node:fs";
import { access, chmod, link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OPTION_LAYOUT_ALGORITHM,
  RANDOMIZATION_ALGORITHM
} from "./randomization-design.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const privateDirectory = path.join(project, "cloudflare", "private");
const workerVersionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const studyIdPattern = /^[0-9a-f]{24}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const sha256FingerprintPattern = /^sha256:[0-9a-f]{64}$/;
const zeroSha256 = "0".repeat(64);
const requiredApprovals = Object.freeze([
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
  "independentPrelaunchReviewCompleted"
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sql(value) {
  assert(typeof value === "string", "SQL text values must be strings");
  return `'${value.replaceAll("'", "''")}'`;
}

function exactOneChangeMarker(label) {
  const success = `uvlt-activation:${label}:exactly-one-change`;
  const failure = `uvlt-activation:${label}:change-count-failure`;
  return "SELECT CASE WHEN changes() = 1 " +
    `THEN ${sql(success)} ELSE json_extract(${sql(failure)}, '$') ` +
    "END AS activation_marker;";
}

function assertCanonicalIsoDateTime(value, label) {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)),
    `${label} must be an ISO date-time`);
  assert(new Date(value).toISOString() === value,
    `${label} must be a canonical UTC ISO date-time`);
}

export function buildActivationSql(release) {
  assert(release && typeof release === "object" && !Array.isArray(release),
    "Release config must be an object");
  assert(release.schemaVersion === "uvlt-fixed-ab-field-release-config-5",
    "Release config schema is unsupported");
  assert(release.active === true,
    "Activation SQL requires a finalized release config with active=true");
  assert(typeof release.releaseId === "string" &&
    /^[a-z0-9][a-z0-9._-]{7,127}$/.test(release.releaseId),
  "Release ID is invalid");
  assert(workerVersionIdPattern.test(release.workerVersionId || ""),
    "workerVersionId must be the captured canonical Cloudflare Worker version UUID");
  assertCanonicalIsoDateTime(release.frozenAt, "frozenAt");
  assert(release.randomizationAlgorithm === RANDOMIZATION_ALGORITHM,
    "Randomization algorithm is unsupported");
  assert(release.optionLayoutAlgorithm === OPTION_LAYOUT_ALGORITHM,
    "Option-layout algorithm is unsupported");
  const expectedHashKeys = [
    "allocationScheduleSha256",
    "bankPayloadSha256",
    "publicBuildManifestSha256",
    "routesPayloadSha256",
    "runtimeBankProjectionSha256",
    "runtimeManifestPayloadSha256",
    "runtimeRoutesProjectionSha256"
  ];
  assert(JSON.stringify(Object.keys(release.expectedHashes || {}).sort()) ===
    JSON.stringify(expectedHashKeys),
  "Release config must contain exactly the seven supported expected hashes");
  for (const value of Object.values(release.expectedHashes)) {
    assert(sha256Pattern.test(value || "") && value !== zeroSha256,
      "Every expected release hash must be a non-placeholder SHA-256 value");
  }
  for (const [label, value] of [
    ["randomizationSeedFingerprint", release.randomizationSeedFingerprint],
    ["participantHmacKeyFingerprint", release.participantHmacKeyFingerprint],
    ["prolificCompletionCodeFingerprint", release.prolificCompletionCodeFingerprint]
  ]) {
    assert(sha256FingerprintPattern.test(value || "") &&
      value !== `sha256:${zeroSha256}`, `${label} is incomplete`);
  }
  for (const approval of requiredApprovals) {
    assert(release.approvals?.[approval] === true,
      `Release approval ${approval} is not recorded`);
  }
  assert(JSON.stringify(Object.keys(release.approvals || {}).sort()) ===
    JSON.stringify([...requiredApprovals].sort()),
  "Release config must contain exactly the supported approval gates");
  assert(["MANUALLY_REVIEW", "AUTOMATICALLY_APPROVE"].includes(
    release.prolificCompletionAction),
  "Prolific completion action is incomplete");
  assert(Array.isArray(release.studies) && release.studies.length === 2,
    "Release config must contain exactly two studies");
  const studies = [...release.studies].sort((left, right) =>
    String(left.l1).localeCompare(String(right.l1)));
  assert(studies.map(study => study.l1).join(",") === "ja,vi",
    "Release config must contain one Japanese-L1 and one Vietnamese-L1 study");
  assert(new Set(studies.map(study => study.studyId)).size === 2,
    "Study IDs must be unique");
  for (const study of studies) {
    assert(study && Object.keys(study).length === 3 &&
      Object.hasOwn(study, "studyId") && Object.hasOwn(study, "l1") &&
      Object.hasOwn(study, "active"),
    "Each study must contain only studyId, l1, and active");
    assert(studyIdPattern.test(study.studyId || ""),
      "Each studyId must be a canonical 24-character Prolific ID");
    assert(study.active === true,
      "Every study must be active in the finalized release authority");
  }

  const lines = [
    "PRAGMA foreign_keys = ON;",
    "",
    "-- Apply this private file only after the captured Worker version is the",
    "-- sole production version at 100%, the custom domain is verified, and",
    "-- /api/config is closed and activation_preflight_ready is true against",
    "-- this full-integrity, exactly inactive D1 release.",
    ...studies.flatMap(study => [
      `-- UVLT activation mutation: study-${study.l1}; expected direct changes: 1`,
      "UPDATE studies SET active = 1 " +
        `WHERE study_id = ${sql(study.studyId)} AND release_id = ${sql(release.releaseId)} ` +
        `AND l1 = ${sql(study.l1)} AND active = 0;`,
      exactOneChangeMarker(`study-${study.l1}`)
    ]),
    "",
    "-- This is deliberately the final mutation. D1 triggers independently",
    "-- revalidate the complete frozen runtime before collection can open.",
    "-- UVLT activation mutation: release; expected direct changes: 1",
    "UPDATE runtime_releases SET active = 1 " +
      `WHERE release_id = ${sql(release.releaseId)} ` +
      `AND worker_version_id = ${sql(release.workerVersionId)} AND active = 0;`,
    exactOneChangeMarker("release"),
    "",
    "SELECT active AS release_active, worker_version_id " +
      `FROM runtime_releases WHERE release_id = ${sql(release.releaseId)};`,
    "SELECT l1, COUNT(*) AS active_study_count FROM studies " +
      `WHERE release_id = ${sql(release.releaseId)} AND active = 1 GROUP BY l1 ORDER BY l1;`,
    ""
  ];
  return lines.join("\n");
}

function resolvePrivatePath(value, fallback, label) {
  const resolved = path.resolve(project, value || fallback);
  const relative = path.relative(privateDirectory, resolved);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} must be a file inside cloudflare/private`);
  return resolved;
}

function parseArguments(argv) {
  const supported = new Set(["--config", "--output"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(supported.has(key), `Unsupported argument ${key || "(missing)"}`);
    assert(value && !value.startsWith("--"), `${key} requires a path`);
    assert(!values.has(key), `${key} may be supplied only once`);
    values.set(key, value);
  }
  return {
    configPath: resolvePrivatePath(values.get("--config"),
      "cloudflare/private/release-config.json", "Release config"),
    outputPath: resolvePrivatePath(values.get("--output"),
      "cloudflare/private/runtime-activate.sql", "Activation SQL output")
  };
}

async function writeFrozenPrivateFile(outputPath, bytes) {
  try {
    const existing = await readFile(outputPath);
    assert(existing.equals(bytes),
      `${path.relative(project, outputPath)} is frozen and differs from the generated bytes`);
    await chmod(outputPath, 0o600);
    return "unchanged";
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporaryPath = path.join(path.dirname(outputPath),
    `.${path.basename(outputPath)}.tmp-${process.pid}-${Date.now()}`);
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    try {
      await link(temporaryPath, outputPath);
      return "created";
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readFile(outputPath);
      assert(existing.equals(bytes),
        `${path.relative(project, outputPath)} was concurrently frozen with different bytes`);
      return "unchanged";
    }
  } finally {
    await unlink(temporaryPath).catch(() => {});
    await chmod(outputPath, 0o600).catch(() => {});
  }
}

async function main() {
  const { configPath, outputPath } = parseArguments(process.argv.slice(2));
  const release = JSON.parse(await readFile(configPath, "utf8"));
  const activationSql = buildActivationSql(release);
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  await chmod(privateDirectory, 0o700);
  await access(configPath, constants.R_OK);
  const writeStatus = await writeFrozenPrivateFile(
    outputPath,
    Buffer.from(activationSql, "utf8")
  );
  console.log(JSON.stringify({
    ok: true,
    output: path.relative(project, outputPath),
    writeStatus,
    releaseId: release.releaseId,
    workerVersionId: release.workerVersionId,
    appliesRemoteChanges: false,
    nextStep: "Review the SQL, then use the activation wrapper only after exact-version, route, inactive full-integrity preflight, and D1 readback checks."
  }, null, 2));
}

const invokedAsScript = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
