import assert from "node:assert/strict";
import test from "node:test";

import { normalizePublicBank } from "../pages/bank.js";

function publicBank(overrides = {}) {
  return {
    packId: "pages-test-pack",
    distribution: { publicReleaseAllowed: true },
    participantCollectionAllowed: true,
    scoringStatus: "stimuli_only_no_answer_key",
    parameterFieldsPresent: [],
    testlets: ["A", "B"].map((formId, testletIndex) => ({
      testletId: `${formId}-testlet`,
      moduleId: `${formId}-module`,
      formId,
      band: "1k",
      options: ["one", "two", "three", "four", "five", "six"],
      items: [1, 2, 3].map(itemPositionWithinTestlet => ({
        itemId: `${formId}-item-${itemPositionWithinTestlet}`,
        itemPositionWithinTestlet,
        prompt: `synthetic prompt ${testletIndex + 1}-${itemPositionWithinTestlet}`
      }))
    })),
    ...overrides
  };
}

test("public bank accepts explicit publication and participation authorization", () => {
  const bank = normalizePublicBank(publicBank());
  assert.equal(bank.releaseId, "pages-test-pack");
  assert.deepEqual(bank.testlets.map(testlet => testlet.formId), ["A", "B"]);
});

test("public bank refuses content without both authorization flags", () => {
  assert.throws(
    () => normalizePublicBank(publicBank({ distribution: { publicReleaseAllowed: false } })),
    /公開用として承認/
  );
  assert.throws(
    () => normalizePublicBank(publicBank({ participantCollectionAllowed: false })),
    /参加者実施用として承認/
  );
});

test("public bank refuses answer keys and item parameters", () => {
  assert.throws(
    () => normalizePublicBank(publicBank({ answerKey: [1, 2, 3] })),
    /採点情報/
  );
  assert.throws(
    () => normalizePublicBank(publicBank({ parameterFieldsPresent: ["difficulty"] })),
    /項目パラメータ/
  );
});
