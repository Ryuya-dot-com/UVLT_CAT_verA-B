# Attrition and reserve-capacity simulation

This stimulus-free planning analysis compares 300, 360, and 420 starts per L1 stratum under 0%, 5%, 10%, 15%, and 20% attrition. The two strata are Japanese L1 and Vietnamese L1. Each capacity is a whole number of 60-start macroreplicates, so all 10 route × 6 option-layout cells begin with equal allocation.

Run:

```sh
npm run simulate:attrition-reserve
npm run check:attrition-reserve
```

The tracked JSON is the machine-readable record. The CSV and Markdown files are compact views of the same results. The public seed, algorithm name, Monte Carlo count, assumptions, limitations, software environment, and payload hash are embedded in the JSON. Scenario streams are domain-separated, so reordering or adding scenarios does not change an existing scenario. The implementation uses Node.js built-ins only; `.nvmrc` pins Node 24.9.0 and the artifact runner fails closed on any other Node version. There are no item prompts, answers, participant records, private schedules, or operational allocation seeds in this analysis.

## Estimands

For each scenario, the primary target-attainment quantity is the exact binomial probability of at least 300 completers per L1 under common, independent attrition. A seeded Monte Carlo estimate and its 95% Wilson interval audit that calculation. The probability that both L1 strata reach 300 is the square of the per-L1 probability and therefore also assumes independent attrition between strata.

Completer balance is summarized unconditionally over every simulated completion set. For routes, option layouts, and the 60 crossed cells, the output reports empirical p05, p50, and p95 summaries of minimum count, maximum count, and maximum-minus-minimum range. It also reports both the Monte Carlo probability that all 60 cells retain at least one completer and the exact binomial probability that all 60 cells retain at least five completers (300/60) under the independent common-attrition model; the machine-readable outputs retain the Monte Carlo audit of the latter too. Overall attainment of 300 completers does not imply this stricter cellwise condition. Empirical quantiles use the nearest-rank definition.

## Interpretation boundary

This analysis supported adopting a target of 300 protocol completers and an immutable hard cap of 420 unique D1 starts within each L1. The runtime now implements that capacity and refuses new allocations when the L1-specific target or cap is reached. This fixed-cap simulation does not validate the full sequential stopping process: it assumes all candidate starts are available at once and has no arrival times, completion latency, Prolific pause delay, or in-flight overshoot. After the pilot, a separate sequential simulation must be added using prespecified estimates and uncertainty for:

- overall attrition and exclusion/invalid-submission rates within each L1;
- differential attrition by L1, route, option layout, and their interaction;
- completion changes associated with test position, burden, device, and recruitment timing;
- the target-triggered Prolific pause, recruitment deadline, in-flight grace period, and overshoot;
- the fixed rule that allocation indices and quality exclusions are not replaced.

Those pilot-based scenarios must be run before the confirmatory preregistration is frozen. The checked-in 420-start implementation uses seven complete 60-start macroreplicates per L1 (840 slots total), but its real release schedule, D1 seed, deployment configuration, and balance audit still require independent review and fresh release-specific hashes. A missed target at 420 is reported as a shortfall; the cap is not extended after outcomes are observed.
