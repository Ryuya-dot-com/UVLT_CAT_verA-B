import { sha256Hex, stableStringify } from "./randomization-design.mjs";

const RELEASE_BINDING_SCHEMA = "uvlt-release-binding-1";
const RELEASE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{7,127}$/;
const APP_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const WORKER_VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTIVATION_IMPORT_QUERY_COUNT = 9;
const ACTIVATION_DIRECT_CHANGE_COUNT = 3;

export const FIELD_WORKER_PROTOCOL_VERSION = "uvlt-fixed-ab-worker-v2";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function releaseBindingSha256({ releaseId, appVersion, workerVersionId }) {
  assert(typeof releaseId === "string" && RELEASE_ID_PATTERN.test(releaseId),
    "Release binding requires a valid release ID");
  assert(typeof appVersion === "string" && APP_VERSION_PATTERN.test(appVersion),
    "Release binding requires a valid app version");
  assert(typeof workerVersionId === "string" &&
    WORKER_VERSION_ID_PATTERN.test(workerVersionId),
  "Release binding requires a canonical Worker version ID");
  return sha256Hex(stableStringify({
    schemaVersion: RELEASE_BINDING_SCHEMA,
    releaseId,
    appVersion,
    workerVersionId
  }));
}

function validateReleaseBinding(payload, releaseIdentity, label) {
  const expected = releaseBindingSha256(releaseIdentity);
  assert(payload.release_binding_sha256 === expected,
    `${label} does not match the exact local release/app/Worker-version binding`);
}

export function validateInactiveReleasePreflight(payload, releaseIdentity) {
  assert(payload && typeof payload === "object" && !Array.isArray(payload),
    "Inactive release preflight did not return a JSON object");
  assert(payload.ok === true && payload.collection_enabled === false,
    "Release must remain closed during the inactive preflight");
  assert(payload.release_integrity_verified === true,
    "Inactive release failed full Worker/version/secret/asset/D1 integrity verification");
  assert(payload.activation_preflight_ready === true,
    "Release and both Study rows are not in the exact inactive pre-activation state");
  assert(payload.protocol_version === FIELD_WORKER_PROTOCOL_VERSION,
    "Inactive release preflight returned an unexpected protocol version");
  validateReleaseBinding(payload, releaseIdentity, "Inactive release preflight");
  return payload;
}

export function validateActivationMutationResult(result) {
  assert(Array.isArray(result) && result.length === 1 && result[0]?.success === true,
    "D1 activation import did not return one successful result");
  assert(Array.isArray(result[0].results) && result[0].results.length === 1,
    "D1 activation import did not return one Wrangler summary row");
  const summary = result[0].results[0];
  assert(summary?.["Total queries executed"] === ACTIVATION_IMPORT_QUERY_COUNT,
    "D1 activation import did not execute the complete reviewed SQL file");
  assert(result[0].meta?.changes === ACTIVATION_DIRECT_CHANGE_COUNT,
    "D1 activation import did not change exactly two Study rows and one release row");
  assert(result[0].meta?.changed_db === true,
    "D1 activation import did not report a database change");
  assert(typeof result[0].finalBookmark === "string" && result[0].finalBookmark.length > 0,
    "D1 activation import did not return a final Time Travel bookmark");
  return result[0];
}

export function validateActivationReadback(result, { workerVersionId }) {
  assert(Array.isArray(result) && result.length === 1 && result[0]?.success === true,
    "D1 activation readback did not return one successful query result");
  assert(Array.isArray(result[0].results) && result[0].results.length === 1,
    "D1 activation readback did not return exactly one release row");
  const row = result[0].results[0];
  assert(row.release_active === 1 && row.worker_version_id === workerVersionId,
    "D1 release is not active on the exact frozen Worker version ID");
  assert(row.total_study_count === 2 && row.ja_active_study_count === 1 &&
    row.vi_active_study_count === 1,
  "D1 activation did not produce exactly one active Japanese and Vietnamese Study row");
  return row;
}

export function validateActiveReleaseReadiness(payload, releaseIdentity) {
  assert(payload && typeof payload === "object" && !Array.isArray(payload),
    "Active release check did not return a JSON object");
  assert(payload.ok === true && payload.release_integrity_verified === true &&
    payload.collection_enabled === true,
  "Controlled domain did not become ready after the reviewed D1 activation");
  assert(payload.activation_preflight_ready === false,
    "Controlled domain still reports an inactive pre-activation state after activation");
  assert(payload.protocol_version === FIELD_WORKER_PROTOCOL_VERSION,
    "Active release check returned an unexpected protocol version");
  validateReleaseBinding(payload, releaseIdentity, "Active release check");
  return payload;
}
