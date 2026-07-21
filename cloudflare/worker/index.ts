const COOKIE_NAME = "__Host-uvlt_session";
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
const FIELD_COLLECTION_MODE = "field";
export const FIELD_WORKER_PROTOCOL_VERSION = "uvlt-fixed-ab-worker-v2";
const TOTAL_TESTLETS = 100;
const TOTAL_RESPONSES = 300;
const TOTAL_BREAKS = 9;
const ROUTE_COUNT = 10;
const L1_COUNT = 2;
const TARGET_PROTOCOL_COMPLETERS_PER_L1 = 300;
const HARD_CAP_STARTS_PER_L1 = 420;
const RANDOMIZATION_BLOCK_SIZE = 10;
const RANDOMIZATION_BLOCKS_PER_L1 = HARD_CAP_STARTS_PER_L1 / RANDOMIZATION_BLOCK_SIZE;
const OPTION_LAYOUT_COUNT = 6;
const PROTOCOL_COMPLETION_DEFINITION =
  "d1-completed-after-practice-100-testlets-300-responses-8x45s-plus-midpoint90s-breaks-v2";
const PARTIAL_RESPONSE_RETENTION_DEFINITION =
  "consented-nonwithdrawn-server-committed-complete-testlets-v1";
const PRACTICE_DEFINITION = "one-synthetic-interface-only-three-row-six-symbol-practice-v1";
const BREAK_POLICY_DEFINITION = "server-minimum-45s-standard-90s-after-module-5-v1";
const STANDARD_BREAK_SECONDS = 45;
const MIDPOINT_BREAK_AFTER_MODULE = 5;
const MIDPOINT_BREAK_SECONDS = 90;
const ADMINISTRATION_POLICY_SHA256 = "55588091b7c85cf698e076283503c663eaacf77540d3ec9d03abf5b06b229b43";
const ADMINISTRATION_POLICY_JSON = '{"breaks":{"backgroundAndReloadTimeCounts":true,"completionDependent":true,"count":9,"definition":"server-minimum-45s-standard-90s-after-module-5-v1","elapsedFrom":"module-final-testlet-server-received-at","midpointAfterModule":5,"midpointMinimumSeconds":90,"serverClockAuthoritative":true,"standardMinimumSeconds":45},"practice":{"completionEventPersisted":true,"definition":"one-synthetic-interface-only-three-row-six-symbol-practice-v1","enabled":true,"feedback":"generic-validity-only","mainResponseCountsAffected":false,"requiredBeforeFirstMainTestlet":true,"responsesPersisted":false},"preparation":{"definition":"single-readiness-screen-before-interface-practice-v1","responsePersisted":false},"processData":{"breakTiming":"derived-from-module-final-server-receipt-and-break-event-v1","clientTiming":"wall-start-submit-plus-monotonic-testlet-elapsed-v1","focusVisibilityEventsPersisted":false,"qualityFlagsComputedAtRuntime":false,"rawInputEventsPersisted":false,"schemaVersion":"uvlt-fixed-ab-process-data-1","unsubmittedSelectionsPersisted":false},"progress":{"definition":"neutral-module-set-and-server-committed-count-v1","showsEstimatedTime":false,"showsOtherParticipantComparison":false,"showsScore":false,"showsSpeed":false},"safeInterruption":{"availableAt":"required-break-screens-only","definition":"break-boundary-guidance-without-server-event-v1","prolificTimerContinues":true},"schemaVersion":"uvlt-fixed-ab-administration-policy-1","unsavedResponseGuard":{"definition":"beforeunload-only-after-main-selection-until-server-confirmation-v1","transmitsUnsubmittedSelections":false}}';
const RANDOMIZATION_ALGORITHM = "hmac-sha256-permuted-blocks-10-crossed-option-williams-6-v1";
const OPTION_LAYOUT_ALGORITHM = "even-order-williams-square-6-canonical-first-v1";
const RUNTIME_BANK_PROJECTION_SCHEMA = "uvlt-d1-runtime-bank-projection-1";
const RUNTIME_ROUTES_PROJECTION_SCHEMA = "uvlt-d1-runtime-routes-projection-1";
const RELEASE_BINDING_SCHEMA = "uvlt-release-binding-1";
const PROLIFIC_ID_PATTERN = /^[0-9a-f]{24}$/i;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const COMPLETION_CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;
const APP_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;
const WORKER_VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ZERO_SHA256 = "0".repeat(64);
const ZERO_SHA256_FINGERPRINT = `sha256:${ZERO_SHA256}`;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SERVER_ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ISO_DATE_MAX_BYTES = 40;
const PUBLIC_BUILD_MANIFEST_MAX_BYTES = 32 * 1024;

const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'"
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff"
});

type JsonObject = Record<string, unknown>;

const ADMINISTRATION_POLICY = Object.freeze(JSON.parse(ADMINISTRATION_POLICY_JSON)) as Readonly<JsonObject>;

interface ProlificIdentifiers {
  prolificPid: string;
  studyId: string;
  submissionId: string;
}

type VerifiedProlificStatus = "ACTIVE" | "AWAITING_REVIEW" | "APPROVED";
type ProlificCompletionAction = "MANUALLY_REVIEW" | "AUTOMATICALLY_APPROVE";

interface StudyRow {
  study_id: string;
  release_id: string;
  l1: "ja" | "vi";
  study_active: number;
  release_active: number;
  frozen_at: string | null;
  expected_testlets: number;
  expected_items: number;
  expected_breaks: number;
}

interface SessionRow {
  session_id: string;
  release_id: string;
  study_id: string;
  l1: "ja" | "vi";
  participant_link_hmac: string;
  submission_link_hmac: string;
  allocation_index: number;
  randomization_block: number;
  block_position: number;
  route_id: string;
  option_layout_id: number;
  status: "in_progress" | "completed";
  next_testlet_ordinal: number;
  completed_testlets: number;
  response_count: number;
  breaks_completed: number;
  practice_completed_at: string | null;
  completed_at: string | null;
}

interface RuntimeTestletContentRow {
  testlet_id: string;
  module_id: string;
  options_json: string;
  items_json: string;
  content_sha256: string;
}

interface RuntimeProjectionTestletRow extends RuntimeTestletContentRow {
  form_id: "A" | "B";
  band: "1k" | "2k" | "3k" | "4k" | "5k";
}

interface RuntimeTestletRow extends RuntimeTestletContentRow {
  testlet_ordinal: number;
  module_position: number;
  testlet_position_within_module: number;
}

interface RuntimeRouteRow {
  route_id: string;
  testlet_ordinal: number;
  module_position: number;
  testlet_position_within_module: number;
  testlet_id: string;
}

interface ValidatedRuntimeItem {
  itemId: string;
  prompt: string;
  itemPositionWithinTestlet: number;
}

interface ValidatedRuntimeTestlet {
  testletId: string;
  moduleId: string;
  options: string[];
  items: ValidatedRuntimeItem[];
}

interface PublicRuntimeTestlet {
  options: string[];
  items: Array<{ prompt: string }>;
}

interface TestletSubmissionBody {
  testletOrdinal: number;
  selectedOptions: string[];
  clientStartedAt: string;
  clientSubmittedAt: string;
  elapsedMs: number;
  idempotencyKey: string;
}

interface ExistingSubmissionRow {
  testlet_ordinal: number;
  option_layout_id: number;
  idempotency_key: string;
  payload_sha256: string;
}

interface CompletionCountsRow {
  practice_count: number;
  submission_count: number;
  response_count: number;
  break_count: number;
  invalid_route_submission_count: number;
  invalid_option_layout_submission_count: number;
}

interface ReleaseReadinessRow {
  app_version: string;
  administration_policy_json: string;
  administration_policy_sha256: string;
  worker_version_id: string | null;
  public_build_manifest_sha256: string;
  runtime_manifest_sha256: string;
  bank_sha256: string;
  routes_sha256: string;
  runtime_bank_projection_sha256: string;
  runtime_routes_projection_sha256: string;
  allocation_schedule_sha256: string;
  randomization_seed_fingerprint: string | null;
  randomization_algorithm: string | null;
  option_layout_algorithm: string | null;
  participant_hmac_key_fingerprint: string | null;
  prolific_completion_code_fingerprint: string | null;
  prolific_completion_action: ProlificCompletionAction | null;
  target_protocol_completers_per_l1: number;
  hard_cap_starts_per_l1: number;
  stop_new_allocations_at_target: number;
  retain_server_committed_partial_responses: number;
  protocol_completion_definition: string;
  partial_response_retention_definition: string;
  active: number;
  frozen_at: string | null;
  expected_testlets: number;
  expected_items: number;
  expected_breaks: number;
  total_study_count: number;
  total_l1_count: number;
  active_study_count: number;
  active_l1_count: number;
}

interface ExpectedReleaseIdentity {
  releaseId: string;
  appVersion: string;
  publicBuildManifestSha256: string;
  runtimeManifestSha256: string;
  bankSha256: string;
  routesSha256: string;
  runtimeBankProjectionSha256: string;
  runtimeRoutesProjectionSha256: string;
  allocationScheduleSha256: string;
  administrationPolicySha256: string;
  participantHmacKeyFingerprint: string;
  prolificCompletionCodeFingerprint: string;
  prolificCompletionAction: ProlificCompletionAction;
}

interface PublicBuildIdentity {
  appVersion: string;
  rawSha256: string;
}

interface AllocationSlotRow {
  l1: "ja" | "vi";
  allocation_index: number;
  randomization_block: number;
  block_position: number;
  route_id: string;
  option_layout_id: number;
}

// Only successful full verification of immutable runtime content, routes, and
// allocation artifacts is cached. The key contains the complete release/deploy
// identity; values are identity strings only, never rows or participant data.
// Release/study, secret, public-build, and Worker-tag checks still run on every
// request. Active-release triggers make the verified runtime tables immutable.
const VERIFIED_RUNTIME_CACHE_LIMIT = 4;
const verifiedRuntimeKeys = new Set<string>();

class PublicHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage: string;
  readonly retryable: boolean;

  constructor(status: number, code: string, publicMessage: string, retryable = false) {
    super(code);
    this.name = "PublicHttpError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.retryable = retryable;
  }
}

function httpError(status: number, code: string, message: string, retryable = false): never {
  throw new PublicHttpError(status, code, message, retryable);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactKeys(value: JsonObject, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.has(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    httpError(400, "INVALID_REQUEST", "The request was not valid.");
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite JSON number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!isPlainObject(value)) throw new Error("Non-plain JSON value");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(digest);
}

// The ordinary six-condition Williams first row is [0, 1, 5, 2, 4, 3].
// Relabeling the source values by its inverse makes layout 0 canonical while
// retaining exact position and directed-adjacency balance across all six rows.
const OPTION_LAYOUT_SOURCE_LABELS = Object.freeze([0, 1, 3, 5, 4, 2]);
const OPTION_LAYOUT_FIRST_ROW_INDEXES = Object.freeze([0, 1, 5, 2, 4, 3]);
const OPTION_LAYOUT_PERMUTATIONS: readonly (readonly number[])[] = Object.freeze(
  Array.from({ length: OPTION_LAYOUT_COUNT }, (_value, layoutId) => Object.freeze(
    OPTION_LAYOUT_FIRST_ROW_INDEXES.map(
      (sourceIndex) => OPTION_LAYOUT_SOURCE_LABELS[(sourceIndex + layoutId) % OPTION_LAYOUT_COUNT]
    )
  ))
);

export function optionPermutationForLayout(optionLayoutId: number): readonly number[] {
  if (!Number.isInteger(optionLayoutId) || optionLayoutId < 0 || optionLayoutId >= OPTION_LAYOUT_COUNT) {
    throw new Error("Invalid option layout ID");
  }
  return OPTION_LAYOUT_PERMUTATIONS[optionLayoutId];
}

function optionsForLayout(options: readonly string[], optionLayoutId: number): string[] {
  if (options.length !== OPTION_LAYOUT_COUNT) throw new Error("Invalid canonical option count");
  return optionPermutationForLayout(optionLayoutId).map((canonicalIndex) => options[canonicalIndex]);
}

async function sha256BytesHex(value: Uint8Array): Promise<string> {
  const digestInput = new ArrayBuffer(value.byteLength);
  new Uint8Array(digestInput).set(value);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return bytesToHex(digest);
}

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToHex(signature);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function newRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function newSessionId(): string {
  return crypto.randomUUID();
}

function sessionCookie(sessionId: string, rawToken: string): string {
  return `${COOKIE_NAME}=${sessionId}.${rawToken}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function parseSessionCookie(cookieHeader: string | null): { sessionId: string; rawToken: string } | null {
  if (!cookieHeader) return null;
  const matches = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(COOKIE_NAME.length + 1);
  const separator = value.indexOf(".");
  if (separator < 0 || separator !== value.lastIndexOf(".")) return null;
  const sessionId = value.slice(0, separator);
  const rawToken = value.slice(separator + 1);
  if (!SESSION_ID_PATTERN.test(sessionId) || !RAW_TOKEN_PATTERN.test(rawToken)) return null;
  return { sessionId: sessionId.toLowerCase(), rawToken };
}

function applySecurityHeaders(response: Response, noStore = false): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (noStore) headers.set("Cache-Control", "no-store, max-age=0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonResponse(payload: JsonObject, status = 200, setCookie?: string): Response {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8"
  });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return applySecurityHeaders(new Response(JSON.stringify(payload), { status, headers }), true);
}

function errorResponse(error: PublicHttpError): Response {
  return jsonResponse({
    ok: false,
    error: error.publicMessage,
    code: error.code,
    retryable: error.retryable
  }, error.status);
}

function redirectResponse(location: string, setCookie?: string): Response {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    Location: location,
    "Referrer-Policy": "no-referrer"
  });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return applySecurityHeaders(new Response(null, { status: 303, headers }), true);
}

async function readBoundedBytes(stream: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      httpError(413, "REQUEST_TOO_LARGE", "The request was too large.");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<JsonObject> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    httpError(415, "JSON_REQUIRED", "A JSON request body is required.");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)) {
    httpError(413, "REQUEST_TOO_LARGE", "The request was too large.");
  }
  const bytes = await readBoundedBytes(request.body, maximumBytes);
  if (bytes.byteLength === 0) httpError(400, "INVALID_JSON", "The request was not valid JSON.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    httpError(400, "INVALID_JSON", "The request was not valid JSON.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    httpError(400, "INVALID_JSON", "The request was not valid JSON.");
  }
  if (!isPlainObject(parsed)) httpError(400, "INVALID_REQUEST", "The request was not valid.");
  return parsed;
}

async function readBoundedResponseJson(response: Response, maximumBytes: number): Promise<JsonObject> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)) {
    httpError(503, "PROLIFIC_UNAVAILABLE", "Prolific validation is temporarily unavailable.", true);
  }
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBytes(response.body, maximumBytes);
  } catch {
    httpError(503, "PROLIFIC_UNAVAILABLE", "Prolific validation is temporarily unavailable.", true);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    httpError(503, "PROLIFIC_UNAVAILABLE", "Prolific validation is temporarily unavailable.", true);
  }
  if (!isPlainObject(parsed)) {
    httpError(503, "PROLIFIC_UNAVAILABLE", "Prolific validation is temporarily unavailable.", true);
  }
  return parsed;
}

function canonicalProlificId(value: unknown): string {
  if (typeof value !== "string" || !PROLIFIC_ID_PATTERN.test(value)) {
    httpError(400, "INVALID_PROLIFIC_LAUNCH", "The Prolific launch information was not valid.");
  }
  return value.toLowerCase();
}

export function normalizeProlificIdentifiers(value: JsonObject): ProlificIdentifiers {
  assertExactKeys(value, ["PROLIFIC_PID", "STUDY_ID", "SESSION_ID"]);
  return {
    prolificPid: canonicalProlificId(value.PROLIFIC_PID),
    studyId: canonicalProlificId(value.STUDY_ID),
    submissionId: canonicalProlificId(value.SESSION_ID)
  };
}

function prolificIdentifiersFromJoin(url: URL): ProlificIdentifiers {
  const expectedKeys = ["PROLIFIC_PID", "STUDY_ID", "SESSION_ID"];
  const actualKeys = [...url.searchParams.keys()];
  if (actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key) => !expectedKeys.includes(key)) ||
      expectedKeys.some((key) => url.searchParams.getAll(key).length !== 1)) {
    httpError(400, "INVALID_PROLIFIC_LAUNCH", "The Prolific launch information was not valid.");
  }
  return normalizeProlificIdentifiers(Object.fromEntries(expectedKeys.map((key) => [key, url.searchParams.get(key)])));
}

function hasRawProlificQuery(url: URL): boolean {
  const rawKeys = new Set(["prolific_pid", "study_id", "session_id"]);
  return [...url.searchParams.keys()].some((key) => rawKeys.has(key.toLowerCase()));
}

function exactProlificQueryForCanonicalRedirect(url: URL): string | null {
  try {
    const identifiers = prolificIdentifiersFromJoin(url);
    const parameters = new URLSearchParams({
      PROLIFIC_PID: identifiers.prolificPid,
      STUDY_ID: identifiers.studyId,
      SESSION_ID: identifiers.submissionId
    });
    return `/join?${parameters.toString()}`;
  } catch (error) {
    if (error instanceof PublicHttpError) return null;
    throw error;
  }
}

function expectedReleaseIdentity(env: Env): ExpectedReleaseIdentity | null {
  const releaseId: string = env.EXPECTED_RELEASE_ID;
  const appVersion: string = env.EXPECTED_APP_VERSION;
  const publicBuildManifestSha256: string = env.EXPECTED_PUBLIC_BUILD_MANIFEST_SHA256;
  const runtimeManifestSha256: string = env.EXPECTED_RUNTIME_MANIFEST_SHA256;
  const bankSha256: string = env.EXPECTED_BANK_SHA256;
  const routesSha256: string = env.EXPECTED_ROUTES_SHA256;
  const runtimeBankProjectionSha256: string = env.EXPECTED_RUNTIME_BANK_PROJECTION_SHA256;
  const runtimeRoutesProjectionSha256: string = env.EXPECTED_RUNTIME_ROUTES_PROJECTION_SHA256;
  const allocationScheduleSha256: string = env.EXPECTED_ALLOCATION_SCHEDULE_SHA256;
  const administrationPolicySha256: string = env.EXPECTED_ADMINISTRATION_POLICY_SHA256;
  const participantHmacKeyFingerprint: string = env.EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT;
  const prolificCompletionCodeFingerprint: string = env.EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT;
  const prolificCompletionAction: string = env.EXPECTED_PROLIFIC_COMPLETION_ACTION;
  if (!RELEASE_ID_PATTERN.test(releaseId) || releaseId === "UNCONFIGURED" ||
      !APP_VERSION_PATTERN.test(appVersion) || appVersion === "UNCONFIGURED" ||
      !SHA256_PATTERN.test(publicBuildManifestSha256) ||
      !SHA256_PATTERN.test(runtimeManifestSha256) || !SHA256_PATTERN.test(bankSha256) ||
      !SHA256_PATTERN.test(routesSha256) ||
      !SHA256_PATTERN.test(runtimeBankProjectionSha256) ||
      !SHA256_PATTERN.test(runtimeRoutesProjectionSha256) ||
      !SHA256_PATTERN.test(allocationScheduleSha256) ||
      !SHA256_PATTERN.test(administrationPolicySha256) ||
      [publicBuildManifestSha256, runtimeManifestSha256, bankSha256, routesSha256,
        runtimeBankProjectionSha256, runtimeRoutesProjectionSha256,
        allocationScheduleSha256, administrationPolicySha256].some((value) => value === ZERO_SHA256) ||
      administrationPolicySha256 !== ADMINISTRATION_POLICY_SHA256 ||
      !SHA256_FINGERPRINT_PATTERN.test(participantHmacKeyFingerprint) ||
      participantHmacKeyFingerprint === ZERO_SHA256_FINGERPRINT) {
    return null;
  }
  if (!SHA256_FINGERPRINT_PATTERN.test(prolificCompletionCodeFingerprint) ||
      prolificCompletionCodeFingerprint === ZERO_SHA256_FINGERPRINT ||
      !["MANUALLY_REVIEW", "AUTOMATICALLY_APPROVE"].includes(prolificCompletionAction)) {
    return null;
  }
  return {
    releaseId,
    appVersion,
    publicBuildManifestSha256,
    runtimeManifestSha256,
    bankSha256,
    routesSha256,
    runtimeBankProjectionSha256,
    runtimeRoutesProjectionSha256,
    allocationScheduleSha256,
    administrationPolicySha256,
    participantHmacKeyFingerprint,
    prolificCompletionCodeFingerprint,
    prolificCompletionAction: prolificCompletionAction as ProlificCompletionAction
  };
}

function environmentShapeReady(env: Env): boolean {
  const collectionMode: string = env.COLLECTION_MODE;
  return collectionMode === FIELD_COLLECTION_MODE &&
    expectedReleaseIdentity(env) !== null &&
    typeof env.PARTICIPANT_HMAC_KEY === "string" && utf8Length(env.PARTICIPANT_HMAC_KEY) >= 32 && utf8Length(env.PARTICIPANT_HMAC_KEY) <= 1024 &&
    typeof env.PROLIFIC_API_TOKEN === "string" && env.PROLIFIC_API_TOKEN.trim().length >= 16 &&
    typeof env.PROLIFIC_COMPLETION_CODE === "string" && COMPLETION_CODE_PATTERN.test(env.PROLIFIC_COMPLETION_CODE);
}

async function publicBuildIdentity(env: Env): Promise<PublicBuildIdentity | null> {
  try {
    const response = await env.ASSETS.fetch(new Request("https://uvlt-public-assets.invalid/build-manifest.json"));
    if (response.status !== 200) return null;
    const declaredLength = response.headers.get("content-length");
    if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > PUBLIC_BUILD_MANIFEST_MAX_BYTES)) {
      return null;
    }
    const bytes = await readBoundedBytes(response.body, PUBLIC_BUILD_MANIFEST_MAX_BYTES);
    if (bytes.byteLength === 0) return null;
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isPlainObject(parsed)) return null;
    const keys = Object.keys(parsed).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["appVersion", "files", "schemaVersion"])) return null;
    if (parsed.schemaVersion !== "uvlt-field-public-build-2" ||
        typeof parsed.appVersion !== "string" || !APP_VERSION_PATTERN.test(parsed.appVersion) ||
        !Array.isArray(parsed.files)) {
      return null;
    }
    return { appVersion: parsed.appVersion, rawSha256: await sha256BytesHex(bytes) };
  } catch {
    return null;
  }
}

function prolificApiOrigin(env: Env): string {
  let configured: URL;
  try {
    configured = new URL(env.PROLIFIC_API_BASE_URL);
  } catch {
    httpError(503, "COLLECTION_NOT_CONFIGURED", "Data collection is not available.", true);
  }
  if (configured.protocol !== "https:" || configured.hostname !== "api.prolific.com" ||
      configured.username || configured.password || configured.search || configured.hash) {
    httpError(503, "COLLECTION_NOT_CONFIGURED", "Data collection is not available.", true);
  }
  return configured.origin;
}

function assertEnvironmentReady(env: Env): void {
  if (!environmentShapeReady(env)) {
    httpError(503, "COLLECTION_CLOSED", "Data collection is not open.", true);
  }
  prolificApiOrigin(env);
}

async function releaseReadiness(env: Env): Promise<ReleaseReadinessRow | null> {
  return env.DB.prepare(`
    SELECT
      r.app_version,
      r.administration_policy_json,
      r.administration_policy_sha256,
      r.worker_version_id,
      r.public_build_manifest_sha256,
      r.runtime_manifest_sha256,
      r.bank_sha256,
      r.routes_sha256,
      r.runtime_bank_projection_sha256,
      r.runtime_routes_projection_sha256,
      r.allocation_schedule_sha256,
      r.randomization_seed_fingerprint,
      r.randomization_algorithm,
      r.option_layout_algorithm,
      r.participant_hmac_key_fingerprint,
      r.prolific_completion_code_fingerprint,
      r.prolific_completion_action,
      r.target_protocol_completers_per_l1,
      r.hard_cap_starts_per_l1,
      r.stop_new_allocations_at_target,
      r.retain_server_committed_partial_responses,
      r.protocol_completion_definition,
      r.partial_response_retention_definition,
      r.active,
      r.frozen_at,
      r.expected_testlets,
      r.expected_items,
      r.expected_breaks,
      (SELECT COUNT(*) FROM studies s WHERE s.release_id = r.release_id) AS total_study_count,
      (SELECT COUNT(DISTINCT l1) FROM studies s WHERE s.release_id = r.release_id) AS total_l1_count,
      (SELECT COUNT(*) FROM studies s WHERE s.release_id = r.release_id AND s.active = 1) AS active_study_count,
      (SELECT COUNT(DISTINCT l1) FROM studies s WHERE s.release_id = r.release_id AND s.active = 1) AS active_l1_count
    FROM runtime_releases r
    WHERE r.release_id = ?
  `).bind(env.EXPECTED_RELEASE_ID).first<ReleaseReadinessRow>();
}

function releaseIdentityMatches(
  row: ReleaseReadinessRow | null,
  expectedIdentity: ExpectedReleaseIdentity,
  actualHmacKeyFingerprint: string,
  actualCompletionCodeFingerprint: string,
  publicBuild: PublicBuildIdentity | null,
  workerVersionId: string | null,
  workerVersionTag: string | null
): boolean {
  return row !== null && row.frozen_at !== null &&
    row.app_version === expectedIdentity.appVersion &&
    row.administration_policy_json === ADMINISTRATION_POLICY_JSON &&
    row.administration_policy_sha256 === ADMINISTRATION_POLICY_SHA256 &&
    row.administration_policy_sha256 === expectedIdentity.administrationPolicySha256 &&
    WORKER_VERSION_ID_PATTERN.test(row.worker_version_id ?? "") &&
    workerVersionId === row.worker_version_id &&
    row.public_build_manifest_sha256 === expectedIdentity.publicBuildManifestSha256 &&
    row.runtime_manifest_sha256 === expectedIdentity.runtimeManifestSha256 &&
    row.bank_sha256 === expectedIdentity.bankSha256 &&
    row.routes_sha256 === expectedIdentity.routesSha256 &&
    row.runtime_bank_projection_sha256 === expectedIdentity.runtimeBankProjectionSha256 &&
    row.runtime_routes_projection_sha256 === expectedIdentity.runtimeRoutesProjectionSha256 &&
    row.allocation_schedule_sha256 === expectedIdentity.allocationScheduleSha256 &&
    SHA256_FINGERPRINT_PATTERN.test(row.randomization_seed_fingerprint ?? "") &&
    row.randomization_seed_fingerprint !== ZERO_SHA256_FINGERPRINT &&
    row.randomization_algorithm === RANDOMIZATION_ALGORITHM &&
    row.option_layout_algorithm === OPTION_LAYOUT_ALGORITHM &&
    row.participant_hmac_key_fingerprint === expectedIdentity.participantHmacKeyFingerprint &&
    row.prolific_completion_code_fingerprint === expectedIdentity.prolificCompletionCodeFingerprint &&
    row.prolific_completion_action === expectedIdentity.prolificCompletionAction &&
    row.target_protocol_completers_per_l1 === TARGET_PROTOCOL_COMPLETERS_PER_L1 &&
    row.hard_cap_starts_per_l1 === HARD_CAP_STARTS_PER_L1 &&
    row.stop_new_allocations_at_target === 1 &&
    row.retain_server_committed_partial_responses === 1 &&
    row.protocol_completion_definition === PROTOCOL_COMPLETION_DEFINITION &&
    row.partial_response_retention_definition === PARTIAL_RESPONSE_RETENTION_DEFINITION &&
    actualHmacKeyFingerprint === expectedIdentity.participantHmacKeyFingerprint &&
    actualCompletionCodeFingerprint === expectedIdentity.prolificCompletionCodeFingerprint &&
    publicBuild !== null && publicBuild.appVersion === expectedIdentity.appVersion &&
    publicBuild.rawSha256 === expectedIdentity.publicBuildManifestSha256 &&
    workerVersionTag === expectedIdentity.releaseId &&
    row.expected_testlets === TOTAL_TESTLETS && row.expected_items === TOTAL_RESPONSES && row.expected_breaks === TOTAL_BREAKS &&
    row.total_study_count === L1_COUNT && row.total_l1_count === L1_COUNT;
}

function readinessIsComplete(
  row: ReleaseReadinessRow | null,
  expectedIdentity: ExpectedReleaseIdentity,
  actualHmacKeyFingerprint: string,
  actualCompletionCodeFingerprint: string,
  publicBuild: PublicBuildIdentity | null,
  workerVersionId: string | null,
  workerVersionTag: string | null
): boolean {
  return releaseIdentityMatches(
    row,
    expectedIdentity,
    actualHmacKeyFingerprint,
    actualCompletionCodeFingerprint,
    publicBuild,
    workerVersionId,
    workerVersionTag
  ) && row !== null && row.active === 1 &&
    row.active_study_count === L1_COUNT && row.active_l1_count === L1_COUNT;
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function exactCountMap(counts: Map<string, number>, cells: number, repetitions: number): boolean {
  return counts.size === cells && [...counts.values()].every((count) => count === repetitions);
}

async function runtimeContentAndRoutesMatch(
  env: Env,
  expectedIdentity: ExpectedReleaseIdentity
): Promise<boolean> {
  const releaseId = expectedIdentity.releaseId;
  const [testletResult, routeResult] = await Promise.all([
    env.DB.prepare(`
      SELECT testlet_id, module_id, form_id, band, options_json, items_json, content_sha256
      FROM runtime_testlets
      WHERE release_id = ?
      ORDER BY testlet_id
    `).bind(releaseId).all<RuntimeProjectionTestletRow>(),
    env.DB.prepare(`
      SELECT route_id, testlet_ordinal, module_position, testlet_position_within_module, testlet_id
      FROM runtime_route_testlets
      WHERE release_id = ?
      ORDER BY route_id, testlet_ordinal
    `).bind(releaseId).all<RuntimeRouteRow>()
  ]);
  if (testletResult.results.length !== TOTAL_TESTLETS ||
      routeResult.results.length !== TOTAL_TESTLETS * ROUTE_COUNT) {
    return false;
  }

  let testlets: ValidatedRuntimeTestlet[];
  try {
    testlets = await Promise.all(testletResult.results.map(validatedCanonicalTestletFromRow));
  } catch {
    return false;
  }
  const moduleByTestlet = new Map<string, string>();
  const testletsByModule = new Map<string, Set<string>>();
  for (const testlet of testlets) {
    if (moduleByTestlet.has(testlet.testletId)) return false;
    moduleByTestlet.set(testlet.testletId, testlet.moduleId);
    const members = testletsByModule.get(testlet.moduleId) ?? new Set<string>();
    members.add(testlet.testletId);
    testletsByModule.set(testlet.moduleId, members);
  }
  if (testletsByModule.size !== ROUTE_COUNT ||
      [...testletsByModule.values()].some((members) => members.size !== TOTAL_TESTLETS / ROUTE_COUNT)) {
    return false;
  }

  const allTestletIds = new Set(moduleByTestlet.keys());
  const allModuleIds = new Set(testletsByModule.keys());
  const modulePositions = new Map<string, number>();
  const moduleCarryovers = new Map<string, number>();
  const withinModulePositions = new Map<string, number>();
  const withinModuleCarryovers = new Map<string, number>();

  for (let routeIndex = 0; routeIndex < ROUTE_COUNT; routeIndex += 1) {
    const routeId = `R${String(routeIndex + 1).padStart(2, "0")}`;
    const routeRows = routeResult.results.slice(routeIndex * TOTAL_TESTLETS, (routeIndex + 1) * TOTAL_TESTLETS);
    const routeTestletIds = new Set<string>();
    const moduleOrder: string[] = [];
    for (let ordinal = 0; ordinal < TOTAL_TESTLETS; ordinal += 1) {
      const routeRow = routeRows[ordinal];
      const modulePosition = Math.floor(ordinal / (TOTAL_TESTLETS / ROUTE_COUNT)) + 1;
      const withinModulePosition = ordinal % (TOTAL_TESTLETS / ROUTE_COUNT) + 1;
      const moduleId = moduleByTestlet.get(routeRow.testlet_id);
      if (routeRow.route_id !== routeId || routeRow.testlet_ordinal !== ordinal ||
          routeRow.module_position !== modulePosition ||
          routeRow.testlet_position_within_module !== withinModulePosition ||
          moduleId === undefined || routeTestletIds.has(routeRow.testlet_id)) {
        return false;
      }
      routeTestletIds.add(routeRow.testlet_id);
      incrementCount(withinModulePositions, `${routeRow.testlet_id}|${withinModulePosition}`);
      if (withinModulePosition === 1) {
        moduleOrder.push(moduleId);
        incrementCount(modulePositions, `${moduleId}|${modulePosition}`);
      } else {
        const previous = routeRows[ordinal - 1];
        const previousModuleId = moduleByTestlet.get(previous.testlet_id);
        if (previousModuleId !== moduleId) return false;
        incrementCount(withinModuleCarryovers, `${previous.testlet_id}|${routeRow.testlet_id}`);
      }
    }
    if (routeTestletIds.size !== TOTAL_TESTLETS ||
        [...allTestletIds].some((testletId) => !routeTestletIds.has(testletId)) ||
        new Set(moduleOrder).size !== ROUTE_COUNT ||
        [...allModuleIds].some((moduleId) => !moduleOrder.includes(moduleId))) {
      return false;
    }
    for (let modulePosition = 0; modulePosition + 1 < moduleOrder.length; modulePosition += 1) {
      incrementCount(moduleCarryovers, `${moduleOrder[modulePosition]}|${moduleOrder[modulePosition + 1]}`);
    }
  }

  const structureMatches = exactCountMap(modulePositions, ROUTE_COUNT * ROUTE_COUNT, 1) &&
    exactCountMap(moduleCarryovers, ROUTE_COUNT * (ROUTE_COUNT - 1), 1) &&
    exactCountMap(withinModulePositions, TOTAL_TESTLETS * (TOTAL_TESTLETS / ROUTE_COUNT), 1) &&
    exactCountMap(
      withinModuleCarryovers,
      ROUTE_COUNT * (TOTAL_TESTLETS / ROUTE_COUNT) * (TOTAL_TESTLETS / ROUTE_COUNT - 1),
      1
    );
  if (!structureMatches) return false;

  const runtimeBankProjection = {
    schemaVersion: RUNTIME_BANK_PROJECTION_SCHEMA,
    releaseId,
    testlets: testlets.map((testlet, index) => ({
      testletId: testlet.testletId,
      moduleId: testlet.moduleId,
      formId: testletResult.results[index].form_id,
      band: testletResult.results[index].band,
      options: [...testlet.options],
      items: testlet.items.map((item) => ({
        itemId: item.itemId,
        prompt: item.prompt,
        itemPositionWithinTestlet: item.itemPositionWithinTestlet
      })),
      contentSha256: testletResult.results[index].content_sha256
    }))
  };
  const runtimeRoutesProjection = {
    schemaVersion: RUNTIME_ROUTES_PROJECTION_SCHEMA,
    releaseId,
    rows: routeResult.results.map((row) => ({
      routeId: row.route_id,
      testletOrdinal: row.testlet_ordinal,
      modulePosition: row.module_position,
      testletPositionWithinModule: row.testlet_position_within_module,
      testletId: row.testlet_id
    }))
  };
  const [bankProjectionHash, routesProjectionHash] = await Promise.all([
    sha256Hex(stableJson(runtimeBankProjection)),
    sha256Hex(stableJson(runtimeRoutesProjection))
  ]);
  return bankProjectionHash === expectedIdentity.runtimeBankProjectionSha256 &&
    routesProjectionHash === expectedIdentity.runtimeRoutesProjectionSha256;
}

async function allocationScheduleRowsMatch(
  env: Env,
  row: ReleaseReadinessRow,
  expectedIdentity: ExpectedReleaseIdentity
): Promise<boolean> {
  const result = await env.DB.prepare(`
    SELECT
      l1, allocation_index, randomization_block, block_position, route_id, option_layout_id
    FROM runtime_allocation_slots
    WHERE release_id = ?
    ORDER BY CASE l1 WHEN 'ja' THEN 0 WHEN 'vi' THEN 1 ELSE 2 END, allocation_index
  `).bind(expectedIdentity.releaseId).all<AllocationSlotRow>();
  if (result.results.length !== L1_COUNT * HARD_CAP_STARTS_PER_L1 ||
      !SHA256_FINGERPRINT_PATTERN.test(row.randomization_seed_fingerprint ?? "")) {
    return false;
  }

  const slots: JsonObject[] = [];
  const blockRoutes = new Map<string, number>();
  const blockLayouts = new Map<string, number>();
  const routesByL1 = new Map<string, number>();
  const layoutsByL1 = new Map<string, number>();
  const routeLayoutsByL1 = new Map<string, number>();
  const macroRouteLayouts = new Map<string, number>();
  for (let index = 0; index < result.results.length; index += 1) {
    const slot = result.results[index];
    const expectedL1: "ja" | "vi" = index < HARD_CAP_STARTS_PER_L1 ? "ja" : "vi";
    const localIndex = index % HARD_CAP_STARTS_PER_L1;
    const expectedBlock = Math.floor(localIndex / RANDOMIZATION_BLOCK_SIZE);
    const expectedPosition = localIndex % RANDOMIZATION_BLOCK_SIZE;
    if (slot.l1 !== expectedL1 || slot.allocation_index !== localIndex ||
        slot.randomization_block !== expectedBlock || slot.block_position !== expectedPosition + 1 ||
        !/^R(?:0[1-9]|10)$/.test(slot.route_id) || !Number.isInteger(slot.option_layout_id) ||
        slot.option_layout_id < 0 || slot.option_layout_id >= OPTION_LAYOUT_COUNT) {
      return false;
    }
    const macroreplicate = Math.floor(slot.randomization_block / OPTION_LAYOUT_COUNT);
    incrementCount(blockRoutes, `${slot.l1}|${slot.randomization_block}|${slot.route_id}`);
    incrementCount(blockLayouts, `${slot.l1}|${slot.randomization_block}|${slot.option_layout_id}`);
    incrementCount(routesByL1, `${slot.l1}|${slot.route_id}`);
    incrementCount(layoutsByL1, `${slot.l1}|${slot.option_layout_id}`);
    incrementCount(routeLayoutsByL1, `${slot.l1}|${slot.route_id}|${slot.option_layout_id}`);
    incrementCount(macroRouteLayouts, `${slot.l1}|${macroreplicate}|${slot.route_id}|${slot.option_layout_id}`);
    slots.push({
      l1: slot.l1,
      slotIndex: slot.allocation_index,
      blockIndex: slot.randomization_block,
      positionWithinBlock: slot.block_position - 1,
      macroreplicateIndex: Math.floor(slot.randomization_block / OPTION_LAYOUT_COUNT),
      blockWithinMacroreplicate: slot.randomization_block % OPTION_LAYOUT_COUNT,
      routeId: slot.route_id,
      optionLayoutIndex: slot.option_layout_id
    });
  }
  if (!exactCountMap(blockRoutes, L1_COUNT * RANDOMIZATION_BLOCKS_PER_L1 * ROUTE_COUNT, 1) ||
      blockLayouts.size !== L1_COUNT * RANDOMIZATION_BLOCKS_PER_L1 * OPTION_LAYOUT_COUNT ||
      [...blockLayouts.values()].some((count) => count !== 1 && count !== 2) ||
      !exactCountMap(routesByL1, L1_COUNT * ROUTE_COUNT, RANDOMIZATION_BLOCKS_PER_L1) ||
      !exactCountMap(layoutsByL1, L1_COUNT * OPTION_LAYOUT_COUNT, HARD_CAP_STARTS_PER_L1 / OPTION_LAYOUT_COUNT) ||
      !exactCountMap(routeLayoutsByL1, L1_COUNT * ROUTE_COUNT * OPTION_LAYOUT_COUNT, 7) ||
      !exactCountMap(macroRouteLayouts, L1_COUNT * 7 * ROUTE_COUNT * OPTION_LAYOUT_COUNT, 1)) {
    return false;
  }

  const reconstructedSchedule = {
    schemaVersion: "uvlt-fixed-ab-randomization-schedule-2",
    releaseId: expectedIdentity.releaseId,
    algorithm: RANDOMIZATION_ALGORITHM,
    optionLayoutAlgorithm: OPTION_LAYOUT_ALGORITHM,
    seedFingerprint: row.randomization_seed_fingerprint,
    routesPayloadSha256: row.routes_sha256,
    recruitmentPolicy: {
      targetProtocolCompletersPerL1: TARGET_PROTOCOL_COMPLETERS_PER_L1,
      hardCapStartsPerL1: HARD_CAP_STARTS_PER_L1,
      stopNewAllocationsAtTarget: true,
      retainServerCommittedPartialResponses: true,
      protocolCompletionDefinition: PROTOCOL_COMPLETION_DEFINITION,
      partialResponseRetentionDefinition: PARTIAL_RESPONSE_RETENTION_DEFINITION
    },
    blockSize: RANDOMIZATION_BLOCK_SIZE,
    blocksPerL1: RANDOMIZATION_BLOCKS_PER_L1,
    macroreplicatesPerL1: RANDOMIZATION_BLOCKS_PER_L1 / OPTION_LAYOUT_COUNT,
    blocksPerMacroreplicate: OPTION_LAYOUT_COUNT,
    optionLayouts: OPTION_LAYOUT_PERMUTATIONS.map((optionOrder, optionLayoutIndex) => ({
      optionLayoutIndex,
      optionOrder: [...optionOrder]
    })),
    slots,
    // The artifact payload contract deletes only integrity.payloadSha256 and
    // retains the now-empty integrity object before stable serialization.
    integrity: {}
  };
  const reconstructedHash = await sha256Hex(stableJson(reconstructedSchedule));
  if (reconstructedHash !== row.allocation_schedule_sha256 ||
      reconstructedHash !== expectedIdentity.allocationScheduleSha256) {
    return false;
  }
  return true;
}

function runtimeVerificationKey(
  env: Env,
  row: ReleaseReadinessRow,
  expectedIdentity: ExpectedReleaseIdentity
): string {
  return stableJson({
    schemaVersion: "uvlt-verified-runtime-cache-key-1",
    workerVersionId: env.CF_VERSION_METADATA?.id ?? "",
    releaseId: expectedIdentity.releaseId,
    appVersion: expectedIdentity.appVersion,
    publicBuildManifestSha256: expectedIdentity.publicBuildManifestSha256,
    runtimeManifestSha256: expectedIdentity.runtimeManifestSha256,
    bankSha256: expectedIdentity.bankSha256,
    routesSha256: expectedIdentity.routesSha256,
    runtimeBankProjectionSha256: expectedIdentity.runtimeBankProjectionSha256,
    runtimeRoutesProjectionSha256: expectedIdentity.runtimeRoutesProjectionSha256,
    allocationScheduleSha256: expectedIdentity.allocationScheduleSha256,
    administrationPolicySha256: expectedIdentity.administrationPolicySha256,
    administrationPolicyJson: row.administration_policy_json,
    randomizationSeedFingerprint: row.randomization_seed_fingerprint,
    participantHmacKeyFingerprint: expectedIdentity.participantHmacKeyFingerprint,
    prolificCompletionCodeFingerprint: expectedIdentity.prolificCompletionCodeFingerprint,
    randomizationAlgorithm: row.randomization_algorithm,
    optionLayoutAlgorithm: row.option_layout_algorithm,
    prolificCompletionAction: expectedIdentity.prolificCompletionAction,
    targetProtocolCompletersPerL1: row.target_protocol_completers_per_l1,
    hardCapStartsPerL1: row.hard_cap_starts_per_l1,
    stopNewAllocationsAtTarget: row.stop_new_allocations_at_target,
    retainServerCommittedPartialResponses: row.retain_server_committed_partial_responses,
    protocolCompletionDefinition: row.protocol_completion_definition,
    partialResponseRetentionDefinition: row.partial_response_retention_definition
  });
}

function rememberVerifiedRuntime(cacheKey: string): void {
  if (verifiedRuntimeKeys.size >= VERIFIED_RUNTIME_CACHE_LIMIT) {
    const oldest = verifiedRuntimeKeys.values().next().value;
    if (typeof oldest === "string") verifiedRuntimeKeys.delete(oldest);
  }
  verifiedRuntimeKeys.add(cacheKey);
}

async function immutableRuntimeMatches(
  env: Env,
  row: ReleaseReadinessRow,
  expectedIdentity: ExpectedReleaseIdentity
): Promise<boolean> {
  const cacheKey = runtimeVerificationKey(env, row, expectedIdentity);
  if (row.active === 1 && verifiedRuntimeKeys.has(cacheKey)) return true;
  const [contentAndRoutesMatch, allocationMatches] = await Promise.all([
    runtimeContentAndRoutesMatch(env, expectedIdentity),
    allocationScheduleRowsMatch(env, row, expectedIdentity)
  ]);
  if (!contentAndRoutesMatch || !allocationMatches) return false;
  if (row.active === 1) rememberVerifiedRuntime(cacheKey);
  return true;
}

async function assertReleaseReady(env: Env): Promise<void> {
  assertEnvironmentReady(env);
  const expectedIdentity = expectedReleaseIdentity(env);
  if (expectedIdentity === null) {
    httpError(503, "COLLECTION_CLOSED", "Data collection is not open.", true);
  }
  const [row, actualHmacKeyHash, actualCompletionCodeHash, publicBuild] = await Promise.all([
    releaseReadiness(env),
    sha256Hex(env.PARTICIPANT_HMAC_KEY),
    sha256Hex(env.PROLIFIC_COMPLETION_CODE),
    publicBuildIdentity(env)
  ]);
  if (!readinessIsComplete(
    row,
    expectedIdentity,
    `sha256:${actualHmacKeyHash}`,
    `sha256:${actualCompletionCodeHash}`,
    publicBuild,
    env.CF_VERSION_METADATA?.id ?? null,
    env.CF_VERSION_METADATA?.tag ?? null
  ) || row === null || !(await immutableRuntimeMatches(env, row, expectedIdentity))) {
    httpError(503, "RELEASE_NOT_READY", "Data collection is not available.", true);
  }
}

function requireSameOrigin(request: Request): void {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if ((origin !== null && origin !== requestUrl.origin) || fetchSite === "cross-site") {
    httpError(403, "SAME_ORIGIN_REQUIRED", "The request origin was not accepted.");
  }
}

async function getStudy(env: Env, studyId: string): Promise<StudyRow> {
  const row = await env.DB.prepare(`
    SELECT
      s.study_id,
      s.release_id,
      s.l1,
      s.active AS study_active,
      r.active AS release_active,
      r.frozen_at,
      r.expected_testlets,
      r.expected_items,
      r.expected_breaks
    FROM studies s
    JOIN runtime_releases r ON r.release_id = s.release_id
    WHERE s.study_id = ? AND s.release_id = ?
  `).bind(studyId, env.EXPECTED_RELEASE_ID).first<StudyRow>();
  if (!row || row.study_active !== 1 || row.release_active !== 1 || row.frozen_at === null ||
      row.expected_testlets !== TOTAL_TESTLETS || row.expected_items !== TOTAL_RESPONSES || row.expected_breaks !== TOTAL_BREAKS) {
    httpError(403, "STUDY_NOT_OPEN", "This Prolific study is not open.");
  }
  return row;
}

function nestedApiId(value: unknown): string | null {
  if (typeof value === "string") return value.toLowerCase();
  if (isPlainObject(value) && typeof value.id === "string") return value.id.toLowerCase();
  return null;
}

async function validateProlificStudyConfiguration(env: Env, studyId: string): Promise<void> {
  const endpoint = new URL(`/api/v1/studies/${encodeURIComponent(studyId)}/`, prolificApiOrigin(env));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${env.PROLIFIC_API_TOKEN}`
      },
      redirect: "error",
      signal: controller.signal
    });
  } catch {
    httpError(503, "PROLIFIC_UNAVAILABLE", "Prolific validation is temporarily unavailable.", true);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    httpError(503, "PROLIFIC_UNAVAILABLE", "Prolific validation is temporarily unavailable.", true);
  }
  const study = await readBoundedResponseJson(response, 64 * 1024);
  const completedCodes = Array.isArray(study.completion_codes)
    ? study.completion_codes.filter((entry) => isPlainObject(entry) && entry.code_type === "COMPLETED")
    : [];
  const completedCode = completedCodes[0];
  const actions = isPlainObject(completedCode) && Array.isArray(completedCode.actions)
    ? completedCode.actions
    : [];
  const action = actions[0];
  if (nestedApiId(study.id) !== studyId || study.prolific_id_option !== "url_parameters" ||
      study.total_available_places !== TARGET_PROTOCOL_COMPLETERS_PER_L1 ||
      study.is_ready_to_publish !== true || completedCodes.length !== 1 ||
      !isPlainObject(completedCode) || completedCode.code !== env.PROLIFIC_COMPLETION_CODE ||
      actions.length !== 1 || !isPlainObject(action) || Object.keys(action).length !== 1 ||
      action.action !== env.EXPECTED_PROLIFIC_COMPLETION_ACTION) {
    httpError(503, "PROLIFIC_STUDY_NOT_READY", "The Prolific study configuration is not ready.", true);
  }
}

async function validateProlificSubmission(
  env: Env,
  identifiers: ProlificIdentifiers
): Promise<VerifiedProlificStatus> {
  const endpoint = new URL(`/api/v1/submissions/${encodeURIComponent(identifiers.submissionId)}/`, prolificApiOrigin(env));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${env.PROLIFIC_API_TOKEN}`
      },
      redirect: "error",
      signal: controller.signal
    });
  } catch {
    httpError(503, "PROLIFIC_UNAVAILABLE", "Prolific validation is temporarily unavailable.", true);
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 404) {
    httpError(403, "PROLIFIC_NOT_VERIFIED", "The Prolific submission could not be verified.");
  }
  if (!response.ok) {
    httpError(503, "PROLIFIC_UNAVAILABLE", "Prolific validation is temporarily unavailable.", true);
  }
  const submission = await readBoundedResponseJson(response, 64 * 1024);
  const returnedSubmission = nestedApiId(submission.id);
  const returnedParticipant = nestedApiId(submission.participant_id ?? submission.participant);
  const returnedStudy = nestedApiId(submission.study_id ?? submission.study);
  if (returnedSubmission !== identifiers.submissionId || returnedParticipant !== identifiers.prolificPid || returnedStudy !== identifiers.studyId) {
    httpError(403, "PROLIFIC_NOT_VERIFIED", "The Prolific submission could not be verified.");
  }
  const status = typeof submission.status === "string" ? submission.status.trim().toUpperCase().replace(/[- ]/g, "_") : "";
  if (!["ACTIVE", "AWAITING_REVIEW", "APPROVED"].includes(status)) {
    httpError(403, "PROLIFIC_NOT_ACTIVE", "The Prolific submission is not active.");
  }
  return status as VerifiedProlificStatus;
}

async function linkageHmacs(env: Env, identifiers: ProlificIdentifiers): Promise<{ participant: string; submission: string }> {
  return {
    participant: await hmacSha256Hex(
      env.PARTICIPANT_HMAC_KEY,
      `uvlt-fixed-ab:v1:participant:${identifiers.studyId}:${identifiers.prolificPid}`
    ),
    submission: await hmacSha256Hex(
      env.PARTICIPANT_HMAC_KEY,
      `uvlt-fixed-ab:v1:submission:${identifiers.submissionId}`
    )
  };
}

async function existingLinkedSession(
  env: Env,
  studyId: string,
  participantHmac: string,
  submissionHmac: string
): Promise<SessionRow | null> {
  const found = await env.DB.prepare(`
    SELECT
      session_id, release_id, study_id, l1, participant_link_hmac, submission_link_hmac,
      allocation_index, randomization_block, block_position, route_id, option_layout_id,
      status, next_testlet_ordinal, completed_testlets,
      response_count, breaks_completed, practice_completed_at, completed_at
    FROM sessions
    WHERE submission_link_hmac = ? OR (study_id = ? AND participant_link_hmac = ?)
    LIMIT 3
  `).bind(submissionHmac, studyId, participantHmac).all<SessionRow>();
  const rows = found.results;
  if (rows.length === 0) return null;
  if (rows.length !== 1 || rows[0].study_id !== studyId ||
      rows[0].participant_link_hmac !== participantHmac || rows[0].submission_link_hmac !== submissionHmac) {
    httpError(409, "PROLIFIC_LINK_CONFLICT", "The Prolific launch conflicts with an existing study session.");
  }
  return rows[0];
}

function sessionRecoveryRequired(): never {
  httpError(
    401,
    "SESSION_RECOVERY_REQUIRED",
    "This existing study session cannot be resumed automatically. Please contact the study team."
  );
}

async function rotateSessionToken(
  request: Request,
  env: Env,
  session: SessionRow
): Promise<{ session: SessionRow; rawToken: string }> {
  const cookie = parseSessionCookie(request.headers.get("cookie"));
  if (!cookie || cookie.sessionId !== session.session_id) sessionRecoveryRequired();
  const previousTokenHash = await sha256Hex(cookie.rawToken);
  const rawToken = newRawToken();
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date().toISOString();
  const tokenExpiresAt = new Date(Date.now() + COOKIE_MAX_AGE_SECONDS * 1000).toISOString();
  const result = await env.DB.prepare(`
    UPDATE sessions SET token_sha256 = ?, token_expires_at = ?, updated_at = ?
    WHERE session_id = ? AND release_id = ? AND token_sha256 = ? AND token_expires_at > ?
  `).bind(
    tokenHash,
    tokenExpiresAt,
    now,
    session.session_id,
    env.EXPECTED_RELEASE_ID,
    previousTokenHash,
    now
  ).run();
  if (result.meta.changes !== 1) sessionRecoveryRequired();
  return { session, rawToken };
}

const ALLOCATE_SESSION_SQL = `
  WITH next_allocation AS (
    SELECT COALESCE(MAX(allocation_index) + 1, 0) AS allocation_index
    FROM allocation_start_ledger
    WHERE release_id = ? AND l1 = ?
  ), completion_count AS (
    SELECT COUNT(*) AS protocol_completers
    FROM protocol_completion_ledger
    WHERE release_id = ? AND l1 = ?
  ), assigned_slot AS (
    SELECT
      slot.allocation_index,
      slot.randomization_block,
      slot.block_position,
      slot.route_id,
      slot.option_layout_id,
      completion.protocol_completers
    FROM next_allocation next
    CROSS JOIN completion_count completion
    JOIN runtime_allocation_slots slot
      ON slot.release_id = ? AND slot.l1 = ? AND slot.allocation_index = next.allocation_index
  )
  INSERT INTO sessions (
    session_id, release_id, study_id, l1, participant_link_hmac, submission_link_hmac,
    allocation_index, randomization_block, block_position, route_id, option_layout_id,
    token_sha256, token_expires_at, status, next_testlet_ordinal,
    completed_testlets, response_count, breaks_completed, practice_completed_at, created_at, updated_at
  )
  SELECT
    ?, ?, ?, ?, ?, ?, allocation_index, randomization_block, block_position, route_id, option_layout_id,
    ?, ?, 'in_progress', 0, 0, 0, 0, NULL, ?, ?
  FROM assigned_slot
  WHERE allocation_index BETWEEN 0 AND ${HARD_CAP_STARTS_PER_L1 - 1}
    AND protocol_completers < ${TARGET_PROTOCOL_COMPLETERS_PER_L1}
  RETURNING
    session_id, release_id, study_id, l1, participant_link_hmac, submission_link_hmac,
    allocation_index, randomization_block, block_position, route_id, option_layout_id,
    status, next_testlet_ordinal, completed_testlets,
    response_count, breaks_completed, practice_completed_at, completed_at
`;

async function createOrResumeSession(
  request: Request,
  env: Env,
  identifiers: ProlificIdentifiers
): Promise<{ session: SessionRow; rawToken: string; resumed: boolean }> {
  await assertReleaseReady(env);
  const study = await getStudy(env, identifiers.studyId);
  await validateProlificStudyConfiguration(env, identifiers.studyId);
  const prolificStatus = await validateProlificSubmission(env, identifiers);
  const links = await linkageHmacs(env, identifiers);
  const existing = await existingLinkedSession(env, study.study_id, links.participant, links.submission);
  if (existing) {
    const rotated = await rotateSessionToken(request, env, existing);
    return { ...rotated, resumed: true };
  }
  if (prolificStatus !== "ACTIVE") {
    httpError(403, "PROLIFIC_NOT_ACTIVE", "The Prolific submission is not active.");
  }

  const startPayloadHash = await sha256Hex("uvlt-fixed-ab:v1:session_started");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const concurrentExisting = await existingLinkedSession(env, study.study_id, links.participant, links.submission);
    if (concurrentExisting) {
      const rotated = await rotateSessionToken(request, env, concurrentExisting);
      return { ...rotated, resumed: true };
    }
    const sessionId = newSessionId();
    const rawToken = newRawToken();
    const tokenHash = await sha256Hex(rawToken);
    const now = new Date().toISOString();
    const tokenExpiresAt = new Date(Date.now() + COOKIE_MAX_AGE_SECONDS * 1000).toISOString();
    try {
      const results = await env.DB.batch([
        env.DB.prepare(ALLOCATE_SESSION_SQL).bind(
          study.release_id, study.l1,
          study.release_id, study.l1,
          study.release_id, study.l1,
          sessionId, study.release_id, study.study_id, study.l1, links.participant, links.submission,
          tokenHash, tokenExpiresAt, now, now
        ),
        env.DB.prepare(`
          INSERT INTO session_events (event_id, session_id, event_type, event_ordinal, payload_sha256, occurred_at)
          SELECT ?, session_id, 'session_started', 0, ?, ? FROM sessions WHERE session_id = ?
        `).bind(crypto.randomUUID(), startPayloadHash, now, sessionId)
      ]);
      const allocated = results[0].results[0] as SessionRow | undefined;
      if (!allocated) {
        const recruitment = await env.DB.prepare(`
          SELECT
            (SELECT COUNT(*) FROM allocation_start_ledger WHERE release_id = ? AND l1 = ?) AS starts,
            (SELECT COUNT(*) FROM protocol_completion_ledger WHERE release_id = ? AND l1 = ?) AS protocol_completers
        `).bind(study.release_id, study.l1, study.release_id, study.l1)
          .first<{ starts: number; protocol_completers: number }>();
        if ((recruitment?.protocol_completers ?? 0) >= TARGET_PROTOCOL_COMPLETERS_PER_L1) {
          httpError(409, "PROTOCOL_COMPLETION_TARGET_REACHED", "This study stratum has reached its protocol-completer target.");
        }
        httpError(409, "STUDY_CAPACITY_REACHED", "This study stratum has reached its start hard cap.");
      }
      return { session: allocated, rawToken, resumed: false };
    } catch (error) {
      if (error instanceof PublicHttpError) throw error;
      const raced = await existingLinkedSession(env, study.study_id, links.participant, links.submission);
      if (raced) {
        const rotated = await rotateSessionToken(request, env, raced);
        return { ...rotated, resumed: true };
      }
      if (attempt === 7) {
        httpError(503, "ALLOCATION_BUSY", "The study session could not be allocated. Please try again.", true);
      }
    }
  }
  throw new Error("Unreachable allocation state");
}

async function authenticateSession(request: Request, env: Env): Promise<SessionRow> {
  await assertReleaseReady(env);
  const cookie = parseSessionCookie(request.headers.get("cookie"));
  if (!cookie) httpError(401, "SESSION_REQUIRED", "A valid Prolific study session is required.");
  const tokenHash = await sha256Hex(cookie.rawToken);
  const now = new Date().toISOString();
  const session = await env.DB.prepare(`
    SELECT
      session_id, release_id, study_id, l1, participant_link_hmac, submission_link_hmac,
      allocation_index, randomization_block, block_position, route_id, option_layout_id,
      status, next_testlet_ordinal, completed_testlets,
      response_count, breaks_completed, practice_completed_at, completed_at
    FROM sessions
    WHERE session_id = ? AND token_sha256 = ? AND release_id = ? AND token_expires_at > ?
  `).bind(cookie.sessionId, tokenHash, env.EXPECTED_RELEASE_ID, now).first<SessionRow>();
  if (!session) httpError(401, "SESSION_REQUIRED", "A valid Prolific study session is required.");
  return session;
}

function assertSessionCounters(session: SessionRow): void {
  if (!Number.isInteger(session.next_testlet_ordinal) || !Number.isInteger(session.completed_testlets) ||
      !Number.isInteger(session.response_count) || !Number.isInteger(session.breaks_completed) ||
      !Number.isInteger(session.allocation_index) || session.allocation_index < 0 || session.allocation_index >= HARD_CAP_STARTS_PER_L1 ||
      !Number.isInteger(session.randomization_block) ||
      session.randomization_block !== Math.floor(session.allocation_index / RANDOMIZATION_BLOCK_SIZE) ||
      !Number.isInteger(session.block_position) ||
      session.block_position !== session.allocation_index % RANDOMIZATION_BLOCK_SIZE + 1 ||
      !/^R(?:0[1-9]|10)$/.test(session.route_id) ||
      !Number.isInteger(session.option_layout_id) || session.option_layout_id < 0 || session.option_layout_id >= OPTION_LAYOUT_COUNT ||
      session.next_testlet_ordinal !== session.completed_testlets ||
      session.response_count !== session.completed_testlets * 3 ||
      (session.practice_completed_at === null &&
        (session.completed_testlets !== 0 || session.response_count !== 0 || session.breaks_completed !== 0)) ||
      (session.practice_completed_at !== null &&
        (!SERVER_ISO_UTC_PATTERN.test(session.practice_completed_at) || !Number.isFinite(Date.parse(session.practice_completed_at)))) ||
      session.completed_testlets < 0 || session.completed_testlets > TOTAL_TESTLETS ||
      session.breaks_completed < 0 || session.breaks_completed > TOTAL_BREAKS) {
    throw new Error("Invalid persisted session counters");
  }
}

function containsAnalyticKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsAnalyticKey);
  if (!isPlainObject(value)) return false;
  const prohibited = /^(?:correct(?:option)?|answer(?:key)?|is_?correct|score|theta|ability|difficulty|discrimination|guessing|information|standard_?error|sem)$/i;
  return Object.entries(value).some(([key, nested]) => prohibited.test(key) || containsAnalyticKey(nested));
}

async function validatedCanonicalTestletFromRow(row: RuntimeTestletContentRow): Promise<ValidatedRuntimeTestlet> {
  let optionsValue: unknown;
  let itemsValue: unknown;
  try {
    optionsValue = JSON.parse(row.options_json);
    itemsValue = JSON.parse(row.items_json);
  } catch {
    throw new Error("Invalid private runtime JSON");
  }
  if (!SHA256_PATTERN.test(row.content_sha256) || typeof row.testlet_id !== "string" ||
      row.testlet_id.trim() !== row.testlet_id || utf8Length(row.testlet_id) < 1 || utf8Length(row.testlet_id) > 128 ||
      typeof row.module_id !== "string" ||
      row.module_id.trim() !== row.module_id || utf8Length(row.module_id) < 1 || utf8Length(row.module_id) > 128 ||
      containsAnalyticKey(optionsValue) || containsAnalyticKey(itemsValue) ||
      !Array.isArray(optionsValue) || optionsValue.length !== 6 ||
      optionsValue.some((option) => typeof option !== "string" || option.trim() !== option || utf8Length(option) < 1 || utf8Length(option) > 256) ||
      new Set(optionsValue).size !== 6 || !Array.isArray(itemsValue) || itemsValue.length !== 3) {
    throw new Error("Invalid private runtime testlet");
  }
  const items = itemsValue.map((value, index): ValidatedRuntimeItem => {
    if (!isPlainObject(value) || Object.keys(value).length !== 3 ||
        !["itemId", "prompt", "itemPositionWithinTestlet"].every((key) => Object.hasOwn(value, key)) ||
        typeof value.itemId !== "string" || typeof value.prompt !== "string" ||
        value.itemPositionWithinTestlet !== index + 1 || value.itemId.trim() !== value.itemId || value.prompt.trim() !== value.prompt ||
        utf8Length(value.itemId) < 1 || utf8Length(value.itemId) > 128 ||
        utf8Length(value.prompt) < 1 || utf8Length(value.prompt) > 1024) {
      throw new Error("Invalid private runtime item");
    }
    return {
      itemId: value.itemId,
      prompt: value.prompt,
      itemPositionWithinTestlet: index + 1
    };
  });
  const options = optionsValue as string[];
  const canonicalPayload = {
    testletId: row.testlet_id,
    moduleId: row.module_id,
    options,
    items
  };
  if (await sha256Hex(stableJson(canonicalPayload)) !== row.content_sha256) {
    throw new Error("Private runtime testlet integrity check failed");
  }
  return { testletId: row.testlet_id, moduleId: row.module_id, options, items };
}

async function validatedTestletFromRow(
  row: RuntimeTestletRow,
  optionLayoutId: number
): Promise<ValidatedRuntimeTestlet> {
  const canonical = await validatedCanonicalTestletFromRow(row);
  return { ...canonical, options: optionsForLayout(canonical.options, optionLayoutId) };
}

function browserTestlet(testlet: ValidatedRuntimeTestlet): PublicRuntimeTestlet {
  return {
    options: [...testlet.options],
    items: testlet.items.map((item) => ({ prompt: item.prompt }))
  };
}

async function nextRuntimeTestlet(env: Env, session: SessionRow): Promise<RuntimeTestletRow> {
  const row = await env.DB.prepare(`
    SELECT
      rr.testlet_ordinal,
      rr.module_position,
      rr.testlet_position_within_module,
      rr.testlet_id,
      t.module_id,
      t.options_json,
      t.items_json,
      t.content_sha256
    FROM runtime_route_testlets rr
    JOIN runtime_testlets t ON t.release_id = rr.release_id AND t.testlet_id = rr.testlet_id
    WHERE rr.release_id = ? AND rr.route_id = ? AND rr.testlet_ordinal = ?
  `).bind(session.release_id, session.route_id, session.next_testlet_ordinal).first<RuntimeTestletRow>();
  if (!row) throw new Error("Missing next private runtime testlet");
  return row;
}

export function minimumBreakSeconds(afterModule: number): number {
  if (!Number.isInteger(afterModule) || afterModule < 1 || afterModule > TOTAL_BREAKS) {
    throw new Error("Invalid module break ordinal");
  }
  return afterModule === MIDPOINT_BREAK_AFTER_MODULE ? MIDPOINT_BREAK_SECONDS : STANDARD_BREAK_SECONDS;
}

function serverIsoEpochMs(value: string): number {
  if (!SERVER_ISO_UTC_PATTERN.test(value)) throw new Error("Invalid persisted server timestamp");
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs)) throw new Error("Invalid persisted server timestamp");
  return epochMs;
}

async function moduleBreakState(
  env: Env,
  sessionId: string,
  afterModule: number,
  nowMs = Date.now()
): Promise<JsonObject> {
  const start = await env.DB.prepare(`
    SELECT occurred_at
    FROM session_events
    WHERE session_id = ? AND event_type = 'testlet_submitted' AND event_ordinal = ?
  `).bind(sessionId, afterModule * 10 - 1).first<{ occurred_at: string }>();
  if (!start) throw new Error("Missing module-final server receipt event");
  const minimumSeconds = minimumBreakSeconds(afterModule);
  const continueAvailableAtMs = serverIsoEpochMs(start.occurred_at) + minimumSeconds * 1000;
  const remainingSeconds = Math.max(0, Math.ceil((continueAvailableAtMs - nowMs) / 1000));
  return {
    after_module_position: afterModule,
    before_module_position: afterModule + 1,
    minimum_break_seconds: minimumSeconds,
    remaining_break_seconds: remainingSeconds,
    continue_available_at: new Date(continueAvailableAtMs).toISOString(),
    break_policy_definition: BREAK_POLICY_DEFINITION
  };
}

async function statePayload(env: Env, session: SessionRow): Promise<JsonObject> {
  assertSessionCounters(session);
  let nextStep: JsonObject;
  if (session.status === "completed") {
    nextStep = { kind: "completed" };
  } else if (session.practice_completed_at === null) {
    nextStep = {
      kind: "practice",
      practice_definition: PRACTICE_DEFINITION,
      responses_persisted: false
    };
  } else if (session.completed_testlets === TOTAL_TESTLETS) {
    if (session.response_count !== TOTAL_RESPONSES || session.breaks_completed !== TOTAL_BREAKS) {
      throw new Error("Invalid completion-ready counters");
    }
    nextStep = { kind: "complete_ready" };
  } else {
    const requiredBreaks = Math.min(TOTAL_BREAKS, Math.floor(session.completed_testlets / 10));
    if (session.breaks_completed < requiredBreaks) {
      const afterModule = session.breaks_completed + 1;
      nextStep = {
        kind: "break",
        ...(await moduleBreakState(env, session.session_id, afterModule))
      };
    } else {
      const row = await nextRuntimeTestlet(env, session);
      nextStep = {
        kind: "testlet",
        testlet_ordinal: row.testlet_ordinal,
        module_position: row.module_position,
        testlet_position_within_module: row.testlet_position_within_module,
        module_count: 10,
        testlets_per_module: 10,
        testlet: browserTestlet(await validatedTestletFromRow(row, session.option_layout_id))
      };
    }
  }
  return {
    ok: true,
    status: session.status,
    l1: session.l1,
    completed_testlets: session.completed_testlets,
    total_testlets: TOTAL_TESTLETS,
    next_step: nextStep
  };
}

function parseClientIsoDate(value: unknown): string {
  if (typeof value !== "string" || utf8Length(value) > ISO_DATE_MAX_BYTES ||
      !ISO_UTC_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    httpError(400, "INVALID_RESPONSE", "The testlet response was not valid.");
  }
  return value;
}

function parseTestletSubmission(value: JsonObject): TestletSubmissionBody {
  assertExactKeys(value, [
    "testlet_ordinal", "selected_options", "testlet_started_at", "testlet_submitted_at", "elapsed_ms", "idempotency_key"
  ], ["phase"]);
  if (value.phase !== undefined && value.phase !== "main") {
    httpError(400, "INVALID_RESPONSE", "The testlet response was not valid.");
  }
  if (!Number.isInteger(value.testlet_ordinal) || (value.testlet_ordinal as number) < 0 || (value.testlet_ordinal as number) >= TOTAL_TESTLETS ||
      !Array.isArray(value.selected_options) || value.selected_options.length !== 3 ||
      value.selected_options.some((option) => typeof option !== "string" || option.trim() !== option || utf8Length(option) < 1 || utf8Length(option) > 256) ||
      new Set(value.selected_options).size !== 3 ||
      !Number.isInteger(value.elapsed_ms) || (value.elapsed_ms as number) < 0 || (value.elapsed_ms as number) > 7_200_000 ||
      typeof value.idempotency_key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(value.idempotency_key)) {
    httpError(400, "INVALID_RESPONSE", "The testlet response was not valid.");
  }
  const clientStartedAt = parseClientIsoDate(value.testlet_started_at);
  const clientSubmittedAt = parseClientIsoDate(value.testlet_submitted_at);
  if (Date.parse(clientStartedAt) > Date.parse(clientSubmittedAt)) {
    httpError(400, "INVALID_RESPONSE", "The testlet response was not valid.");
  }
  return {
    testletOrdinal: value.testlet_ordinal as number,
    selectedOptions: value.selected_options as string[],
    clientStartedAt,
    clientSubmittedAt,
    elapsedMs: value.elapsed_ms as number,
    idempotencyKey: value.idempotency_key
  };
}

async function existingTestletSubmission(
  env: Env,
  sessionId: string,
  ordinal: number,
  idempotencyKey: string
): Promise<ExistingSubmissionRow | null> {
  const found = await env.DB.prepare(`
    SELECT testlet_ordinal, option_layout_id, idempotency_key, payload_sha256
    FROM testlet_submissions
    WHERE session_id = ? AND (testlet_ordinal = ? OR idempotency_key = ?)
    LIMIT 3
  `).bind(sessionId, ordinal, idempotencyKey).all<ExistingSubmissionRow>();
  if (found.results.length === 0) return null;
  if (found.results.length !== 1) httpError(409, "RESPONSE_CONFLICT", "The response conflicts with a saved submission.");
  return found.results[0];
}

async function handleConfig(env: Env): Promise<Response> {
  let collectionEnabled = false;
  let releaseIntegrityVerified = false;
  let activationPreflightReady = false;
  let releaseBindingSha256: string | null = null;
  if (environmentShapeReady(env)) {
    prolificApiOrigin(env);
    const expectedIdentity = expectedReleaseIdentity(env);
    if (expectedIdentity !== null) {
      const [row, actualHmacKeyHash, actualCompletionCodeHash, publicBuild] = await Promise.all([
        releaseReadiness(env),
        sha256Hex(env.PARTICIPANT_HMAC_KEY),
        sha256Hex(env.PROLIFIC_COMPLETION_CODE),
        publicBuildIdentity(env)
      ]);
      const actualHmacKeyFingerprint = `sha256:${actualHmacKeyHash}`;
      const actualCompletionCodeFingerprint = `sha256:${actualCompletionCodeHash}`;
      const identityMatches = releaseIdentityMatches(
        row,
        expectedIdentity,
        actualHmacKeyFingerprint,
        actualCompletionCodeFingerprint,
        publicBuild,
        env.CF_VERSION_METADATA?.id ?? null,
        env.CF_VERSION_METADATA?.tag ?? null
      );
      if (identityMatches && row !== null) {
        releaseBindingSha256 = await sha256Hex(stableJson({
          schemaVersion: RELEASE_BINDING_SCHEMA,
          releaseId: expectedIdentity.releaseId,
          appVersion: expectedIdentity.appVersion,
          workerVersionId: row.worker_version_id
        }));
        releaseIntegrityVerified = await immutableRuntimeMatches(env, row, expectedIdentity);
        activationPreflightReady = releaseIntegrityVerified && row.active === 0 &&
          row.active_study_count === 0 && row.active_l1_count === 0;
      }
      collectionEnabled = releaseIntegrityVerified && readinessIsComplete(
        row,
        expectedIdentity,
        actualHmacKeyFingerprint,
        actualCompletionCodeFingerprint,
        publicBuild,
        env.CF_VERSION_METADATA?.id ?? null,
        env.CF_VERSION_METADATA?.tag ?? null
      );
    }
  }
  return jsonResponse({
    ok: true,
    collection_enabled: collectionEnabled,
    release_integrity_verified: releaseIntegrityVerified,
    activation_preflight_ready: activationPreflightReady,
    release_binding_sha256: releaseBindingSha256,
    protocol_version: FIELD_WORKER_PROTOCOL_VERSION,
    total_testlets: TOTAL_TESTLETS,
    total_item_responses: TOTAL_RESPONSES,
    required_breaks: TOTAL_BREAKS,
    target_protocol_completers_per_l1: TARGET_PROTOCOL_COMPLETERS_PER_L1,
    hard_cap_starts_per_l1: HARD_CAP_STARTS_PER_L1,
    stop_new_allocations_at_target: true,
    retain_server_committed_partial_responses: true,
    protocol_completion_definition: PROTOCOL_COMPLETION_DEFINITION,
    partial_response_retention_definition: PARTIAL_RESPONSE_RETENTION_DEFINITION,
    practice_enabled: true,
    practice_responses_persisted: false,
    administration_policy: ADMINISTRATION_POLICY,
    administration_policy_sha256: ADMINISTRATION_POLICY_SHA256,
    prolific_entry_path: "/join"
  });
}

async function handleJoin(request: Request, url: URL, env: Env): Promise<Response> {
  const identifiers = prolificIdentifiersFromJoin(url);
  const started = await createOrResumeSession(request, env, identifiers);
  return redirectResponse("/", sessionCookie(started.session.session_id, started.rawToken));
}

async function handleState(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const session = await authenticateSession(request, env);
  return jsonResponse(await statePayload(env, session));
}

async function handlePracticeComplete(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const body = await readBoundedJson(request, 256);
  assertExactKeys(body, ["practice_definition"]);
  if (body.practice_definition !== PRACTICE_DEFINITION) {
    httpError(400, "INVALID_PRACTICE", "The interface practice completion was not valid.");
  }
  const canonical = { practice_definition: PRACTICE_DEFINITION };
  const payloadHash = await sha256Hex(stableJson(canonical));
  const session = await authenticateSession(request, env);
  const existing = await env.DB.prepare(`
    SELECT payload_sha256, occurred_at
    FROM session_events
    WHERE session_id = ? AND event_type = 'practice_completed' AND event_ordinal = 0
  `).bind(session.session_id).first<{ payload_sha256: string; occurred_at: string }>();
  if (existing) {
    if (existing.payload_sha256 !== payloadHash || !SERVER_ISO_UTC_PATTERN.test(existing.occurred_at)) {
      httpError(409, "PRACTICE_CONFLICT", "The interface practice conflicts with a saved event.");
    }
    if (session.practice_completed_at === null) {
      const recovered = await env.DB.prepare(`
        UPDATE sessions SET practice_completed_at = ?, updated_at = ?
        WHERE session_id = ? AND status = 'in_progress' AND practice_completed_at IS NULL AND
          next_testlet_ordinal = 0 AND completed_testlets = 0 AND response_count = 0 AND breaks_completed = 0
      `).bind(existing.occurred_at, existing.occurred_at, session.session_id).run();
      if (recovered.meta.changes !== 1) {
        httpError(409, "PRACTICE_CONFLICT", "The interface practice could not be confirmed because the session changed.", true);
      }
    }
    const fresh = await authenticateSession(request, env);
    return jsonResponse(await statePayload(env, fresh));
  }
  if (session.status !== "in_progress") {
    httpError(409, "SESSION_COMPLETED", "This study session is already complete.");
  }
  if (session.practice_completed_at !== null || session.next_testlet_ordinal !== 0 ||
      session.completed_testlets !== 0 || session.response_count !== 0 || session.breaks_completed !== 0) {
    httpError(409, "PRACTICE_OUT_OF_ORDER", "The interface practice can only be completed before the first testlet.");
  }
  const now = new Date().toISOString();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO session_events (event_id, session_id, event_type, event_ordinal, payload_sha256, occurred_at)
        VALUES (?, ?, 'practice_completed', 0, ?, ?)
      `).bind(crypto.randomUUID(), session.session_id, payloadHash, now),
      env.DB.prepare(`
        UPDATE sessions SET practice_completed_at = ?, updated_at = ?
        WHERE session_id = ? AND status = 'in_progress' AND practice_completed_at IS NULL AND
          next_testlet_ordinal = 0 AND completed_testlets = 0 AND response_count = 0 AND breaks_completed = 0
      `).bind(now, now, session.session_id)
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      throw new Error("Practice completion transaction did not change one row per statement");
    }
  } catch {
    const raced = await env.DB.prepare(`
      SELECT payload_sha256 FROM session_events
      WHERE session_id = ? AND event_type = 'practice_completed' AND event_ordinal = 0
    `).bind(session.session_id).first<{ payload_sha256: string }>();
    if (!raced || raced.payload_sha256 !== payloadHash) {
      httpError(409, "PRACTICE_CONFLICT", "The interface practice could not be confirmed because the session changed.", true);
    }
  }
  const fresh = await authenticateSession(request, env);
  if (fresh.practice_completed_at === null) {
    throw new Error("Practice completion transaction was not confirmed");
  }
  return jsonResponse(await statePayload(env, fresh));
}

async function handleTestletResponse(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const body = parseTestletSubmission(await readBoundedJson(request, 4096));
  const session = await authenticateSession(request, env);
  if (session.status !== "in_progress") httpError(409, "SESSION_COMPLETED", "This study session is already complete.");
  if (session.practice_completed_at === null) {
    httpError(409, "PRACTICE_REQUIRED", "The interface practice must be completed first.");
  }

  const canonical = {
    elapsed_ms: body.elapsedMs,
    idempotency_key: body.idempotencyKey,
    selected_options: body.selectedOptions,
    testlet_ordinal: body.testletOrdinal,
    testlet_started_at: body.clientStartedAt,
    testlet_submitted_at: body.clientSubmittedAt
  };
  const payloadHash = await sha256Hex(stableJson(canonical));
  const existing = await existingTestletSubmission(env, session.session_id, body.testletOrdinal, body.idempotencyKey);
  if (existing) {
    if (existing.testlet_ordinal !== body.testletOrdinal || existing.idempotency_key !== body.idempotencyKey ||
        existing.option_layout_id !== session.option_layout_id || existing.payload_sha256 !== payloadHash) {
      httpError(409, "RESPONSE_CONFLICT", "The response conflicts with a saved submission.");
    }
    const fresh = await authenticateSession(request, env);
    return jsonResponse(await statePayload(env, fresh));
  }

  if (session.next_testlet_ordinal !== body.testletOrdinal) {
    httpError(409, "OUT_OF_ORDER_RESPONSE", "Only the next testlet can be submitted.");
  }
  const requiredBreaks = Math.min(TOTAL_BREAKS, Math.floor(body.testletOrdinal / 10));
  if (session.breaks_completed !== requiredBreaks) {
    httpError(409, "BREAK_REQUIRED", "The required module break must be completed first.");
  }
  const runtimeRow = await nextRuntimeTestlet(env, session);
  const runtimeTestlet = await validatedTestletFromRow(runtimeRow, session.option_layout_id);
  if (body.selectedOptions.some((option) => !runtimeTestlet.options.includes(option))) {
    httpError(400, "INVALID_RESPONSE", "The testlet response was not valid.");
  }
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT INTO testlet_submissions (
        session_id, testlet_ordinal, testlet_id, option_layout_id, idempotency_key, payload_sha256,
        client_started_at, client_submitted_at, elapsed_ms, received_at
      )
      SELECT session_id, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM sessions
      WHERE session_id = ? AND status = 'in_progress' AND practice_completed_at IS NOT NULL AND
        next_testlet_ordinal = ? AND breaks_completed = ?
    `).bind(
      body.testletOrdinal, runtimeTestlet.testletId, session.option_layout_id, body.idempotencyKey, payloadHash,
      body.clientStartedAt, body.clientSubmittedAt, body.elapsedMs, now,
      session.session_id, body.testletOrdinal, requiredBreaks
    )
  ];
  runtimeTestlet.items.forEach((item, index) => {
    statements.push(env.DB.prepare(`
      INSERT INTO responses (
        session_id, response_ordinal, testlet_ordinal, testlet_id, item_id,
        item_position_within_testlet, selected_option, selected_option_position, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      session.session_id, body.testletOrdinal * 3 + index + 1, body.testletOrdinal,
      runtimeTestlet.testletId, item.itemId, index + 1, body.selectedOptions[index],
      runtimeTestlet.options.indexOf(body.selectedOptions[index]) + 1, now
    ));
  });
  statements.push(
    env.DB.prepare(`
      UPDATE sessions SET
        next_testlet_ordinal = next_testlet_ordinal + 1,
        completed_testlets = completed_testlets + 1,
        response_count = response_count + 3,
        updated_at = ?
      WHERE session_id = ? AND status = 'in_progress' AND next_testlet_ordinal = ? AND breaks_completed = ?
    `).bind(now, session.session_id, body.testletOrdinal, requiredBreaks),
    env.DB.prepare(`
      INSERT INTO session_events (event_id, session_id, event_type, event_ordinal, payload_sha256, occurred_at)
      VALUES (?, ?, 'testlet_submitted', ?, ?, ?)
    `).bind(crypto.randomUUID(), session.session_id, body.testletOrdinal, payloadHash, now)
  );
  try {
    await env.DB.batch(statements);
  } catch {
    const raced = await existingTestletSubmission(env, session.session_id, body.testletOrdinal, body.idempotencyKey);
    if (!raced || raced.testlet_ordinal !== body.testletOrdinal || raced.idempotency_key !== body.idempotencyKey ||
        raced.option_layout_id !== session.option_layout_id || raced.payload_sha256 !== payloadHash) {
      httpError(409, "RESPONSE_CONFLICT", "The response could not be saved because the session changed.", true);
    }
  }
  const fresh = await authenticateSession(request, env);
  return jsonResponse(await statePayload(env, fresh));
}

async function handleBreakComplete(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const body = await readBoundedJson(request, 256);
  assertExactKeys(body, ["after_module_position"]);
  if (!Number.isInteger(body.after_module_position) || (body.after_module_position as number) < 1 ||
      (body.after_module_position as number) > TOTAL_BREAKS) {
    httpError(400, "INVALID_BREAK", "The module break was not valid.");
  }
  const afterModule = body.after_module_position as number;
  const payloadHash = await sha256Hex(stableJson({ after_module_position: afterModule }));
  const session = await authenticateSession(request, env);
  if (session.status !== "in_progress") httpError(409, "SESSION_COMPLETED", "This study session is already complete.");
  const existing = await env.DB.prepare(`
    SELECT payload_sha256 FROM session_events
    WHERE session_id = ? AND event_type = 'break_completed' AND event_ordinal = ?
  `).bind(session.session_id, afterModule).first<{ payload_sha256: string }>();
  if (existing) {
    if (existing.payload_sha256 !== payloadHash) httpError(409, "BREAK_CONFLICT", "The break conflicts with a saved event.");
    const fresh = await authenticateSession(request, env);
    return jsonResponse(await statePayload(env, fresh));
  }
  if (afterModule !== session.breaks_completed + 1 || session.next_testlet_ordinal !== afterModule * 10) {
    httpError(409, "BREAK_OUT_OF_ORDER", "Only the required module break can be completed.");
  }
  const timing = await moduleBreakState(env, session.session_id, afterModule);
  if ((timing.remaining_break_seconds as number) > 0) {
    httpError(409, "BREAK_NOT_READY", "The minimum module break has not yet elapsed.", true);
  }
  const now = new Date().toISOString();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO session_events (event_id, session_id, event_type, event_ordinal, payload_sha256, occurred_at)
        VALUES (?, ?, 'break_completed', ?, ?, ?)
      `).bind(crypto.randomUUID(), session.session_id, afterModule, payloadHash, now),
      env.DB.prepare(`
        UPDATE sessions SET breaks_completed = breaks_completed + 1, updated_at = ?
        WHERE session_id = ? AND status = 'in_progress' AND practice_completed_at IS NOT NULL AND
          breaks_completed = ? AND next_testlet_ordinal = ? AND EXISTS (
            SELECT 1 FROM session_events e
            WHERE e.session_id = sessions.session_id AND e.event_type = 'break_completed' AND
              e.event_ordinal = ? AND e.payload_sha256 = ?
          )
      `).bind(now, session.session_id, afterModule - 1, afterModule * 10, afterModule, payloadHash)
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      throw new Error("Break completion transaction did not change one row per statement");
    }
  } catch {
    const raced = await env.DB.prepare(`
      SELECT payload_sha256 FROM session_events
      WHERE session_id = ? AND event_type = 'break_completed' AND event_ordinal = ?
    `).bind(session.session_id, afterModule).first<{ payload_sha256: string }>();
    if (!raced || raced.payload_sha256 !== payloadHash) {
      httpError(409, "BREAK_CONFLICT", "The module break could not be confirmed because the session changed.", true);
    }
  }
  const fresh = await authenticateSession(request, env);
  return jsonResponse(await statePayload(env, fresh));
}

function completionResult(env: Env): Response {
  const completionCode = env.PROLIFIC_COMPLETION_CODE;
  if (!COMPLETION_CODE_PATTERN.test(completionCode)) {
    httpError(503, "COMPLETION_NOT_CONFIGURED", "The completion link is not configured.", true);
  }
  const completionUrl = new URL("https://app.prolific.com/submissions/complete");
  completionUrl.searchParams.set("cc", completionCode);
  return jsonResponse({
    ok: true,
    status: "completed",
    completion_code: completionCode,
    completion_url: completionUrl.toString()
  });
}

async function handleComplete(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const body = await readBoundedJson(request, 128);
  assertExactKeys(body, []);
  const session = await authenticateSession(request, env);
  if (session.status === "completed") return completionResult(env);
  assertSessionCounters(session);
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM session_events e WHERE e.session_id = ? AND e.event_type = 'practice_completed') AS practice_count,
      (SELECT COUNT(*) FROM testlet_submissions ts WHERE ts.session_id = ?) AS submission_count,
      (SELECT COUNT(*) FROM responses r WHERE r.session_id = ?) AS response_count,
      (SELECT COUNT(*) FROM session_events e WHERE e.session_id = ? AND e.event_type = 'break_completed') AS break_count,
      (
        SELECT COUNT(*)
        FROM testlet_submissions ts
        LEFT JOIN runtime_route_testlets rr
          ON rr.release_id = ? AND rr.route_id = ? AND rr.testlet_ordinal = ts.testlet_ordinal AND rr.testlet_id = ts.testlet_id
        WHERE ts.session_id = ? AND rr.testlet_id IS NULL
      ) AS invalid_route_submission_count,
      (SELECT COUNT(*) FROM testlet_submissions ts
        WHERE ts.session_id = ? AND ts.option_layout_id <> ?) AS invalid_option_layout_submission_count
  `).bind(
    session.session_id, session.session_id, session.session_id, session.session_id,
    session.release_id, session.route_id, session.session_id,
    session.session_id, session.option_layout_id
  ).first<CompletionCountsRow>();
  if (!counts || session.practice_completed_at === null || counts.practice_count !== 1 ||
      session.completed_testlets !== TOTAL_TESTLETS || session.next_testlet_ordinal !== TOTAL_TESTLETS ||
      session.response_count !== TOTAL_RESPONSES || session.breaks_completed !== TOTAL_BREAKS ||
      counts.submission_count !== TOTAL_TESTLETS || counts.response_count !== TOTAL_RESPONSES ||
      counts.break_count !== TOTAL_BREAKS || counts.invalid_route_submission_count !== 0 ||
      counts.invalid_option_layout_submission_count !== 0) {
    httpError(409, "SESSION_INCOMPLETE", "The full response and break record has not yet been verified.");
  }
  const now = new Date().toISOString();
  const payloadHash = await sha256Hex("uvlt-fixed-ab:v2:session_completed:practice:100:300:9:8x45s+90s");
  try {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE sessions SET status = 'completed', completed_at = ?, completion_issued_at = ?, updated_at = ?
        WHERE session_id = ? AND status = 'in_progress' AND practice_completed_at IS NOT NULL AND completed_testlets = 100 AND
          next_testlet_ordinal = 100 AND response_count = 300 AND breaks_completed = 9
      `).bind(now, now, now, session.session_id),
      env.DB.prepare(`
        INSERT INTO session_events (event_id, session_id, event_type, event_ordinal, payload_sha256, occurred_at)
        SELECT ?, session_id, 'session_completed', 100, ?, ?
        FROM sessions WHERE session_id = ? AND status = 'completed'
      `).bind(crypto.randomUUID(), payloadHash, now, session.session_id)
    ]);
  } catch {
    const fresh = await authenticateSession(request, env);
    if (fresh.status !== "completed") {
      httpError(409, "COMPLETION_CONFLICT", "Completion could not be confirmed because the session changed.", true);
    }
  }
  const confirmed = await authenticateSession(request, env);
  if (confirmed.status !== "completed" || confirmed.completed_at === null) {
    throw new Error("Completion transaction was not confirmed");
  }
  return completionResult(env);
}

function methodNotAllowed(allow: string): Response {
  const response = errorResponse(new PublicHttpError(405, "METHOD_NOT_ALLOWED", "The request method was not accepted."));
  const headers = new Headers(response.headers);
  headers.set("Allow", allow);
  return new Response(response.body, { status: response.status, headers });
}

function forbiddenAssetPath(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return true;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) return true;
  if (/\.(?:map|ts|sql|r)$/i.test(decoded)) return true;
  return /^\/(?:data|scoring|audit|test|tools|cloudflare)(?:\/|$)/i.test(decoded);
}

async function handleStatic(request: Request, env: Env, url: URL): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method)) return methodNotAllowed("GET, HEAD");
  if (url.pathname === "/recruitment-closed" || url.pathname === "/recruitment-closed/") {
    if (url.pathname !== "/recruitment-closed" || url.search !== "") {
      return redirectResponse("/recruitment-closed");
    }
    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    const assetResponse = await env.ASSETS.fetch(new Request(indexUrl, {
      method: request.method,
      headers: request.headers
    }));
    return applySecurityHeaders(assetResponse, true);
  }
  if (hasRawProlificQuery(url)) {
    const canonical = exactProlificQueryForCanonicalRedirect(url);
    return redirectResponse(canonical ?? "/");
  }
  if (forbiddenAssetPath(url.pathname)) {
    httpError(404, "NOT_FOUND", "The requested resource was not found.");
  }
  const assetResponse = await env.ASSETS.fetch(request);
  // The current field assets use stable filenames rather than content hashes;
  // no-store prevents a browser from mixing files across operational releases.
  return applySecurityHeaders(assetResponse, true);
}

async function dispatch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/join") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return handleJoin(request, url, env);
  }
  if (url.pathname.startsWith("/api/")) {
    if (url.search !== "") httpError(400, "QUERY_NOT_ALLOWED", "Query parameters are not accepted by this endpoint.");
    if (url.pathname === "/api/config") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return handleConfig(env);
    }
    if (url.pathname === "/api/session/state") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return handleState(request, env);
    }
    if (url.pathname === "/api/session/practice-complete") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handlePracticeComplete(request, env);
    }
    if (url.pathname === "/api/session/testlet-response") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handleTestletResponse(request, env);
    }
    if (url.pathname === "/api/session/break-complete") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handleBreakComplete(request, env);
    }
    if (url.pathname === "/api/session/complete") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handleComplete(request, env);
    }
    httpError(404, "NOT_FOUND", "The requested API endpoint was not found.");
  }
  return handleStatic(request, env, url);
}

function routeLabel(pathname: string): string {
  const known = new Set([
    "/join", "/recruitment-closed", "/api/config", "/api/session/state",
    "/api/session/practice-complete", "/api/session/testlet-response",
    "/api/session/break-complete", "/api/session/complete"
  ]);
  if (known.has(pathname)) return pathname;
  return pathname.startsWith("/api/") ? "unknown_api" : "static";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const pathname = new URL(request.url).pathname;
    let status = 500;
    let outcome = "error";
    let errorCode: string | undefined;
    try {
      const response = await dispatch(request, env);
      status = response.status;
      outcome = response.ok || response.status === 303 ? "ok" : "rejected";
      return response;
    } catch (error) {
      if (error instanceof PublicHttpError) {
        status = error.status;
        outcome = "rejected";
        errorCode = error.code;
        if (pathname === "/join") {
          status = 303;
          const closedByPolicy = error.code === "PROTOCOL_COMPLETION_TARGET_REACHED" ||
            error.code === "STUDY_CAPACITY_REACHED";
          return redirectResponse(closedByPolicy ? "/recruitment-closed" : "/");
        }
        return errorResponse(error);
      }
      status = 500;
      errorCode = "INTERNAL_ERROR";
      if (pathname === "/join") {
        status = 303;
        return redirectResponse("/");
      }
      return errorResponse(new PublicHttpError(500, "INTERNAL_ERROR", "The study server encountered an unexpected error.", true));
    } finally {
      console.log(JSON.stringify({
        event: "worker_request",
        request_id: requestId,
        route: routeLabel(pathname),
        method: request.method,
        status,
        outcome,
        ...(errorCode ? { error_code: errorCode } : {})
      }));
    }
  }
};
