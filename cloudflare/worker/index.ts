const COOKIE_NAME = "__Host-uvlt_session";
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
const FIELD_COLLECTION_MODE = "field";
const TOTAL_TESTLETS = 100;
const TOTAL_RESPONSES = 300;
const TOTAL_BREAKS = 9;
const ROUTE_COUNT = 10;
const PROLIFIC_ID_PATTERN = /^[0-9a-f]{24}$/i;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const COMPLETION_CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;
const APP_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
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
  route_id: string;
  status: "in_progress" | "completed";
  next_testlet_ordinal: number;
  completed_testlets: number;
  response_count: number;
  breaks_completed: number;
  completed_at: string | null;
}

interface RuntimeTestletRow {
  testlet_ordinal: number;
  module_position: number;
  testlet_position_within_module: number;
  testlet_id: string;
  module_id: string;
  options_json: string;
  items_json: string;
  content_sha256: string;
}

interface PublicRuntimeItem {
  itemId: string;
  prompt: string;
  itemPositionWithinTestlet: number;
}

interface PublicRuntimeTestlet {
  testletId: string;
  options: string[];
  items: PublicRuntimeItem[];
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
  idempotency_key: string;
  payload_sha256: string;
}

interface CompletionCountsRow {
  submission_count: number;
  response_count: number;
  break_count: number;
  invalid_route_submission_count: number;
}

interface ReleaseReadinessRow {
  app_version: string;
  public_build_manifest_sha256: string;
  runtime_manifest_sha256: string;
  bank_sha256: string;
  routes_sha256: string;
  participant_hmac_key_fingerprint: string | null;
  prolific_completion_code_fingerprint: string | null;
  prolific_completion_action: ProlificCompletionAction | null;
  active: number;
  frozen_at: string | null;
  expected_testlets: number;
  expected_items: number;
  expected_breaks: number;
  testlet_count: number;
  route_row_count: number;
  route_count: number;
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
  participantHmacKeyFingerprint: string;
  prolificCompletionCodeFingerprint: string;
  prolificCompletionAction: ProlificCompletionAction;
}

interface PublicBuildIdentity {
  appVersion: string;
  rawSha256: string;
}

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
  const participantHmacKeyFingerprint: string = env.EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT;
  const prolificCompletionCodeFingerprint: string = env.EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT;
  const prolificCompletionAction: string = env.EXPECTED_PROLIFIC_COMPLETION_ACTION;
  if (!RELEASE_ID_PATTERN.test(releaseId) || releaseId === "UNCONFIGURED" ||
      !APP_VERSION_PATTERN.test(appVersion) || appVersion === "UNCONFIGURED" ||
      !SHA256_PATTERN.test(publicBuildManifestSha256) ||
      !SHA256_PATTERN.test(runtimeManifestSha256) || !SHA256_PATTERN.test(bankSha256) ||
      !SHA256_PATTERN.test(routesSha256) || !SHA256_FINGERPRINT_PATTERN.test(participantHmacKeyFingerprint)) {
    return null;
  }
  if (!SHA256_FINGERPRINT_PATTERN.test(prolificCompletionCodeFingerprint) ||
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
      r.public_build_manifest_sha256,
      r.runtime_manifest_sha256,
      r.bank_sha256,
      r.routes_sha256,
      r.participant_hmac_key_fingerprint,
      r.prolific_completion_code_fingerprint,
      r.prolific_completion_action,
      r.active,
      r.frozen_at,
      r.expected_testlets,
      r.expected_items,
      r.expected_breaks,
      (SELECT COUNT(*) FROM runtime_testlets t WHERE t.release_id = r.release_id) AS testlet_count,
      (SELECT COUNT(*) FROM runtime_route_testlets rt WHERE rt.release_id = r.release_id) AS route_row_count,
      (SELECT COUNT(DISTINCT route_id) FROM runtime_route_testlets rt WHERE rt.release_id = r.release_id) AS route_count,
      (SELECT COUNT(*) FROM studies s WHERE s.release_id = r.release_id AND s.active = 1) AS active_study_count,
      (SELECT COUNT(DISTINCT l1) FROM studies s WHERE s.release_id = r.release_id AND s.active = 1) AS active_l1_count
    FROM runtime_releases r
    WHERE r.release_id = ?
  `).bind(env.EXPECTED_RELEASE_ID).first<ReleaseReadinessRow>();
}

function readinessIsComplete(
  row: ReleaseReadinessRow | null,
  expectedIdentity: ExpectedReleaseIdentity,
  actualHmacKeyFingerprint: string,
  actualCompletionCodeFingerprint: string,
  publicBuild: PublicBuildIdentity | null,
  workerVersionTag: string | null
): boolean {
  return row !== null && row.active === 1 && row.frozen_at !== null &&
    row.app_version === expectedIdentity.appVersion &&
    row.public_build_manifest_sha256 === expectedIdentity.publicBuildManifestSha256 &&
    row.runtime_manifest_sha256 === expectedIdentity.runtimeManifestSha256 &&
    row.bank_sha256 === expectedIdentity.bankSha256 &&
    row.routes_sha256 === expectedIdentity.routesSha256 &&
    row.participant_hmac_key_fingerprint === expectedIdentity.participantHmacKeyFingerprint &&
    row.prolific_completion_code_fingerprint === expectedIdentity.prolificCompletionCodeFingerprint &&
    row.prolific_completion_action === expectedIdentity.prolificCompletionAction &&
    actualHmacKeyFingerprint === expectedIdentity.participantHmacKeyFingerprint &&
    actualCompletionCodeFingerprint === expectedIdentity.prolificCompletionCodeFingerprint &&
    publicBuild !== null && publicBuild.appVersion === expectedIdentity.appVersion &&
    publicBuild.rawSha256 === expectedIdentity.publicBuildManifestSha256 &&
    workerVersionTag === expectedIdentity.releaseId &&
    row.expected_testlets === TOTAL_TESTLETS && row.expected_items === TOTAL_RESPONSES && row.expected_breaks === TOTAL_BREAKS &&
    row.testlet_count === TOTAL_TESTLETS && row.route_row_count === TOTAL_TESTLETS * ROUTE_COUNT &&
    row.route_count === ROUTE_COUNT && row.active_study_count === 2 && row.active_l1_count === 2;
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
    env.CF_VERSION_METADATA?.tag ?? null
  )) {
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
      allocation_index, route_id, status, next_testlet_ordinal, completed_testlets,
      response_count, breaks_completed, completed_at
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
    FROM sessions
    WHERE release_id = ? AND l1 = ?
  )
  INSERT INTO sessions (
    session_id, release_id, study_id, l1, participant_link_hmac, submission_link_hmac,
    allocation_index, route_id, token_sha256, token_expires_at, status, next_testlet_ordinal,
    completed_testlets, response_count, breaks_completed, created_at, updated_at
  )
  SELECT
    ?, ?, ?, ?, ?, ?, allocation_index,
    CASE (allocation_index % 10)
      WHEN 0 THEN 'R01' WHEN 1 THEN 'R02' WHEN 2 THEN 'R03' WHEN 3 THEN 'R04' WHEN 4 THEN 'R05'
      WHEN 5 THEN 'R06' WHEN 6 THEN 'R07' WHEN 7 THEN 'R08' WHEN 8 THEN 'R09' WHEN 9 THEN 'R10'
    END,
    ?, ?, 'in_progress', 0, 0, 0, 0, ?, ?
  FROM next_allocation
  WHERE allocation_index BETWEEN 0 AND 299
  RETURNING
    session_id, release_id, study_id, l1, participant_link_hmac, submission_link_hmac,
    allocation_index, route_id, status, next_testlet_ordinal, completed_testlets,
    response_count, breaks_completed, completed_at
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
          sessionId, study.release_id, study.study_id, study.l1, links.participant, links.submission,
          tokenHash, tokenExpiresAt, now, now
        ),
        env.DB.prepare(`
          INSERT INTO session_events (event_id, session_id, event_type, event_ordinal, payload_sha256, occurred_at)
          SELECT ?, session_id, 'session_started', 0, ?, ? FROM sessions WHERE session_id = ?
        `).bind(crypto.randomUUID(), startPayloadHash, now, sessionId)
      ]);
      const allocated = results[0].results[0] as SessionRow | undefined;
      if (!allocated) httpError(409, "STUDY_CAPACITY_REACHED", "This study stratum has reached its planned capacity.");
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
      allocation_index, route_id, status, next_testlet_ordinal, completed_testlets,
      response_count, breaks_completed, completed_at
    FROM sessions
    WHERE session_id = ? AND token_sha256 = ? AND release_id = ? AND token_expires_at > ?
  `).bind(cookie.sessionId, tokenHash, env.EXPECTED_RELEASE_ID, now).first<SessionRow>();
  if (!session) httpError(401, "SESSION_REQUIRED", "A valid Prolific study session is required.");
  return session;
}

function assertSessionCounters(session: SessionRow): void {
  if (!Number.isInteger(session.next_testlet_ordinal) || !Number.isInteger(session.completed_testlets) ||
      !Number.isInteger(session.response_count) || !Number.isInteger(session.breaks_completed) ||
      session.next_testlet_ordinal !== session.completed_testlets ||
      session.response_count !== session.completed_testlets * 3 ||
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

async function publicTestletFromRow(row: RuntimeTestletRow): Promise<PublicRuntimeTestlet> {
  let optionsValue: unknown;
  let itemsValue: unknown;
  try {
    optionsValue = JSON.parse(row.options_json);
    itemsValue = JSON.parse(row.items_json);
  } catch {
    throw new Error("Invalid private runtime JSON");
  }
  if (!SHA256_PATTERN.test(row.content_sha256) || typeof row.module_id !== "string" ||
      row.module_id.trim() !== row.module_id || utf8Length(row.module_id) < 1 || utf8Length(row.module_id) > 128 ||
      containsAnalyticKey(optionsValue) || containsAnalyticKey(itemsValue) ||
      !Array.isArray(optionsValue) || optionsValue.length !== 6 ||
      optionsValue.some((option) => typeof option !== "string" || option.trim() !== option || utf8Length(option) < 1 || utf8Length(option) > 256) ||
      new Set(optionsValue).size !== 6 || !Array.isArray(itemsValue) || itemsValue.length !== 3) {
    throw new Error("Invalid private runtime testlet");
  }
  const items = itemsValue.map((value, index): PublicRuntimeItem => {
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
  return { testletId: row.testlet_id, options, items };
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

async function statePayload(env: Env, session: SessionRow): Promise<JsonObject> {
  assertSessionCounters(session);
  let nextStep: JsonObject;
  if (session.status === "completed") {
    nextStep = { kind: "completed" };
  } else if (session.completed_testlets === TOTAL_TESTLETS) {
    if (session.response_count !== TOTAL_RESPONSES || session.breaks_completed !== TOTAL_BREAKS) {
      throw new Error("Invalid completion-ready counters");
    }
    nextStep = { kind: "complete_ready" };
  } else {
    const requiredBreaks = Math.min(TOTAL_BREAKS, Math.floor(session.completed_testlets / 10));
    if (session.breaks_completed < requiredBreaks) {
      nextStep = {
        kind: "break",
        after_module_position: session.breaks_completed + 1,
        before_module_position: session.breaks_completed + 2
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
        testlet: await publicTestletFromRow(row)
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
    SELECT testlet_ordinal, idempotency_key, payload_sha256
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
      collectionEnabled = readinessIsComplete(
        row,
        expectedIdentity,
        `sha256:${actualHmacKeyHash}`,
        `sha256:${actualCompletionCodeHash}`,
        publicBuild,
        env.CF_VERSION_METADATA?.tag ?? null
      );
    }
  }
  return jsonResponse({
    ok: true,
    collection_enabled: collectionEnabled,
    protocol_version: "uvlt-fixed-ab-worker-v1",
    total_testlets: TOTAL_TESTLETS,
    total_item_responses: TOTAL_RESPONSES,
    required_breaks: TOTAL_BREAKS,
    practice_enabled: false,
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

async function handleTestletResponse(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const body = parseTestletSubmission(await readBoundedJson(request, 4096));
  const session = await authenticateSession(request, env);
  if (session.status !== "in_progress") httpError(409, "SESSION_COMPLETED", "This study session is already complete.");

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
        existing.payload_sha256 !== payloadHash) {
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
  const runtimeTestlet = await publicTestletFromRow(runtimeRow);
  if (body.selectedOptions.some((option) => !runtimeTestlet.options.includes(option))) {
    httpError(400, "INVALID_RESPONSE", "The testlet response was not valid.");
  }
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT INTO testlet_submissions (
        session_id, testlet_ordinal, testlet_id, idempotency_key, payload_sha256,
        client_started_at, client_submitted_at, elapsed_ms, received_at
      )
      SELECT session_id, ?, ?, ?, ?, ?, ?, ?, ?
      FROM sessions
      WHERE session_id = ? AND status = 'in_progress' AND next_testlet_ordinal = ? AND breaks_completed = ?
    `).bind(
      body.testletOrdinal, runtimeTestlet.testletId, body.idempotencyKey, payloadHash,
      body.clientStartedAt, body.clientSubmittedAt, body.elapsedMs, now,
      session.session_id, body.testletOrdinal, requiredBreaks
    )
  ];
  runtimeTestlet.items.forEach((item, index) => {
    statements.push(env.DB.prepare(`
      INSERT INTO responses (
        session_id, response_ordinal, testlet_ordinal, testlet_id, item_id,
        item_position_within_testlet, selected_option, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      session.session_id, body.testletOrdinal * 3 + index + 1, body.testletOrdinal,
      runtimeTestlet.testletId, item.itemId, index + 1, body.selectedOptions[index], now
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
        raced.payload_sha256 !== payloadHash) {
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
    return jsonResponse(await statePayload(env, session));
  }
  if (afterModule !== session.breaks_completed + 1 || session.next_testlet_ordinal !== afterModule * 10) {
    httpError(409, "BREAK_OUT_OF_ORDER", "Only the required module break can be completed.");
  }
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE sessions SET breaks_completed = breaks_completed + 1, updated_at = ?
        WHERE session_id = ? AND status = 'in_progress' AND breaks_completed = ? AND next_testlet_ordinal = ?
      `).bind(now, session.session_id, afterModule - 1, afterModule * 10),
      env.DB.prepare(`
        INSERT INTO session_events (event_id, session_id, event_type, event_ordinal, payload_sha256, occurred_at)
        SELECT ?, session_id, 'break_completed', ?, ?, ?
        FROM sessions WHERE session_id = ? AND breaks_completed = ?
      `).bind(crypto.randomUUID(), afterModule, payloadHash, now, session.session_id, afterModule)
    ]);
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
      (SELECT COUNT(*) FROM testlet_submissions ts WHERE ts.session_id = ?) AS submission_count,
      (SELECT COUNT(*) FROM responses r WHERE r.session_id = ?) AS response_count,
      (SELECT COUNT(*) FROM session_events e WHERE e.session_id = ? AND e.event_type = 'break_completed') AS break_count,
      (
        SELECT COUNT(*)
        FROM testlet_submissions ts
        LEFT JOIN runtime_route_testlets rr
          ON rr.release_id = ? AND rr.route_id = ? AND rr.testlet_ordinal = ts.testlet_ordinal AND rr.testlet_id = ts.testlet_id
        WHERE ts.session_id = ? AND rr.testlet_id IS NULL
      ) AS invalid_route_submission_count
  `).bind(
    session.session_id, session.session_id, session.session_id,
    session.release_id, session.route_id, session.session_id
  ).first<CompletionCountsRow>();
  if (!counts || session.completed_testlets !== TOTAL_TESTLETS || session.next_testlet_ordinal !== TOTAL_TESTLETS ||
      session.response_count !== TOTAL_RESPONSES || session.breaks_completed !== TOTAL_BREAKS ||
      counts.submission_count !== TOTAL_TESTLETS || counts.response_count !== TOTAL_RESPONSES ||
      counts.break_count !== TOTAL_BREAKS || counts.invalid_route_submission_count !== 0) {
    httpError(409, "SESSION_INCOMPLETE", "The full response and break record has not yet been verified.");
  }
  const now = new Date().toISOString();
  const payloadHash = await sha256Hex("uvlt-fixed-ab:v1:session_completed:100:300:9");
  try {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE sessions SET status = 'completed', completed_at = ?, completion_issued_at = ?, updated_at = ?
        WHERE session_id = ? AND status = 'in_progress' AND completed_testlets = 100 AND
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
    "/join", "/api/config", "/api/session/state",
    "/api/session/testlet-response", "/api/session/break-complete", "/api/session/complete"
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
          return redirectResponse("/");
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
