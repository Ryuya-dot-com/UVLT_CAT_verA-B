import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { withFrozenActivationInputs } from "../cloudflare/tools/activate-production.mjs";
import { buildActivationSql } from "../cloudflare/tools/build-activation-sql.mjs";
import {
  FIELD_WORKER_PROTOCOL_VERSION,
  releaseBindingSha256,
  validateActivationMutationResult,
  validateActivationReadback,
  validateActiveReleaseReadiness,
  validateInactiveReleasePreflight
} from "../cloudflare/tools/activation-workflow-validation.mjs";
import {
  ADMINISTRATION_POLICY,
  ADMINISTRATION_POLICY_JSON,
  ADMINISTRATION_POLICY_SHA256
} from "../cloudflare/tools/administration-policy.mjs";
import {
  PROTOCOL_COMPLETION_DEFINITION
} from "../cloudflare/tools/randomization-design.mjs";

const nonzero = "1".repeat(64);
const fingerprint = `sha256:${nonzero}`;
const completeRelease = Object.freeze({
  schemaVersion: "uvlt-fixed-ab-field-release-config-7",
  releaseId: "uvlt-fixed-ab-release-20260720",
  appVersion: "0.1.0-dev",
  workerVersionId: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-07-20T00:00:00.000Z",
  frozenAt: "2026-07-20T01:00:00.000Z",
  active: true,
  randomizationSeedFingerprint: fingerprint,
  randomizationAlgorithm: "hmac-sha256-permuted-blocks-10-crossed-option-williams-6-v1",
  optionLayoutAlgorithm: "even-order-williams-square-6-canonical-first-v1",
  participantHmacKeyFingerprint: fingerprint,
  prolificCompletionCodeFingerprint: fingerprint,
  prolificCompletionAction: "MANUALLY_REVIEW",
  recruitmentPolicy: {
    targetProtocolCompletersPerL1: 300,
    hardCapStartsPerL1: 420,
    stopNewAllocationsAtTarget: true,
    retainServerCommittedPartialResponses: true,
    protocolCompletionDefinition: PROTOCOL_COMPLETION_DEFINITION,
    partialResponseRetentionDefinition: "consented-nonwithdrawn-server-committed-complete-testlets-v1"
  },
  administrationPolicy: structuredClone(ADMINISTRATION_POLICY),
  expectedHashes: {
    administrationPolicySha256: ADMINISTRATION_POLICY_SHA256,
    runtimeManifestPayloadSha256: nonzero,
    bankPayloadSha256: nonzero,
    routesPayloadSha256: nonzero,
    runtimeBankProjectionSha256: nonzero,
    runtimeRoutesProjectionSha256: nonzero,
    allocationScheduleSha256: nonzero,
    publicBuildManifestSha256: nonzero
  },
  approvals: {
    contentOwnerApprovalRecorded: true,
    authoritativeAnswerKeyApprovalRecorded: true,
    participantInformationAndConsentApproved: true,
    japaneseAndVietnameseInstructionReviewRecorded: true,
    timingPilotCompleted: true,
    ethicsApprovalRecorded: true,
    privacyRetentionDeletionPlanRecorded: true,
    protectedDataReceiptVerified: true,
    privateWorkspaceApprovalRecorded: true,
    randomizationScheduleReviewRecorded: true,
    attritionReplacementPolicyRecorded: true,
    administrationPolicyIndependentReviewRecorded: true,
    processDataEthicsPrivacyConsentApproved: true,
    attentionAnalysisPreregistrationRecorded: true,
    independentPrelaunchReviewCompleted: true
  },
  studies: [
    { studyId: "aaaaaaaaaaaaaaaaaaaaaaaa", l1: "vi", active: true },
    { studyId: "bbbbbbbbbbbbbbbbbbbbbbbb", l1: "ja", active: true }
  ]
});

test("activation SQL opens studies before the exact version-bound release", () => {
  const sql = buildActivationSql(structuredClone(completeRelease));
  assert.equal((sql.match(/UPDATE studies SET active = 1/g) || []).length, 2);
  assert.equal((sql.match(/UPDATE runtime_releases SET active = 1/g) || []).length, 1);
  assert.ok(sql.indexOf("UPDATE studies SET active = 1") <
    sql.indexOf("UPDATE runtime_releases SET active = 1"));
  assert.match(sql,
    /worker_version_id = '11111111-1111-4111-8111-111111111111' AND active = 0;/u);
  assert.equal((sql.match(/AS activation_marker;/gu) || []).length, 3);
  assert.equal((sql.match(/json_extract\('uvlt-activation:/gu) || []).length, 3);
  assert.match(sql, /uvlt-activation:study-ja:exactly-one-change/u);
  assert.match(sql, /uvlt-activation:study-vi:exactly-one-change/u);
  assert.match(sql, /uvlt-activation:release:exactly-one-change/u);
  assert.equal((sql.match(/;$/gmu) || []).length, 9);
  assert.doesNotMatch(sql, /BEGIN|COMMIT/u);
  assert.doesNotMatch(sql, /participantHmac|completionCode|sha256:/u);
});

test("activation SQL is deterministic regardless of study input order", () => {
  const first = buildActivationSql(structuredClone(completeRelease));
  const reversed = structuredClone(completeRelease);
  reversed.studies.reverse();
  assert.equal(buildActivationSql(reversed), first);
});

test("activation SQL commits a complete release and rolls back a partial attempt in SQLite", async () => {
  const database = new DatabaseSync(":memory:");
  const migration = await readFile(new URL(
    "../cloudflare/migrations/0001_initial.sql", import.meta.url
  ), "utf8");
  const releaseId = completeRelease.releaseId;
  const activationSql = buildActivationSql(structuredClone(completeRelease));

  function runActivation() {
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec(activationSql);
      database.exec("COMMIT;");
    } catch (error) {
      try {
        database.exec("ROLLBACK;");
      } catch {
        // Preserve the activation error if SQLite has already ended the transaction.
      }
      throw error;
    }
  }

  try {
    database.exec(migration);
    database.exec("BEGIN IMMEDIATE;");
    database.prepare(`
      INSERT INTO runtime_releases (
        release_id, app_version, worker_version_id,
        administration_policy_json, administration_policy_sha256,
        public_build_manifest_sha256, runtime_manifest_sha256,
        bank_sha256, routes_sha256,
        runtime_bank_projection_sha256, runtime_routes_projection_sha256,
        allocation_schedule_sha256, randomization_seed_fingerprint,
        randomization_algorithm, option_layout_algorithm,
        participant_hmac_key_fingerprint,
        prolific_completion_code_fingerprint, prolific_completion_action,
        target_protocol_completers_per_l1, hard_cap_starts_per_l1,
        stop_new_allocations_at_target, retain_server_committed_partial_responses,
        protocol_completion_definition, partial_response_retention_definition,
        created_at, frozen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      releaseId, completeRelease.appVersion, completeRelease.workerVersionId,
      ADMINISTRATION_POLICY_JSON, ADMINISTRATION_POLICY_SHA256,
      nonzero, nonzero, nonzero, nonzero, nonzero, nonzero, nonzero,
      completeRelease.randomizationSeedFingerprint,
      completeRelease.randomizationAlgorithm,
      completeRelease.optionLayoutAlgorithm,
      completeRelease.participantHmacKeyFingerprint,
      completeRelease.prolificCompletionCodeFingerprint,
      completeRelease.prolificCompletionAction,
      completeRelease.recruitmentPolicy.targetProtocolCompletersPerL1,
      completeRelease.recruitmentPolicy.hardCapStartsPerL1,
      1, 1,
      completeRelease.recruitmentPolicy.protocolCompletionDefinition,
      completeRelease.recruitmentPolicy.partialResponseRetentionDefinition,
      completeRelease.createdAt, completeRelease.frozenAt
    );

    const insertStudy = database.prepare(`
      INSERT INTO studies (study_id, release_id, l1, active, created_at)
      VALUES (?, ?, ?, 0, ?)
    `);
    for (const study of completeRelease.studies) {
      insertStudy.run(study.studyId, releaseId, study.l1, completeRelease.createdAt);
    }

    const insertTestlet = database.prepare(`
      INSERT INTO runtime_testlets (
        release_id, testlet_id, module_id, form_id, band,
        options_json, items_json, content_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertRoute = database.prepare(`
      INSERT INTO runtime_route_testlets (
        release_id, route_id, testlet_ordinal, module_position,
        testlet_position_within_module, testlet_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const testletIds = [];
    for (let ordinal = 0; ordinal < 100; ordinal += 1) {
      const testletId = `testlet-${String(ordinal + 1).padStart(3, "0")}`;
      testletIds.push(testletId);
      insertTestlet.run(
        releaseId,
        testletId,
        `module-${String(Math.floor(ordinal / 10) + 1).padStart(2, "0")}`,
        ordinal % 2 === 0 ? "A" : "B",
        ["1k", "2k", "3k", "4k", "5k"][ordinal % 5],
        JSON.stringify(["o1", "o2", "o3", "o4", "o5", "o6"]),
        JSON.stringify(["i1", "i2", "i3"]),
        nonzero
      );
    }
    for (let routeIndex = 0; routeIndex < 10; routeIndex += 1) {
      const routeId = `R${String(routeIndex + 1).padStart(2, "0")}`;
      for (let ordinal = 0; ordinal < 100; ordinal += 1) {
        insertRoute.run(
          releaseId,
          routeId,
          ordinal,
          Math.floor(ordinal / 10) + 1,
          (ordinal % 10) + 1,
          testletIds[ordinal]
        );
      }
    }

    const insertSlot = database.prepare(`
      INSERT INTO runtime_allocation_slots (
        release_id, l1, allocation_index, randomization_block,
        block_position, route_id, option_layout_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const l1 of ["ja", "vi"]) {
      for (let block = 0; block < 42; block += 1) {
        for (let routeIndex = 0; routeIndex < 10; routeIndex += 1) {
          insertSlot.run(
            releaseId,
            l1,
            block * 10 + routeIndex,
            block,
            routeIndex + 1,
            `R${String(routeIndex + 1).padStart(2, "0")}`,
            (block + routeIndex) % 6
          );
        }
      }
    }
    database.exec("COMMIT;");

    database.prepare(
      "UPDATE studies SET active = 1 WHERE release_id = ? AND l1 = 'vi'"
    ).run(releaseId);
    assert.throws(runActivation, /malformed JSON|SQLITE_ERROR/u);
    assert.equal(database.prepare(
      "SELECT active FROM runtime_releases WHERE release_id = ?"
    ).get(releaseId).active, 0);
    assert.deepEqual(database.prepare(
      "SELECT l1, active FROM studies WHERE release_id = ? ORDER BY l1"
    ).all(releaseId).map(row => [row.l1, row.active]), [
      ["ja", 0],
      ["vi", 1]
    ]);

    database.prepare(
      "UPDATE studies SET active = 0 WHERE release_id = ? AND l1 = 'vi'"
    ).run(releaseId);
    runActivation();
    assert.equal(database.prepare(
      "SELECT active FROM runtime_releases WHERE release_id = ?"
    ).get(releaseId).active, 1);
    assert.deepEqual(database.prepare(
      "SELECT l1, active FROM studies WHERE release_id = ? ORDER BY l1"
    ).all(releaseId).map(row => [row.l1, row.active]), [
      ["ja", 1],
      ["vi", 1]
    ]);
  } finally {
    database.close();
  }
});

test("activation SQL rejects incomplete or mismatched release authority", () => {
  for (const mutate of [
    release => { release.active = false; },
    release => { release.workerVersionId = null; },
    release => { release.frozenAt = null; },
    release => { release.approvals.ethicsApprovalRecorded = false; },
    release => { release.approvals.processDataEthicsPrivacyConsentApproved = false; },
    release => { release.recruitmentPolicy.hardCapStartsPerL1 = 421; },
    release => { release.administrationPolicy.breaks.standardMinimumSeconds = 46; },
    release => { release.expectedHashes.administrationPolicySha256 = "0".repeat(64); },
    release => { release.expectedHashes.bankPayloadSha256 = "0".repeat(64); },
    release => { release.studies[0].active = false; },
    release => { release.studies[1].l1 = "vi"; }
  ]) {
    const invalid = structuredClone(completeRelease);
    mutate(invalid);
    assert.throws(() => buildActivationSql(invalid));
  }
});

test("activation remote calls use immutable config and SQL copies that are always removed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uvlt-activation-inputs-test-"));
  const sourceConfigPath = path.join(directory, "wrangler.production.json");
  const sourceSqlPath = path.join(directory, "runtime-activate.sql");
  const configBytes = Buffer.from('{"name":"validated-worker"}\n', "utf8");
  const sqlBytes = Buffer.from("SELECT 'validated activation';\n", "utf8");
  try {
    await writeFile(sourceConfigPath, configBytes, { flag: "wx", mode: 0o600 });
    await writeFile(sourceSqlPath, sqlBytes, { flag: "wx", mode: 0o600 });

    let successPaths;
    await withFrozenActivationInputs({
      sourceConfigPath,
      configBytes,
      sourceSqlPath,
      sqlBytes
    }, async paths => {
      successPaths = paths;
      await writeFile(sourceConfigPath, '{"name":"changed-worker"}\n', "utf8");
      await writeFile(sourceSqlPath, "SELECT 'changed activation';\n", "utf8");
      assert.deepEqual(await readFile(paths.wranglerConfigPath), configBytes);
      assert.deepEqual(await readFile(paths.activationSqlPath), sqlBytes);
      assert.equal((await stat(paths.wranglerConfigPath)).mode & 0o777, 0o400);
      assert.equal((await stat(paths.activationSqlPath)).mode & 0o777, 0o400);
      assert.equal(path.dirname(paths.wranglerConfigPath), directory);
      assert.equal(path.dirname(paths.activationSqlPath), directory);
      assert.notEqual(paths.wranglerConfigPath, sourceConfigPath);
      assert.notEqual(paths.activationSqlPath, sourceSqlPath);
    });
    await assert.rejects(access(successPaths.wranglerConfigPath, constants.F_OK),
      error => error?.code === "ENOENT");
    await assert.rejects(access(successPaths.activationSqlPath, constants.F_OK),
      error => error?.code === "ENOENT");

    let failurePaths;
    await assert.rejects(withFrozenActivationInputs({
      sourceConfigPath,
      configBytes,
      sourceSqlPath,
      sqlBytes
    }, async paths => {
      failurePaths = paths;
      throw new Error("synthetic activation failure");
    }), /synthetic activation failure/u);
    await assert.rejects(access(failurePaths.wranglerConfigPath, constants.F_OK),
      error => error?.code === "ENOENT");
    await assert.rejects(access(failurePaths.activationSqlPath, constants.F_OK),
      error => error?.code === "ENOENT");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("activation workflow requires full inactive preflight and exact post-activation readback", () => {
  const releaseBinding = releaseBindingSha256(completeRelease);
  assert.equal(releaseBinding,
    "7ab8b3ee64ca85978e93b114eadafdc2e964201851c755d9e90263c178fddc04");
  const inactive = {
    ok: true,
    collection_enabled: false,
    release_integrity_verified: true,
    activation_preflight_ready: true,
    release_binding_sha256: releaseBinding,
    protocol_version: FIELD_WORKER_PROTOCOL_VERSION
  };
  assert.equal(validateInactiveReleasePreflight(inactive, completeRelease), inactive);
  for (const invalid of [
    { ...inactive, collection_enabled: true },
    { ...inactive, release_integrity_verified: false },
    { ...inactive, activation_preflight_ready: false },
    { ...inactive, protocol_version: "other" },
    { ...inactive, release_binding_sha256: "0".repeat(64) }
  ]) assert.throws(() => validateInactiveReleasePreflight(invalid, completeRelease));
  assert.throws(() => validateInactiveReleasePreflight(inactive, {
    ...completeRelease,
    releaseId: "uvlt-fixed-ab-release-other"
  }));

  const mutation = [{
    success: true,
    results: [{
      "Total queries executed": 9,
      "Rows read": 18,
      "Rows written": 9,
      "Database size (MB)": "1.00"
    }],
    finalBookmark: "bookmark-after-exact-activation",
    meta: { changed_db: true, changes: 3, rows_read: 18, rows_written: 9 }
  }];
  assert.equal(validateActivationMutationResult(mutation), mutation[0]);
  for (const invalid of [
    [],
    [{ ...mutation[0], success: false }],
    [{ ...mutation[0], results: [{ ...mutation[0].results[0], "Total queries executed": 8 }] }],
    [{ ...mutation[0], meta: { ...mutation[0].meta, changes: 2 } }],
    [{ ...mutation[0], meta: { ...mutation[0].meta, changed_db: false } }],
    [{ ...mutation[0], finalBookmark: "" }]
  ]) assert.throws(() => validateActivationMutationResult(invalid));

  const readback = [{
    success: true,
    results: [{
      release_active: 1,
      worker_version_id: completeRelease.workerVersionId,
      total_study_count: 2,
      ja_active_study_count: 1,
      vi_active_study_count: 1
    }]
  }];
  assert.equal(validateActivationReadback(readback, {
    workerVersionId: completeRelease.workerVersionId
  }).release_active, 1);
  for (const invalid of [
    [],
    [{ success: false, results: readback[0].results }],
    [{ success: true, results: [{ ...readback[0].results[0], release_active: 0 }] }],
    [{ success: true, results: [{ ...readback[0].results[0], ja_active_study_count: 0 }] }]
  ]) assert.throws(() => validateActivationReadback(invalid, {
    workerVersionId: completeRelease.workerVersionId
  }));

  const active = { ...inactive, collection_enabled: true, activation_preflight_ready: false };
  assert.equal(validateActiveReleaseReadiness(active, completeRelease), active);
  assert.throws(() => validateActiveReleaseReadiness(inactive, completeRelease));
  assert.throws(() => validateActiveReleaseReadiness({
    ...active,
    release_binding_sha256: "f".repeat(64)
  }, completeRelease));
});
