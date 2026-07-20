import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const argumentsMap = new Map();
let requireActive = false;
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (key === "--require-active") {
    assert(!requireActive, "--require-active may be supplied only once");
    requireActive = true;
    continue;
  }
  if (!["--config", "--output"].includes(key)) {
    throw new Error("Arguments must be --config <path>, --output <path>, and/or --require-active");
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${key} requires a path`);
  if (argumentsMap.has(key)) throw new Error(`${key} may be supplied only once`);
  argumentsMap.set(key, value);
  index += 1;
}

const configPath = path.resolve(project, argumentsMap.get("--config") || "cloudflare/release-config.example.json");
const outputPath = path.resolve(project, argumentsMap.get("--output") || "cloudflare/private/runtime-seed.sql");
const dataDirectory = path.join(project, "data");
const privateDirectory = path.join(project, "cloudflare", "private");
const privateOutputRelative = path.relative(privateDirectory, outputPath);
assert(privateOutputRelative && !privateOutputRelative.startsWith("..") && !path.isAbsolute(privateOutputRelative), "Seed output must be a file inside cloudflare/private");

function stableStringify(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in release input");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  throw new Error("Release input must contain JSON-compatible plain values only");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function payloadHash(artifact) {
  const copy = structuredClone(artifact);
  delete copy.integrity.payloadSha256;
  return sha256(stableStringify(copy));
}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function assertPlainObject(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
}

function assertExactKeys(value, expected, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted), `${label} fields must be exactly ${wanted.join(", ")}`);
}

function assertBoundedString(value, label, { min = 1, max, pattern } = {}) {
  assert(typeof value === "string", `${label} must be a string`);
  assert(value.length >= min && value.length <= max, `${label} must contain ${min}-${max} characters`);
  assert(value === value.trim(), `${label} must not contain leading or trailing whitespace`);
  assert(value === value.normalize("NFC"), `${label} must use NFC Unicode normalization`);
  assert(!/[\u0000-\u001f\u007f]/u.test(value), `${label} must not contain control characters`);
  if (pattern) assert(pattern.test(value), `${label} has an invalid format`);
  return value;
}

function assertIsoDateTime(value, label) {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), `${label} must be an ISO date-time`);
  assert(new Date(value).toISOString() === value, `${label} must be a canonical UTC ISO date-time`);
}

function assertCollectionReadyArtifact(artifact, label) {
  assert(artifact.technicalOnly === false, `${label} must not be technical-only for an active release`);
  assert(artifact.developmentOnly === false, `${label} must not be development-only for an active release`);
  assert(artifact.operationallyFrozen === true, `${label} must be operationally frozen for an active release`);
  assert(artifact.participantCollectionAllowed === true, `${label} must explicitly allow participant collection`);
}

function inspectForbiddenFields(value, pathLabel = "release") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectForbiddenFields(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const forbidden = /^(?:correctOption|correct_option|answerKey|answer_key|score|isCorrect|is_correct|theta|ability|difficulty|discrimination|guessing|information|standardError|standard_error)$/i;
  for (const [key, nested] of Object.entries(value)) {
    assert(!forbidden.test(key), `${pathLabel}.${key} is forbidden in the keyless field seed`);
    inspectForbiddenFields(nested, `${pathLabel}.${key}`);
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

const [config, packageMetadata, manifest, bank, routes, publicBuildManifestRawBytes] = await Promise.all([
  readJson(configPath),
  readJson(path.join(project, "package.json")),
  readJson(path.join(dataDirectory, "runtime-manifest.dev.json")),
  readJson(path.join(dataDirectory, "uvlt_bank.ab.content.dev.json")),
  readJson(path.join(dataDirectory, "uvlt_routes.ab.williams10.dev.json")),
  readFile(path.join(project, "dist", "build-manifest.json"))
]);
let publicBuildManifest;
try {
  publicBuildManifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(publicBuildManifestRawBytes));
} catch {
  throw new Error("dist/build-manifest.json must be valid UTF-8 JSON");
}
const [bankRawBytes, routesRawBytes] = await Promise.all([
  readFile(path.join(dataDirectory, "uvlt_bank.ab.content.dev.json")),
  readFile(path.join(dataDirectory, "uvlt_routes.ab.williams10.dev.json"))
]);

assertExactKeys(config, ["schemaVersion", "releaseId", "appVersion", "createdAt", "frozenAt", "active", "participantHmacKeyFingerprint", "prolificCompletionCodeFingerprint", "prolificCompletionAction", "expectedHashes", "approvals", "studies"], "Release config");
assert(config.schemaVersion === "uvlt-fixed-ab-field-release-config-2", "Unsupported release config schema");
assertBoundedString(config.releaseId, "releaseId", { min: 8, max: 128, pattern: /^[a-z0-9][a-z0-9._-]+$/ });
assertBoundedString(config.appVersion, "appVersion", { min: 8, max: 128, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]+$/ });
assertPlainObject(packageMetadata, "package.json");
assertBoundedString(packageMetadata.version, "package.json version", { min: 1, max: 128, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ });
assert(config.appVersion === packageMetadata.version, "Release appVersion must exactly match package.json version");
assertIsoDateTime(config.createdAt, "createdAt");
assert(config.frozenAt === null || typeof config.frozenAt === "string", "frozenAt must be null or an ISO date-time");
if (config.frozenAt !== null) {
  assertIsoDateTime(config.frozenAt, "frozenAt");
  assert(Date.parse(config.frozenAt) >= Date.parse(config.createdAt), "frozenAt must not precede createdAt");
}
assert(typeof config.active === "boolean", "active must be boolean");
assert(!requireActive || config.active, "Deployment seed generation requires an active release config");
assert(config.participantHmacKeyFingerprint === null || /^sha256:[0-9a-f]{64}$/.test(config.participantHmacKeyFingerprint), "participantHmacKeyFingerprint must be null or sha256:<64 lowercase hex>");
assert(config.prolificCompletionCodeFingerprint === null || /^sha256:[0-9a-f]{64}$/.test(config.prolificCompletionCodeFingerprint), "prolificCompletionCodeFingerprint must be null or sha256:<64 lowercase hex>");
assert(config.prolificCompletionAction === null || ["MANUALLY_REVIEW", "AUTOMATICALLY_APPROVE"].includes(config.prolificCompletionAction), "prolificCompletionAction must be null, MANUALLY_REVIEW, or AUTOMATICALLY_APPROVE");
assert(manifest.schemaVersion === "uvlt-fixed-ab-runtime-manifest-1.0", "Unsupported runtime manifest schema");
assert(bank.schemaVersion === "uvlt-fixed-ab-content-snapshot-1.0", "Unsupported bank schema");
assert(routes.schemaVersion === "uvlt-fixed-ab-routes-snapshot-1.0", "Unsupported routes schema");
assertPlainObject(manifest.integrity, "Runtime manifest integrity");
assertPlainObject(bank.integrity, "Bank integrity");
assertPlainObject(routes.integrity, "Routes integrity");
assert(payloadHash(manifest) === manifest.integrity.payloadSha256, "Runtime manifest payload hash is invalid");
assert(payloadHash(bank) === bank.integrity.payloadSha256, "Bank payload hash is invalid");
assert(payloadHash(routes) === routes.integrity.payloadSha256, "Routes payload hash is invalid");
assertExactKeys(publicBuildManifest, ["schemaVersion", "appVersion", "files"], "Public build manifest");
assert(publicBuildManifest.schemaVersion === "uvlt-field-public-build-2", "Unsupported public build manifest schema");
assert(publicBuildManifest.appVersion === packageMetadata.version, "Public build manifest appVersion must exactly match package.json version");
assert(Array.isArray(publicBuildManifest.files), "Public build manifest files must be an array");
assertExactKeys(config.expectedHashes, ["runtimeManifestPayloadSha256", "bankPayloadSha256", "routesPayloadSha256", "publicBuildManifestSha256"], "expectedHashes");
for (const [field, value] of Object.entries(config.expectedHashes)) {
  assert(/^[0-9a-f]{64}$/.test(value || ""), `expectedHashes.${field} must be a lowercase SHA-256 value`);
}
assert(config.expectedHashes.runtimeManifestPayloadSha256 === manifest.integrity.payloadSha256, "Release config does not pin this runtime manifest");
assert(config.expectedHashes.bankPayloadSha256 === bank.integrity.payloadSha256, "Release config does not pin this bank");
assert(config.expectedHashes.routesPayloadSha256 === routes.integrity.payloadSha256, "Release config does not pin this route set");
assert(config.expectedHashes.publicBuildManifestSha256 === sha256(publicBuildManifestRawBytes), "Release config does not pin this public build manifest");
assert(Array.isArray(manifest.artifacts), "Runtime manifest artifacts must be an array");
const manifestArtifacts = new Map();
for (const [index, artifact] of manifest.artifacts.entries()) {
  assertPlainObject(artifact, `Runtime manifest artifacts[${index}]`);
  assertBoundedString(artifact.role, `Runtime manifest artifacts[${index}].role`, { min: 4, max: 16, pattern: /^[a-z]+$/ });
  assert(!manifestArtifacts.has(artifact.role), `Runtime manifest contains duplicate ${artifact.role} roles`);
  manifestArtifacts.set(artifact.role, artifact);
}
for (const [role, artifact, expectedFileName, source, rawBytes] of [
  ["bank", manifestArtifacts.get("bank"), "uvlt_bank.ab.content.dev.json", bank, bankRawBytes],
  ["routes", manifestArtifacts.get("routes"), "uvlt_routes.ab.williams10.dev.json", routes, routesRawBytes]
]) {
  assertPlainObject(artifact, `Runtime manifest ${role} artifact`);
  assert(artifact.fileName === expectedFileName, `Runtime manifest ${role} filename is invalid`);
  assert(artifact.schemaVersion === source.schemaVersion, `Runtime manifest ${role} schema does not match its artifact`);
  assert(artifact.payloadSha256 === source.integrity.payloadSha256, `Runtime manifest ${role} payload hash does not match its artifact`);
  assert(artifact.contentSha256 === source.integrity.contentSha256, `Runtime manifest ${role} content hash does not match its artifact`);
  assert(artifact.rawFileSha256 === sha256(rawBytes), `Runtime manifest ${role} raw file hash does not match its artifact`);
  assert(artifact.containsCanonicalAnswerKey === false, `Runtime manifest ${role} must declare that it contains no canonical answer key`);
}
assertPlainObject(routes.sourceBank, "Routes sourceBank");
assert(routes.sourceBank.packId === bank.packId, "Routes sourceBank packId does not match the bank");
assert(routes.sourceBank.payloadSha256 === bank.integrity.payloadSha256, "Routes sourceBank payload hash does not match the bank");
assert(routes.sourceBank.contentSha256 === bank.integrity.contentSha256, "Routes sourceBank content hash does not match the bank");
inspectForbiddenFields(bank, "bank");
inspectForbiddenFields(routes, "routes");

const approvals = config.approvals;
const requiredApprovals = [
  "contentOwnerApprovalRecorded",
  "authoritativeAnswerKeyApprovalRecorded",
  "participantInformationAndConsentApproved",
  "japaneseAndVietnameseInstructionReviewRecorded",
  "timingPilotCompleted",
  "ethicsApprovalRecorded",
  "privacyRetentionDeletionPlanRecorded",
  "protectedDataReceiptVerified",
  "independentPrelaunchReviewCompleted"
];
assertExactKeys(approvals, requiredApprovals, "approvals");
for (const field of requiredApprovals) assert(typeof approvals[field] === "boolean", `approvals.${field} must be boolean`);

assert(Array.isArray(config.studies), "studies must be an array");
const studies = config.studies;
const seenStudyIds = new Set();
for (const [index, study] of studies.entries()) {
  assertExactKeys(study, ["studyId", "l1", "active"], `studies[${index}]`);
  assert(/^[0-9a-f]{24}$/.test(study.studyId || ""), `studies[${index}].studyId must be a 24-character lowercase hex ID`);
  assert(["ja", "vi"].includes(study.l1), `studies[${index}].l1 must be ja or vi`);
  assert(typeof study.active === "boolean", `studies[${index}].active must be boolean`);
  assert(!study.active || config.active, `studies[${index}] cannot be active when the release is inactive`);
  assert(!seenStudyIds.has(study.studyId), `Duplicate studyId ${study.studyId}`);
  seenStudyIds.add(study.studyId);
}
if (config.active) {
  assert(requiredApprovals.every(field => approvals[field] === true), "An active release requires every approval gate to be true");
  assert(config.frozenAt !== null, "An active release requires frozenAt");
  assert(/^sha256:[0-9a-f]{64}$/.test(config.participantHmacKeyFingerprint || ""), "An active release requires participantHmacKeyFingerprint");
  assert(/^sha256:[0-9a-f]{64}$/.test(config.prolificCompletionCodeFingerprint || ""), "An active release requires prolificCompletionCodeFingerprint");
  assert(["MANUALLY_REVIEW", "AUTOMATICALLY_APPROVE"].includes(config.prolificCompletionAction), "An active release requires prolificCompletionAction");
  assert(studies.length === 2, "An active release requires exactly two Prolific studies");
  assert(new Set(studies.map(study => study.l1)).size === 2, "Active studies must contain one ja and one vi stratum");
  assert(studies.every(study => study.active === true), "Every study must be active when the release is active");
  assertCollectionReadyArtifact(manifest, "Runtime manifest");
  assertCollectionReadyArtifact(bank, "Bank");
  assertCollectionReadyArtifact(routes, "Routes");
}

assert(Array.isArray(bank.testlets) && bank.testlets.length === 100, "Bank must contain exactly 100 testlets");
assert(Array.isArray(routes.routes) && routes.routes.length === 10, "Route set must contain exactly 10 routes");
const testlets = new Map();
const seenItemIds = new Set();
const moduleTestletIds = new Map();
for (const [index, source] of bank.testlets.entries()) {
  assertPlainObject(source, `bank.testlets[${index}]`);
  assertBoundedString(source.testletId, `bank.testlets[${index}].testletId`, { min: 13, max: 13, pattern: /^uvlt_[ab]_[1-5]k_t(?:0[1-9]|10)$/ });
  assert(!testlets.has(source.testletId), `Duplicate bank testlet ${source.testletId}`);
  assert(["A", "B"].includes(source.formId), `${source.testletId} has an invalid formId`);
  assert(source.form === source.formId, `${source.testletId} form and formId must agree`);
  assert(["1k", "2k", "3k", "4k", "5k"].includes(source.band), `${source.testletId} has an invalid band`);
  const idMatch = source.testletId.match(/^uvlt_([ab])_([1-5]k)_t(?:0[1-9]|10)$/);
  assert(idMatch[1].toUpperCase() === source.formId && idMatch[2] === source.band, `${source.testletId} metadata does not match its ID`);
  const expectedModuleId = `${source.formId}:${source.band}`;
  assertBoundedString(source.moduleId, `${source.testletId}.moduleId`, { min: 4, max: 4, pattern: /^[AB]:[1-5]k$/ });
  assert(source.moduleId === expectedModuleId, `${source.testletId} has an inconsistent moduleId`);
  assert(Array.isArray(source.options) && source.options.length === 6, `${source.testletId} must have six options`);
  source.options.forEach((option, optionIndex) => {
    assertBoundedString(option, `${source.testletId}.options[${optionIndex}]`, { min: 1, max: 80 });
  });
  assert(new Set(source.options).size === 6, `${source.testletId} must have six unique options`);
  assert(new Set(source.options.map(option => option.toLocaleLowerCase("en-US"))).size === 6, `${source.testletId} options must also be unique ignoring case`);
  assert(Array.isArray(source.items) && source.items.length === 3, `${source.testletId} must have three items`);
  const items = source.items.map((item, itemIndex) => {
    assertPlainObject(item, `${source.testletId}.items[${itemIndex}]`);
    assertBoundedString(item.itemId, `${source.testletId}.items[${itemIndex}].itemId`, { min: 17, max: 17, pattern: /^uvlt_[ab]_[1-5]k_t(?:0[1-9]|10)_i0[1-3]$/ });
    assert(item.itemId === `${source.testletId}_i${String(itemIndex + 1).padStart(2, "0")}`, `${item.itemId} does not match its testlet position`);
    assert(!seenItemIds.has(item.itemId), `Duplicate itemId ${item.itemId}`);
    seenItemIds.add(item.itemId);
    assertBoundedString(item.prompt, `${item.itemId}.prompt`, { min: 1, max: 240 });
    assert(item.itemPositionWithinTestlet === itemIndex + 1, `${item.itemId} has an inconsistent itemPositionWithinTestlet`);
    return {
      itemId: item.itemId,
      prompt: item.prompt,
      itemPositionWithinTestlet: itemIndex + 1
    };
  });
  const payload = {
    testletId: source.testletId,
    moduleId: source.moduleId,
    options: [...source.options],
    items
  };
  testlets.set(source.testletId, {
    ...payload,
    formId: source.formId,
    band: source.band,
    contentSha256: sha256(stableStringify(payload))
  });
  const moduleMembers = moduleTestletIds.get(source.moduleId) || [];
  moduleMembers.push(source.testletId);
  moduleTestletIds.set(source.moduleId, moduleMembers);
}
assert(seenItemIds.size === 300, "Bank must contain exactly 300 globally unique item IDs");
const expectedModuleIds = ["A:1k", "A:2k", "A:3k", "A:4k", "A:5k", "B:1k", "B:2k", "B:3k", "B:4k", "B:5k"];
assert(expectedModuleIds.every(moduleId => moduleTestletIds.get(moduleId)?.length === 10), "Bank must contain exactly 10 testlets in each expected module");

const expectedRouteIds = Array.from({ length: 10 }, (_value, index) => `R${String(index + 1).padStart(2, "0")}`);
const routeRows = [];
assert(routes.moduleCount === 10 && routes.testletsPerModule === 10 && routes.testletCount === 100, "Routes summary counts are invalid");
for (const [routeIndex, route] of routes.routes.entries()) {
  assertPlainObject(route, `routes.routes[${routeIndex}]`);
  assertBoundedString(route.routeId, `routes.routes[${routeIndex}].routeId`, { min: 3, max: 3, pattern: /^R(?:0[1-9]|10)$/ });
  assert(route.routeId === expectedRouteIds[routeIndex], `Route array must be in canonical R01-R10 order`);
  assert(route.sequenceIndex === routeIndex, `${route.routeId} has an invalid sequenceIndex`);
  assert(Array.isArray(route.moduleOrder) && route.moduleOrder.length === 10, `${route.routeId} must have 10 module IDs`);
  route.moduleOrder.forEach((moduleId, moduleIndex) => {
    assertBoundedString(moduleId, `${route.routeId}.moduleOrder[${moduleIndex}]`, { min: 4, max: 4, pattern: /^[AB]:[1-5]k$/ });
  });
  assert(new Set(route.moduleOrder).size === 10 && expectedModuleIds.every(moduleId => route.moduleOrder.includes(moduleId)), `${route.routeId} must contain every module exactly once`);
  assert(Array.isArray(route.modules) && route.modules.length === 10, `${route.routeId} must contain 10 module records`);
  const flattenedModuleOrder = [];
  route.modules.forEach((module, moduleIndex) => {
    assertPlainObject(module, `${route.routeId}.modules[${moduleIndex}]`);
    const moduleId = route.moduleOrder[moduleIndex];
    assert(module.moduleId === moduleId, `${route.routeId} module ${moduleIndex + 1} does not match moduleOrder`);
    assert(module.modulePosition === moduleIndex + 1, `${route.routeId} ${moduleId} has an invalid modulePosition`);
    assert(module.form === moduleId.slice(0, 1), `${route.routeId} ${moduleId} has an invalid form`);
    assert(module.band === moduleId.slice(2), `${route.routeId} ${moduleId} has an invalid band`);
    assert(Array.isArray(module.testletOrder) && module.testletOrder.length === 10, `${route.routeId} ${moduleId} must contain 10 testlets`);
    assert(new Set(module.testletOrder).size === 10, `${route.routeId} ${moduleId} contains duplicate testlets`);
    const expectedMembers = moduleTestletIds.get(moduleId);
    assert(expectedMembers.every(testletId => module.testletOrder.includes(testletId)), `${route.routeId} ${moduleId} does not contain the exact bank module`);
    flattenedModuleOrder.push(...module.testletOrder);
  });
  assert(Array.isArray(route.testletOrder) && route.testletOrder.length === 100, `${route.routeId} must contain 100 testlets`);
  assert(new Set(route.testletOrder).size === 100, `${route.routeId} contains duplicate testlets`);
  assert(route.testletOrder.every((testletId, index) => testletId === flattenedModuleOrder[index]), `${route.routeId} flat testletOrder does not match its module records`);
  route.testletOrder.forEach((testletId, testletOrdinal) => {
    assert(testlets.has(testletId), `${route.routeId} references unknown ${testletId}`);
    routeRows.push({
      routeId: route.routeId,
      testletOrdinal,
      modulePosition: Math.floor(testletOrdinal / 10) + 1,
      testletPositionWithinModule: (testletOrdinal % 10) + 1,
      testletId
    });
  });
}
assert(new Set(routes.routes.map(route => route.routeId)).size === 10, "Route IDs must be unique");

const lines = [
  "PRAGMA foreign_keys = ON;",
  "BEGIN TRANSACTION;",
  "",
  "INSERT INTO runtime_releases (",
  "  release_id, app_version, public_build_manifest_sha256, runtime_manifest_sha256, bank_sha256, routes_sha256, participant_hmac_key_fingerprint,",
  "  prolific_completion_code_fingerprint, prolific_completion_action,",
  "  expected_testlets, expected_items, expected_breaks, active, created_at, frozen_at",
  ") VALUES (",
  `  ${sql(config.releaseId)}, ${sql(config.appVersion)}, ${sql(config.expectedHashes.publicBuildManifestSha256)}, ${sql(manifest.integrity.payloadSha256)},`,
  `  ${sql(bank.integrity.payloadSha256)}, ${sql(routes.integrity.payloadSha256)}, ${sql(config.participantHmacKeyFingerprint)},`,
  `  ${sql(config.prolificCompletionCodeFingerprint)}, ${sql(config.prolificCompletionAction)},`,
  `  100, 300, 9, 0, ${sql(config.createdAt)}, ${sql(config.frozenAt)}`,
  ");",
  ""
];

for (const study of studies) {
  lines.push(
    "INSERT INTO studies (study_id, release_id, l1, active, created_at) VALUES (" +
      `${sql(study.studyId)}, ${sql(config.releaseId)}, ${sql(study.l1)}, 0, ${sql(config.createdAt)});`
  );
}
if (studies.length) lines.push("");

for (const testlet of testlets.values()) {
  lines.push(
    "INSERT INTO runtime_testlets (release_id, testlet_id, module_id, form_id, band, options_json, items_json, content_sha256) VALUES (" +
      `${sql(config.releaseId)}, ${sql(testlet.testletId)}, ${sql(testlet.moduleId)}, ${sql(testlet.formId)}, ${sql(testlet.band)}, ` +
      `${sql(JSON.stringify(testlet.options))}, ${sql(JSON.stringify(testlet.items))}, ${sql(testlet.contentSha256)});`
  );
}
lines.push("");

for (const row of routeRows) {
  lines.push(
    "INSERT INTO runtime_route_testlets (release_id, route_id, testlet_ordinal, module_position, testlet_position_within_module, testlet_id) VALUES (" +
      `${sql(config.releaseId)}, ${sql(row.routeId)}, ${row.testletOrdinal}, ${row.modulePosition}, ${row.testletPositionWithinModule}, ${sql(row.testletId)});`
  );
}

if (config.active) {
  lines.push("");
  for (const study of studies) {
    lines.push(
      `UPDATE studies SET active = 1 WHERE study_id = ${sql(study.studyId)} AND release_id = ${sql(config.releaseId)} AND active = 0;`
    );
  }
  lines.push(
    `UPDATE runtime_releases SET active = 1 WHERE release_id = ${sql(config.releaseId)} AND active = 0;`
  );
}

lines.push("", "COMMIT;", "");
await mkdir(path.dirname(outputPath), { recursive: true });
const temporaryOutputPath = `${outputPath}.tmp-${process.pid}`;
await writeFile(temporaryOutputPath, lines.join("\n"), { encoding: "utf8", mode: 0o600 });
await rename(temporaryOutputPath, outputPath);
await chmod(outputPath, 0o600);

console.log(JSON.stringify({
  ok: true,
  output: path.relative(project, outputPath),
  releaseId: config.releaseId,
  appVersion: config.appVersion,
  publicBuildManifestSha256: config.expectedHashes.publicBuildManifestSha256,
  active: config.active,
  participantHmacKeyFingerprintConfigured: config.participantHmacKeyFingerprint !== null,
  prolificCompletionCodeFingerprintConfigured: config.prolificCompletionCodeFingerprint !== null,
  prolificCompletionAction: config.prolificCompletionAction,
  studies: studies.length,
  testlets: testlets.size,
  routeRows: routeRows.length,
  answerKeysIncluded: false,
  scoringFieldsIncluded: false
}, null, 2));
