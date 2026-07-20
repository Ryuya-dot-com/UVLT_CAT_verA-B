import { env as runtimeEnv } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker, { optionPermutationForLayout, sha256Hex } from "../worker/index";

const ORIGIN = "https://uvlt.example";
const RELEASE_ID = "release-test-v1";
const JA_STUDY_ID = "111111111111111111111111";
const VI_STUDY_ID = "222222222222222222222222";
const PARTICIPANT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const SUBMISSION_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const COMPLETION_CODE = "DONE1234";
const COMPLETION_ACTION = "MANUALLY_REVIEW";
const COOKIE_NAME_FOR_TEST = "__Host-uvlt_session";
const PARTICIPANT_HMAC_KEY = "test-only-hmac-key-with-at-least-32-bytes";
const APP_VERSION = "0.1.0-dev";
const PUBLIC_BUILD_MANIFEST = `${JSON.stringify({
  schemaVersion: "uvlt-field-public-build-2",
  appVersion: APP_VERSION,
  files: []
}, null, 2)}\n`;
const PUBLIC_BUILD_MANIFEST_SHA256 = "96a3bc87f488edb7bb822ab0ce235bf1eea61f8cac709797ab2637c9209db261";
const RUNTIME_MANIFEST_SHA256 = "1".repeat(64);
const BANK_SHA256 = "2".repeat(64);
const ROUTES_SHA256 = "3".repeat(64);
let RUNTIME_BANK_PROJECTION_SHA256 = "0".repeat(64);
let RUNTIME_ROUTES_PROJECTION_SHA256 = "0".repeat(64);
const ALLOCATION_SCHEDULE_SHA256 = "de02d7a732893d96108579fb8b80569b4b22bfc932c0a910512fd549de964063";
const RANDOMIZATION_SEED_FINGERPRINT = `sha256:${"4".repeat(64)}`;
const RANDOMIZATION_ALGORITHM = "hmac-sha256-permuted-blocks-10-crossed-option-williams-6-v1";
const OPTION_LAYOUT_ALGORITHM = "even-order-williams-square-6-canonical-first-v1";
const PARTICIPANT_HMAC_KEY_FINGERPRINT = "sha256:9df491e6b93f01674bba2b1840d9dbb6c14d847921709325d8405982ef5d42dc";
const COMPLETION_CODE_FINGERPRINT = "sha256:e02731629394086455f97e58d6c865f78f10dea4436f6ca51950ec7911519ef9";
const HEX_64 = /^[0-9a-f]{64}$/;
const ISO_UTC_PATTERN_FOR_TEST = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
let schemaGeneration = 0;

function currentWorkerVersionId(): string {
  return `11111111-1111-4111-8111-${String(schemaGeneration).padStart(12, "0")}`;
}

type TestBindings = Env & { TEST_MIGRATIONS: D1Migration[] };

const bindings = runtimeEnv as unknown as TestBindings;

function environmentWith(overrides: Record<string, unknown>): Env {
  return new Proxy(bindings, {
    get(target, property, receiver) {
      if (typeof property === "string" && Object.hasOwn(overrides, property)) {
        return overrides[property];
      }
      return Reflect.get(target, property, receiver);
    }
  }) as unknown as Env;
}

function assetBinding(manifest = PUBLIC_BUILD_MANIFEST): { fetch(input: RequestInfo | URL): Promise<Response> } {
  return {
    async fetch(input) {
      const target = typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
      if (target.pathname !== "/build-manifest.json") return new Response(null, { status: 404 });
      return new Response(manifest, {
        status: 200,
        headers: {
          "Content-Length": String(new TextEncoder().encode(manifest).byteLength),
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    }
  };
}

const fieldEnvironment = (overrides: Record<string, unknown> = {}) => environmentWith({
  COLLECTION_MODE: "field",
  EXPECTED_RELEASE_ID: RELEASE_ID,
  EXPECTED_APP_VERSION: APP_VERSION,
  EXPECTED_PUBLIC_BUILD_MANIFEST_SHA256: PUBLIC_BUILD_MANIFEST_SHA256,
  EXPECTED_RUNTIME_MANIFEST_SHA256: RUNTIME_MANIFEST_SHA256,
  EXPECTED_BANK_SHA256: BANK_SHA256,
  EXPECTED_ROUTES_SHA256: ROUTES_SHA256,
  EXPECTED_RUNTIME_BANK_PROJECTION_SHA256: RUNTIME_BANK_PROJECTION_SHA256,
  EXPECTED_RUNTIME_ROUTES_PROJECTION_SHA256: RUNTIME_ROUTES_PROJECTION_SHA256,
  EXPECTED_ALLOCATION_SCHEDULE_SHA256: ALLOCATION_SCHEDULE_SHA256,
  EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT: PARTICIPANT_HMAC_KEY_FINGERPRINT,
  EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT: COMPLETION_CODE_FINGERPRINT,
  EXPECTED_PROLIFIC_COMPLETION_ACTION: COMPLETION_ACTION,
  PROLIFIC_API_BASE_URL: "https://api.prolific.com",
  PARTICIPANT_HMAC_KEY,
  PROLIFIC_API_TOKEN: "test-only-prolific-token",
  PROLIFIC_COMPLETION_CODE: COMPLETION_CODE,
  CF_VERSION_METADATA: {
    id: currentWorkerVersionId(),
    tag: RELEASE_ID,
    timestamp: "2026-07-20T00:00:00.000Z"
  },
  ASSETS: assetBinding(),
  ...overrides
});

async function requestWorker(pathname: string, init: RequestInit = {}, workerEnv: Env = bindings): Promise<Response> {
  return worker.fetch(new Request(`${ORIGIN}${pathname}`, init), workerEnv);
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

async function runInBatches(statements: D1PreparedStatement[], batchSize = 50): Promise<void> {
  for (let offset = 0; offset < statements.length; offset += batchSize) {
    await bindings.DB.batch(statements.slice(offset, offset + batchSize));
  }
}

function syntheticTestlet(ordinal: number): {
  testletId: string;
  moduleId: string;
  options: string[];
  items: Array<{ itemId: string; prompt: string; itemPositionWithinTestlet: number }>;
  optionsJson: string;
  itemsJson: string;
} {
  const testletId = `synthetic-testlet-${String(ordinal).padStart(3, "0")}`;
  const moduleId = `module-${Math.floor(ordinal / 10) + 1}`;
  const options = Array.from({ length: 6 }, (_, option) => `option-${ordinal}-${option + 1}`);
  const items = Array.from({ length: 3 }, (_, item) => ({
    itemId: `synthetic-item-${String(ordinal).padStart(3, "0")}-${item + 1}`,
    prompt: `Synthetic prompt ${ordinal + 1}.${item + 1}`,
    itemPositionWithinTestlet: item + 1
  }));
  return {
    testletId,
    moduleId,
    options,
    items,
    optionsJson: JSON.stringify(options),
    itemsJson: JSON.stringify(items)
  };
}

function stableJsonForTest(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJsonForTest).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJsonForTest(record[key])}`).join(",")}}`;
}

function syntheticAllocationSlot(l1: "ja" | "vi", allocationIndex: number): {
  randomizationBlock: number;
  blockPosition: number;
  routeId: string;
  optionLayoutId: number;
} {
  const randomizationBlock = Math.floor(allocationIndex / 10);
  const positionWithinBlock = allocationIndex % 10;
  const l1RouteOffset = l1 === "ja" ? 0 : 4;
  const l1LayoutOffset = l1 === "ja" ? 2 : 5;
  const routeIndex = (positionWithinBlock * 3 + randomizationBlock * 7 + l1RouteOffset + 6) % 10;
  return {
    randomizationBlock,
    blockPosition: positionWithinBlock + 1,
    routeId: `R${String(routeIndex + 1).padStart(2, "0")}`,
    optionLayoutId: (routeIndex + randomizationBlock + l1LayoutOffset) % 6
  };
}

function evenOrderWilliamsSquareForTest(order: number): number[][] {
  const first = [0];
  for (let offset = 1; first.length < order; offset += 1) {
    first.push(offset);
    if (first.length < order) first.push(order - offset);
  }
  const canonicalLabelByRawTreatment = new Map(
    first.map((rawTreatment, canonicalPosition) => [rawTreatment, canonicalPosition])
  );
  return Array.from({ length: order }, (_value, row) =>
    first.map((condition) => canonicalLabelByRawTreatment.get((condition + row) % order)!));
}

async function syntheticRuntimeProjectionHashes(): Promise<{
  bank: string;
  routes: string;
}> {
  const testlets = [];
  for (let ordinal = 0; ordinal < 100; ordinal += 1) {
    const testlet = syntheticTestlet(ordinal);
    const contentSha256 = await sha256Hex(stableJsonForTest({
      testletId: testlet.testletId,
      moduleId: testlet.moduleId,
      options: testlet.options,
      items: testlet.items
    }));
    testlets.push({
      testletId: testlet.testletId,
      moduleId: testlet.moduleId,
      formId: ordinal % 2 === 0 ? "A" : "B",
      band: ["1k", "2k", "3k", "4k", "5k"][ordinal % 5],
      options: testlet.options,
      items: testlet.items,
      contentSha256
    });
  }
  const rows = [];
  const routeOrders = evenOrderWilliamsSquareForTest(10);
  for (let routeIndex = 0; routeIndex < 10; routeIndex += 1) {
    const routeId = `R${String(routeIndex + 1).padStart(2, "0")}`;
    const moduleOrder = routeOrders[routeIndex];
    const withinModuleOrder = routeOrders[routeIndex];
    for (let modulePosition = 0; modulePosition < 10; modulePosition += 1) {
      for (let withinModulePosition = 0; withinModulePosition < 10; withinModulePosition += 1) {
        const testletOrdinal = modulePosition * 10 + withinModulePosition;
        const canonicalTestletOrdinal = moduleOrder[modulePosition] * 10 +
          withinModuleOrder[withinModulePosition];
        rows.push({
          routeId,
          testletOrdinal,
          modulePosition: modulePosition + 1,
          testletPositionWithinModule: withinModulePosition + 1,
          testletId: syntheticTestlet(canonicalTestletOrdinal).testletId
        });
      }
    }
  }
  return {
    bank: await sha256Hex(stableJsonForTest({
      schemaVersion: "uvlt-d1-runtime-bank-projection-1",
      releaseId: RELEASE_ID,
      testlets
    })),
    routes: await sha256Hex(stableJsonForTest({
      schemaVersion: "uvlt-d1-runtime-routes-projection-1",
      releaseId: RELEASE_ID,
      rows
    }))
  };
}

async function applySchema(): Promise<void> {
  await bindings.DB.batch([
    bindings.DB.prepare("DROP TABLE IF EXISTS responses"),
    bindings.DB.prepare("DROP TABLE IF EXISTS testlet_submissions"),
    bindings.DB.prepare("DROP TABLE IF EXISTS session_events"),
    bindings.DB.prepare("DROP TABLE IF EXISTS sessions"),
    bindings.DB.prepare("DROP TABLE IF EXISTS runtime_allocation_slots"),
    bindings.DB.prepare("DROP TABLE IF EXISTS runtime_route_testlets"),
    bindings.DB.prepare("DROP TABLE IF EXISTS runtime_testlets"),
    bindings.DB.prepare("DROP TABLE IF EXISTS studies"),
    bindings.DB.prepare("DROP TABLE IF EXISTS runtime_releases"),
    bindings.DB.prepare("DROP TABLE IF EXISTS d1_migrations")
  ]);
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  schemaGeneration += 1;
}

async function seedReadySyntheticRelease(
  {
    corruptTestletOrdinal,
    coordinatedTestletMutation = false,
    swapFirstJaAssignments = false,
    unbalancedRouteOrder = false,
    balancedRouteRelabel = false,
    appVersion = APP_VERSION,
    workerVersionId = currentWorkerVersionId(),
    publicBuildManifestSha256 = PUBLIC_BUILD_MANIFEST_SHA256,
    participantHmacKeyFingerprint = PARTICIPANT_HMAC_KEY_FINGERPRINT,
    completionCodeFingerprint = COMPLETION_CODE_FINGERPRINT,
    activate = true
  }: {
    corruptTestletOrdinal?: number;
    coordinatedTestletMutation?: boolean;
    swapFirstJaAssignments?: boolean;
    unbalancedRouteOrder?: boolean;
    balancedRouteRelabel?: boolean;
    appVersion?: string;
    workerVersionId?: string | null;
    publicBuildManifestSha256?: string;
    participantHmacKeyFingerprint?: string;
    completionCodeFingerprint?: string;
    activate?: boolean;
  } = {}
): Promise<void> {
  const now = "2026-07-20T00:00:00.000Z";
  const projectionHashes = await syntheticRuntimeProjectionHashes();
  RUNTIME_BANK_PROJECTION_SHA256 = projectionHashes.bank;
  RUNTIME_ROUTES_PROJECTION_SHA256 = projectionHashes.routes;
  await bindings.DB.batch([
    bindings.DB.prepare(`
      INSERT INTO runtime_releases (
        release_id, app_version, worker_version_id, public_build_manifest_sha256, runtime_manifest_sha256, bank_sha256, routes_sha256,
        runtime_bank_projection_sha256, runtime_routes_projection_sha256,
        allocation_schedule_sha256, randomization_seed_fingerprint, randomization_algorithm, option_layout_algorithm,
        participant_hmac_key_fingerprint, prolific_completion_code_fingerprint, prolific_completion_action,
        expected_testlets, expected_items, expected_breaks, active, created_at, frozen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 300, 9, 0, ?, ?)
    `).bind(
      RELEASE_ID,
      appVersion,
      workerVersionId,
      publicBuildManifestSha256,
      RUNTIME_MANIFEST_SHA256,
      BANK_SHA256,
      ROUTES_SHA256,
      RUNTIME_BANK_PROJECTION_SHA256,
      RUNTIME_ROUTES_PROJECTION_SHA256,
      ALLOCATION_SCHEDULE_SHA256,
      RANDOMIZATION_SEED_FINGERPRINT,
      RANDOMIZATION_ALGORITHM,
      OPTION_LAYOUT_ALGORITHM,
      participantHmacKeyFingerprint,
      completionCodeFingerprint,
      COMPLETION_ACTION,
      now,
      now
    ),
    bindings.DB.prepare(`
      INSERT INTO studies (study_id, release_id, l1, active, created_at)
      VALUES (?, ?, 'ja', 0, ?)
    `).bind(JA_STUDY_ID, RELEASE_ID, now),
    bindings.DB.prepare(`
      INSERT INTO studies (study_id, release_id, l1, active, created_at)
      VALUES (?, ?, 'vi', 0, ?)
    `).bind(VI_STUDY_ID, RELEASE_ID, now)
  ]);

  const testletStatements: D1PreparedStatement[] = [];
  for (let ordinal = 0; ordinal < 100; ordinal += 1) {
    const testlet = syntheticTestlet(ordinal);
    if (coordinatedTestletMutation && ordinal === 88) {
      testlet.items[0].prompt = `${testlet.items[0].prompt} altered`;
      testlet.itemsJson = JSON.stringify(testlet.items);
    }
    const contentHash = ordinal === corruptTestletOrdinal
      ? "0".repeat(64)
      : await sha256Hex(stableJsonForTest({
        testletId: testlet.testletId,
        moduleId: testlet.moduleId,
        options: testlet.options,
        items: testlet.items
      }));
    testletStatements.push(bindings.DB.prepare(`
      INSERT INTO runtime_testlets (
        release_id, testlet_id, module_id, form_id, band, options_json, items_json, content_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      RELEASE_ID,
      testlet.testletId,
      testlet.moduleId,
      ordinal % 2 === 0 ? "A" : "B",
      ["1k", "2k", "3k", "4k", "5k"][ordinal % 5],
      testlet.optionsJson,
      testlet.itemsJson,
      contentHash
    ));
  }
  await runInBatches(testletStatements);

  const routeStatements: D1PreparedStatement[] = [];
  const routeOrders = evenOrderWilliamsSquareForTest(10);
  for (let routeIndex = 0; routeIndex < 10; routeIndex += 1) {
    const routeId = `R${String(routeIndex + 1).padStart(2, "0")}`;
    const sourceRouteIndex = balancedRouteRelabel ? (routeIndex + 1) % 10 : routeIndex;
    const moduleOrder = routeOrders[sourceRouteIndex];
    const withinModuleOrder = unbalancedRouteOrder
      ? routeOrders[0]
      : routeOrders[sourceRouteIndex];
    for (let modulePosition = 0; modulePosition < 10; modulePosition += 1) {
      const moduleIndex = moduleOrder[modulePosition];
      for (let withinModulePosition = 0; withinModulePosition < 10; withinModulePosition += 1) {
        const ordinal = modulePosition * 10 + withinModulePosition;
        const canonicalTestletOrdinal = moduleIndex * 10 + withinModuleOrder[withinModulePosition];
        routeStatements.push(bindings.DB.prepare(`
          INSERT INTO runtime_route_testlets (
            release_id, route_id, testlet_ordinal, module_position,
            testlet_position_within_module, testlet_id
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          RELEASE_ID,
          routeId,
          ordinal,
          modulePosition + 1,
          withinModulePosition + 1,
          syntheticTestlet(canonicalTestletOrdinal).testletId
        ));
      }
    }
  }
  await runInBatches(routeStatements);

  const allocationStatements: D1PreparedStatement[] = [];
  for (const l1 of ["ja", "vi"] as const) {
    for (let allocationIndex = 0; allocationIndex < 300; allocationIndex += 1) {
      const slot = syntheticAllocationSlot(l1, allocationIndex);
      const assignmentIndex = swapFirstJaAssignments && l1 === "ja" && allocationIndex < 2
        ? 1 - allocationIndex
        : allocationIndex;
      const assignment = syntheticAllocationSlot(l1, assignmentIndex);
      allocationStatements.push(bindings.DB.prepare(`
        INSERT INTO runtime_allocation_slots (
          release_id, l1, allocation_index, randomization_block,
          block_position, route_id, option_layout_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        RELEASE_ID,
        l1,
        allocationIndex,
        slot.randomizationBlock,
        slot.blockPosition,
        assignment.routeId,
        assignment.optionLayoutId
      ));
    }
  }
  await runInBatches(allocationStatements);

  if (activate) {
    await bindings.DB.batch([
      bindings.DB.prepare("UPDATE studies SET active = 1 WHERE study_id = ? AND release_id = ?")
        .bind(JA_STUDY_ID, RELEASE_ID),
      bindings.DB.prepare("UPDATE studies SET active = 1 WHERE study_id = ? AND release_id = ?")
        .bind(VI_STUDY_ID, RELEASE_ID),
      bindings.DB.prepare("UPDATE runtime_releases SET active = 1 WHERE release_id = ?")
        .bind(RELEASE_ID)
    ]);
  }
}

function installProlificSubmissionMock({
  completionCode = COMPLETION_CODE,
  completionAction = COMPLETION_ACTION,
  studyReady = true,
  studyResponseStatus = 200
}: {
  completionCode?: string;
  completionAction?: string;
  studyReady?: boolean;
  studyResponseStatus?: number;
} = {}): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const target = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe("Token test-only-prolific-token");
    if (target === `https://api.prolific.com/api/v1/studies/${JA_STUDY_ID}/`) {
      if (studyResponseStatus !== 200) return new Response(null, { status: studyResponseStatus });
      return Response.json({
        id: JA_STUDY_ID,
        prolific_id_option: "url_parameters",
        is_ready_to_publish: studyReady,
        completion_codes: [{
          code: completionCode,
          code_type: "COMPLETED",
          actions: [{ action: completionAction }]
        }]
      });
    }
    expect(target).toBe(`https://api.prolific.com/api/v1/submissions/${SUBMISSION_ID}/`);
    return Response.json({
      id: SUBMISSION_ID,
      participant_id: PARTICIPANT_ID,
      study_id: JA_STUDY_ID,
      status: "ACTIVE"
    });
  });
}

interface MockProlificIdentity {
  participantId: string;
  submissionId: string;
}

function installProlificMatrixMock(
  studyId: string,
  identities: readonly MockProlificIdentity[]
): ReturnType<typeof vi.spyOn> {
  const identityBySubmission = new Map(identities.map((identity) => [identity.submissionId, identity]));
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const target = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe("Token test-only-prolific-token");
    if (target === `https://api.prolific.com/api/v1/studies/${studyId}/`) {
      return Response.json({
        id: studyId,
        prolific_id_option: "url_parameters",
        is_ready_to_publish: true,
        completion_codes: [{
          code: COMPLETION_CODE,
          code_type: "COMPLETED",
          actions: [{ action: COMPLETION_ACTION }]
        }]
      });
    }
    const submissionMatch = target.match(/^https:\/\/api\.prolific\.com\/api\/v1\/submissions\/([0-9a-f]{24})\/$/);
    expect(submissionMatch).not.toBeNull();
    const identity = identityBySubmission.get(submissionMatch![1]);
    expect(identity).toBeDefined();
    return Response.json({
      id: identity!.submissionId,
      participant_id: identity!.participantId,
      study_id: studyId,
      status: "ACTIVE"
    });
  });
}

function prolificHexId(value: number): string {
  return value.toString(16).padStart(24, "0");
}

function assertNoRawLinkIdentifiers(value: unknown): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  expect(serialized).not.toContain(PARTICIPANT_ID);
  expect(serialized).not.toContain(SUBMISSION_ID);
  expect(serialized).not.toContain(JA_STUDY_ID);
}

function authenticatedJson(cookie: string, body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: ORIGIN,
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

function testletSubmissionBody(
  ordinal: number,
  selectedOptions: string[],
  idempotencyKey = `testlet-${String(ordinal).padStart(3, "0")}-attempt-1`
): Record<string, unknown> {
  const startedAt = new Date(Date.UTC(2026, 6, 20, 1, 0, 0) + ordinal * 2_000);
  const submittedAt = new Date(startedAt.getTime() + 1_000);
  return {
    testlet_ordinal: ordinal,
    selected_options: selectedOptions,
    testlet_started_at: startedAt.toISOString(),
    testlet_submitted_at: submittedAt.toISOString(),
    elapsed_ms: 1_000,
    idempotency_key: idempotencyKey
  };
}

async function launchSyntheticSession(fieldEnv: Env): Promise<string> {
  const launchPath = `/join?PROLIFIC_PID=${PARTICIPANT_ID}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${SUBMISSION_ID}`;
  const response = await requestWorker(launchPath, {}, fieldEnv);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/");
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toMatch(/^__Host-uvlt_session=[^;]+; Path=\/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax$/);
  return cookie!.split(";", 1)[0];
}

function currentTestlet(state: Record<string, unknown>, ordinal: number): { options: string[] } {
  const nextStep = state.next_step as Record<string, unknown>;
  expect(nextStep).toMatchObject({ kind: "testlet", testlet_ordinal: ordinal });
  const testlet = nextStep.testlet as { options: string[] };
  expect(testlet.options).toHaveLength(6);
  return testlet;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UVLT Cloudflare field Worker", () => {
  it("uses six canonical-first Williams option layouts with exact position and carryover balance", () => {
    const layouts = Array.from({ length: 6 }, (_value, layoutId) => [...optionPermutationForLayout(layoutId)]);
    expect(layouts).toEqual([
      [0, 1, 2, 3, 4, 5],
      [1, 3, 0, 5, 2, 4],
      [3, 5, 1, 4, 0, 2],
      [5, 4, 3, 2, 1, 0],
      [4, 2, 5, 0, 3, 1],
      [2, 0, 4, 1, 5, 3]
    ]);
    for (let position = 0; position < 6; position += 1) {
      expect(new Set(layouts.map((layout) => layout[position]))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    }
    const directedPairs = new Map<string, number>();
    for (const layout of layouts) {
      for (let position = 0; position < 5; position += 1) {
        const key = `${layout[position]}->${layout[position + 1]}`;
        directedPairs.set(key, (directedPairs.get(key) ?? 0) + 1);
      }
    }
    expect(directedPairs.size).toBe(30);
    expect([...directedPairs.values()].every((count) => count === 1)).toBe(true);
    expect(() => optionPermutationForLayout(6)).toThrow(/Invalid option layout ID/);
  });

  it("applies the real migration and remains fail-closed under the checked-in configuration", async () => {
    await applySchema();

    const tables = await bindings.DB.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name IN (
        'runtime_releases', 'studies', 'runtime_testlets', 'runtime_route_testlets',
        'runtime_allocation_slots', 'sessions', 'testlet_submissions', 'responses', 'session_events'
      )
      ORDER BY name
    `).all<{ name: string }>();
    expect(tables.results.map(({ name }) => name)).toEqual([
      "responses",
      "runtime_allocation_slots",
      "runtime_releases",
      "runtime_route_testlets",
      "runtime_testlets",
      "session_events",
      "sessions",
      "studies",
      "testlet_submissions"
    ]);

    const configResponse = await requestWorker("/api/config");
    expect(configResponse.status).toBe(200);
    expect(configResponse.headers.get("cache-control")).toContain("no-store");
    expect(configResponse.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const config = await responseJson(configResponse);
    expect(config).toMatchObject({ ok: true, collection_enabled: false, practice_enabled: false });
    expect(JSON.stringify(config)).not.toContain(COMPLETION_CODE);

    const joinResponse = await requestWorker(
      `/join?PROLIFIC_PID=${PARTICIPANT_ID}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${SUBMISSION_ID}`
    );
    expect(joinResponse.status).toBe(303);
    expect(joinResponse.headers.get("location")).toBe("/");
    expect(joinResponse.headers.get("set-cookie")).toBeNull();
    expect(await joinResponse.text()).toBe("");

    const removedStartResponse = await requestWorker("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        PROLIFIC_PID: PARTICIPANT_ID,
        STUDY_ID: JA_STUDY_ID,
        SESSION_ID: SUBMISSION_ID
      })
    });
    expect(removedStartResponse.status).toBe(404);
    expect(await responseJson(removedStartResponse)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("fails closed when any pinned release identity or the actual HMAC secret differs", async () => {
    await applySchema();
    await seedReadySyntheticRelease();

    const mismatchedEnvironments = [
      fieldEnvironment({ EXPECTED_RELEASE_ID: "release-test-v2" }),
      fieldEnvironment({ EXPECTED_APP_VERSION: "0.1.0-other" }),
      fieldEnvironment({ EXPECTED_PUBLIC_BUILD_MANIFEST_SHA256: "4".repeat(64) }),
      fieldEnvironment({ EXPECTED_RUNTIME_MANIFEST_SHA256: "4".repeat(64) }),
      fieldEnvironment({ EXPECTED_BANK_SHA256: "4".repeat(64) }),
      fieldEnvironment({ EXPECTED_ROUTES_SHA256: "4".repeat(64) }),
      fieldEnvironment({ EXPECTED_RUNTIME_BANK_PROJECTION_SHA256: "4".repeat(64) }),
      fieldEnvironment({ EXPECTED_RUNTIME_ROUTES_PROJECTION_SHA256: "4".repeat(64) }),
      fieldEnvironment({ EXPECTED_ALLOCATION_SCHEDULE_SHA256: "5".repeat(64) }),
      fieldEnvironment({ EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT: `sha256:${"4".repeat(64)}` }),
      fieldEnvironment({ EXPECTED_PARTICIPANT_HMAC_KEY_FINGERPRINT: `sha256:${"0".repeat(64)}` }),
      fieldEnvironment({ EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT: `sha256:${"4".repeat(64)}` }),
      fieldEnvironment({ EXPECTED_PROLIFIC_COMPLETION_CODE_FINGERPRINT: `sha256:${"0".repeat(64)}` }),
      fieldEnvironment({ EXPECTED_PROLIFIC_COMPLETION_ACTION: "AUTOMATICALLY_APPROVE" }),
      fieldEnvironment({ PARTICIPANT_HMAC_KEY: "different-test-only-hmac-key-with-at-least-32-bytes" }),
      fieldEnvironment({ PROLIFIC_COMPLETION_CODE: "OTHER123" }),
      fieldEnvironment({
        CF_VERSION_METADATA: {
          id: "22222222-2222-4222-8222-222222222222",
          tag: RELEASE_ID,
          timestamp: "2026-07-20T00:00:00.000Z"
        }
      }),
      fieldEnvironment({
        CF_VERSION_METADATA: {
          id: "22222222-2222-4222-8222-222222222222",
          tag: "release-test-v2",
          timestamp: "2026-07-20T00:00:00.000Z"
        }
      }),
      fieldEnvironment({ ASSETS: assetBinding(`${PUBLIC_BUILD_MANIFEST} `) })
    ];
    for (const mismatchedEnvironment of mismatchedEnvironments) {
      const response = await requestWorker("/api/config", {}, mismatchedEnvironment);
      expect(response.status).toBe(200);
      expect(await responseJson(response)).toMatchObject({ ok: true, collection_enabled: false });
    }

    await expect(bindings.DB.prepare(`
      UPDATE runtime_releases
      SET participant_hmac_key_fingerprint = ?
      WHERE release_id = ?
    `).bind(`sha256:${"5".repeat(64)}`, RELEASE_ID).run()).rejects.toThrow();
  });

  it("uses the frozen schedule with complete L1-route-layout crossing instead of allocation modulo", async () => {
    await applySchema();
    await seedReadySyntheticRelease();

    const firstSlot = await bindings.DB.prepare(`
      SELECT allocation_index, randomization_block, block_position, route_id, option_layout_id
      FROM runtime_allocation_slots
      WHERE release_id = ? AND l1 = 'ja' AND allocation_index = 0
    `).bind(RELEASE_ID).first<{
      allocation_index: number;
      randomization_block: number;
      block_position: number;
      route_id: string;
      option_layout_id: number;
    }>();
    expect(firstSlot).toEqual({
      allocation_index: 0,
      randomization_block: 0,
      block_position: 1,
      route_id: "R07",
      option_layout_id: 2
    });
    expect(firstSlot?.route_id).not.toBe("R01");

    const blocks = await bindings.DB.prepare(`
      SELECT l1, randomization_block, COUNT(*) AS slots,
        COUNT(DISTINCT route_id) AS routes, COUNT(DISTINCT option_layout_id) AS layouts
      FROM runtime_allocation_slots
      WHERE release_id = ?
      GROUP BY l1, randomization_block
      ORDER BY l1, randomization_block
    `).bind(RELEASE_ID).all<{
      l1: string;
      randomization_block: number;
      slots: number;
      routes: number;
      layouts: number;
    }>();
    expect(blocks.results).toHaveLength(60);
    expect(blocks.results.every((block) => block.slots === 10 && block.routes === 10 && block.layouts === 6)).toBe(true);

    const routeLayoutCells = await bindings.DB.prepare(`
      SELECT l1, route_id, option_layout_id, COUNT(*) AS allocations
      FROM runtime_allocation_slots
      WHERE release_id = ?
      GROUP BY l1, route_id, option_layout_id
    `).bind(RELEASE_ID).all<{
      l1: string;
      route_id: string;
      option_layout_id: number;
      allocations: number;
    }>();
    expect(routeLayoutCells.results).toHaveLength(120);
    expect(routeLayoutCells.results.every((cell) => cell.allocations === 5)).toBe(true);
  });

  it("fails closed when structurally balanced D1 slots do not reproduce the pinned schedule hash", async () => {
    await applySchema();
    await seedReadySyntheticRelease({ swapFirstJaAssignments: true });
    const response = await requestWorker("/api/config", {}, fieldEnvironment());
    expect(response.status).toBe(200);
    expect(await responseJson(response)).toMatchObject({ ok: true, collection_enabled: false });
  });

  it("fully verifies an inactive release before activation and never caches mutable preflight data", async () => {
    await applySchema();
    await seedReadySyntheticRelease({ activate: false });
    const fieldEnv = fieldEnvironment();

    const validPreflight = await requestWorker("/api/config", {}, fieldEnv);
    const expectedReleaseBinding = await sha256Hex(stableJsonForTest({
      schemaVersion: "uvlt-release-binding-1",
      releaseId: RELEASE_ID,
      appVersion: APP_VERSION,
      workerVersionId: currentWorkerVersionId()
    }));
    expect(await responseJson(validPreflight)).toMatchObject({
      ok: true,
      collection_enabled: false,
      release_integrity_verified: true,
      activation_preflight_ready: true,
      release_binding_sha256: expectedReleaseBinding
    });

    await bindings.DB.prepare(`
      UPDATE runtime_testlets SET content_sha256 = ?
      WHERE release_id = ? AND testlet_id = ?
    `).bind("0".repeat(64), RELEASE_ID, syntheticTestlet(88).testletId).run();
    const corruptPreflight = await requestWorker("/api/config", {}, fieldEnv);
    expect(await responseJson(corruptPreflight)).toMatchObject({
      ok: true,
      collection_enabled: false,
      release_integrity_verified: false,
      activation_preflight_ready: false
    });
  });

  it("rejects coordinated content and self-hash mutation against the pinned bank projection", async () => {
    await applySchema();
    await seedReadySyntheticRelease({ coordinatedTestletMutation: true, activate: false });
    const response = await requestWorker("/api/config", {}, fieldEnvironment());
    expect(await responseJson(response)).toMatchObject({
      ok: true,
      collection_enabled: false,
      release_integrity_verified: false,
      activation_preflight_ready: false
    });
  });

  it("rejects a structurally balanced route relabeling against the pinned route projection", async () => {
    await applySchema();
    await seedReadySyntheticRelease({ balancedRouteRelabel: true, activate: false });
    const response = await requestWorker("/api/config", {}, fieldEnvironment());
    expect(await responseJson(response)).toMatchObject({
      ok: true,
      collection_enabled: false,
      release_integrity_verified: false,
      activation_preflight_ready: false
    });
  });

  it("caches only successful immutable runtime verification while repeating small readiness checks", async () => {
    await applySchema();
    await seedReadySyntheticRelease();
    const preparedSql: string[] = [];
    const countedDb = new Proxy(bindings.DB, {
      get(target, property) {
        if (property === "prepare") {
          return (query: string) => {
            preparedSql.push(query);
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const fieldEnv = fieldEnvironment({ DB: countedDb });
    const first = await requestWorker("/api/config", {}, fieldEnv);
    expect(await responseJson(first)).toMatchObject({ ok: true, collection_enabled: true });
    const largeScanCount = () => preparedSql.filter((query) =>
      /FROM runtime_(?:testlets|route_testlets|allocation_slots)\b/.test(query)).length;
    expect(largeScanCount()).toBe(3);

    const second = await requestWorker("/api/config", {}, fieldEnv);
    expect(await responseJson(second)).toMatchObject({ ok: true, collection_enabled: true });
    expect(largeScanCount()).toBe(3);
    expect(preparedSql.filter((query) => query.includes("FROM runtime_releases r"))).toHaveLength(2);
  });

  it("rejects all-zero linkage fingerprints at both Worker and active-release boundaries", async () => {
    await applySchema();
    await expect(seedReadySyntheticRelease({
      participantHmacKeyFingerprint: `sha256:${"0".repeat(64)}`,
      completionCodeFingerprint: `sha256:${"0".repeat(64)}`
    })).rejects.toThrow();
    expect(await bindings.DB.prepare(
      "SELECT active FROM runtime_releases WHERE release_id = ?"
    ).bind(RELEASE_ID).first<{ active: number }>()).toEqual({ active: 0 });
  });

  it("requires a canonical frozen Worker version UUID before release activation", async () => {
    await applySchema();
    await expect(seedReadySyntheticRelease({ workerVersionId: null })).rejects.toThrow();
    expect(await bindings.DB.prepare(
      "SELECT active, worker_version_id FROM runtime_releases WHERE release_id = ?"
    ).bind(RELEASE_ID).first<{ active: number; worker_version_id: string | null }>()).toEqual({
      active: 0,
      worker_version_id: null
    });
    await expect(bindings.DB.prepare(
      "UPDATE runtime_releases SET worker_version_id = 'NOT-A-CLOUDFLARE-UUID' WHERE release_id = ?"
    ).bind(RELEASE_ID).run()).rejects.toThrow();
  });

  it("rejects launch before allocation when the live Prolific completion configuration is not exact", async () => {
    const cases = [
      { completionCode: "OTHER123" },
      { completionAction: "AUTOMATICALLY_APPROVE" },
      { studyReady: false },
      { studyResponseStatus: 503 }
    ];
    for (const testCase of cases) {
      await applySchema();
      await seedReadySyntheticRelease();
      const prolificMock = installProlificSubmissionMock(testCase);
      const response = await requestWorker(
        `/join?PROLIFIC_PID=${PARTICIPANT_ID}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${SUBMISSION_ID}`,
        {},
        fieldEnvironment()
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("set-cookie")).toBeNull();
      const sessionCount = await bindings.DB.prepare("SELECT COUNT(*) AS count FROM sessions").first<{ count: number }>();
      expect(sessionCount?.count).toBe(0);
      prolificMock.mockRestore();
    }
  });

  it("fails closed when D1 appVersion or public manifest identity differs", async () => {
    for (const releaseIdentity of [
      { appVersion: "0.1.0-other" },
      { workerVersionId: "33333333-3333-4333-8333-333333333333" },
      { publicBuildManifestSha256: "5".repeat(64) }
    ]) {
      await applySchema();
      await seedReadySyntheticRelease(releaseIdentity);
      const response = await requestWorker("/api/config", {}, fieldEnvironment());
      expect(await responseJson(response)).toMatchObject({ ok: true, collection_enabled: false });
    }
  });

  it("fails closed when a hash-pinned public manifest declares another appVersion", async () => {
    const otherVersionManifest = `${JSON.stringify({
      schemaVersion: "uvlt-field-public-build-2",
      appVersion: "0.1.0-other",
      files: []
    }, null, 2)}\n`;
    const otherVersionManifestSha256 = "44604ca640c9633cb03ff436f75645bd9d0b5a540af3ec1c9c2f5d161c8c323b";
    await applySchema();
    await seedReadySyntheticRelease({ publicBuildManifestSha256: otherVersionManifestSha256 });
    const response = await requestWorker("/api/config", {}, fieldEnvironment({
      EXPECTED_PUBLIC_BUILD_MANIFEST_SHA256: otherVersionManifestSha256,
      ASSETS: assetBinding(otherVersionManifest)
    }));
    expect(await responseJson(response)).toMatchObject({ ok: true, collection_enabled: false });
  });

  it("permits activation only after the complete frozen runtime is present", async () => {
    await applySchema();
    const now = "2026-07-20T00:00:00.000Z";
    await bindings.DB.prepare(`
      INSERT INTO runtime_releases (
        release_id, app_version, public_build_manifest_sha256, runtime_manifest_sha256, bank_sha256, routes_sha256,
        runtime_bank_projection_sha256, runtime_routes_projection_sha256,
        participant_hmac_key_fingerprint, prolific_completion_code_fingerprint, prolific_completion_action,
        expected_testlets, expected_items, expected_breaks, active, created_at, frozen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 300, 9, 0, ?, ?)
    `).bind(
      RELEASE_ID,
      APP_VERSION,
      PUBLIC_BUILD_MANIFEST_SHA256,
      RUNTIME_MANIFEST_SHA256,
      BANK_SHA256,
      ROUTES_SHA256,
      "6".repeat(64),
      "7".repeat(64),
      PARTICIPANT_HMAC_KEY_FINGERPRINT,
      COMPLETION_CODE_FINGERPRINT,
      COMPLETION_ACTION,
      now,
      now
    ).run();

    await expect(bindings.DB.prepare(
      "UPDATE runtime_releases SET active = 1 WHERE release_id = ?"
    ).bind(RELEASE_ID).run()).rejects.toThrow();
    expect(await bindings.DB.prepare(
      "SELECT active FROM runtime_releases WHERE release_id = ?"
    ).bind(RELEASE_ID).first<{ active: number }>()).toEqual({ active: 0 });

    await expect(bindings.DB.prepare(`
      UPDATE runtime_releases SET randomization_algorithm = 'unsupported-randomization'
      WHERE release_id = ?
    `).bind(RELEASE_ID).run()).rejects.toThrow();
    await expect(bindings.DB.prepare(`
      UPDATE runtime_releases SET option_layout_algorithm = 'unsupported-layout'
      WHERE release_id = ?
    `).bind(RELEASE_ID).run()).rejects.toThrow();

    await expect(bindings.DB.prepare(`
      INSERT INTO runtime_releases (
        release_id, app_version, public_build_manifest_sha256, runtime_manifest_sha256, bank_sha256, routes_sha256,
        runtime_bank_projection_sha256, runtime_routes_projection_sha256,
        participant_hmac_key_fingerprint, prolific_completion_code_fingerprint, prolific_completion_action,
        expected_testlets, expected_items, expected_breaks, active, created_at, frozen_at
      ) VALUES ('release-direct-active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 300, 9, 1, ?, ?)
    `).bind(
      APP_VERSION,
      PUBLIC_BUILD_MANIFEST_SHA256,
      RUNTIME_MANIFEST_SHA256,
      BANK_SHA256,
      ROUTES_SHA256,
      "6".repeat(64),
      "7".repeat(64),
      PARTICIPANT_HMAC_KEY_FINGERPRINT,
      COMPLETION_CODE_FINGERPRINT,
      COMPLETION_ACTION,
      now,
      now
    ).run()).rejects.toThrow();
  });

  it("makes every active release runtime table immutable", async () => {
    await applySchema();
    await seedReadySyntheticRelease();
    const firstTestlet = syntheticTestlet(0);
    const mutationStatements: Array<[string, D1PreparedStatement]> = [
      ["release update", bindings.DB.prepare(
        "UPDATE runtime_releases SET app_version = 'mutated' WHERE release_id = ?"
      ).bind(RELEASE_ID)],
      ["public manifest identity update", bindings.DB.prepare(
        "UPDATE runtime_releases SET public_build_manifest_sha256 = ? WHERE release_id = ?"
      ).bind("6".repeat(64), RELEASE_ID)],
      ["Worker version identity update", bindings.DB.prepare(
        "UPDATE runtime_releases SET worker_version_id = ? WHERE release_id = ?"
      ).bind("33333333-3333-4333-8333-333333333333", RELEASE_ID)],
      ["release delete", bindings.DB.prepare(
        "DELETE FROM runtime_releases WHERE release_id = ?"
      ).bind(RELEASE_ID)],
      ["study insert", bindings.DB.prepare(`
        INSERT INTO studies (study_id, release_id, l1, active, created_at)
        VALUES ('333333333333333333333333', ?, 'ja', 1, '2026-07-20T00:00:00.000Z')
      `).bind(RELEASE_ID)],
      ["study update", bindings.DB.prepare(
        "UPDATE studies SET created_at = '2026-07-21T00:00:00.000Z' WHERE study_id = ?"
      ).bind(JA_STUDY_ID)],
      ["study delete", bindings.DB.prepare(
        "DELETE FROM studies WHERE study_id = ?"
      ).bind(JA_STUDY_ID)],
      ["testlet insert", bindings.DB.prepare(`
        INSERT INTO runtime_testlets (
          release_id, testlet_id, module_id, form_id, band, options_json, items_json, content_sha256
        ) VALUES (?, 'forbidden-testlet', 'module-1', 'A', '1k', ?, ?, ?)
      `).bind(RELEASE_ID, firstTestlet.optionsJson, firstTestlet.itemsJson, "6".repeat(64))],
      ["testlet update", bindings.DB.prepare(
        "UPDATE runtime_testlets SET module_id = 'mutated-module' WHERE release_id = ? AND testlet_id = ?"
      ).bind(RELEASE_ID, firstTestlet.testletId)],
      ["testlet delete", bindings.DB.prepare(
        "DELETE FROM runtime_testlets WHERE release_id = ? AND testlet_id = ?"
      ).bind(RELEASE_ID, firstTestlet.testletId)],
      ["route insert", bindings.DB.prepare(`
        INSERT INTO runtime_route_testlets (
          release_id, route_id, testlet_ordinal, module_position, testlet_position_within_module, testlet_id
        ) VALUES (?, 'R01', 0, 1, 1, ?)
      `).bind(RELEASE_ID, firstTestlet.testletId)],
      ["route update", bindings.DB.prepare(`
        UPDATE runtime_route_testlets SET module_position = 2
        WHERE release_id = ? AND route_id = 'R01' AND testlet_ordinal = 0
      `).bind(RELEASE_ID)],
      ["route delete", bindings.DB.prepare(`
        DELETE FROM runtime_route_testlets
        WHERE release_id = ? AND route_id = 'R01' AND testlet_ordinal = 0
      `).bind(RELEASE_ID)],
      ["allocation insert", bindings.DB.prepare(`
        INSERT INTO runtime_allocation_slots (
          release_id, l1, allocation_index, randomization_block,
          block_position, route_id, option_layout_id
        ) VALUES (?, 'ja', 0, 0, 1, 'R07', 2)
      `).bind(RELEASE_ID)],
      ["allocation update", bindings.DB.prepare(`
        UPDATE runtime_allocation_slots SET route_id = 'R01'
        WHERE release_id = ? AND l1 = 'ja' AND allocation_index = 0
      `).bind(RELEASE_ID)],
      ["allocation delete", bindings.DB.prepare(`
        DELETE FROM runtime_allocation_slots
        WHERE release_id = ? AND l1 = 'ja' AND allocation_index = 0
      `).bind(RELEASE_ID)]
    ];
    for (const [label, statement] of mutationStatements) {
      await expect(statement.run(), label).rejects.toThrow();
    }

    const frozenCounts = await bindings.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM runtime_releases WHERE release_id = ? AND active = 1 AND app_version = ?) AS releases,
        (SELECT COUNT(*) FROM studies WHERE release_id = ? AND active = 1) AS studies,
        (SELECT COUNT(*) FROM runtime_testlets WHERE release_id = ?) AS testlets,
        (SELECT COUNT(*) FROM runtime_route_testlets WHERE release_id = ?) AS route_rows,
        (SELECT COUNT(*) FROM runtime_allocation_slots WHERE release_id = ?) AS allocation_slots
    `).bind(RELEASE_ID, APP_VERSION, RELEASE_ID, RELEASE_ID, RELEASE_ID, RELEASE_ID).first<{
      releases: number;
      studies: number;
      testlets: number;
      route_rows: number;
      allocation_slots: number;
    }>();
    expect(frozenCounts).toEqual({ releases: 1, studies: 2, testlets: 100, route_rows: 1000, allocation_slots: 600 });
  });

  it("freezes session assignment and validates stored choice positions at the D1 boundary", async () => {
    await applySchema();
    await seedReadySyntheticRelease();
    const sessionId = "33333333-3333-4333-8333-333333333333";
    const firstSlot = await bindings.DB.prepare(`
      SELECT allocation_index, randomization_block, block_position, route_id, option_layout_id
      FROM runtime_allocation_slots
      WHERE release_id = ? AND l1 = 'vi' AND allocation_index = 0
    `).bind(RELEASE_ID).first<{
      allocation_index: number;
      randomization_block: number;
      block_position: number;
      route_id: string;
      option_layout_id: number;
    }>();
    expect(firstSlot).not.toBeNull();
    await bindings.DB.prepare(`
      INSERT INTO sessions (
        session_id, release_id, study_id, l1, participant_link_hmac, submission_link_hmac,
        allocation_index, randomization_block, block_position, route_id, option_layout_id,
        token_sha256, token_expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'vi', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      RELEASE_ID,
      VI_STUDY_ID,
      "7".repeat(64),
      "8".repeat(64),
      firstSlot!.allocation_index,
      firstSlot!.randomization_block,
      firstSlot!.block_position,
      firstSlot!.route_id,
      firstSlot!.option_layout_id,
      "9".repeat(64),
      "2026-07-21T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z"
    ).run();

    const secondSlot = await bindings.DB.prepare(`
      SELECT allocation_index, randomization_block, block_position, route_id, option_layout_id
      FROM runtime_allocation_slots
      WHERE release_id = ? AND l1 = 'vi' AND allocation_index = 1
    `).bind(RELEASE_ID).first<typeof firstSlot>();
    await expect(bindings.DB.prepare(`
      UPDATE sessions SET
        allocation_index = ?, randomization_block = ?, block_position = ?,
        route_id = ?, option_layout_id = ?
      WHERE session_id = ?
    `).bind(
      secondSlot!.allocation_index,
      secondSlot!.randomization_block,
      secondSlot!.block_position,
      secondSlot!.route_id,
      secondSlot!.option_layout_id,
      sessionId
    ).run()).rejects.toThrow();

    const runtime = await bindings.DB.prepare(`
      SELECT rr.testlet_id, t.options_json, t.items_json
      FROM runtime_route_testlets rr
      JOIN runtime_testlets t ON t.release_id = rr.release_id AND t.testlet_id = rr.testlet_id
      WHERE rr.release_id = ? AND rr.route_id = ? AND rr.testlet_ordinal = 0
    `).bind(RELEASE_ID, firstSlot!.route_id).first<{
      testlet_id: string;
      options_json: string;
      items_json: string;
    }>();
    const options = JSON.parse(runtime!.options_json) as string[];
    const items = JSON.parse(runtime!.items_json) as Array<{ itemId: string }>;
    const firstDisplayedOption = options[optionPermutationForLayout(firstSlot!.option_layout_id)[0]];
    await bindings.DB.prepare(`
      INSERT INTO testlet_submissions (
        session_id, testlet_ordinal, testlet_id, option_layout_id, idempotency_key,
        payload_sha256, client_started_at, client_submitted_at, elapsed_ms, received_at
      ) VALUES (?, 0, ?, ?, 'direct-boundary-test', ?, ?, ?, 1000, ?)
    `).bind(
      sessionId,
      runtime!.testlet_id,
      firstSlot!.option_layout_id,
      "a".repeat(64),
      "2026-07-20T00:00:01.000Z",
      "2026-07-20T00:00:02.000Z",
      "2026-07-20T00:00:02.000Z"
    ).run();

    const responseStatement = (displayedPosition: number) => bindings.DB.prepare(`
      INSERT INTO responses (
        session_id, response_ordinal, testlet_ordinal, testlet_id, item_id,
        item_position_within_testlet, selected_option, selected_option_position, recorded_at
      ) VALUES (?, 1, 0, ?, ?, 1, ?, ?, '2026-07-20T00:00:02.000Z')
    `).bind(sessionId, runtime!.testlet_id, items[0].itemId, firstDisplayedOption, displayedPosition);
    await expect(responseStatement(2).run()).rejects.toThrow();
    expect((await responseStatement(1).run()).meta.changes).toBe(1);
    await expect(bindings.DB.prepare(`
      UPDATE responses SET selected_option_position = 2
      WHERE session_id = ? AND response_ordinal = 1
    `).bind(sessionId).run()).rejects.toThrow();
    await expect(bindings.DB.prepare(`
      UPDATE testlet_submissions SET elapsed_ms = 1001
      WHERE session_id = ? AND testlet_ordinal = 0
    `).bind(sessionId).run()).rejects.toThrow();
  });

  it("allows one-way emergency study closure and fails collection closed", async () => {
    await applySchema();
    await seedReadySyntheticRelease();
    const fieldEnv = fieldEnvironment();

    const closeResult = await bindings.DB.prepare(`
      UPDATE studies SET active = 0
      WHERE study_id = ? AND release_id = ? AND active = 1
    `).bind(JA_STUDY_ID, RELEASE_ID).run();
    expect(closeResult.meta.changes).toBe(1);

    const closedStudy = await bindings.DB.prepare(`
      SELECT study_id, release_id, l1, active, created_at
      FROM studies WHERE study_id = ?
    `).bind(JA_STUDY_ID).first<{
      study_id: string;
      release_id: string;
      l1: string;
      active: number;
      created_at: string;
    }>();
    expect(closedStudy).toEqual({
      study_id: JA_STUDY_ID,
      release_id: RELEASE_ID,
      l1: "ja",
      active: 0,
      created_at: "2026-07-20T00:00:00.000Z"
    });

    const configResponse = await requestWorker("/api/config", {}, fieldEnv);
    expect(await responseJson(configResponse)).toMatchObject({ ok: true, collection_enabled: false });

    const launchResponse = await requestWorker(
      `/join?PROLIFIC_PID=${PARTICIPANT_ID}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${SUBMISSION_ID}`,
      {},
      fieldEnv
    );
    expect(launchResponse.status).toBe(303);
    expect(launchResponse.headers.get("location")).toBe("/");
    expect(launchResponse.headers.get("set-cookie")).toBeNull();

    await expect(bindings.DB.prepare(`
      UPDATE studies SET active = 1
      WHERE study_id = ? AND release_id = ? AND active = 0
    `).bind(JA_STUDY_ID, RELEASE_ID).run()).rejects.toThrow();
  });

  it("fails closed before allocation when any canonical testlet content hash differs", async () => {
    await applySchema();
    await seedReadySyntheticRelease({ corruptTestletOrdinal: 88 });
    const fieldEnv = fieldEnvironment();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const configResponse = await requestWorker("/api/config", {}, fieldEnv);
    expect(await responseJson(configResponse)).toMatchObject({ ok: true, collection_enabled: false });
    const launchResponse = await requestWorker(
      `/join?PROLIFIC_PID=${PARTICIPANT_ID}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${SUBMISSION_ID}`,
      {},
      fieldEnv
    );
    expect(launchResponse.status).toBe(303);
    expect(launchResponse.headers.get("set-cookie")).toBeNull();
    expect(await bindings.DB.prepare("SELECT COUNT(*) AS count FROM sessions").first<{ count: number }>())
      .toEqual({ count: 0 });
  });

  it("fails closed before allocation when route rows lose within-module Williams balance", async () => {
    await applySchema();
    await seedReadySyntheticRelease({ unbalancedRouteOrder: true });
    const fieldEnv = fieldEnvironment();
    const configResponse = await requestWorker("/api/config", {}, fieldEnv);
    expect(await responseJson(configResponse)).toMatchObject({ ok: true, collection_enabled: false });
    const launchResponse = await requestWorker(
      `/join?PROLIFIC_PID=${PARTICIPANT_ID}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${SUBMISSION_ID}`,
      {},
      fieldEnv
    );
    expect(launchResponse.status).toBe(303);
    expect(launchResponse.headers.get("set-cookie")).toBeNull();
    expect(await bindings.DB.prepare("SELECT COUNT(*) AS count FROM sessions").first<{ count: number }>())
      .toEqual({ count: 0 });
  });

  it("verifies Prolific, requires the current cookie to resume one private session, and withholds completion", async () => {
    await applySchema();
    await seedReadySyntheticRelease();

    const counts = await bindings.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM runtime_testlets WHERE release_id = ?) AS testlets,
        (SELECT COUNT(*) FROM runtime_route_testlets WHERE release_id = ?) AS route_rows,
        (SELECT COUNT(DISTINCT route_id) FROM runtime_route_testlets WHERE release_id = ?) AS routes
    `).bind(RELEASE_ID, RELEASE_ID, RELEASE_ID).first<{ testlets: number; route_rows: number; routes: number }>();
    expect(counts).toEqual({ testlets: 100, route_rows: 1000, routes: 10 });

    const fieldEnv = fieldEnvironment();
    const fieldConfigResponse = await requestWorker("/api/config", {}, fieldEnv);
    expect(await responseJson(fieldConfigResponse)).toMatchObject({ ok: true, collection_enabled: true });

    const prolificFetch = installProlificSubmissionMock();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const launchPath = `/join?PROLIFIC_PID=${PARTICIPANT_ID}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${SUBMISSION_ID}`;

    const firstJoin = await requestWorker(launchPath, {}, fieldEnv);
    expect(firstJoin.status).toBe(303);
    expect(firstJoin.headers.get("location")).toBe("/");
    expect(firstJoin.headers.get("cache-control")).toContain("no-store");
    const firstCookie = firstJoin.headers.get("set-cookie");
    expect(firstCookie).toMatch(/^__Host-uvlt_session=[^;]+; Path=\/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax$/);
    assertNoRawLinkIdentifiers(firstCookie);
    expect(await firstJoin.text()).toBe("");

    const firstCookiePair = firstCookie!.split(";", 1)[0];
    const stateResponse = await requestWorker("/api/session/state", {
      headers: {
        Cookie: firstCookiePair,
        Origin: ORIGIN,
        "Sec-Fetch-Site": "same-origin"
      }
    }, fieldEnv);
    expect(stateResponse.status).toBe(200);
    const state = await responseJson(stateResponse);
    expect(state).toMatchObject({
      ok: true,
      status: "in_progress",
      l1: "ja",
      completed_testlets: 0,
      total_testlets: 100,
      next_step: {
        kind: "testlet",
        testlet_ordinal: 0,
        module_position: 1,
        testlet_position_within_module: 1
      }
    });
    const nextStep = state.next_step as Record<string, unknown>;
    const exposedTestlet = nextStep.testlet as { options: string[]; items: Array<{ prompt: string }> };
    expect(Object.keys(exposedTestlet).sort()).toEqual(["items", "options"]);
    expect(exposedTestlet.options).toEqual([
      "option-88-4", "option-88-6", "option-88-2",
      "option-88-5", "option-88-1", "option-88-3"
    ]);
    expect(exposedTestlet.items).toEqual([
      { prompt: "Synthetic prompt 89.1" },
      { prompt: "Synthetic prompt 89.2" },
      { prompt: "Synthetic prompt 89.3" }
    ]);
    expect(state).not.toHaveProperty("session_id");
    expect(state).not.toHaveProperty("study_id");
    expect(state).not.toHaveProperty("route_id");
    expect(state).not.toHaveProperty("option_layout_id");
    expect(state).not.toHaveProperty("randomization_block");
    expect(state).not.toHaveProperty("block_position");
    const serializedState = JSON.stringify(state);
    expect(serializedState).not.toMatch(/answer|correct|score|theta|ability|difficulty|discrimination|guessing/i);
    expect(serializedState).not.toMatch(/synthetic-(?:testlet|item)-|uvlt_[ab]_[1-5]k_/i);
    expect(serializedState).not.toContain(COMPLETION_CODE);
    assertNoRawLinkIdentifiers(state);

    const noCookieResume = await requestWorker(launchPath, {}, fieldEnv);
    expect(noCookieResume.status).toBe(303);
    expect(noCookieResume.headers.get("location")).toBe("/");
    expect(noCookieResume.headers.get("set-cookie")).toBeNull();

    const firstCookieValue = firstCookiePair.slice(firstCookiePair.indexOf("=") + 1);
    const sessionTokenSeparator = firstCookieValue.indexOf(".");
    const wrongTokenCookie = `${COOKIE_NAME_FOR_TEST}=${firstCookieValue.slice(0, sessionTokenSeparator)}.${"A".repeat(43)}`;
    const wrongCookieResume = await requestWorker(launchPath, {
      headers: { Cookie: wrongTokenCookie }
    }, fieldEnv);
    expect(wrongCookieResume.status).toBe(303);
    expect(wrongCookieResume.headers.get("location")).toBe("/");
    expect(wrongCookieResume.headers.get("set-cookie")).toBeNull();

    const secondJoin = await requestWorker(launchPath, {
      headers: { Cookie: firstCookiePair }
    }, fieldEnv);
    expect(secondJoin.status).toBe(303);
    const secondCookie = secondJoin.headers.get("set-cookie");
    expect(secondCookie).toMatch(/^__Host-uvlt_session=[^;]+; Path=\/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax$/);
    expect(secondCookie).not.toBe(firstCookie);
    assertNoRawLinkIdentifiers(secondCookie);

    const sessions = await bindings.DB.prepare(`
      SELECT participant_link_hmac, submission_link_hmac, allocation_index,
        randomization_block, block_position, route_id, option_layout_id
      FROM sessions WHERE release_id = ?
    `).bind(RELEASE_ID).all<{
      participant_link_hmac: string;
      submission_link_hmac: string;
      allocation_index: number;
      randomization_block: number;
      block_position: number;
      route_id: string;
      option_layout_id: number;
    }>();
    expect(sessions.results).toHaveLength(1);
    expect(sessions.results[0]).toMatchObject({
      allocation_index: 0,
      randomization_block: 0,
      block_position: 1,
      route_id: "R07",
      option_layout_id: 2
    });
    expect(sessions.results[0].participant_link_hmac).toMatch(HEX_64);
    expect(sessions.results[0].submission_link_hmac).toMatch(HEX_64);
    expect(JSON.stringify(sessions.results[0])).not.toContain(PARTICIPANT_ID);
    expect(JSON.stringify(sessions.results[0])).not.toContain(SUBMISSION_ID);

    const staleState = await requestWorker("/api/session/state", {
      headers: { Cookie: firstCookiePair, Origin: ORIGIN }
    }, fieldEnv);
    expect(staleState.status).toBe(401);

    const secondCookiePair = secondCookie!.split(";", 1)[0];
    const resumedStateResponse = await requestWorker("/api/session/state", {
      headers: { Cookie: secondCookiePair, Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }
    }, fieldEnv);
    expect(resumedStateResponse.status).toBe(200);
    const resumedState = await responseJson(resumedStateResponse);
    const resumedTestlet = (resumedState.next_step as Record<string, unknown>).testlet as { options: string[] };
    expect(resumedTestlet.options).toEqual(exposedTestlet.options);
    expect(resumedState).not.toHaveProperty("option_layout_id");
    const completionResponse = await requestWorker("/api/session/complete", {
      method: "POST",
      headers: {
        Cookie: secondCookiePair,
        Origin: ORIGIN,
        "Content-Type": "application/json"
      },
      body: "{}"
    }, fieldEnv);
    expect(completionResponse.status).toBe(409);
    const completion = await responseJson(completionResponse);
    expect(completion).toMatchObject({ ok: false, code: "SESSION_INCOMPLETE" });
    expect(JSON.stringify(completion)).not.toContain(COMPLETION_CODE);
    assertNoRawLinkIdentifiers(completion);

    await bindings.DB.prepare(`
      UPDATE sessions SET token_expires_at = '2000-01-01T00:00:00.000Z'
      WHERE release_id = ? AND l1 = 'ja'
    `).bind(RELEASE_ID).run();
    const expiredCookieResume = await requestWorker(launchPath, {
      headers: { Cookie: secondCookiePair }
    }, fieldEnv);
    expect(expiredCookieResume.status).toBe(303);
    expect(expiredCookieResume.headers.get("location")).toBe("/");
    expect(expiredCookieResume.headers.get("set-cookie")).toBeNull();

    expect(prolificFetch).toHaveBeenCalledTimes(10);
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged.match(/"error_code":"SESSION_RECOVERY_REQUIRED"/g)).toHaveLength(3);
    assertNoRawLinkIdentifiers(logged);
  });

  it("allocates one complete block without duplicate slots under concurrent joins", async () => {
    await applySchema();
    await seedReadySyntheticRelease();
    const fieldEnv = fieldEnvironment();
    const warmup = await requestWorker("/api/config", {}, fieldEnv);
    expect(await responseJson(warmup)).toMatchObject({ ok: true, collection_enabled: true });
    const identities = Array.from({ length: 10 }, (_value, index) => ({
      participantId: prolificHexId(0x100 + index),
      submissionId: prolificHexId(0x1000 + index)
    }));
    installProlificMatrixMock(JA_STUDY_ID, identities);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const joins = await Promise.all(identities.map((identity) => requestWorker(
      `/join?PROLIFIC_PID=${identity.participantId}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${identity.submissionId}`,
      {},
      fieldEnv
    )));
    expect(joins.every((response) => response.status === 303 && response.headers.get("set-cookie") !== null)).toBe(true);
    const cookies = joins.map((response) => response.headers.get("set-cookie")!.split(";", 1)[0]);
    expect(new Set(cookies).size).toBe(10);

    const sessions = await bindings.DB.prepare(`
      SELECT allocation_index, randomization_block, block_position, route_id, option_layout_id
      FROM sessions
      WHERE release_id = ? AND l1 = 'ja'
      ORDER BY allocation_index
    `).bind(RELEASE_ID).all<{
      allocation_index: number;
      randomization_block: number;
      block_position: number;
      route_id: string;
      option_layout_id: number;
    }>();
    expect(sessions.results).toHaveLength(10);
    expect(sessions.results.map((session) => session.allocation_index)).toEqual(
      Array.from({ length: 10 }, (_value, index) => index)
    );
    expect(new Set(sessions.results.map((session) => session.route_id)).size).toBe(10);
    sessions.results.forEach((session, allocationIndex) => {
      expect(session).toEqual({
        allocation_index: allocationIndex,
        randomization_block: syntheticAllocationSlot("ja", allocationIndex).randomizationBlock,
        block_position: syntheticAllocationSlot("ja", allocationIndex).blockPosition,
        route_id: syntheticAllocationSlot("ja", allocationIndex).routeId,
        option_layout_id: syntheticAllocationSlot("ja", allocationIndex).optionLayoutId
      });
    });
  });

  it("allocates slot 299 exactly once and then closes the 300-start L1 capacity", async () => {
    await applySchema();
    await seedReadySyntheticRelease();
    const now = "2026-07-20T00:00:00.000Z";
    const existingSessions: D1PreparedStatement[] = [];
    for (let allocationIndex = 0; allocationIndex < 299; allocationIndex += 1) {
      const slot = syntheticAllocationSlot("ja", allocationIndex);
      existingSessions.push(bindings.DB.prepare(`
        INSERT INTO sessions (
          session_id, release_id, study_id, l1, participant_link_hmac, submission_link_hmac,
          allocation_index, randomization_block, block_position, route_id, option_layout_id,
          token_sha256, token_expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'ja', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        `capacity-session-${String(allocationIndex).padStart(3, "0")}`,
        RELEASE_ID,
        JA_STUDY_ID,
        (allocationIndex + 1).toString(16).padStart(64, "0"),
        (allocationIndex + 1001).toString(16).padStart(64, "0"),
        allocationIndex,
        slot.randomizationBlock,
        slot.blockPosition,
        slot.routeId,
        slot.optionLayoutId,
        (allocationIndex + 2001).toString(16).padStart(64, "0"),
        "2026-07-21T00:00:00.000Z",
        now,
        now
      ));
    }
    await runInBatches(existingSessions);
    const identities = [
      { participantId: prolificHexId(0x300), submissionId: prolificHexId(0x3000) },
      { participantId: prolificHexId(0x301), submissionId: prolificHexId(0x3001) }
    ];
    const fieldEnv = fieldEnvironment();
    installProlificMatrixMock(JA_STUDY_ID, identities);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const finalJoin = await requestWorker(
      `/join?PROLIFIC_PID=${identities[0].participantId}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${identities[0].submissionId}`,
      {},
      fieldEnv
    );
    expect(finalJoin.headers.get("set-cookie")).not.toBeNull();
    const finalSlot = await bindings.DB.prepare(`
      SELECT allocation_index, randomization_block, block_position, route_id, option_layout_id
      FROM sessions WHERE release_id = ? AND l1 = 'ja' AND allocation_index = 299
    `).bind(RELEASE_ID).first<{
      allocation_index: number;
      randomization_block: number;
      block_position: number;
      route_id: string;
      option_layout_id: number;
    }>();
    const expectedFinalSlot = syntheticAllocationSlot("ja", 299);
    expect(finalSlot).toEqual({
      allocation_index: 299,
      randomization_block: expectedFinalSlot.randomizationBlock,
      block_position: expectedFinalSlot.blockPosition,
      route_id: expectedFinalSlot.routeId,
      option_layout_id: expectedFinalSlot.optionLayoutId
    });

    const overCapacity = await requestWorker(
      `/join?PROLIFIC_PID=${identities[1].participantId}&STUDY_ID=${JA_STUDY_ID}&SESSION_ID=${identities[1].submissionId}`,
      {},
      fieldEnv
    );
    expect(overCapacity.status).toBe(303);
    expect(overCapacity.headers.get("set-cookie")).toBeNull();
    expect(await bindings.DB.prepare(`
      SELECT COUNT(*) AS count, MAX(allocation_index) AS maximum
      FROM sessions WHERE release_id = ? AND l1 = 'ja'
    `).bind(RELEASE_ID).first<{ count: number; maximum: number }>()).toEqual({ count: 300, maximum: 299 });
  });

  it("runs a Vietnamese-L1 launch, private state, and response save end to end", async () => {
    await applySchema();
    await seedReadySyntheticRelease();
    const fieldEnv = fieldEnvironment();
    const identity = { participantId: prolificHexId(0x200), submissionId: prolificHexId(0x2000) };
    installProlificMatrixMock(VI_STUDY_ID, [identity]);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const join = await requestWorker(
      `/join?PROLIFIC_PID=${identity.participantId}&STUDY_ID=${VI_STUDY_ID}&SESSION_ID=${identity.submissionId}`,
      {},
      fieldEnv
    );
    expect(join.status).toBe(303);
    const cookie = join.headers.get("set-cookie")!.split(";", 1)[0];
    const stateResponse = await requestWorker("/api/session/state", {
      headers: { Cookie: cookie, Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }
    }, fieldEnv);
    const state = await responseJson(stateResponse);
    expect(state).toMatchObject({ ok: true, l1: "vi", completed_testlets: 0 });
    const testlet = (state.next_step as Record<string, unknown>).testlet as {
      options: string[];
      items: Array<{ prompt: string }>;
    };
    expect(Object.keys(testlet).sort()).toEqual(["items", "options"]);
    expect(testlet.options).toEqual([
      "option-0-3", "option-0-1", "option-0-5",
      "option-0-2", "option-0-6", "option-0-4"
    ]);
    expect(JSON.stringify(state)).not.toMatch(/synthetic-(?:testlet|item)-|uvlt_[ab]_[1-5]k_/i);

    const save = await requestWorker(
      "/api/session/testlet-response",
      authenticatedJson(cookie, testletSubmissionBody(0, testlet.options.slice(0, 3))),
      fieldEnv
    );
    expect(save.status).toBe(200);
    expect(await responseJson(save)).toMatchObject({ ok: true, l1: "vi", completed_testlets: 1 });
    const persisted = await bindings.DB.prepare(`
      SELECT l1, allocation_index, route_id, option_layout_id, response_count
      FROM sessions WHERE release_id = ?
    `).bind(RELEASE_ID).first<{
      l1: string;
      allocation_index: number;
      route_id: string;
      option_layout_id: number;
      response_count: number;
    }>();
    expect(persisted).toEqual({
      l1: "vi",
      allocation_index: 0,
      route_id: "R01",
      option_layout_id: 5,
      response_count: 3
    });
  });

  it("saves one testlet exactly once and rejects conflicting or out-of-order replays", async () => {
    await applySchema();
    await seedReadySyntheticRelease();
    const fieldEnv = fieldEnvironment();
    installProlificSubmissionMock();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cookie = await launchSyntheticSession(fieldEnv);

    const firstBody = testletSubmissionBody(0, ["option-88-1", "option-88-2", "option-88-3"]);
    const firstSave = await requestWorker(
      "/api/session/testlet-response",
      authenticatedJson(cookie, firstBody),
      fieldEnv
    );
    expect(firstSave.status).toBe(200);
    expect(await responseJson(firstSave)).toMatchObject({
      ok: true,
      completed_testlets: 1,
      next_step: { kind: "testlet", testlet_ordinal: 1 }
    });

    const exactReplay = await requestWorker(
      "/api/session/testlet-response",
      authenticatedJson(cookie, firstBody),
      fieldEnv
    );
    expect(exactReplay.status).toBe(200);
    expect(await responseJson(exactReplay)).toMatchObject({
      ok: true,
      completed_testlets: 1,
      next_step: { kind: "testlet", testlet_ordinal: 1 }
    });

    const conflictingReplay = await requestWorker(
      "/api/session/testlet-response",
      authenticatedJson(cookie, {
        ...firstBody,
        selected_options: ["option-88-1", "option-88-2", "option-88-4"]
      }),
      fieldEnv
    );
    expect(conflictingReplay.status).toBe(409);
    expect(await responseJson(conflictingReplay)).toMatchObject({ ok: false, code: "RESPONSE_CONFLICT" });

    const outOfOrder = await requestWorker(
      "/api/session/testlet-response",
      authenticatedJson(
        cookie,
        testletSubmissionBody(2, ["option-2-1", "option-2-2", "option-2-3"])
      ),
      fieldEnv
    );
    expect(outOfOrder.status).toBe(409);
    expect(await responseJson(outOfOrder)).toMatchObject({ ok: false, code: "OUT_OF_ORDER_RESPONSE" });

    const persisted = await bindings.DB.prepare(`
      SELECT
        s.next_testlet_ordinal,
        s.completed_testlets,
        s.response_count,
        s.breaks_completed,
        (SELECT COUNT(*) FROM testlet_submissions ts WHERE ts.session_id = s.session_id) AS submissions,
        (SELECT COUNT(*) FROM responses r WHERE r.session_id = s.session_id) AS responses,
        (SELECT COUNT(*) FROM session_events e
          WHERE e.session_id = s.session_id AND e.event_type = 'testlet_submitted') AS submit_events
      FROM sessions s
      WHERE s.release_id = ? AND s.l1 = 'ja'
    `).bind(RELEASE_ID).first<{
      next_testlet_ordinal: number;
      completed_testlets: number;
      response_count: number;
      breaks_completed: number;
      submissions: number;
      responses: number;
      submit_events: number;
    }>();
    expect(persisted).toEqual({
      next_testlet_ordinal: 1,
      completed_testlets: 1,
      response_count: 3,
      breaks_completed: 0,
      submissions: 1,
      responses: 3,
      submit_events: 1
    });

    const savedSelections = await bindings.DB.prepare(`
      SELECT response_ordinal, item_id, selected_option, selected_option_position
      FROM responses
      ORDER BY response_ordinal
    `).all<{
      response_ordinal: number;
      item_id: string;
      selected_option: string;
      selected_option_position: number;
    }>();
    expect(savedSelections.results).toEqual([
      { response_ordinal: 1, item_id: "synthetic-item-088-1", selected_option: "option-88-1", selected_option_position: 5 },
      { response_ordinal: 2, item_id: "synthetic-item-088-2", selected_option: "option-88-2", selected_option_position: 3 },
      { response_ordinal: 3, item_id: "synthetic-item-088-3", selected_option: "option-88-3", selected_option_position: 6 }
    ]);

    const savedSubmission = await bindings.DB.prepare(`
      SELECT testlet_id, option_layout_id FROM testlet_submissions
      WHERE testlet_ordinal = 0
    `).first<{ testlet_id: string; option_layout_id: number }>();
    expect(savedSubmission).toEqual({ testlet_id: "synthetic-testlet-088", option_layout_id: 2 });

    await bindings.DB.prepare(`
      UPDATE sessions SET token_expires_at = '2000-01-01T00:00:00.000Z'
      WHERE release_id = ? AND l1 = 'ja'
    `).bind(RELEASE_ID).run();
    const expiredState = await requestWorker("/api/session/state", {
      headers: { Cookie: cookie, Origin: ORIGIN }
    }, fieldEnv);
    expect(expiredState.status).toBe(401);
    expect(await responseJson(expiredState)).toMatchObject({ ok: false, code: "SESSION_REQUIRED" });
  });

  it("completes all 100 testlets and nine breaks before issuing the Prolific completion URL", async () => {
    await applySchema();
    await seedReadySyntheticRelease();
    const fieldEnv = fieldEnvironment();
    installProlificSubmissionMock();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cookie = await launchSyntheticSession(fieldEnv);

    let stateResponse = await requestWorker("/api/session/state", {
      headers: { Cookie: cookie, Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }
    }, fieldEnv);
    expect(stateResponse.status).toBe(200);
    let state = await responseJson(stateResponse);

    for (let ordinal = 0; ordinal < 100; ordinal += 1) {
      const testlet = currentTestlet(state, ordinal);
      const saveResponse = await requestWorker(
        "/api/session/testlet-response",
        authenticatedJson(cookie, testletSubmissionBody(ordinal, testlet.options.slice(0, 3))),
        fieldEnv
      );
      expect(saveResponse.status, `testlet ${ordinal} should save`).toBe(200);
      state = await responseJson(saveResponse);

      if (ordinal === 98) {
        expect(state).toMatchObject({
          completed_testlets: 99,
          next_step: { kind: "testlet", testlet_ordinal: 99 }
        });
        const incompleteCounts = await bindings.DB.prepare(`
          SELECT completed_testlets, response_count, breaks_completed
          FROM sessions WHERE release_id = ? AND l1 = 'ja'
        `).bind(RELEASE_ID).first<{
          completed_testlets: number;
          response_count: number;
          breaks_completed: number;
        }>();
        expect(incompleteCounts).toEqual({ completed_testlets: 99, response_count: 297, breaks_completed: 9 });

        const prematureCompletion = await requestWorker(
          "/api/session/complete",
          authenticatedJson(cookie, {}),
          fieldEnv
        );
        expect(prematureCompletion.status).toBe(409);
        const prematureBody = await responseJson(prematureCompletion);
        expect(prematureBody).toMatchObject({ ok: false, code: "SESSION_INCOMPLETE" });
        expect(JSON.stringify(prematureBody)).not.toContain(COMPLETION_CODE);
      }

      if (ordinal < 99 && (ordinal + 1) % 10 === 0) {
        const modulePosition = (ordinal + 1) / 10;
        expect(state).toMatchObject({
          completed_testlets: ordinal + 1,
          next_step: { kind: "break", after_module_position: modulePosition }
        });
        const breakResponse = await requestWorker(
          "/api/session/break-complete",
          authenticatedJson(cookie, { after_module_position: modulePosition }),
          fieldEnv
        );
        expect(breakResponse.status, `break ${modulePosition} should save`).toBe(200);
        state = await responseJson(breakResponse);
      }
    }

    expect(state).toMatchObject({
      ok: true,
      status: "in_progress",
      completed_testlets: 100,
      next_step: { kind: "complete_ready" }
    });
    const completionResponse = await requestWorker(
      "/api/session/complete",
      authenticatedJson(cookie, {}),
      fieldEnv
    );
    expect(completionResponse.status).toBe(200);
    expect(await responseJson(completionResponse)).toEqual({
      ok: true,
      status: "completed",
      completion_code: COMPLETION_CODE,
      completion_url: `https://app.prolific.com/submissions/complete?cc=${COMPLETION_CODE}`
    });

    stateResponse = await requestWorker("/api/session/state", {
      headers: { Cookie: cookie, Origin: ORIGIN }
    }, fieldEnv);
    expect(stateResponse.status).toBe(200);
    expect(await responseJson(stateResponse)).toMatchObject({
      status: "completed",
      completed_testlets: 100,
      next_step: { kind: "completed" }
    });

    const finalCounts = await bindings.DB.prepare(`
      SELECT
        s.status,
        s.completed_testlets,
        s.response_count,
        s.breaks_completed,
        s.completed_at,
        s.completion_issued_at,
        (SELECT COUNT(*) FROM testlet_submissions ts WHERE ts.session_id = s.session_id) AS submissions,
        (SELECT COUNT(*) FROM responses r WHERE r.session_id = s.session_id) AS responses,
        (SELECT COUNT(*) FROM session_events e
          WHERE e.session_id = s.session_id AND e.event_type = 'break_completed') AS break_events,
        (SELECT COUNT(*) FROM session_events e
          WHERE e.session_id = s.session_id AND e.event_type = 'session_completed') AS completion_events
      FROM sessions s
      WHERE s.release_id = ? AND s.l1 = 'ja'
    `).bind(RELEASE_ID).first<{
      status: string;
      completed_testlets: number;
      response_count: number;
      breaks_completed: number;
      completed_at: string | null;
      completion_issued_at: string | null;
      submissions: number;
      responses: number;
      break_events: number;
      completion_events: number;
    }>();
    expect(finalCounts).toMatchObject({
      status: "completed",
      completed_testlets: 100,
      response_count: 300,
      breaks_completed: 9,
      submissions: 100,
      responses: 300,
      break_events: 9,
      completion_events: 1
    });
    expect(finalCounts?.completed_at).toMatch(ISO_UTC_PATTERN_FOR_TEST);
    expect(finalCounts?.completion_issued_at).toMatch(ISO_UTC_PATTERN_FOR_TEST);
  });
});
