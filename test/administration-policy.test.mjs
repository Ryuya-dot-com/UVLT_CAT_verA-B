import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADMINISTRATION_POLICY,
  ADMINISTRATION_POLICY_APPROVAL_GATES,
  ADMINISTRATION_POLICY_JSON,
  ADMINISTRATION_POLICY_SHA256,
  stableAdministrationJson,
  validateAdministrationPolicy,
  validateAdministrationPolicySha256
} from "../cloudflare/tools/administration-policy.mjs";
import {
  PROTOCOL_COMPLETION_DEFINITION
} from "../cloudflare/tools/randomization-design.mjs";

const KNOWN_ADMINISTRATION_POLICY_SHA256 =
  "55588091b7c85cf698e076283503c663eaacf77540d3ec9d03abf5b06b229b43";

function assertDeeplyFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value)) assertDeeplyFrozen(nested);
}

test("administration policy is deeply frozen with a stable known hash", () => {
  assertDeeplyFrozen(ADMINISTRATION_POLICY);
  assert.equal(ADMINISTRATION_POLICY_SHA256, KNOWN_ADMINISTRATION_POLICY_SHA256);
  assert.equal(stableAdministrationJson(ADMINISTRATION_POLICY), ADMINISTRATION_POLICY_JSON);
  assert.deepEqual(JSON.parse(ADMINISTRATION_POLICY_JSON), ADMINISTRATION_POLICY);

  const reversedTopLevel = Object.fromEntries(
    Object.entries(structuredClone(ADMINISTRATION_POLICY)).reverse()
  );
  assert.equal(stableAdministrationJson(reversedTopLevel), ADMINISTRATION_POLICY_JSON);
  assert.equal(validateAdministrationPolicy(reversedTopLevel), reversedTopLevel);
  assert.equal(
    validateAdministrationPolicySha256(KNOWN_ADMINISTRATION_POLICY_SHA256),
    KNOWN_ADMINISTRATION_POLICY_SHA256
  );
});

test("administration policy validation rejects semantic or hash drift", () => {
  const changedBreak = structuredClone(ADMINISTRATION_POLICY);
  changedBreak.breaks.standardMinimumSeconds = 46;
  assert.throws(() => validateAdministrationPolicy(changedBreak), /frozen policy/u);

  const addedField = structuredClone(ADMINISTRATION_POLICY);
  addedField.progress.unreviewedField = false;
  assert.throws(() => validateAdministrationPolicy(addedField), /frozen policy/u);

  const missingField = structuredClone(ADMINISTRATION_POLICY);
  delete missingField.practice.feedback;
  assert.throws(() => validateAdministrationPolicy(missingField), /frozen policy/u);

  assert.throws(
    () => validateAdministrationPolicySha256("0".repeat(64)),
    /hash does not match/u
  );
});

test("schema-v7 example binds the exact policy, hash, protocol v2, and approval gates", async () => {
  const [release, wrangler] = await Promise.all([
    readFile(new URL(
      "../cloudflare/release-config.example.json",
      import.meta.url
    ), "utf8").then(JSON.parse),
    readFile(new URL(
      "../cloudflare/wrangler.production.example.json",
      import.meta.url
    ), "utf8").then(JSON.parse)
  ]);

  assert.equal(release.schemaVersion, "uvlt-fixed-ab-field-release-config-7");
  assert.deepEqual(release.administrationPolicy, ADMINISTRATION_POLICY);
  assert.equal(
    release.expectedHashes.administrationPolicySha256,
    ADMINISTRATION_POLICY_SHA256
  );
  assert.equal(
    release.recruitmentPolicy.protocolCompletionDefinition,
    PROTOCOL_COMPLETION_DEFINITION
  );
  assert.deepEqual(ADMINISTRATION_POLICY_APPROVAL_GATES, [
    "administrationPolicyIndependentReviewRecorded",
    "processDataEthicsPrivacyConsentApproved",
    "attentionAnalysisPreregistrationRecorded"
  ]);
  for (const gate of ADMINISTRATION_POLICY_APPROVAL_GATES) {
    assert.equal(release.approvals[gate], false);
  }
  assert.equal(
    wrangler.vars.EXPECTED_ADMINISTRATION_POLICY_SHA256,
    ADMINISTRATION_POLICY_SHA256
  );
  assert.equal(
    Object.keys(wrangler.vars).some((key) => /ADMINISTRATION_POLICY_JSON/u.test(key)),
    false
  );
});
