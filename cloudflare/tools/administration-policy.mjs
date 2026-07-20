import { createHash } from "node:crypto";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function stableAdministrationJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value), "Administration policy cannot contain a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableAdministrationJson).join(",")}]`;
  }
  assert(value && typeof value === "object", "Administration policy contains an unsupported value");
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableAdministrationJson(value[key])}`).join(",")}}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const ADMINISTRATION_POLICY = deepFreeze({
  schemaVersion: "uvlt-fixed-ab-administration-policy-1",
  preparation: {
    definition: "single-readiness-screen-before-interface-practice-v1",
    responsePersisted: false
  },
  practice: {
    completionEventPersisted: true,
    definition: "one-synthetic-interface-only-three-row-six-symbol-practice-v1",
    enabled: true,
    feedback: "generic-validity-only",
    mainResponseCountsAffected: false,
    requiredBeforeFirstMainTestlet: true,
    responsesPersisted: false
  },
  breaks: {
    backgroundAndReloadTimeCounts: true,
    completionDependent: true,
    count: 9,
    definition: "server-minimum-45s-standard-90s-after-module-5-v1",
    elapsedFrom: "module-final-testlet-server-received-at",
    midpointAfterModule: 5,
    midpointMinimumSeconds: 90,
    serverClockAuthoritative: true,
    standardMinimumSeconds: 45
  },
  progress: {
    definition: "neutral-module-set-and-server-committed-count-v1",
    showsEstimatedTime: false,
    showsOtherParticipantComparison: false,
    showsScore: false,
    showsSpeed: false
  },
  safeInterruption: {
    availableAt: "required-break-screens-only",
    definition: "break-boundary-guidance-without-server-event-v1",
    prolificTimerContinues: true
  },
  unsavedResponseGuard: {
    definition: "beforeunload-only-after-main-selection-until-server-confirmation-v1",
    transmitsUnsubmittedSelections: false
  },
  processData: {
    breakTiming: "derived-from-module-final-server-receipt-and-break-event-v1",
    clientTiming: "wall-start-submit-plus-monotonic-testlet-elapsed-v1",
    focusVisibilityEventsPersisted: false,
    qualityFlagsComputedAtRuntime: false,
    rawInputEventsPersisted: false,
    schemaVersion: "uvlt-fixed-ab-process-data-1",
    unsubmittedSelectionsPersisted: false
  }
});

export const ADMINISTRATION_POLICY_JSON = stableAdministrationJson(ADMINISTRATION_POLICY);
export const ADMINISTRATION_POLICY_SHA256 = createHash("sha256")
  .update(ADMINISTRATION_POLICY_JSON, "utf8")
  .digest("hex");
export const ADMINISTRATION_POLICY_APPROVAL_GATES = Object.freeze([
  "administrationPolicyIndependentReviewRecorded",
  "processDataEthicsPrivacyConsentApproved",
  "attentionAnalysisPreregistrationRecorded"
]);

export function validateAdministrationPolicy(policy) {
  assert(stableAdministrationJson(policy) === ADMINISTRATION_POLICY_JSON,
    "Administration policy does not match the supported frozen policy");
  return policy;
}

export function validateAdministrationPolicySha256(value) {
  assert(value === ADMINISTRATION_POLICY_SHA256,
    "Administration policy hash does not match the supported frozen policy");
  return value;
}
