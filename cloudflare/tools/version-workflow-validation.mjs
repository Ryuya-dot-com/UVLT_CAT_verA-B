export const WORKER_VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateVersionUploadRecords(records, { workerName }) {
  assert(Array.isArray(records), "Wrangler output must be an array of records");
  assert(!records.some(record => record?.type === "command-failed"),
    "Wrangler reported command-failed for the version upload");
  const uploads = records.filter(record =>
    record?.type === "version-upload" && record?.version === 1);
  assert(uploads.length === 1,
    "Wrangler output must contain exactly one version-upload record");
  const upload = uploads[0];
  assert(upload.worker_name === workerName,
    "Uploaded Worker name does not match the production configuration");
  assert(upload.worker_name_overridden === false,
    "Wrangler unexpectedly overrode the configured Worker name");
  assert(WORKER_VERSION_ID_PATTERN.test(upload.version_id || ""),
    "Cloudflare returned a non-canonical Worker version UUID");
  assert(upload.preview_url == null && upload.preview_alias_url == null,
    "Production version upload unexpectedly created a preview URL or alias");
  return upload;
}

export function validateVersionView(version, { workerVersionId, releaseId }) {
  assert(version?.id === workerVersionId,
    "Remote Worker version ID does not match the frozen release");
  assert(version?.annotations?.["workers/tag"] === releaseId,
    "Remote Worker version tag does not match the frozen release ID");
  return version;
}

export function validateUploadAttestation(attestation, {
  releaseId,
  appVersion,
  workerName,
  workerVersionId,
  nodeVersion,
  wranglerVersion,
  productionWranglerConfigSha256,
  releaseHandoffIdentitySha256,
  uploadInputsSha256,
  workerUploadInputsSha256
}) {
  assert(attestation?.schemaVersion === "uvlt-worker-version-upload-attestation-2",
    "Worker-version attestation schema is unsupported");
  assert(attestation.releaseId === releaseId && attestation.appVersion === appVersion,
    "Worker-version attestation does not match the finalized release");
  assert(attestation.workerName === workerName,
    "Worker-version attestation does not match the production Worker name");
  assert(attestation.workerVersionId === workerVersionId &&
    WORKER_VERSION_ID_PATTERN.test(attestation.workerVersionId || ""),
  "Worker-version attestation does not bind the finalized Worker version ID");
  assert(attestation.workerVersionTag === releaseId,
    "Worker-version attestation tag does not match the release ID");
  assert(attestation.wranglerVersion === wranglerVersion,
    "Worker-version attestation was produced by a different Wrangler version");
  assert(attestation.nodeVersion === nodeVersion,
    "Worker-version attestation was produced by a different Node.js version");
  assert(/^[0-9a-f]{64}$/.test(attestation.preuploadReleaseConfigSha256 || ""),
    "Worker-version attestation lacks the preupload release-config hash");
  assert(attestation.releaseHandoffIdentitySha256 === releaseHandoffIdentitySha256,
    "Final release changed outside the permitted post-upload lifecycle fields");
  assert(attestation.productionWranglerConfigSha256 === productionWranglerConfigSha256,
    "Production Wrangler config changed after the immutable version upload");
  assert(attestation.uploadInputsSha256 === uploadInputsSha256,
    "Worker source, assets, package metadata, lockfile, or production config changed after upload");
  assert(attestation.uploadInputs && typeof attestation.uploadInputs === "object" &&
    !Array.isArray(attestation.uploadInputs),
  "Worker-version attestation lacks its upload-input manifest");
  assert(workerUploadInputsSha256(attestation.uploadInputs) === attestation.uploadInputsSha256,
    "Worker-version attestation upload-input manifest is internally inconsistent");
  assert(typeof attestation.uploadedAt === "string" &&
    Number.isFinite(Date.parse(attestation.uploadedAt)) &&
    new Date(attestation.uploadedAt).toISOString() === attestation.uploadedAt,
  "Worker-version attestation upload time is invalid");
  return attestation;
}

export function validateDeploymentStatus(latestDeployment, workerVersionId) {
  assert(Array.isArray(latestDeployment?.versions),
    "Production deployment status does not contain a versions array");
  assert(latestDeployment.versions.length === 1,
    "Production deployment must route traffic to exactly one Worker version");
  const traffic = latestDeployment.versions[0];
  assert(traffic?.version_id === workerVersionId && traffic?.percentage === 100,
    "Production deployment does not route 100% of traffic to the frozen Worker version ID");
  return traffic;
}
