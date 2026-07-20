import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const privateDirectory = path.join(project, "cloudflare", "private");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolvePrivatePath(value, fallback, label) {
  const resolved = path.resolve(project, value || fallback);
  const relative = path.relative(privateDirectory, resolved);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `${label} must be a file inside cloudflare/private`);
  return resolved;
}

function parseArguments(argv) {
  const supported = new Set(["--release-config", "--wrangler-config"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(supported.has(key), `Unsupported argument ${key || "(missing)"}`);
    assert(value && !value.startsWith("--"), `${key} requires a path`);
    assert(!values.has(key), `${key} may be supplied only once`);
    values.set(key, value);
  }
  return {
    releaseConfigPath: resolvePrivatePath(values.get("--release-config"), "cloudflare/private/release-config.json", "Release config"),
    wranglerConfigPath: resolvePrivatePath(values.get("--wrangler-config"), "cloudflare/private/wrangler.production.json", "Wrangler config")
  };
}

async function readJson(file, label) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new Error(`${label} is missing: ${path.relative(project, file)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} must be strict JSON without comments: ${path.relative(project, file)}`);
  }
}

function assertNoSecretValues(value, label = "Wrangler config") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretValues(entry, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert(!/^(?:PARTICIPANT_HMAC_KEY|PROLIFIC_API_TOKEN|PROLIFIC_COMPLETION_CODE)$/i.test(key), `${label}.${key} must be stored only as a remote Cloudflare Worker secret`);
    assertNoSecretValues(nested, `${label}.${key}`);
  }
}

const { releaseConfigPath, wranglerConfigPath } = parseArguments(process.argv.slice(2));
const [release, wrangler, packageMetadata] = await Promise.all([
  readJson(releaseConfigPath, "Private release config"),
  readJson(wranglerConfigPath, "Private production Wrangler config"),
  readJson(path.join(project, "package.json"), "package.json")
]);

assert(release?.schemaVersion === "uvlt-fixed-ab-field-release-config-2", "Private release config schema is unsupported");
assert(release.active === true, "Private release config must be active before field deployment");
assert(typeof release.releaseId === "string" && /^[a-z0-9][a-z0-9._-]{7,127}$/.test(release.releaseId), "Private release ID is invalid");
assert(typeof release.appVersion === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(release.appVersion), "Private release appVersion is invalid");
assert(release.appVersion === packageMetadata?.version, "Private release appVersion must exactly match package.json version");
assert(release.expectedHashes && typeof release.expectedHashes === "object" && !Array.isArray(release.expectedHashes), "Private release expectedHashes must be an object");
for (const field of ["runtimeManifestPayloadSha256", "bankPayloadSha256", "routesPayloadSha256", "publicBuildManifestSha256"]) {
  assert(/^[0-9a-f]{64}$/.test(release.expectedHashes[field] || ""), `Private release expectedHashes.${field} is invalid`);
}
assert(/^sha256:[0-9a-f]{64}$/.test(release.participantHmacKeyFingerprint || ""), "Private release participantHmacKeyFingerprint is invalid");
assert(/^sha256:[0-9a-f]{64}$/.test(release.prolificCompletionCodeFingerprint || ""), "Private release prolificCompletionCodeFingerprint is invalid");
assert(["MANUALLY_REVIEW", "AUTOMATICALLY_APPROVE"].includes(release.prolificCompletionAction), "Private release prolificCompletionAction is invalid");

assertNoSecretValues(wrangler);
assert(wrangler.name === "uvlt-fixed-ab-calibration", "Production Worker name is invalid");
assert(wrangler.main === "../worker/index.ts", "Production Wrangler main must resolve from cloudflare/private to ../worker/index.ts");
assert(typeof wrangler.compatibility_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wrangler.compatibility_date), "Production compatibility_date is invalid");
assert(Array.isArray(wrangler.compatibility_flags) && wrangler.compatibility_flags.includes("nodejs_compat"), "Production Wrangler config must enable nodejs_compat");
assert(wrangler.workers_dev === false, "Production deployment must disable workers.dev");
assert(wrangler.preview_urls === false, "Production deployment must disable preview URLs");

assert(wrangler.assets?.directory === "../../dist", "Production assets directory must resolve from cloudflare/private to ../../dist");
assert(wrangler.assets?.binding === "ASSETS", "Production assets binding must be ASSETS");
assert(wrangler.assets?.run_worker_first === true, "Production assets must run the Worker first");
assert(wrangler.assets?.html_handling === "auto-trailing-slash", "Production assets html_handling is invalid");
assert(wrangler.assets?.not_found_handling === "none", "Production assets must not use SPA fallback routing");
assert(wrangler.version_metadata && typeof wrangler.version_metadata === "object" && !Array.isArray(wrangler.version_metadata), "Production must configure Worker version metadata");
assert(JSON.stringify(Object.keys(wrangler.version_metadata).sort()) === JSON.stringify(["binding"]), "Production version metadata must contain only its binding");
assert(wrangler.version_metadata.binding === "CF_VERSION_METADATA", "Production Worker version metadata binding must be CF_VERSION_METADATA");

assert(Array.isArray(wrangler.d1_databases) && wrangler.d1_databases.length === 1, "Production must configure exactly one D1 database");
const database = wrangler.d1_databases[0];
assert(database?.binding === "DB", "Production D1 binding must be DB");
assert(database.database_name === "uvlt-fixed-ab-calibration-production", "Production D1 database_name must be uvlt-fixed-ab-calibration-production");
assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(database.database_id || ""), "Production D1 database_id must be a non-placeholder UUID");
assert(database.database_id !== "00000000-0000-0000-0000-000000000000", "Production D1 database_id is still the placeholder");
assert(database.migrations_dir === "../migrations", "Production D1 migrations_dir must resolve from cloudflare/private to ../migrations");

assert(wrangler.vars && typeof wrangler.vars === "object" && !Array.isArray(wrangler.vars), "Production vars must be an object");
const expectedVariableNames = [
  "COLLECTION_MODE",
  "EXPECTED_RELEASE_ID",
  "EXPECTED_APP_VERSION",
  "EXPECTED_PUBLIC_BUILD_MANIFEST_SHA256",
  "EXPECTED_RUNTIME_MANIFEST_SHA256",
  "EXPECTED_BANK_SHA256",
  "EXPECTED_ROUTES_SHA256",
  "EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT",
  "EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT",
  "EXPECTED_PROLIFIC_COMPLETION_ACTION",
  "PROLIFIC_API_BASE_URL"
];
assert(JSON.stringify(Object.keys(wrangler.vars).sort()) === JSON.stringify(expectedVariableNames.sort()), "Production vars must contain exactly the eleven non-secret runtime variables");
assert(wrangler.vars.COLLECTION_MODE === "field", "Production COLLECTION_MODE must be field");
assert(wrangler.vars?.EXPECTED_RELEASE_ID === release.releaseId, "Production EXPECTED_RELEASE_ID must exactly match the active private release");
assert(wrangler.vars?.EXPECTED_APP_VERSION === release.appVersion, "Production EXPECTED_APP_VERSION must exactly match package.json and the active private release");
assert(wrangler.vars?.EXPECTED_PUBLIC_BUILD_MANIFEST_SHA256 === release.expectedHashes.publicBuildManifestSha256, "Production EXPECTED_PUBLIC_BUILD_MANIFEST_SHA256 must exactly match the active private release");
assert(wrangler.vars?.EXPECTED_RUNTIME_MANIFEST_SHA256 === release.expectedHashes.runtimeManifestPayloadSha256, "Production EXPECTED_RUNTIME_MANIFEST_SHA256 must exactly match the active private release");
assert(wrangler.vars?.EXPECTED_BANK_SHA256 === release.expectedHashes.bankPayloadSha256, "Production EXPECTED_BANK_SHA256 must exactly match the active private release");
assert(wrangler.vars?.EXPECTED_ROUTES_SHA256 === release.expectedHashes.routesPayloadSha256, "Production EXPECTED_ROUTES_SHA256 must exactly match the active private release");
assert(wrangler.vars?.EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT === release.participantHmacKeyFingerprint, "Production EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT must exactly match the active private release");
assert(wrangler.vars?.EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT === release.prolificCompletionCodeFingerprint, "Production EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT must exactly match the active private release");
assert(wrangler.vars?.EXPECTED_PROLIFIC_COMPLETION_ACTION === release.prolificCompletionAction, "Production EXPECTED_PROLIFIC_COMPLETION_ACTION must exactly match the active private release");
assert(wrangler.vars?.PROLIFIC_API_BASE_URL === "https://api.prolific.com", "Production Prolific API origin must be https://api.prolific.com");
assert(wrangler.observability?.enabled === true && wrangler.observability?.logs?.enabled === true, "Production structured logging must remain enabled");
assert(wrangler.observability?.logs?.invocation_logs === false, "Production invocation logs must remain disabled to protect launch query identifiers");
assert(wrangler.observability?.traces?.enabled === false, "Production traces must remain disabled to protect launch query identifiers");

assert(Array.isArray(wrangler.routes) && wrangler.routes.length === 1, "Production must configure exactly one custom-domain route");
const route = wrangler.routes[0];
assert(route && typeof route === "object" && !Array.isArray(route) && route.custom_domain === true, "Production route must be a custom domain");
assert(typeof route.pattern === "string" && /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(route.pattern) && route.pattern.includes("."), "Production custom-domain pattern must be one lowercase hostname without a scheme, path, port, wildcard, or trailing dot");
const productionHostname = route.pattern.toLowerCase();
const productionLabels = productionHostname.split(".");
assert(productionLabels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)), "Production custom domain contains an invalid DNS label");
assert(!/^\d+(?:\.\d+){3}$/.test(productionHostname), "Production custom domain must not be an IPv4 address");
const forbiddenExactDomains = ["example.edu", "example.com", "example.net", "example.org", "workers.dev", "pages.dev"];
const forbiddenSuffixes = [".example", ".invalid", ".test", ".localhost", ".workers.dev", ".pages.dev"];
assert(!forbiddenExactDomains.some(domain => productionHostname === domain || productionHostname.endsWith(`.${domain}`)), "Production custom domain is still an example-domain placeholder");
assert(productionHostname !== "localhost" && !forbiddenSuffixes.some(suffix => productionHostname.endsWith(suffix)), "Production custom domain uses a reserved or provider-owned suffix");

console.log(JSON.stringify({
  ok: true,
  releaseId: release.releaseId,
  appVersion: release.appVersion,
  expectedWorkerVersionTag: release.releaseId,
  collectionMode: "field",
  customDomainConfigured: true,
  d1DatabaseConfigured: true,
  releaseIdentityVerified: true,
  secretValuesRead: false
}, null, 2));
