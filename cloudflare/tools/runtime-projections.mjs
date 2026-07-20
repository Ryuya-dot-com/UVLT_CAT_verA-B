import { sha256Hex, stableStringify } from "./randomization-design.mjs";

export const RUNTIME_BANK_PROJECTION_SCHEMA = "uvlt-d1-runtime-bank-projection-1";
export const RUNTIME_ROUTES_PROJECTION_SCHEMA = "uvlt-d1-runtime-routes-projection-1";

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalBankTestlet(testlet) {
  return {
    testletId: testlet.testletId,
    moduleId: testlet.moduleId,
    formId: testlet.formId,
    band: testlet.band,
    options: [...testlet.options],
    items: testlet.items.map((item) => ({
      itemId: item.itemId,
      prompt: item.prompt,
      itemPositionWithinTestlet: item.itemPositionWithinTestlet
    })),
    contentSha256: testlet.contentSha256
  };
}

function canonicalRouteRow(row) {
  return {
    routeId: row.routeId,
    testletOrdinal: row.testletOrdinal,
    modulePosition: row.modulePosition,
    testletPositionWithinModule: row.testletPositionWithinModule,
    testletId: row.testletId
  };
}

export function runtimeBankProjection(releaseId, testlets) {
  return {
    schemaVersion: RUNTIME_BANK_PROJECTION_SCHEMA,
    releaseId,
    testlets: [...testlets]
      .map(canonicalBankTestlet)
      .sort((left, right) => compareCodeUnits(left.testletId, right.testletId))
  };
}

export function runtimeRoutesProjection(releaseId, rows) {
  return {
    schemaVersion: RUNTIME_ROUTES_PROJECTION_SCHEMA,
    releaseId,
    rows: [...rows]
      .map(canonicalRouteRow)
      .sort((left, right) => compareCodeUnits(left.routeId, right.routeId) ||
        left.testletOrdinal - right.testletOrdinal)
  };
}

export function runtimeProjectionSha256(projection) {
  return sha256Hex(stableStringify(projection));
}
