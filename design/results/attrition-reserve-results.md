# Attrition/reserve simulation results

- Public simulation seed: `uvlt-fixed-ab-public-attrition-reserve-simulation-v1`
- Algorithm: `xoshiro128starstar-independent-cell-bernoulli-v1`
- Monte Carlo replicates: 20,000 per scenario
- JSON payload SHA-256: `7e2bd96b17159a3ae6f09049e405f425c19ce25b7f34a70e81a3b387858ebbe1`

The exact probability is primary for attaining at least 300 completers per L1 under common independent attrition. Balance quantiles and P(all cells ≥1) are unconditional Monte Carlo summaries; P(all cells ≥5) is exact under the same model. Ranges are maximum minus minimum completer counts.

| Starts/L1 | Attrition | P(≥300)/L1 | P(both L1 ≥300) | Completers p05–p50–p95 | Route range p50/p95 | Layout range p50/p95 | Cell min p05/p50 | Cell range p50/p95 | P(all cells ≥1) | P(all cells ≥5) |
|---:|---:|---:|---:|:---:|:---:|:---:|:---:|:---:|---:|---:|
| 300 | 0% | 1 | 1 | 300–300–300 | 0/0 | 0/0 | 5/5 | 0/0 | 1 | 1 |
| 300 | 5% | 2.075e-7 | 4.307e-14 | 278–285–291 | 3/5 | 4/6 | 2/3 | 2/3 | 0.9999 | 2.075e-7 |
| 300 | 10% | 1.874e-14 | 3.512e-28 | 261–270–278 | 5/7 | 5/8 | 2/3 | 2/3 | 0.9997 | 1.874e-14 |
| 300 | 15% | 6.694e-22 | 4.481e-43 | 245–255–265 | 6/9 | 6/10 | 1/2 | 3/4 | 0.9959 | 6.694e-22 |
| 300 | 20% | 8.453e-30 | 7.145e-59 | 228–240–251 | 7/10 | 7/11 | 1/2 | 3/4 | 0.9801 | 8.453e-30 |
| 360 | 0% | 1 | 1 | 360–360–360 | 0/0 | 0/0 | 6/6 | 0/0 | 1 | 1 |
| 360 | 5% | 1 − 9.745e-17 | 1 − 1.949e-16 | 335–342–349 | 4/6 | 4/7 | 3/4 | 2/3 | 1 | 0.1354 |
| 360 | 10% | 0.999966 | 0.999933 | 314–324–333 | 5/8 | 6/9 | 2/3 | 3/4 | 0.999950 | 0.0007 |
| 360 | 15% | 0.8318 | 0.6918 | 295–306–317 | 6/9 | 7/11 | 2/3 | 3/4 | 0.9995 | 2.558e-7 |
| 360 | 20% | 0.0625 | 0.0039 | 275–288–300 | 7/11 | 8/12 | 1/2 | 4/5 | 0.9962 | 9.745e-12 |
| 420 | 0% | 1 | 1 | 420–420–420 | 0/0 | 0/0 | 7/7 | 0/0 | 1 | 1 |
| 420 | 5% | 1 − 1.348e-56 | 1 − 2.695e-56 | 392–399–406 | 4/6 | 4/7 | 4/5 | 2/3 | 1 | 0.7978 |
| 420 | 10% | 1 − 4.082e-27 | 1 − 8.163e-27 | 368–378–388 | 6/9 | 6/10 | 3/4 | 3/4 | 1 | 0.2098 |
| 420 | 15% | 1 − 3.995e-13 | 1 − 7.990e-13 | 345–357–369 | 7/10 | 7/12 | 2/3 | 4/5 | 0.9999 | 0.0101 |
| 420 | 20% | 0.999990 | 0.999980 | 322–336–349 | 8/11 | 8/13 | 2/3 | 4/5 | 0.9992 | 6.690e-5 |

These fixed-cap scenarios supported the adopted target of 300 protocol completers and immutable hard cap of 420 starts per L1, but they do not validate target-triggered sequential stopping. Before preregistration, run a separate pilot-informed model of arrival times, completion latency, Prolific pause delay, in-flight overshoot, the recruitment deadline, and overall and differential attrition (including L1, route, option-layout, burden/position, exclusions, and invalid submissions), with uncertainty propagated. The release-specific 840-slot schedule, D1 seed, deployment hashes, and balance audit still require fresh generation and independent validation.
