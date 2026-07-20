import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRITION_SIMULATION_ALGORITHM,
  DEFAULT_ATTRITION_RATES,
  DEFAULT_STARTS_PER_L1,
  createScenarioRng,
  exactProbabilityAtLeastTarget,
  exactTargetAttainment,
  formatResultsCsv,
  formatResultsMarkdown,
  runAttritionReserveSimulation,
  simulateAttritionScenario
} from "../design/attrition-reserve-simulation.mjs";

test("public planning RNG has a stable known vector", () => {
  assert.equal(ATTRITION_SIMULATION_ALGORITHM,
    "xoshiro128starstar-independent-cell-bernoulli-v1");
  const rng = createScenarioRng("known-public-seed", "known-domain");
  assert.deepEqual(
    Array.from({ length: 6 }, () => rng.nextUint32()),
    [1912237683, 2224476580, 3299654984, 1874020467, 87414052, 2157694071]
  );
});

test("zero attrition preserves exact starting balance at every candidate capacity", () => {
  for (const startsPerL1 of DEFAULT_STARTS_PER_L1) {
    const result = simulateAttritionScenario({
      startsPerL1,
      attritionRate: 0,
      monteCarloReplicates: 8,
      publicSeed: "zero-attrition-public-test-seed"
    });
    assert.equal(result.targetAttainment.exactBinomialProbabilityPerL1, 1);
    assert.equal(result.targetAttainment.monteCarlo.successes, 8);
    assert.deepEqual(result.completerCount,
      { mean: startsPerL1, p05: startsPerL1, p50: startsPerL1, p95: startsPerL1 });
    assert.deepEqual(result.completerBalanceUnconditional.route.maximumMinusMinimum,
      { mean: 0, p05: 0, p50: 0, p95: 0 });
    assert.deepEqual(result.completerBalanceUnconditional.optionLayout.maximumMinusMinimum,
      { mean: 0, p05: 0, p50: 0, p95: 0 });
    assert.deepEqual(
      result.completerBalanceUnconditional.routeByOptionLayoutCell.maximumMinusMinimum,
      { mean: 0, p05: 0, p50: 0, p95: 0 }
    );
    assert.equal(
      result.completerBalanceUnconditional.routeByOptionLayoutCell.minimumCount.p50,
      startsPerL1 / 60
    );
    assert.equal(
      result.completerBalanceUnconditional.routeByOptionLayoutCell.probabilityAllCellsRepresented,
      1
    );
    assert.equal(
      result.completerBalanceUnconditional.routeByOptionLayoutCell.exactBinomialProbabilityAllCellsMeetBalancedTarget,
      1
    );
    assert.equal(
      result.completerBalanceUnconditional.routeByOptionLayoutCell.monteCarloProbabilityAllCellsMeetBalancedTarget,
      1
    );
  }
});

test("exact target probability matches boundary identities", () => {
  assert.equal(exactProbabilityAtLeastTarget(300, 0, 300), 1);
  assert.ok(Math.abs(exactProbabilityAtLeastTarget(300, 0.05, 300) - 0.95 ** 300) < 1e-20);
  assert.equal(exactProbabilityAtLeastTarget(300, 0.2, 301), 0);
  assert.ok(Math.abs(exactProbabilityAtLeastTarget(360, 0.15, 300) -
    0.8317602488949232) < 1e-14);
  const remoteTail = exactTargetAttainment(360, 0.05, 300);
  assert.ok(remoteTail.successProbability > 0.999999999999);
  assert.ok(remoteTail.shortfallProbability > 0 && remoteTail.shortfallProbability < 1e-12);
  assert.ok(Math.abs(
    remoteTail.successProbability + remoteTail.shortfallProbability - 1
  ) < 1e-12);
  const rareSuccess = simulateAttritionScenario({
    startsPerL1: 300,
    attritionRate: 0.1,
    monteCarloReplicates: 1,
    publicSeed: "rare-success-public-test-seed"
  }).targetAttainment;
  assert.ok(Math.abs(
    rareSuccess.exactBinomialProbabilityBothIndependentL1Strata -
      rareSuccess.exactBinomialProbabilityPerL1 ** 2
  ) < Number.EPSILON);
  assert.ok(rareSuccess.exactBinomialProbabilityBothIndependentL1Strata < 1e-27);
  const crossedCells = simulateAttritionScenario({
    startsPerL1: 360,
    attritionRate: 0.1,
    monteCarloReplicates: 1,
    publicSeed: "cell-assurance-public-test-seed"
  }).completerBalanceUnconditional.routeByOptionLayoutCell;
  assert.ok(crossedCells.exactBinomialProbabilityAllCellsMeetBalancedTarget > 0.0006);
  assert.ok(crossedCells.exactBinomialProbabilityAllCellsMeetBalancedTarget < 0.0008);
});

test("scenario results are deterministic and retain a stable known summary", () => {
  const settings = {
    startsPerL1: 360,
    attritionRate: 0.15,
    monteCarloReplicates: 100,
    publicSeed: "known-test-public-seed"
  };
  const first = simulateAttritionScenario(settings);
  const second = simulateAttritionScenario(settings);
  assert.deepEqual(first, second);
  assert.deepEqual({
    successes: first.targetAttainment.monteCarlo.successes,
    completerCount: first.completerCount,
    routeRange: first.completerBalanceUnconditional.route.maximumMinusMinimum,
    layoutRange: first.completerBalanceUnconditional.optionLayout.maximumMinusMinimum,
    cellMinimum: first.completerBalanceUnconditional.routeByOptionLayoutCell.minimumCount,
    cellRange: first.completerBalanceUnconditional.routeByOptionLayoutCell.maximumMinusMinimum
  }, {
    successes: 83,
    completerCount: { mean: 304.81, p05: 291, p50: 304, p95: 318 },
    routeRange: { mean: 6.51, p05: 4, p50: 6, p95: 10 },
    layoutRange: { mean: 6.95, p05: 4, p50: 7, p95: 10 },
    cellMinimum: { mean: 2.85, p05: 2, p50: 3, p95: 4 },
    cellRange: { mean: 3.15, p05: 2, p50: 3, p95: 4 }
  });
});

test("scenario streams are stable when the surrounding grid is changed", () => {
  const shared = {
    monteCarloReplicates: 25,
    publicSeed: "grid-order-public-test-seed"
  };
  const isolated = runAttritionReserveSimulation({
    ...shared,
    startsPerL1: [360],
    attritionRates: [0.15]
  }).results[0];
  const grid = runAttritionReserveSimulation({
    ...shared,
    startsPerL1: [420, 300, 360],
    attritionRates: [0.2, 0.15, 0]
  });
  const embedded = grid.results.find(result =>
    result.startsPerL1 === 360 && result.attritionRate === 0.15);
  assert.deepEqual(embedded, isolated);
});

test("invalid designs fail before simulation", () => {
  assert.throws(() => simulateAttritionScenario({
    startsPerL1: 301,
    attritionRate: 0.1,
    monteCarloReplicates: 10
  }), /multiple of 60/u);
  assert.throws(() => simulateAttritionScenario({
    startsPerL1: 300,
    attritionRate: 1,
    monteCarloReplicates: 10
  }), /attritionRate/u);
  assert.throws(() => simulateAttritionScenario({
    startsPerL1: 300,
    attritionRate: 0.1,
    monteCarloReplicates: 0
  }), /positive integer/u);
});

test("default artifact covers all 15 scenarios without sensitive material", () => {
  const artifact = runAttritionReserveSimulation({ monteCarloReplicates: 2 });
  assert.deepEqual(artifact.startsPerL1, DEFAULT_STARTS_PER_L1);
  assert.deepEqual(artifact.attritionRates, DEFAULT_ATTRITION_RATES);
  assert.equal(artifact.results.length, 15);
  assert.match(artifact.integrity.payloadSha256, /^[0-9a-f]{64}$/u);
  const serialized = JSON.stringify(artifact);
  assert.doesNotMatch(serialized, /"(?:prompt|options|optionOrder|slots|routeId|testletId|itemId)"/iu);
  assert.doesNotMatch(serialized, /UVLT_RANDOMIZATION_SEED|PROLIFIC_PID|STUDY_ID|SESSION_ID/u);

  const csv = formatResultsCsv(artifact);
  const markdown = formatResultsMarkdown(artifact);
  assert.equal(csv.trim().split("\n").length, 16);
  assert.match(csv, /exact_probability_at_least_300_per_l1/u);
  assert.match(csv, /exact_shortfall_probability_per_l1/u);
  assert.match(csv, /exact_probability_all_60_cells_have_at_least_5_completers/u);
  assert.match(markdown, /inform, but do not determine/u);
  assert.match(markdown, /pilot-estimated overall and differential attrition/u);
});
