import { createHash, createHmac } from "node:crypto";

export const RANDOMIZATION_ALGORITHM =
  "hmac-sha256-permuted-blocks-10-crossed-option-williams-6-v1";
export const OPTION_LAYOUT_ALGORITHM =
  "even-order-williams-square-6-canonical-first-v1";
export const L1_STRATA = Object.freeze(["ja", "vi"]);
export const ROUTE_IDS = Object.freeze(
  Array.from({ length: 10 }, (_value, index) => `R${String(index + 1).padStart(2, "0")}`)
);

const SCHEDULE_SCHEMA_VERSION = "uvlt-fixed-ab-randomization-schedule-2";
const AUDIT_SCHEMA_VERSION = "uvlt-fixed-ab-randomization-balance-audit-2";
export const TARGET_PROTOCOL_COMPLETERS_PER_L1 = 300;
export const HARD_CAP_STARTS_PER_L1 = 420;
export const PROTOCOL_COMPLETION_DEFINITION =
  "d1-completed-after-100-testlets-300-responses-9-breaks-v1";
export const PARTIAL_RESPONSE_RETENTION_DEFINITION =
  "consented-nonwithdrawn-server-committed-complete-testlets-v1";
const BLOCK_SIZE = 10;
const BLOCKS_PER_L1 = 42;
const MACROREPLICATES_PER_L1 = 7;
const BLOCKS_PER_MACROREPLICATE = 6;
const OPTION_LAYOUT_COUNT = 6;
const UINT32_RANGE = 0x1_0000_0000;

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

function assertInteger(value, label, minimum, maximum) {
  assert(Number.isInteger(value) && value >= minimum && value <= maximum,
    `${label} must be an integer from ${minimum} through ${maximum}`);
}

function assertSha256(value, label) {
  assert(typeof value === "string" && /^[0-9a-f]{64}$/u.test(value),
    `${label} must be a lowercase SHA-256 value`);
}

function assertReleaseId(value) {
  assert(typeof value === "string" && value.length >= 8 && value.length <= 128 &&
    /^[a-z0-9][a-z0-9._-]+$/u.test(value),
  "releaseId must be an 8-128 character lowercase release identifier");
}

function assertSeed(seed) {
  assert(typeof seed === "string", "UVLT randomization seed must be a string");
  assert(Buffer.byteLength(seed, "utf8") >= 32,
    "UVLT randomization seed must contain at least 32 UTF-8 bytes");
}

export function validateRecruitmentPolicy(policy) {
  assertExactKeys(policy, [
    "targetProtocolCompletersPerL1", "hardCapStartsPerL1",
    "stopNewAllocationsAtTarget", "retainServerCommittedPartialResponses",
    "protocolCompletionDefinition", "partialResponseRetentionDefinition"
  ], "Recruitment policy");
  assert(policy.targetProtocolCompletersPerL1 === TARGET_PROTOCOL_COMPLETERS_PER_L1,
    "Recruitment policy must target 300 protocol completers per L1");
  assert(policy.hardCapStartsPerL1 === HARD_CAP_STARTS_PER_L1,
    "Recruitment policy must cap starts at 420 per L1");
  assert(policy.stopNewAllocationsAtTarget === true,
    "Recruitment policy must stop new allocations at the completer target");
  assert(policy.retainServerCommittedPartialResponses === true,
    "Recruitment policy must retain server-committed partial responses");
  assert(policy.protocolCompletionDefinition === PROTOCOL_COMPLETION_DEFINITION,
    "Recruitment policy has an unsupported protocol-completion definition");
  assert(policy.partialResponseRetentionDefinition === PARTIAL_RESPONSE_RETENTION_DEFINITION,
    "Recruitment policy has an unsupported partial-response retention definition");
  return Object.freeze({ ...policy });
}

export function recruitmentPolicy() {
  return Object.freeze({
    targetProtocolCompletersPerL1: TARGET_PROTOCOL_COMPLETERS_PER_L1,
    hardCapStartsPerL1: HARD_CAP_STARTS_PER_L1,
    stopNewAllocationsAtTarget: true,
    retainServerCommittedPartialResponses: true,
    protocolCompletionDefinition: PROTOCOL_COMPLETION_DEFINITION,
    partialResponseRetentionDefinition: PARTIAL_RESPONSE_RETENTION_DEFINITION
  });
}

export function stableStringify(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value), "Stable JSON cannot contain a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  throw new Error("Stable JSON accepts JSON-compatible plain values only");
}

export function sha256Hex(value) {
  assert(typeof value === "string" || value instanceof Uint8Array,
    "SHA-256 input must be a string or Uint8Array");
  return createHash("sha256").update(value).digest("hex");
}

export function payloadSha256(artifact) {
  assertPlainObject(artifact, "Artifact");
  assertPlainObject(artifact.integrity, "Artifact integrity");
  const copy = structuredClone(artifact);
  delete copy.integrity.payloadSha256;
  return sha256Hex(stableStringify(copy));
}

export function seedFingerprint(seed) {
  assertSeed(seed);
  return `sha256:${sha256Hex(Buffer.from(seed, "utf8"))}`;
}

/**
 * Construct the standard even-order Williams square. Values are canonical
 * zero-based condition indices; each row lists conditions by display position.
 */
export function buildEvenOrderWilliamsSquare(order) {
  assert(Number.isInteger(order) && order >= 2 && order % 2 === 0,
    "Williams square order must be an even integer of at least two");
  const first = [0];
  for (let offset = 1; first.length < order; offset += 1) {
    first.push(offset);
    if (first.length < order) first.push(order - offset);
  }
  const canonicalLabelByRawTreatment = new Map(
    first.map((rawTreatment, canonicalPosition) => [rawTreatment, canonicalPosition])
  );
  return Array.from({ length: order }, (_value, row) =>
    first.map(condition => canonicalLabelByRawTreatment.get((condition + row) % order)));
}

export const OPTION_LAYOUTS = Object.freeze(
  buildEvenOrderWilliamsSquare(OPTION_LAYOUT_COUNT).map((optionOrder, optionLayoutIndex) =>
    Object.freeze({ optionLayoutIndex, optionOrder: Object.freeze(optionOrder) }))
);

/**
 * Domain-separated deterministic counter generator. randomInt uses rejection
 * sampling, so Fisher-Yates choices are not biased by a modulo operation.
 */
export function createHmacCounterRng(seed, domain) {
  assertSeed(seed);
  assert(typeof domain === "string" && domain.length > 0, "RNG domain must be a non-empty string");
  const key = Buffer.from(seed, "utf8");
  const domainBytes = Buffer.from(domain, "utf8");
  let counter = 0n;
  let block = Buffer.alloc(0);
  let offset = 0;

  function refill() {
    const counterBytes = Buffer.alloc(8);
    counterBytes.writeBigUInt64BE(counter);
    counter += 1n;
    const domainLength = Buffer.alloc(4);
    domainLength.writeUInt32BE(domainBytes.length);
    block = createHmac("sha256", key)
      .update("uvlt-hmac-counter-rng-v1\0", "utf8")
      .update(domainLength)
      .update(domainBytes)
      .update(counterBytes)
      .digest();
    offset = 0;
  }

  function uint32() {
    if (offset + 4 > block.length) refill();
    const value = block.readUInt32BE(offset);
    offset += 4;
    return value;
  }

  function randomInt(maxExclusive) {
    assert(Number.isInteger(maxExclusive) && maxExclusive >= 1 && maxExclusive <= UINT32_RANGE,
      "randomInt upper bound must be an integer from 1 through 2^32");
    if (maxExclusive === UINT32_RANGE) return uint32();
    const rejectionLimit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
    let value;
    do value = uint32(); while (value >= rejectionLimit);
    return value % maxExclusive;
  }

  function shuffle(values) {
    assert(Array.isArray(values), "Fisher-Yates input must be an array");
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = randomInt(index + 1);
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  return Object.freeze({ randomInt, shuffle });
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function countRange(map) {
  const values = [...map.values()];
  return Object.freeze({
    cells: values.length,
    minimum: values.length ? Math.min(...values) : 0,
    maximum: values.length ? Math.max(...values) : 0
  });
}

function validateOptionLayouts(layouts) {
  assert(Array.isArray(layouts) && layouts.length === OPTION_LAYOUT_COUNT,
    "Option layout set must contain six sequences");
  const expected = buildEvenOrderWilliamsSquare(OPTION_LAYOUT_COUNT);
  assert(JSON.stringify(expected[0]) === JSON.stringify([0, 1, 2, 3, 4, 5]),
    "Canonical-first Williams layout must preserve the original option order in layout 0");
  const positionCounts = new Map();
  const carryoverCounts = new Map();
  layouts.forEach((layout, layoutIndex) => {
    assertExactKeys(layout, ["optionLayoutIndex", "optionOrder"], `optionLayouts[${layoutIndex}]`);
    assert(layout.optionLayoutIndex === layoutIndex,
      `optionLayouts[${layoutIndex}] must have its canonical optionLayoutIndex`);
    assert(Array.isArray(layout.optionOrder) && layout.optionOrder.length === OPTION_LAYOUT_COUNT,
      `optionLayouts[${layoutIndex}].optionOrder must contain six entries`);
    assert(new Set(layout.optionOrder).size === OPTION_LAYOUT_COUNT &&
      layout.optionOrder.every(value => Number.isInteger(value) && value >= 0 && value < OPTION_LAYOUT_COUNT),
    `optionLayouts[${layoutIndex}].optionOrder must be a permutation of 0-5`);
    assert(JSON.stringify(layout.optionOrder) === JSON.stringify(expected[layoutIndex]),
      `optionLayouts[${layoutIndex}] does not match the canonical Williams sequence`);
    layout.optionOrder.forEach((condition, position) => {
      increment(positionCounts, `${condition}|${position}`);
      if (position + 1 < layout.optionOrder.length) {
        increment(carryoverCounts, `${condition}|${layout.optionOrder[position + 1]}`);
      }
    });
  });
  assert(positionCounts.size === 36 && [...positionCounts.values()].every(count => count === 1),
    "Option layouts do not balance conditions across display positions");
  assert(carryoverCounts.size === 30 && [...carryoverCounts.values()].every(count => count === 1),
    "Option layouts do not balance directed first-order carryover");
  return Object.freeze({
    passed: true,
    sequences: 6,
    positionsPerSequence: 6,
    positionCells: 36,
    repetitionsPerPositionCell: 1,
    directedFirstOrderCarryoverCells: 30,
    repetitionsPerDirectedCarryoverCell: 1
  });
}

export function generateAllocationSchedule({ seed, releaseId, routesPayloadSha256 }) {
  assertSeed(seed);
  assertReleaseId(releaseId);
  assertSha256(routesPayloadSha256, "routesPayloadSha256");
  const slots = [];

  for (const l1 of L1_STRATA) {
    const rng = createHmacCounterRng(
      seed,
      `${RANDOMIZATION_ALGORITHM}\0${releaseId}\0l1:${l1}`
    );
    for (let macroreplicateIndex = 0;
      macroreplicateIndex < MACROREPLICATES_PER_L1;
      macroreplicateIndex += 1) {
      // The rank and label permutations remove deterministic route/layout
      // pairings while the six permuted offsets preserve a complete crossing.
      const rankedRoutes = rng.shuffle(ROUTE_IDS);
      const blockOffsets = rng.shuffle(Array.from({ length: 6 }, (_value, index) => index));
      const layoutLabels = rng.shuffle(Array.from({ length: 6 }, (_value, index) => index));

      for (let blockWithinMacroreplicate = 0;
        blockWithinMacroreplicate < BLOCKS_PER_MACROREPLICATE;
        blockWithinMacroreplicate += 1) {
        const blockIndex = macroreplicateIndex * BLOCKS_PER_MACROREPLICATE +
          blockWithinMacroreplicate;
        const optionLayoutByRoute = new Map();
        rankedRoutes.forEach((routeId, rank) => {
          const canonicalLayout = (rank + blockOffsets[blockWithinMacroreplicate]) % 6;
          optionLayoutByRoute.set(routeId, layoutLabels[canonicalLayout]);
        });
        const routeOrder = rng.shuffle(ROUTE_IDS);
        routeOrder.forEach((routeId, positionWithinBlock) => {
          slots.push({
            l1,
            slotIndex: blockIndex * BLOCK_SIZE + positionWithinBlock,
            blockIndex,
            positionWithinBlock,
            macroreplicateIndex,
            blockWithinMacroreplicate,
            routeId,
            optionLayoutIndex: optionLayoutByRoute.get(routeId)
          });
        });
      }
    }
  }

  const schedule = {
    schemaVersion: SCHEDULE_SCHEMA_VERSION,
    releaseId,
    algorithm: RANDOMIZATION_ALGORITHM,
    optionLayoutAlgorithm: OPTION_LAYOUT_ALGORITHM,
    seedFingerprint: seedFingerprint(seed),
    routesPayloadSha256,
    recruitmentPolicy: recruitmentPolicy(),
    blockSize: BLOCK_SIZE,
    blocksPerL1: BLOCKS_PER_L1,
    macroreplicatesPerL1: MACROREPLICATES_PER_L1,
    blocksPerMacroreplicate: BLOCKS_PER_MACROREPLICATE,
    optionLayouts: OPTION_LAYOUTS.map(layout => ({
      optionLayoutIndex: layout.optionLayoutIndex,
      optionOrder: [...layout.optionOrder]
    })),
    slots,
    integrity: { payloadSha256: "" }
  };
  schedule.integrity.payloadSha256 = payloadSha256(schedule);
  validateAllocationSchedule(schedule, { releaseId, routesPayloadSha256 });
  return schedule;
}

export function validateAllocationSchedule(schedule, expected = {}) {
  assertPlainObject(expected, "Expected schedule identity");
  assertExactKeys(schedule, [
    "schemaVersion", "releaseId", "algorithm", "optionLayoutAlgorithm",
    "seedFingerprint", "routesPayloadSha256", "recruitmentPolicy", "blockSize",
    "blocksPerL1", "macroreplicatesPerL1", "blocksPerMacroreplicate",
    "optionLayouts", "slots", "integrity"
  ], "Randomization schedule");
  assert(schedule.schemaVersion === SCHEDULE_SCHEMA_VERSION, "Unsupported randomization schedule schema");
  assertReleaseId(schedule.releaseId);
  assert(schedule.algorithm === RANDOMIZATION_ALGORITHM, "Unexpected randomization algorithm");
  assert(schedule.optionLayoutAlgorithm === OPTION_LAYOUT_ALGORITHM,
    "Unexpected option layout algorithm");
  assert(typeof schedule.seedFingerprint === "string" &&
    /^sha256:[0-9a-f]{64}$/u.test(schedule.seedFingerprint),
  "seedFingerprint must be sha256:<64 lowercase hex>");
  assertSha256(schedule.routesPayloadSha256, "routesPayloadSha256");
  if (expected.releaseId !== undefined) {
    assert(schedule.releaseId === expected.releaseId, "Schedule releaseId does not match the expected release");
  }
  if (expected.routesPayloadSha256 !== undefined) {
    assert(schedule.routesPayloadSha256 === expected.routesPayloadSha256,
      "Schedule routesPayloadSha256 does not match the expected route artifact");
  }
  validateRecruitmentPolicy(schedule.recruitmentPolicy);
  assert(schedule.blockSize === BLOCK_SIZE, "Schedule block size must be 10");
  assert(schedule.blocksPerL1 === BLOCKS_PER_L1, "Schedule must contain 42 blocks per L1");
  assert(schedule.macroreplicatesPerL1 === MACROREPLICATES_PER_L1,
    "Schedule must contain seven macroreplicates per L1");
  assert(schedule.blocksPerMacroreplicate === BLOCKS_PER_MACROREPLICATE,
    "Schedule must contain six blocks per macroreplicate");
  const optionLayoutSummary = validateOptionLayouts(schedule.optionLayouts);
  assert(Array.isArray(schedule.slots) &&
    schedule.slots.length === L1_STRATA.length * HARD_CAP_STARTS_PER_L1,
  "Schedule must contain 840 allocation slots");

  const l1Summaries = [];
  L1_STRATA.forEach((l1, l1Index) => {
    const start = l1Index * HARD_CAP_STARTS_PER_L1;
    const stratumSlots = schedule.slots.slice(start, start + HARD_CAP_STARTS_PER_L1);
    const routeCounts = new Map();
    const layoutCounts = new Map();
    const routeLayoutCounts = new Map();
    const macroRouteLayoutCounts = new Map();
    let minimumLayoutCountWithinBlock = Number.POSITIVE_INFINITY;
    let maximumLayoutCountWithinBlock = Number.NEGATIVE_INFINITY;

    stratumSlots.forEach((slot, localIndex) => {
      assertExactKeys(slot, [
        "l1", "slotIndex", "blockIndex", "positionWithinBlock",
        "macroreplicateIndex", "blockWithinMacroreplicate", "routeId",
        "optionLayoutIndex"
      ], `slots[${start + localIndex}]`);
      const expectedBlock = Math.floor(localIndex / BLOCK_SIZE);
      assert(slot.l1 === l1, `slots[${start + localIndex}] is outside canonical L1 ordering`);
      assert(slot.slotIndex === localIndex, `${l1} slotIndex must be canonical and zero-based`);
      assert(slot.blockIndex === expectedBlock, `${l1} blockIndex is inconsistent with slotIndex`);
      assert(slot.positionWithinBlock === localIndex % BLOCK_SIZE,
        `${l1} positionWithinBlock is inconsistent with slotIndex`);
      assert(slot.macroreplicateIndex === Math.floor(expectedBlock / BLOCKS_PER_MACROREPLICATE),
        `${l1} macroreplicateIndex is inconsistent with blockIndex`);
      assert(slot.blockWithinMacroreplicate === expectedBlock % BLOCKS_PER_MACROREPLICATE,
        `${l1} blockWithinMacroreplicate is inconsistent with blockIndex`);
      assert(ROUTE_IDS.includes(slot.routeId), `${l1} slot has an invalid routeId`);
      assertInteger(slot.optionLayoutIndex, `${l1} optionLayoutIndex`, 0, 5);
      increment(routeCounts, slot.routeId);
      increment(layoutCounts, String(slot.optionLayoutIndex));
      increment(routeLayoutCounts, `${slot.routeId}|${slot.optionLayoutIndex}`);
      increment(macroRouteLayoutCounts,
        `${slot.macroreplicateIndex}|${slot.routeId}|${slot.optionLayoutIndex}`);
    });

    for (let blockIndex = 0; blockIndex < BLOCKS_PER_L1; blockIndex += 1) {
      const blockSlots = stratumSlots.slice(blockIndex * BLOCK_SIZE, (blockIndex + 1) * BLOCK_SIZE);
      assert(new Set(blockSlots.map(slot => slot.routeId)).size === ROUTE_IDS.length &&
        ROUTE_IDS.every(routeId => blockSlots.some(slot => slot.routeId === routeId)),
      `${l1} block ${blockIndex} must contain each route exactly once`);
      const blockLayoutCounts = new Map();
      blockSlots.forEach(slot => increment(blockLayoutCounts, String(slot.optionLayoutIndex)));
      assert(blockLayoutCounts.size === OPTION_LAYOUT_COUNT,
        `${l1} block ${blockIndex} must contain every option layout`);
      minimumLayoutCountWithinBlock = Math.min(minimumLayoutCountWithinBlock,
        ...blockLayoutCounts.values());
      maximumLayoutCountWithinBlock = Math.max(maximumLayoutCountWithinBlock,
        ...blockLayoutCounts.values());
      assert([...blockLayoutCounts.values()].every(count => count === 1 || count === 2),
        `${l1} block ${blockIndex} option layouts must occur once or twice`);
    }

    assert(routeCounts.size === 10 && [...routeCounts.values()].every(count => count === 42),
      `${l1} routes must each occur 42 times`);
    assert(layoutCounts.size === 6 && [...layoutCounts.values()].every(count => count === 70),
      `${l1} option layouts must each occur 70 times`);
    assert(routeLayoutCounts.size === 60 && [...routeLayoutCounts.values()].every(count => count === 7),
      `${l1} route-by-option-layout cells must each occur seven times`);
    assert(macroRouteLayoutCounts.size === 420 &&
      [...macroRouteLayoutCounts.values()].every(count => count === 1),
    `${l1} must completely cross route and option layout once in every macroreplicate`);

    l1Summaries.push(Object.freeze({
      l1,
      slots: HARD_CAP_STARTS_PER_L1,
      blocks: BLOCKS_PER_L1,
      startsPerRoute: 42,
      startsPerOptionLayout: 70,
      routeOptionLayoutCells: 60,
      replicationsPerRouteOptionLayoutCell: 7,
      macroreplicates: MACROREPLICATES_PER_L1,
      routeOptionLayoutCellsPerMacroreplicate: 60,
      replicationsPerCellWithinMacroreplicate: 1,
      minimumOptionLayoutCountWithinBlock: minimumLayoutCountWithinBlock,
      maximumOptionLayoutCountWithinBlock: maximumLayoutCountWithinBlock
    }));
  });

  assertExactKeys(schedule.integrity, ["payloadSha256"], "Randomization schedule integrity");
  assertSha256(schedule.integrity.payloadSha256, "Schedule integrity.payloadSha256");
  assert(payloadSha256(schedule) === schedule.integrity.payloadSha256,
    "Randomization schedule payload hash is invalid");

  return Object.freeze({
    passed: true,
    totalSlots: schedule.slots.length,
    perL1: Object.freeze(l1Summaries),
    optionLayouts: optionLayoutSummary
  });
}

/**
 * Recompute, rather than trust, the route artifact's two nested Williams
 * balances. Returned values are aggregate-only and safe for the public audit.
 */
export function analyzeWilliamsRouteBalance(routes) {
  assertPlainObject(routes, "Route artifact");
  assert(routes.schemaVersion === "uvlt-fixed-ab-routes-snapshot-1.0",
    "Unsupported route artifact schema");
  assert(Array.isArray(routes.modules) && routes.modules.length === 10,
    "Route artifact must define 10 canonical modules");
  const canonicalModules = new Map();
  for (const [index, module] of routes.modules.entries()) {
    assertPlainObject(module, `routes.modules[${index}]`);
    assert(typeof module.moduleId === "string" && module.moduleId.length > 0,
      `routes.modules[${index}] must have a moduleId`);
    assert(!canonicalModules.has(module.moduleId), "Route artifact contains a duplicate moduleId");
    assert(Array.isArray(module.testletIds) && module.testletIds.length === 10 &&
      new Set(module.testletIds).size === 10 &&
      module.testletIds.every(testletId => typeof testletId === "string" && testletId.length > 0),
    `${module.moduleId} must define 10 unique testlet IDs`);
    canonicalModules.set(module.moduleId, new Set(module.testletIds));
  }
  const moduleIds = [...canonicalModules.keys()];
  const allTestletIds = routes.modules.flatMap(module => module.testletIds);
  assert(new Set(allTestletIds).size === 100,
    "Canonical modules must contain 100 globally unique testlet IDs");
  assert(Array.isArray(routes.routes) && routes.routes.length === 10,
    "Route artifact must contain 10 routes");
  assert(new Set(routes.routes.map(route => route.routeId)).size === 10 &&
    ROUTE_IDS.every(routeId => routes.routes.some(route => route.routeId === routeId)),
  "Route artifact must contain canonical routes R01-R10 exactly once");

  const modulePositions = new Map();
  const moduleCarryovers = new Map();
  const withinModulePositions = new Map();
  const withinModuleCarryovers = new Map();

  routes.routes.forEach((route, routeIndex) => {
    assertPlainObject(route, `routes.routes[${routeIndex}]`);
    assert(Array.isArray(route.moduleOrder) && route.moduleOrder.length === 10 &&
      new Set(route.moduleOrder).size === 10 &&
      moduleIds.every(moduleId => route.moduleOrder.includes(moduleId)),
    `${route.routeId} must contain each canonical module exactly once`);
    assert(Array.isArray(route.modules) && route.modules.length === 10,
      `${route.routeId} must contain 10 expanded modules`);
    route.moduleOrder.forEach((moduleId, position) => {
      increment(modulePositions, `${moduleId}|${position}`);
      if (position + 1 < route.moduleOrder.length) {
        increment(moduleCarryovers, `${moduleId}|${route.moduleOrder[position + 1]}`);
      }
    });

    const flattened = [];
    route.modules.forEach((module, moduleIndex) => {
      assertPlainObject(module, `${route.routeId}.modules[${moduleIndex}]`);
      const moduleId = route.moduleOrder[moduleIndex];
      assert(module.moduleId === moduleId,
        `${route.routeId} expanded module order does not match moduleOrder`);
      assert(Array.isArray(module.testletOrder) && module.testletOrder.length === 10 &&
        new Set(module.testletOrder).size === 10 &&
        module.testletOrder.every(testletId => canonicalModules.get(moduleId).has(testletId)),
      `${route.routeId}/${moduleId} must contain its 10 canonical testlets exactly once`);
      module.testletOrder.forEach((testletId, position) => {
        increment(withinModulePositions, `${moduleId}|${testletId}|${position}`);
        if (position + 1 < module.testletOrder.length) {
          increment(withinModuleCarryovers,
            `${moduleId}|${testletId}|${module.testletOrder[position + 1]}`);
        }
      });
      flattened.push(...module.testletOrder);
    });
    assert(Array.isArray(route.testletOrder) && route.testletOrder.length === 100 &&
      route.testletOrder.every((testletId, index) => testletId === flattened[index]),
    `${route.routeId} flattened testlet order does not match expanded modules`);
  });

  const analysis = {
    routeCount: routes.routes.length,
    moduleCount: routes.modules.length,
    testletsPerModule: 10,
    modulePosition: countRange(modulePositions),
    moduleDirectedFirstOrderCarryover: countRange(moduleCarryovers),
    withinModuleTestletPosition: countRange(withinModulePositions),
    withinModuleTestletDirectedFirstOrderCarryover: countRange(withinModuleCarryovers)
  };
  return Object.freeze(analysis);
}

export function validateWilliamsRouteBalance(routes) {
  const analysis = analyzeWilliamsRouteBalance(routes);
  for (const [field, expectedCells] of [
    ["modulePosition", 100],
    ["moduleDirectedFirstOrderCarryover", 90],
    ["withinModuleTestletPosition", 1000],
    ["withinModuleTestletDirectedFirstOrderCarryover", 900]
  ]) {
    const result = analysis[field];
    assert(result.cells === expectedCells && result.minimum === 1 && result.maximum === 1,
      `Route ${field} balance is invalid`);
  }
  return Object.freeze({ passed: true, ...analysis });
}

export function buildBalanceAudit({ schedule, routes }) {
  const allocation = validateAllocationSchedule(schedule);
  const routeBalance = validateWilliamsRouteBalance(routes);
  assertPlainObject(routes.integrity, "Route artifact integrity");
  assertSha256(routes.integrity.payloadSha256, "Route artifact integrity.payloadSha256");
  assert(payloadSha256(routes) === routes.integrity.payloadSha256,
    "Route artifact payload hash is invalid");
  assert(schedule.routesPayloadSha256 === routes.integrity.payloadSha256,
    "Schedule is not bound to the audited route artifact");
  const safePerL1 = allocation.perL1.map(({ slots, ...summary }) => ({
    ...summary,
    hardCapAllocations: slots
  }));
  const audit = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    releaseId: schedule.releaseId,
    randomizationAlgorithm: RANDOMIZATION_ALGORITHM,
    optionLayoutAlgorithm: OPTION_LAYOUT_ALGORITHM,
    allocationSchedulePayloadSha256: schedule.integrity.payloadSha256,
    randomizationSeedFingerprint: schedule.seedFingerprint,
    routesPayloadSha256: schedule.routesPayloadSha256,
    design: {
      l1Strata: [...L1_STRATA],
      recruitmentPolicy: recruitmentPolicy(),
      blockSize: BLOCK_SIZE,
      blocksPerL1: BLOCKS_PER_L1,
      macroreplicatesPerL1: MACROREPLICATES_PER_L1,
      blocksPerMacroreplicate: BLOCKS_PER_MACROREPLICATE,
      routeCount: ROUTE_IDS.length,
      optionLayoutCount: OPTION_LAYOUT_COUNT
    },
    allocationBalance: {
      passed: allocation.passed,
      totalHardCapAllocations: allocation.totalSlots,
      perL1: safePerL1
    },
    optionLayoutBalance: { ...allocation.optionLayouts },
    routeBalance: {
      passed: routeBalance.passed,
      routeCount: routeBalance.routeCount,
      moduleCount: routeBalance.moduleCount,
      testletsPerModule: routeBalance.testletsPerModule,
      modulePosition: { ...routeBalance.modulePosition },
      moduleDirectedFirstOrderCarryover: {
        ...routeBalance.moduleDirectedFirstOrderCarryover
      },
      withinModuleTestletPosition: { ...routeBalance.withinModuleTestletPosition },
      withinModuleTestletDirectedFirstOrderCarryover: {
        ...routeBalance.withinModuleTestletDirectedFirstOrderCarryover
      }
    },
    integrity: { payloadSha256: "" }
  };
  audit.integrity.payloadSha256 = payloadSha256(audit);
  return audit;
}
