import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withFrozenWranglerConfig } from "../cloudflare/tools/deploy-production.mjs";
import {
  assertPreloadedUploadInputsMatch,
  canonicalRemoteVersionCreatedAt,
  writeAttemptMarker
} from "../cloudflare/tools/upload-worker-version.mjs";
import {
  validateDeploymentStatus,
  validateUploadAttestation,
  validateVersionUploadRecords,
  validateVersionView
} from "../cloudflare/tools/version-workflow-validation.mjs";
import {
  runtimeBankProjection,
  runtimeProjectionSha256,
  runtimeRoutesProjection
} from "../cloudflare/tools/runtime-projections.mjs";
import {
  releaseHandoffIdentitySha256,
  workerUploadInputsSha256
} from "../cloudflare/tools/worker-upload-inputs.mjs";
import {
  ADMINISTRATION_POLICY,
  ADMINISTRATION_POLICY_SHA256
} from "../cloudflare/tools/administration-policy.mjs";
import {
  PROTOCOL_COMPLETION_DEFINITION
} from "../cloudflare/tools/randomization-design.mjs";

const workerVersionId = "11111111-1111-4111-8111-111111111111";
const workerName = "uvlt-fixed-ab-calibration";
const releaseId = "uvlt-fixed-ab-release-20260720";

test("canonical D1 projection hashes are order-stable and content-sensitive", () => {
  const testlets = [
    {
      testletId: "testlet-b",
      moduleId: "B:1k",
      formId: "B",
      band: "1k",
      options: ["a", "b", "c", "d", "e", "f"],
      items: [{ itemId: "item-b", prompt: "prompt b", itemPositionWithinTestlet: 1 }],
      contentSha256: "2".repeat(64)
    },
    {
      testletId: "testlet-a",
      moduleId: "A:1k",
      formId: "A",
      band: "1k",
      options: ["g", "h", "i", "j", "k", "l"],
      items: [{ itemId: "item-a", prompt: "prompt a", itemPositionWithinTestlet: 1 }],
      contentSha256: "1".repeat(64)
    }
  ];
  const routeRows = [
    { routeId: "R02", testletOrdinal: 0, modulePosition: 1, testletPositionWithinModule: 1, testletId: "testlet-b" },
    { routeId: "R01", testletOrdinal: 0, modulePosition: 1, testletPositionWithinModule: 1, testletId: "testlet-a" }
  ];
  const bankHash = runtimeProjectionSha256(runtimeBankProjection(releaseId, testlets));
  const routeHash = runtimeProjectionSha256(runtimeRoutesProjection(releaseId, routeRows));
  assert.match(bankHash, /^[0-9a-f]{64}$/u);
  assert.match(routeHash, /^[0-9a-f]{64}$/u);
  assert.equal(
    runtimeProjectionSha256(runtimeBankProjection(releaseId, [...testlets].reverse())),
    bankHash
  );
  assert.equal(
    runtimeProjectionSha256(runtimeRoutesProjection(releaseId, [...routeRows].reverse())),
    routeHash
  );
  const changedTestlets = structuredClone(testlets);
  changedTestlets[0].items[0].prompt = "coordinated replacement";
  changedTestlets[0].contentSha256 = "3".repeat(64);
  assert.notEqual(
    runtimeProjectionSha256(runtimeBankProjection(releaseId, changedTestlets)),
    bankHash
  );
  const relabeledRoutes = structuredClone(routeRows);
  [relabeledRoutes[0].testletId, relabeledRoutes[1].testletId] =
    [relabeledRoutes[1].testletId, relabeledRoutes[0].testletId];
  assert.notEqual(
    runtimeProjectionSha256(runtimeRoutesProjection(releaseId, relabeledRoutes)),
    routeHash
  );
});
function uploadRecord(overrides = {}) {
  return {
    type: "version-upload",
    version: 1,
    worker_name: workerName,
    worker_tag: "opaque-service-tag",
    version_id: workerVersionId,
    worker_name_overridden: false,
    ...overrides
  };
}

test("version-upload validation accepts omitted disabled preview fields", () => {
  assert.equal(validateVersionUploadRecords([uploadRecord()], {
    workerName,
    releaseId
  }).version_id, workerVersionId);
  assert.equal(validateVersionUploadRecords([uploadRecord({
    preview_url: null,
    preview_alias_url: null
  })], { workerName, releaseId }).version_id, workerVersionId);
});

test("version-upload validation rejects ambiguous or unsafe receipts", () => {
  for (const records of [
    [],
    [uploadRecord(), uploadRecord()],
    [{ type: "command-failed" }, uploadRecord()],
    [uploadRecord({ worker_name: "wrong-worker" })],
    [uploadRecord({ worker_name_overridden: true })],
    [uploadRecord({ version_id: "not-a-version-id" })],
    [uploadRecord({ preview_url: "https://preview.invalid" })]
  ]) {
    assert.throws(() => validateVersionUploadRecords(records, {
      workerName,
      releaseId
    }));
  }
});

test("version view must match both immutable ID and one-time tag", () => {
  const version = {
    id: workerVersionId,
    annotations: { "workers/tag": releaseId }
  };
  assert.equal(validateVersionView(version, { workerVersionId, releaseId }), version);
  assert.throws(() => validateVersionView({ ...version, id: "22222222-2222-4222-8222-222222222222" },
    { workerVersionId, releaseId }));
  assert.throws(() => validateVersionView({ ...version, annotations: {} },
    { workerVersionId, releaseId }));
});

test("upload attestation binds the finalized ID and unchanged production config", () => {
  const uploadInputs = {
    schemaVersion: "uvlt-worker-upload-inputs-1",
    files: [{ path: "cloudflare/worker/index.ts", bytes: 12, sha256: "4".repeat(64) }]
  };
  const uploadInputsSha256 = workerUploadInputsSha256(uploadInputs);
  const attestation = {
    schemaVersion: "uvlt-worker-version-upload-attestation-2",
    releaseId,
    appVersion: "0.1.0-dev",
    workerName,
    workerVersionId,
    workerVersionTag: releaseId,
    uploadedAt: "2026-07-20T00:00:00.000Z",
    preuploadReleaseConfigSha256: "1".repeat(64),
    releaseHandoffIdentitySha256: "5".repeat(64),
    productionWranglerConfigSha256: "2".repeat(64),
    uploadInputs,
    uploadInputsSha256,
    nodeVersion: "24.9.0",
    wranglerVersion: "4.112.0"
  };
  const expected = {
    releaseId,
    appVersion: "0.1.0-dev",
    workerName,
    workerVersionId,
    nodeVersion: "24.9.0",
    wranglerVersion: "4.112.0",
    productionWranglerConfigSha256: "2".repeat(64),
    releaseHandoffIdentitySha256: "5".repeat(64),
    uploadInputsSha256,
    workerUploadInputsSha256
  };
  assert.equal(validateUploadAttestation(attestation, expected), attestation);
  for (const changed of [
    { workerVersionId: "22222222-2222-4222-8222-222222222222" },
    { productionWranglerConfigSha256: "3".repeat(64) },
    { releaseHandoffIdentitySha256: "6".repeat(64) },
    { uploadInputsSha256: "7".repeat(64) },
    { nodeVersion: "24.9.1" },
    { wranglerVersion: "4.111.0" }
  ]) {
    assert.throws(() => validateUploadAttestation(attestation, {
      ...expected,
      ...changed
    }));
  }
  assert.throws(() => validateUploadAttestation({
    ...attestation,
    uploadInputs: {
      ...uploadInputs,
      files: [{ ...uploadInputs.files[0], bytes: 13 }]
    }
  }, expected));
});

test("deployment status accepts only the frozen version at exactly 100 percent", () => {
  const exact = { versions: [{ version_id: workerVersionId, percentage: 100 }] };
  assert.equal(validateDeploymentStatus(exact, workerVersionId).percentage, 100);
  for (const status of [
    {},
    { versions: [] },
    { versions: [exact.versions[0], { version_id: "other", percentage: 0 }] },
    { versions: [{ version_id: workerVersionId, percentage: 99 }] },
    { versions: [{ version_id: "22222222-2222-4222-8222-222222222222", percentage: 100 }] }
  ]) {
    assert.throws(() => validateDeploymentStatus(status, workerVersionId));
  }
});

test("release handoff identity permits only documented lifecycle changes", () => {
  const before = {
    schemaVersion: "uvlt-fixed-ab-field-release-config-7",
    releaseId,
    appVersion: "0.1.0-dev",
    workerVersionId: null,
    frozenAt: null,
    active: false,
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
      bankPayloadSha256: "1".repeat(64)
    },
    approvals: {
      contentOwnerApprovalRecorded: true,
      administrationPolicyIndependentReviewRecorded: true,
      processDataEthicsPrivacyConsentApproved: true,
      attentionAnalysisPreregistrationRecorded: true,
      independentPrelaunchReviewCompleted: false
    },
    studies: [
      { studyId: "1".repeat(24), l1: "ja", active: false },
      { studyId: "2".repeat(24), l1: "vi", active: false }
    ]
  };
  const after = structuredClone(before);
  after.workerVersionId = workerVersionId;
  after.frozenAt = "2026-07-20T01:00:00.000Z";
  after.active = true;
  after.approvals.independentPrelaunchReviewCompleted = true;
  after.studies.forEach(study => { study.active = true; });
  assert.equal(releaseHandoffIdentitySha256(before), releaseHandoffIdentitySha256(after));

  after.expectedHashes.bankPayloadSha256 = "2".repeat(64);
  assert.notEqual(releaseHandoffIdentitySha256(before), releaseHandoffIdentitySha256(after));

  const changedPolicy = structuredClone(before);
  changedPolicy.recruitmentPolicy.hardCapStartsPerL1 = 421;
  assert.notEqual(releaseHandoffIdentitySha256(before), releaseHandoffIdentitySha256(changedPolicy));

  const changedAdministration = structuredClone(before);
  changedAdministration.administrationPolicy.breaks.standardMinimumSeconds = 46;
  assert.notEqual(
    releaseHandoffIdentitySha256(before),
    releaseHandoffIdentitySha256(changedAdministration)
  );

  const changedAdministrationApproval = structuredClone(before);
  changedAdministrationApproval.approvals.attentionAnalysisPreregistrationRecorded = false;
  assert.notEqual(
    releaseHandoffIdentitySha256(before),
    releaseHandoffIdentitySha256(changedAdministrationApproval)
  );
});

test("remote Worker creation time is required and normalized from version metadata", () => {
  assert.equal(canonicalRemoteVersionCreatedAt({
    metadata: { created_on: "2026-07-20T00:00:00.123456Z" }
  }), "2026-07-20T00:00:00.123Z");
  for (const version of [
    {},
    { metadata: {} },
    { metadata: { created_on: "2026-07-20" } },
    { metadata: { created_on: "not-a-date" } }
  ]) {
    assert.throws(() => canonicalRemoteVersionCreatedAt(version));
  }
});

test("upload snapshot must contain the exact prevalidated package and Wrangler bytes", () => {
  const packageBytes = Buffer.from('{"name":"fixture"}\n', "utf8");
  const wranglerConfigBytes = Buffer.from('{"name":"fixture-worker"}\n', "utf8");
  const inputs = {
    entries: [
      { path: "package.json", contents: packageBytes },
      { path: "cloudflare/private/wrangler.production.json", contents: wranglerConfigBytes }
    ]
  };
  assert.equal(assertPreloadedUploadInputsMatch(inputs, {
    packageBytes,
    wranglerConfigBytes
  }), inputs);
  assert.throws(() => assertPreloadedUploadInputsMatch({
    entries: inputs.entries.map(entry => entry.path === "package.json" ?
      { ...entry, contents: Buffer.from("changed", "utf8") } : entry)
  }, { packageBytes, wranglerConfigBytes }));
  assert.throws(() => assertPreloadedUploadInputsMatch({
    entries: inputs.entries.filter(entry => entry.path !== "cloudflare/private/wrangler.production.json")
  }, { packageBytes, wranglerConfigBytes }));
});

test("upload attempt marker is complete, private, synced before return, and no-clobber", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uvlt-upload-marker-test-"));
  const markerPath = path.join(directory, "worker-version-attestation.json.lock");
  const marker = {
    schemaVersion: "uvlt-worker-version-upload-attempt-1",
    state: "remote-call-started",
    releaseId
  };
  try {
    await writeAttemptMarker(markerPath, marker);
    assert.deepEqual(JSON.parse(await readFile(markerPath, "utf8")), marker);
    assert.equal((await stat(markerPath)).mode & 0o777, 0o600);
    await assert.rejects(
      writeAttemptMarker(markerPath, { ...marker, releaseId: "different-release" }),
      error => error?.code === "EEXIST"
    );
    assert.deepEqual(JSON.parse(await readFile(markerPath, "utf8")), marker);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deployment uses an immutable config copy and removes it on success or failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uvlt-deploy-config-test-"));
  const sourcePath = path.join(directory, "wrangler.production.json");
  const validatedBytes = Buffer.from('{"name":"validated"}\n', "utf8");
  try {
    await writeFile(sourcePath, validatedBytes, { flag: "wx", mode: 0o600 });
    let successFrozenPath;
    await withFrozenWranglerConfig(sourcePath, validatedBytes, async frozenPath => {
      successFrozenPath = frozenPath;
      await writeFile(sourcePath, '{"name":"changed"}\n', "utf8");
      assert.deepEqual(await readFile(frozenPath), validatedBytes);
      assert.equal((await stat(frozenPath)).mode & 0o777, 0o400);
    });
    await assert.rejects(access(successFrozenPath, constants.F_OK), error => error?.code === "ENOENT");

    let failedFrozenPath;
    await assert.rejects(withFrozenWranglerConfig(sourcePath, validatedBytes, async frozenPath => {
      failedFrozenPath = frozenPath;
      throw new Error("synthetic deployment failure");
    }), /synthetic deployment failure/u);
    await assert.rejects(access(failedFrozenPath, constants.F_OK), error => error?.code === "ENOENT");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
