export const RESULT_SCHEMA_VERSION = "uvlt-pages-result-v1";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/g;
const SPREADSHEET_FORMULA_PATTERN = /^[\s]*[=+\-@]/;

function cleanIdentityValue(value) {
  return String(value ?? "")
    .replace(CONTROL_CHARACTER_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIdentity(input) {
  const participantName = cleanIdentityValue(input?.participantName);
  const studentId = cleanIdentityValue(input?.studentId);

  if (!participantName) throw new Error("氏名を入力してください。");
  if (!studentId) throw new Error("学籍番号を入力してください。");
  if (participantName.length > 100) throw new Error("氏名は100文字以内で入力してください。");
  if (studentId.length > 64) throw new Error("学籍番号は64文字以内で入力してください。");

  return Object.freeze({ participantName, studentId });
}

export function createSubmissionCode(cryptoApi = globalThis.crypto) {
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `UAB-${cryptoApi.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  }
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("このブラウザでは安全な提出コードを生成できません。");
  }
  const bytes = new Uint8Array(8);
  cryptoApi.getRandomValues(bytes);
  return `UAB-${[...bytes].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function protectSpreadsheetCell(value) {
  const text = String(value ?? "");
  return SPREADSHEET_FORMULA_PATTERN.test(text) ? `'${text}` : text;
}

export function csvCell(value) {
  const text = protectSpreadsheetCell(value).replaceAll('"', '""');
  return `"${text}"`;
}

const RESULT_COLUMNS = Object.freeze([
  "schema_version",
  "release_id",
  "app_version",
  "submission_code",
  "participant_name",
  "student_id",
  "started_at",
  "completed_at",
  "testlet_ordinal",
  "route_id",
  "form_id",
  "band",
  "module_id",
  "module_position",
  "testlet_position_within_module",
  "testlet_id",
  "item_position",
  "item_id",
  "prompt",
  "selected_option_position",
  "selected_option",
  "testlet_elapsed_ms"
]);

export function buildResultCsv(session) {
  const identity = normalizeIdentity(session?.identity);
  const responses = Array.isArray(session?.responses) ? session.responses : [];
  if (!session?.submissionCode) throw new Error("提出コードがありません。");
  if (!session?.startedAt || !session?.completedAt) throw new Error("完了時刻が確定していません。");
  if (responses.length === 0) throw new Error("保存できる回答がありません。");

  const shared = {
    schema_version: RESULT_SCHEMA_VERSION,
    release_id: session.releaseId || "unversioned",
    app_version: session.appVersion || "unversioned",
    submission_code: session.submissionCode,
    participant_name: identity.participantName,
    student_id: identity.studentId,
    started_at: session.startedAt,
    completed_at: session.completedAt
  };
  const rows = responses.map(response => ({ ...shared, ...response }));
  const lines = [RESULT_COLUMNS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(RESULT_COLUMNS.map(column => csvCell(row[column])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function buildResultFilename(submissionCode) {
  const normalized = String(submissionCode || "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
  if (!normalized) throw new Error("安全なファイル名を作成できません。");
  return `UVLT_AB_result_${normalized}.csv`;
}

export function createResultSnapshot(session) {
  return Object.freeze({
    filename: buildResultFilename(session?.submissionCode),
    csv: buildResultCsv(session)
  });
}

export function triggerResultDownload(snapshot, dependencies = {}) {
  if (!snapshot?.filename || !snapshot?.csv) throw new Error("結果ファイルが準備されていません。");
  const documentApi = dependencies.documentApi || globalThis.document;
  const urlApi = dependencies.urlApi || globalThis.URL;
  const BlobApi = dependencies.BlobApi || globalThis.Blob;
  const schedule = dependencies.schedule || globalThis.setTimeout;
  if (!documentApi || !urlApi || !BlobApi) throw new Error("このブラウザではダウンロードできません。");

  const blob = new BlobApi([snapshot.csv], { type: "text/csv;charset=utf-8" });
  const url = urlApi.createObjectURL(blob);
  const anchor = documentApi.createElement("a");
  anchor.href = url;
  anchor.download = snapshot.filename;
  anchor.hidden = true;
  documentApi.body.append(anchor);
  anchor.click();
  anchor.remove();
  schedule(() => urlApi.revokeObjectURL(url), 0);
  return snapshot.filename;
}
