import assert from "node:assert/strict";
import test from "node:test";
import {
  L1_STRATA,
  OPTION_LAYOUTS,
  OPTION_LAYOUT_ALGORITHM,
  RANDOMIZATION_ALGORITHM,
  ROUTE_IDS,
  buildBalanceAudit,
  buildEvenOrderWilliamsSquare,
  generateAllocationSchedule,
  payloadSha256,
  stableStringify,
  validateAllocationSchedule,
  validateWilliamsRouteBalance
} from "../cloudflare/tools/randomization-design.mjs";

function buildSyntheticRoutes() {
  const moduleIds = Array.from({ length: 10 }, (_value, index) =>
    `SYNTHETIC_MODULE_${String(index + 1).padStart(2, "0")}`);
  const modules = moduleIds.map((moduleId, moduleIndex) => ({
    moduleId,
    testletIds: Array.from({ length: 10 }, (_value, unitIndex) =>
      `SYNTHETIC_UNIT_${String(moduleIndex + 1).padStart(2, "0")}_${String(unitIndex + 1).padStart(2, "0")}`)
  }));
  const moduleSquare = buildEvenOrderWilliamsSquare(10);
  const withinModuleSquare = buildEvenOrderWilliamsSquare(10);
  const fixture = {
    schemaVersion: "uvlt-fixed-ab-routes-snapshot-1.0",
    modules,
    routes: moduleSquare.map((moduleSequence, routeIndex) => {
      const moduleOrder = moduleSequence.map(moduleIndex => moduleIds[moduleIndex]);
      const expandedModules = moduleOrder.map(moduleId => {
        const canonicalModule = modules.find(module => module.moduleId === moduleId);
        return {
          moduleId,
          testletOrder: withinModuleSquare[routeIndex]
            .map(unitIndex => canonicalModule.testletIds[unitIndex])
        };
      });
      return {
        routeId: ROUTE_IDS[routeIndex],
        moduleOrder,
        modules: expandedModules,
        testletOrder: expandedModules.flatMap(module => module.testletOrder)
      };
    }),
    integrity: { payloadSha256: "" }
  };
  fixture.integrity.payloadSha256 = payloadSha256(fixture);
  return fixture;
}

const routes = buildSyntheticRoutes();
const routesPayloadSha256 = routes.integrity.payloadSha256;
const releaseId = "uvlt-fixed-ab-randomization-test";
const seed = "test-only-randomization-seed-32-bytes-minimum";
const KNOWN_SCHEDULE_PAYLOAD_SHA256 =
  "309df24906f9c1d4761b561e711a5f63b776d5c04707ca4cb11b975692db0adb";

function scheduleFor(seedValue = seed) {
  return generateAllocationSchedule({ seed: seedValue, releaseId, routesPayloadSha256 });
}

function rehash(artifact) {
  artifact.integrity.payloadSha256 = payloadSha256(artifact);
  return artifact;
}

test("option layouts are the canonical-first 6x6 Williams square", () => {
  assert.equal(OPTION_LAYOUT_ALGORITHM, "even-order-williams-square-6-canonical-first-v1");
  assert.deepEqual(buildEvenOrderWilliamsSquare(6), [
    [0, 1, 2, 3, 4, 5],
    [1, 3, 0, 5, 2, 4],
    [3, 5, 1, 4, 0, 2],
    [5, 4, 3, 2, 1, 0],
    [4, 2, 5, 0, 3, 1],
    [2, 0, 4, 1, 5, 3]
  ]);
  assert.deepEqual(OPTION_LAYOUTS[0].optionOrder, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(OPTION_LAYOUTS.map(layout => layout.optionOrder),
    buildEvenOrderWilliamsSquare(6));
  const positions = new Map();
  const carryovers = new Map();
  for (const layout of OPTION_LAYOUTS) {
    layout.optionOrder.forEach((condition, position) => {
      positions.set(`${condition}|${position}`, (positions.get(`${condition}|${position}`) || 0) + 1);
      if (position < 5) {
        const key = `${condition}|${layout.optionOrder[position + 1]}`;
        carryovers.set(key, (carryovers.get(key) || 0) + 1);
      }
    });
  }
  assert.equal(positions.size, 36);
  assert.ok([...positions.values()].every(count => count === 1));
  assert.equal(carryovers.size, 30);
  assert.ok([...carryovers.values()].every(count => count === 1));
});

test("schedule generation is deterministic, domain-separated by L1, and never stores the seed", () => {
  assert.equal(RANDOMIZATION_ALGORITHM,
    "hmac-sha256-permuted-blocks-10-crossed-option-williams-6-v1");
  const first = scheduleFor();
  const second = scheduleFor();
  assert.equal(stableStringify(first), stableStringify(second));
  // This vector makes an algorithm change explicit even when generator and
  // validator are changed together and would otherwise remain self-consistent.
  assert.equal(first.integrity.payloadSha256, KNOWN_SCHEDULE_PAYLOAD_SHA256);
  assert.notEqual(first.seedFingerprint, seed);
  assert.doesNotMatch(stableStringify(first), new RegExp(seed.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));

  const japanese = first.slots.filter(slot => slot.l1 === "ja")
    .map(({ routeId, optionLayoutIndex }) => [routeId, optionLayoutIndex]);
  const vietnamese = first.slots.filter(slot => slot.l1 === "vi")
    .map(({ routeId, optionLayoutIndex }) => [routeId, optionLayoutIndex]);
  assert.notDeepEqual(japanese, vietnamese);
  assert.notDeepEqual(first.slots, scheduleFor("a-different-test-only-randomization-seed-value").slots);
});

test("schedule satisfies every block and crossed route-layout constraint", () => {
  const schedule = scheduleFor();
  const summary = validateAllocationSchedule(schedule, { releaseId, routesPayloadSha256 });
  assert.equal(summary.passed, true);
  assert.equal(summary.totalSlots, 600);
  assert.deepEqual(summary.perL1.map(entry => entry.l1), L1_STRATA);
  for (const l1 of L1_STRATA) {
    const slots = schedule.slots.filter(slot => slot.l1 === l1);
    assert.equal(slots.length, 300);
    for (let block = 0; block < 30; block += 1) {
      const blockSlots = slots.filter(slot => slot.blockIndex === block);
      assert.equal(blockSlots.length, 10);
      assert.deepEqual([...new Set(blockSlots.map(slot => slot.routeId))].sort(), [...ROUTE_IDS]);
    }
    for (const routeId of ROUTE_IDS) {
      for (let optionLayoutIndex = 0; optionLayoutIndex < 6; optionLayoutIndex += 1) {
        assert.equal(slots.filter(slot => slot.routeId === routeId &&
          slot.optionLayoutIndex === optionLayoutIndex).length, 5);
        for (let macroreplicateIndex = 0; macroreplicateIndex < 5; macroreplicateIndex += 1) {
          assert.equal(slots.filter(slot => slot.macroreplicateIndex === macroreplicateIndex &&
            slot.routeId === routeId && slot.optionLayoutIndex === optionLayoutIndex).length, 1);
        }
      }
    }
  }
});

test("seed length is measured in UTF-8 bytes and short seeds fail closed", () => {
  assert.throws(() => scheduleFor("x".repeat(31)), /at least 32 UTF-8 bytes/u);
  assert.doesNotThrow(() => scheduleFor("安全な種".repeat(8)));
});

test("schedule validation detects a tampered allocation even with a recomputed hash", () => {
  const schedule = structuredClone(scheduleFor());
  schedule.slots[1].routeId = schedule.slots[0].routeId;
  rehash(schedule);
  assert.throws(() => validateAllocationSchedule(schedule), /each route exactly once/u);
});

test("route validator recomputes module and within-module Williams balance", () => {
  const summary = validateWilliamsRouteBalance(routes);
  assert.equal(summary.modulePosition.cells, 100);
  assert.equal(summary.moduleDirectedFirstOrderCarryover.cells, 90);
  assert.equal(summary.withinModuleTestletPosition.cells, 1000);
  assert.equal(summary.withinModuleTestletDirectedFirstOrderCarryover.cells, 900);

  const moved = structuredClone(routes);
  const firstModule = moved.routes[0].modules[0];
  [firstModule.testletOrder[0], firstModule.testletOrder[1]] =
    [firstModule.testletOrder[1], firstModule.testletOrder[0]];
  moved.routes[0].testletOrder = moved.routes[0].modules.flatMap(module => module.testletOrder);
  assert.throws(() => validateWilliamsRouteBalance(moved), /balance is invalid/u);
});

test("balance audit is aggregate-only and omits private schedule material", () => {
  const schedule = scheduleFor();
  const audit = buildBalanceAudit({ schedule, routes });
  assert.equal(audit.allocationBalance.passed, true);
  assert.equal(audit.routeBalance.passed, true);
  assert.equal(audit.allocationSchedulePayloadSha256, schedule.integrity.payloadSha256);
  assert.equal(audit.randomizationSeedFingerprint, schedule.seedFingerprint);
  assert.equal(audit.routesPayloadSha256, routes.integrity.payloadSha256);
  assert.equal(audit.integrity.payloadSha256, payloadSha256(audit));
  const serialized = stableStringify(audit);
  assert.doesNotMatch(serialized, /uvlt_[ab]_[1-5]k_t(?:0[1-9]|10)/u);
  assert.doesNotMatch(serialized, /"slots"|"prompt"|"options"|"optionOrder"|stimulus/iu);
  assert.doesNotMatch(serialized, new RegExp(seed.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});
