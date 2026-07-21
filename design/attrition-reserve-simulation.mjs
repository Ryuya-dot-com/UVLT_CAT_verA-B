import { createHash } from "node:crypto";

export const ATTRITION_SIMULATION_SCHEMA_VERSION =
  "uvlt-fixed-ab-attrition-reserve-simulation-1";
export const ATTRITION_SIMULATION_ALGORITHM =
  "xoshiro128starstar-independent-cell-bernoulli-v1";
export const DEFAULT_PUBLIC_SIMULATION_SEED =
  "uvlt-fixed-ab-public-attrition-reserve-simulation-v1";
export const DEFAULT_MONTE_CARLO_REPLICATES = 20_000;
export const DEFAULT_STARTS_PER_L1 = Object.freeze([300, 360, 420]);
export const DEFAULT_ATTRITION_RATES = Object.freeze([0, 0.05, 0.1, 0.15, 0.2]);
export const TARGET_COMPLETERS_PER_L1 = 300;

const ROUTE_COUNT = 10;
const OPTION_LAYOUT_COUNT = 6;
const ROUTE_LAYOUT_CELL_COUNT = ROUTE_COUNT * OPTION_LAYOUT_COUNT;
const UINT32_RANGE = 0x1_0000_0000;
const WILSON_Z_975 = 1.959963984540054;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function stableStringify(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value), "Stable JSON cannot contain a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  throw new Error("Stable JSON accepts JSON-compatible plain values only");
}

function payloadSha256(artifact) {
  const copy = structuredClone(artifact);
  delete copy.integrity.payloadSha256;
  return createHash("sha256").update(stableStringify(copy)).digest("hex");
}

function rotateLeft32(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/**
 * A small deterministic generator used only for public Monte Carlo planning.
 * Scenario-specific SHA-256 domain separation means that adding or reordering
 * scenarios cannot change an existing scenario's stream.
 */
export function createScenarioRng(publicSeed, scenarioDomain) {
  assert(typeof publicSeed === "string" && publicSeed.length > 0,
    "publicSeed must be a non-empty string");
  assert(typeof scenarioDomain === "string" && scenarioDomain.length > 0,
    "scenarioDomain must be a non-empty string");
  const digest = createHash("sha256")
    .update(`${ATTRITION_SIMULATION_ALGORITHM}\0${publicSeed}\0${scenarioDomain}`, "utf8")
    .digest();
  let state0 = digest.readUInt32LE(0);
  let state1 = digest.readUInt32LE(4);
  let state2 = digest.readUInt32LE(8);
  let state3 = digest.readUInt32LE(12);
  if ((state0 | state1 | state2 | state3) === 0) state0 = 1;

  function nextUint32() {
    let result = Math.imul(state1, 5) >>> 0;
    result = Math.imul(rotateLeft32(result, 7), 9) >>> 0;
    const shifted = (state1 << 9) >>> 0;
    state2 = (state2 ^ state0) >>> 0;
    state3 = (state3 ^ state1) >>> 0;
    state1 = (state1 ^ state2) >>> 0;
    state0 = (state0 ^ state3) >>> 0;
    state2 = (state2 ^ shifted) >>> 0;
    state3 = rotateLeft32(state3, 11);
    return result;
  }

  return Object.freeze({
    nextUint32,
    nextUnit: () => nextUint32() / UINT32_RANGE
  });
}

function validateScenario({ startsPerL1, attritionRate, monteCarloReplicates, targetCompleters }) {
  assert(Number.isInteger(startsPerL1) && startsPerL1 >= ROUTE_LAYOUT_CELL_COUNT &&
    startsPerL1 % ROUTE_LAYOUT_CELL_COUNT === 0,
  "startsPerL1 must be a positive multiple of 60 so every route-layout cell starts equally often");
  assert(typeof attritionRate === "number" && Number.isFinite(attritionRate) &&
    attritionRate >= 0 && attritionRate < 1,
  "attritionRate must be a finite number from 0 (inclusive) to 1 (exclusive)");
  assert(Number.isInteger(monteCarloReplicates) && monteCarloReplicates >= 1,
    "monteCarloReplicates must be a positive integer");
  assert(Number.isInteger(targetCompleters) && targetCompleters >= 1,
    "targetCompleters must be a positive integer");
}

function nearestRank(sortedValues, probability) {
  assert(sortedValues.length > 0, "Quantiles require at least one value");
  const rank = Math.max(1, Math.ceil(probability * sortedValues.length));
  return sortedValues[rank - 1];
}

function summarizeDistribution(values) {
  assert(Array.isArray(values) && values.length > 0, "Distribution must contain values");
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Object.freeze({
    mean: round(mean),
    p05: nearestRank(sorted, 0.05),
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95)
  });
}

function wilsonInterval(successes, trials) {
  const proportion = successes / trials;
  const zSquared = WILSON_Z_975 ** 2;
  const denominator = 1 + zSquared / trials;
  const centre = (proportion + zSquared / (2 * trials)) / denominator;
  const halfWidth = WILSON_Z_975 * Math.sqrt(
    proportion * (1 - proportion) / trials + zSquared / (4 * trials ** 2)
  ) / denominator;
  return Object.freeze({
    lower: round(Math.max(0, centre - halfWidth), 8),
    upper: round(Math.min(1, centre + halfWidth), 8)
  });
}

function binomialAttainmentFromMaximumFailures(trials, failureProbability, maximumFailures) {
  if (maximumFailures < 0) {
    return Object.freeze({ successProbability: 0, shortfallProbability: 1 });
  }
  if (maximumFailures >= trials || failureProbability === 0) {
    return Object.freeze({ successProbability: 1, shortfallProbability: 0 });
  }

  const attritionMode = Math.floor((trials + 1) * failureProbability);
  const relativeMasses = new Float64Array(trials + 1);
  relativeMasses[attritionMode] = 1;
  for (let attritions = attritionMode; attritions < trials; attritions += 1) {
    relativeMasses[attritions + 1] = relativeMasses[attritions] *
      ((trials - attritions) / (attritions + 1)) *
      (failureProbability / (1 - failureProbability));
  }
  for (let attritions = attritionMode; attritions > 0; attritions -= 1) {
    relativeMasses[attritions - 1] = relativeMasses[attritions] *
      (attritions / (trials - attritions + 1)) *
      ((1 - failureProbability) / failureProbability);
  }

  function kahanSum(minimumIndex, maximumIndex) {
    let total = 0;
    let compensation = 0;
    for (let index = minimumIndex; index <= maximumIndex; index += 1) {
      const adjusted = relativeMasses[index] - compensation;
      const next = total + adjusted;
      compensation = (next - total) - adjusted;
      total = next;
    }
    return total;
  }

  // Sum the success and shortfall sides separately. Keeping the shortfall as
  // its own ratio preserves a remote upper tail even when 1 - tail would
  // round to exactly one in IEEE-754 arithmetic.
  const successMass = kahanSum(0, maximumFailures);
  const shortfallMass = kahanSum(maximumFailures + 1, trials);
  const totalMass = successMass + shortfallMass;
  return Object.freeze({
    successProbability: Math.min(1, Math.max(0, successMass / totalMass)),
    shortfallProbability: Math.min(1, Math.max(0, shortfallMass / totalMass))
  });
}

/** Exact (up to floating-point evaluation) under the common independent attrition model. */
export function exactTargetAttainment(startsPerL1, attritionRate, targetCompleters) {
  validateScenario({
    startsPerL1,
    attritionRate,
    monteCarloReplicates: 1,
    targetCompleters
  });
  return binomialAttainmentFromMaximumFailures(
    startsPerL1,
    attritionRate,
    startsPerL1 - targetCompleters
  );
}

/** Backwards-compatible convenience accessor for the target-attainment probability. */
export function exactProbabilityAtLeastTarget(startsPerL1, attritionRate, targetCompleters) {
  return exactTargetAttainment(startsPerL1, attritionRate, targetCompleters)
    .successProbability;
}

function countSummary(counts) {
  let minimum = counts[0];
  let maximum = counts[0];
  for (let index = 1; index < counts.length; index += 1) {
    minimum = Math.min(minimum, counts[index]);
    maximum = Math.max(maximum, counts[index]);
  }
  return { minimum, maximum, range: maximum - minimum };
}

export function simulateAttritionScenario({
  startsPerL1,
  attritionRate,
  monteCarloReplicates = DEFAULT_MONTE_CARLO_REPLICATES,
  publicSeed = DEFAULT_PUBLIC_SIMULATION_SEED,
  targetCompleters = TARGET_COMPLETERS_PER_L1
}) {
  validateScenario({ startsPerL1, attritionRate, monteCarloReplicates, targetCompleters });
  assert(typeof publicSeed === "string" && publicSeed.length > 0,
    "publicSeed must be a non-empty string");

  const startsPerCell = startsPerL1 / ROUTE_LAYOUT_CELL_COUNT;
  const targetCompletersPerCell = targetCompleters / ROUTE_LAYOUT_CELL_COUNT;
  assert(Number.isInteger(targetCompletersPerCell),
    "targetCompleters must be a multiple of 60 for the balanced-cell assurance audit");
  const rng = createScenarioRng(
    publicSeed,
    `starts:${startsPerL1}\0attrition:${String(attritionRate)}`
  );
  const completerTotals = [];
  const routeMinimums = [];
  const routeMaximums = [];
  const routeRanges = [];
  const layoutMinimums = [];
  const layoutMaximums = [];
  const layoutRanges = [];
  const cellMinimums = [];
  const cellMaximums = [];
  const cellRanges = [];
  const emptyCellCounts = [];
  let targetSuccesses = 0;
  let allCellsRepresentedSuccesses = 0;
  let allCellsMeetBalancedTargetSuccesses = 0;

  for (let replicate = 0; replicate < monteCarloReplicates; replicate += 1) {
    const routeCounts = new Uint32Array(ROUTE_COUNT);
    const layoutCounts = new Uint32Array(OPTION_LAYOUT_COUNT);
    const cellCounts = new Uint32Array(ROUTE_LAYOUT_CELL_COUNT);
    let totalCompleters = 0;
    let emptyCells = 0;

    for (let routeIndex = 0; routeIndex < ROUTE_COUNT; routeIndex += 1) {
      for (let layoutIndex = 0; layoutIndex < OPTION_LAYOUT_COUNT; layoutIndex += 1) {
        const cellIndex = routeIndex * OPTION_LAYOUT_COUNT + layoutIndex;
        let cellCompleters = 0;
        for (let participant = 0; participant < startsPerCell; participant += 1) {
          if (rng.nextUnit() >= attritionRate) cellCompleters += 1;
        }
        cellCounts[cellIndex] = cellCompleters;
        routeCounts[routeIndex] += cellCompleters;
        layoutCounts[layoutIndex] += cellCompleters;
        totalCompleters += cellCompleters;
        if (cellCompleters === 0) emptyCells += 1;
      }
    }

    const route = countSummary(routeCounts);
    const layout = countSummary(layoutCounts);
    const cell = countSummary(cellCounts);
    completerTotals.push(totalCompleters);
    routeMinimums.push(route.minimum);
    routeMaximums.push(route.maximum);
    routeRanges.push(route.range);
    layoutMinimums.push(layout.minimum);
    layoutMaximums.push(layout.maximum);
    layoutRanges.push(layout.range);
    cellMinimums.push(cell.minimum);
    cellMaximums.push(cell.maximum);
    cellRanges.push(cell.range);
    emptyCellCounts.push(emptyCells);
    if (totalCompleters >= targetCompleters) targetSuccesses += 1;
    if (emptyCells === 0) allCellsRepresentedSuccesses += 1;
    if (cell.minimum >= targetCompletersPerCell) {
      allCellsMeetBalancedTargetSuccesses += 1;
    }
  }

  const monteCarloProbability = targetSuccesses / monteCarloReplicates;
  const exactAttainment = exactTargetAttainment(
    startsPerL1,
    attritionRate,
    targetCompleters
  );
  const eitherStratumShortfall = exactAttainment.shortfallProbability *
    (2 - exactAttainment.shortfallProbability);
  const exactBalancedCellAttainment = binomialAttainmentFromMaximumFailures(
    startsPerCell,
    attritionRate,
    startsPerCell - targetCompletersPerCell
  );
  const exactAllCellsMeetBalancedTarget =
    exactBalancedCellAttainment.successProbability ** ROUTE_LAYOUT_CELL_COUNT;
  return Object.freeze({
    startsPerL1,
    reserveStartsPerL1: startsPerL1 - targetCompleters,
    attritionRate,
    completionRate: round(1 - attritionRate),
    startingDesign: {
      routes: ROUTE_COUNT,
      startsPerRoute: startsPerL1 / ROUTE_COUNT,
      optionLayouts: OPTION_LAYOUT_COUNT,
      startsPerOptionLayout: startsPerL1 / OPTION_LAYOUT_COUNT,
      routeByOptionLayoutCells: ROUTE_LAYOUT_CELL_COUNT,
      startsPerRouteByOptionLayoutCell: startsPerCell
    },
    targetAttainment: {
      targetCompletersPerL1: targetCompleters,
      exactBinomialProbabilityPerL1: exactAttainment.successProbability,
      exactBinomialShortfallProbabilityPerL1: exactAttainment.shortfallProbability,
      exactBinomialProbabilityBothIndependentL1Strata:
        exactAttainment.successProbability ** 2,
      exactBinomialShortfallProbabilityAtLeastOneIndependentL1Stratum:
        eitherStratumShortfall,
      monteCarlo: {
        successes: targetSuccesses,
        replicates: monteCarloReplicates,
        estimate: round(monteCarloProbability, 8),
        standardError: round(Math.sqrt(
          monteCarloProbability * (1 - monteCarloProbability) / monteCarloReplicates
        ), 8),
        wilson95: wilsonInterval(targetSuccesses, monteCarloReplicates)
      }
    },
    completerCount: summarizeDistribution(completerTotals),
    completerBalanceUnconditional: {
      route: {
        groups: ROUTE_COUNT,
        minimumCount: summarizeDistribution(routeMinimums),
        maximumCount: summarizeDistribution(routeMaximums),
        maximumMinusMinimum: summarizeDistribution(routeRanges)
      },
      optionLayout: {
        groups: OPTION_LAYOUT_COUNT,
        minimumCount: summarizeDistribution(layoutMinimums),
        maximumCount: summarizeDistribution(layoutMaximums),
        maximumMinusMinimum: summarizeDistribution(layoutRanges)
      },
      routeByOptionLayoutCell: {
        groups: ROUTE_LAYOUT_CELL_COUNT,
        minimumCount: summarizeDistribution(cellMinimums),
        maximumCount: summarizeDistribution(cellMaximums),
        maximumMinusMinimum: summarizeDistribution(cellRanges),
        emptyCellCount: summarizeDistribution(emptyCellCounts),
        probabilityAllCellsRepresented: round(
          allCellsRepresentedSuccesses / monteCarloReplicates,
          8
        ),
        balancedTargetCompletersPerCell: targetCompletersPerCell,
        exactBinomialProbabilityAllCellsMeetBalancedTarget:
          exactAllCellsMeetBalancedTarget,
        monteCarloProbabilityAllCellsMeetBalancedTarget: round(
          allCellsMeetBalancedTargetSuccesses / monteCarloReplicates,
          8
        )
      }
    }
  });
}

function uniqueSortedNumbers(values, label) {
  assert(Array.isArray(values) && values.length > 0, `${label} must be a non-empty array`);
  assert(values.every(value => typeof value === "number" && Number.isFinite(value)),
    `${label} must contain only finite numbers`);
  return [...new Set(values)].sort((left, right) => left - right);
}

export function runAttritionReserveSimulation({
  startsPerL1 = DEFAULT_STARTS_PER_L1,
  attritionRates = DEFAULT_ATTRITION_RATES,
  monteCarloReplicates = DEFAULT_MONTE_CARLO_REPLICATES,
  publicSeed = DEFAULT_PUBLIC_SIMULATION_SEED,
  targetCompleters = TARGET_COMPLETERS_PER_L1
} = {}) {
  const starts = uniqueSortedNumbers(startsPerL1, "startsPerL1");
  const rates = uniqueSortedNumbers(attritionRates, "attritionRates");
  const results = [];
  for (const startsCount of starts) {
    for (const attritionRate of rates) {
      results.push(simulateAttritionScenario({
        startsPerL1: startsCount,
        attritionRate,
        monteCarloReplicates,
        publicSeed,
        targetCompleters
      }));
    }
  }
  const artifact = {
    schemaVersion: ATTRITION_SIMULATION_SCHEMA_VERSION,
    simulationAlgorithm: ATTRITION_SIMULATION_ALGORITHM,
    publicSimulationSeed: publicSeed,
    publicSimulationSeedPurpose:
      "Public reproducibility seed for this planning simulation only; never use it for participant allocation.",
    softwareEnvironment: {
      node: "24.9.0 (runner fails closed on every other version)",
      dependencies: "Node.js built-ins only"
    },
    monteCarloReplicatesPerScenario: monteCarloReplicates,
    targetCompletersPerL1: targetCompleters,
    startsPerL1: starts,
    attritionRates: rates,
    l1Interpretation:
      "Results apply separately and symmetrically to Japanese-L1 and Vietnamese-L1 strata under the same model.",
    estimandNotes: {
      targetProbability:
        "Exact binomial probability is primary under the stated model; Monte Carlo estimate and Wilson interval audit the simulation.",
      balance:
        "Balance summaries are unconditional across all simulated completer sets and use nearest-rank empirical p05, p50, and p95 quantiles.",
      bothL1Strata:
        "The two-stratum probability is the squared per-L1 exact probability and assumes independent attrition between strata."
    },
    assumptions: [
      "Each start completes independently with the scenario's common attrition probability.",
      "Attrition is identical across L1 strata, routes, option layouts, and route-by-layout cells.",
      "Every capacity is a multiple of 60 and begins with an equal number of starts in all 60 route-by-layout cells.",
      "The balanced-cell audit defines its descriptive threshold as 300/60 = 5 completers per route-by-layout cell; overall target attainment does not require every cell to meet this threshold.",
      "The simulation models completion status only; it contains no stimuli, participant data, allocation schedule, or operational randomization seed."
    ],
    limitations: [
      "These fixed-cap scenarios supported adoption of a 300-protocol-completer target and an immutable 420-start hard cap per L1, but they do not validate target-triggered sequential stopping.",
      "The model omits arrival times, completion latency, Prolific pause delay, in-flight overshoot, and the recruitment deadline.",
      "Pilot-estimated overall and differential attrition, exclusions, invalid submissions, and their uncertainty must be added before preregistration.",
      "The adopted 420-start implementation still requires a fresh release-specific schedule, D1 seed, deployment hashes, and independent validation before recruitment."
    ],
    results,
    integrity: { payloadSha256: "" }
  };
  artifact.integrity.payloadSha256 = payloadSha256(artifact);
  return artifact;
}

function formatProbability(value, complement = null) {
  if (value === 0) return String(value);
  if (value === 1 && !(complement > 0)) return String(value);
  if (value < 0.0001) return value.toExponential(3);
  const shortfall = complement ?? (1 - value);
  if (value > 0.9999995 || (value === 1 && shortfall > 0)) {
    return `1 − ${shortfall.toExponential(3)}`;
  }
  if (value > 0.9999) return value.toFixed(6);
  return value.toFixed(4);
}

export function formatResultsCsv(artifact) {
  const columns = [
    "starts_per_l1",
    "reserve_starts_per_l1",
    "attrition_rate",
    "exact_probability_at_least_300_per_l1",
    "exact_shortfall_probability_per_l1",
    "exact_probability_both_l1_strata",
    "exact_shortfall_probability_at_least_one_l1_stratum",
    "mc_probability_at_least_300_per_l1",
    "mc_wilson95_lower",
    "mc_wilson95_upper",
    "completers_p05",
    "completers_p50",
    "completers_p95",
    "route_range_p50",
    "route_range_p95",
    "option_layout_range_p50",
    "option_layout_range_p95",
    "cell_minimum_p05",
    "cell_minimum_p50",
    "cell_range_p50",
    "cell_range_p95",
    "probability_all_60_cells_represented",
    "exact_probability_all_60_cells_have_at_least_5_completers",
    "mc_probability_all_60_cells_have_at_least_5_completers"
  ];
  const rows = artifact.results.map(result => {
    const target = result.targetAttainment;
    const balance = result.completerBalanceUnconditional;
    return [
      result.startsPerL1,
      result.reserveStartsPerL1,
      result.attritionRate,
      target.exactBinomialProbabilityPerL1,
      target.exactBinomialShortfallProbabilityPerL1,
      target.exactBinomialProbabilityBothIndependentL1Strata,
      target.exactBinomialShortfallProbabilityAtLeastOneIndependentL1Stratum,
      target.monteCarlo.estimate,
      target.monteCarlo.wilson95.lower,
      target.monteCarlo.wilson95.upper,
      result.completerCount.p05,
      result.completerCount.p50,
      result.completerCount.p95,
      balance.route.maximumMinusMinimum.p50,
      balance.route.maximumMinusMinimum.p95,
      balance.optionLayout.maximumMinusMinimum.p50,
      balance.optionLayout.maximumMinusMinimum.p95,
      balance.routeByOptionLayoutCell.minimumCount.p05,
      balance.routeByOptionLayoutCell.minimumCount.p50,
      balance.routeByOptionLayoutCell.maximumMinusMinimum.p50,
      balance.routeByOptionLayoutCell.maximumMinusMinimum.p95,
      balance.routeByOptionLayoutCell.probabilityAllCellsRepresented,
      balance.routeByOptionLayoutCell.exactBinomialProbabilityAllCellsMeetBalancedTarget,
      balance.routeByOptionLayoutCell.monteCarloProbabilityAllCellsMeetBalancedTarget
    ].join(",");
  });
  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

export function formatResultsMarkdown(artifact) {
  const lines = [
    "# Attrition/reserve simulation results",
    "",
    `- Public simulation seed: \`${artifact.publicSimulationSeed}\``,
    `- Algorithm: \`${artifact.simulationAlgorithm}\``,
    `- Monte Carlo replicates: ${artifact.monteCarloReplicatesPerScenario.toLocaleString("en-US")} per scenario`,
    `- JSON payload SHA-256: \`${artifact.integrity.payloadSha256}\``,
    "",
    "The exact probability is primary for attaining at least 300 completers per L1 under common independent attrition. Balance quantiles and P(all cells ≥1) are unconditional Monte Carlo summaries; P(all cells ≥5) is exact under the same model. Ranges are maximum minus minimum completer counts.",
    "",
    "| Starts/L1 | Attrition | P(≥300)/L1 | P(both L1 ≥300) | Completers p05–p50–p95 | Route range p50/p95 | Layout range p50/p95 | Cell min p05/p50 | Cell range p50/p95 | P(all cells ≥1) | P(all cells ≥5) |",
    "|---:|---:|---:|---:|:---:|:---:|:---:|:---:|:---:|---:|---:|"
  ];
  for (const result of artifact.results) {
    const target = result.targetAttainment;
    const balance = result.completerBalanceUnconditional;
    lines.push([
      `| ${result.startsPerL1}`,
      `${Math.round(result.attritionRate * 100)}%`,
      formatProbability(
        target.exactBinomialProbabilityPerL1,
        target.exactBinomialShortfallProbabilityPerL1
      ),
      formatProbability(
        target.exactBinomialProbabilityBothIndependentL1Strata,
        target.exactBinomialShortfallProbabilityAtLeastOneIndependentL1Stratum
      ),
      `${result.completerCount.p05}–${result.completerCount.p50}–${result.completerCount.p95}`,
      `${balance.route.maximumMinusMinimum.p50}/${balance.route.maximumMinusMinimum.p95}`,
      `${balance.optionLayout.maximumMinusMinimum.p50}/${balance.optionLayout.maximumMinusMinimum.p95}`,
      `${balance.routeByOptionLayoutCell.minimumCount.p05}/${balance.routeByOptionLayoutCell.minimumCount.p50}`,
      `${balance.routeByOptionLayoutCell.maximumMinusMinimum.p50}/${balance.routeByOptionLayoutCell.maximumMinusMinimum.p95}`,
      formatProbability(balance.routeByOptionLayoutCell.probabilityAllCellsRepresented),
      `${formatProbability(balance.routeByOptionLayoutCell.exactBinomialProbabilityAllCellsMeetBalancedTarget)} |`
    ].join(" | "));
  }
  lines.push(
    "",
    "These fixed-cap scenarios supported the adopted target of 300 protocol completers and immutable hard cap of 420 starts per L1, but they do not validate target-triggered sequential stopping. Before preregistration, run a separate pilot-informed model of arrival times, completion latency, Prolific pause delay, in-flight overshoot, the recruitment deadline, and overall and differential attrition (including L1, route, option-layout, burden/position, exclusions, and invalid submissions), with uncertainty propagated. The release-specific 840-slot schedule, D1 seed, deployment hashes, and balance audit still require fresh generation and independent validation.",
    ""
  );
  return lines.join("\n");
}
