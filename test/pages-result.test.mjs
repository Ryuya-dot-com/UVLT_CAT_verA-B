import assert from "node:assert/strict";
import test from "node:test";

import {
  RESULT_SCHEMA_VERSION,
  buildResultCsv,
  buildResultFilename,
  createResultSnapshot,
  createSubmissionCode,
  normalizeIdentity,
  protectSpreadsheetCell,
  triggerResultDownload
} from "../pages/result-export.js";

function completedSession(overrides = {}) {
  return {
    identity: { participantName: "山田 太郎", studentId: "AB-123456" },
    submissionCode: "UAB-0011223344556677",
    releaseId: "pages-test-release",
    appVersion: "0.2.0-dev",
    startedAt: "2026-07-22T01:02:03.000Z",
    completedAt: "2026-07-22T02:03:04.000Z",
    responses: [{
      testlet_ordinal: 1,
      route_id: "R01",
      form_id: "A",
      band: "1k",
      module_id: "A-1k",
      module_position: 1,
      testlet_position_within_module: 1,
      testlet_id: "A-1k-01",
      item_position: 1,
      item_id: "A-1k-01-01",
      prompt: "synthetic prompt",
      selected_option_position: 2,
      selected_option: "synthetic option",
      testlet_elapsed_ms: 1234
    }],
    ...overrides
  };
}

test("identity requires only a name and student ID", () => {
  assert.deepEqual(normalizeIdentity({ participantName: "  山田  太郎 ", studentId: " AB-123456 " }), {
    participantName: "山田 太郎",
    studentId: "AB-123456"
  });
  assert.throws(() => normalizeIdentity({ participantName: "", studentId: "AB-1" }), /氏名/);
  assert.throws(() => normalizeIdentity({ participantName: "山田", studentId: "" }), /学籍番号/);
});

test("submission code uses browser cryptographic randomness", () => {
  const code = createSubmissionCode({ randomUUID: () => "00112233-4455-4677-8899-aabbccddeeff" });
  assert.equal(code, "UAB-0011223344554677");
});

test("CSV is Excel-compatible, formula-safe, and keeps PII out of the filename", () => {
  assert.equal(protectSpreadsheetCell("=HYPERLINK(\"https://example.invalid\")"), "'=HYPERLINK(\"https://example.invalid\")");
  const session = completedSession({
    identity: { participantName: "=CMD()", studentId: "+123" }
  });
  const csv = buildResultCsv(session);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, new RegExp(RESULT_SCHEMA_VERSION));
  assert.match(csv, /"'=CMD\(\)"/);
  assert.match(csv, /"'\+123"/);
  assert.match(csv, /"synthetic option"/);
  const filename = buildResultFilename(session.submissionCode);
  assert.equal(filename, "UVLT_AB_result_UAB-0011223344556677.csv");
  assert.doesNotMatch(filename, /CMD|123$/);
});

test("snapshot is stable and can be downloaded again without regeneration", () => {
  const snapshot = createResultSnapshot(completedSession());
  const clicks = [];
  const appended = [];
  const revoked = [];
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
    }
  }
  const anchor = {
    click() { clicks.push(this.download); },
    remove() {}
  };
  const documentApi = {
    createElement(tag) {
      assert.equal(tag, "a");
      return anchor;
    },
    body: { append(node) { appended.push(node); } }
  };
  const urlApi = {
    createObjectURL(blob) {
      assert.equal(blob.parts[0], snapshot.csv);
      return "blob:test";
    },
    revokeObjectURL(url) { revoked.push(url); }
  };
  const dependencies = { documentApi, urlApi, BlobApi: FakeBlob, schedule: callback => callback() };

  assert.equal(triggerResultDownload(snapshot, dependencies), snapshot.filename);
  assert.equal(triggerResultDownload(snapshot, dependencies), snapshot.filename);
  assert.deepEqual(clicks, [snapshot.filename, snapshot.filename]);
  assert.equal(appended.length, 2);
  assert.deepEqual(revoked, ["blob:test", "blob:test"]);
});
