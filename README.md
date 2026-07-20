# UVLT Form A+B Cloudflare–Prolific Runtime

This repository contains the code-only, collection-disabled runtime for a proposed fixed-form joint calibration of UVLT Forms A and B. It uses Cloudflare Workers, D1, and Prolific Study/launch/submission verification.

## Status

This is an engineering preview, not an authorized participant study. The checked-in configuration fails closed: it has placeholder D1 bindings, `COLLECTION_MODE=technical_only`, unconfigured release/app/build identities, no secrets, and no active Study IDs.

This GitHub repository and its commit history are not an anonymous-review artifact. For blinded review, export only the reviewed worktree files (never `.git`) to the journal-facing OSF component and use OSF's anonymized view-only link.

The repository intentionally excludes:

- UVLT stimuli and source workbooks;
- answer keys, scoring registries, and IRT parameters;
- private D1 seeds or exports;
- participant-level data and Prolific identifiers;
- HMAC keys, API tokens, and completion codes.

No permission to reproduce or redistribute UVLT content is conveyed by this code repository.

## Runtime boundary

Prolific opens `/join` with its three standard identifiers. Before allocation, the Worker verifies the live Study configuration, completion code/action, and submission through Prolific; maps the Study ID to the Japanese- or Vietnamese-L1 stratum; stores only domain-separated HMAC linkage values; issues an expiring HttpOnly cookie; and redirects to a clean URL. After first allocation, a relaunch can rotate the token only when the browser presents the exact still-valid session cookie; a copied launch URL alone cannot take over the session. D1 serves only the next keyless three-item testlet, and the completion URL remains withheld until the server verifies 100 testlets, 300 responses, and nine breaks.

The engineering gate pins the release ID, exact `package.json` app version, deterministic public build-manifest hash, manifest/bank/route/allocation-schedule SHA-256 values, canonical D1 bank/route projection hashes, randomization seed fingerprint and algorithms, both participant-linkage and completion-code fingerprints, expected completion action, and the Cloudflare Worker version ID and one-time tag. Browser assets are built from an explicit allowlist and audited against path, size, app-version, and SHA-256 constraints. The two-phase workflow uploads without deploying from a private frozen snapshot, captures the immutable version ID in a no-clobber attestation bound to Worker source, assets, production config, migrations, package metadata, and lockfile, stores that ID in the inactive D1 release, deploys exactly that ID at 100%, verifies deployment status, and requires both `CF_VERSION_METADATA.id` and its tag to match at runtime. Before activation, the Worker reconstructs and hashes every D1 testlet and route row, reconstructs all 600 allocation rows, and exposes only non-secret integrity/readiness values plus a release/app/Worker-version binding digest.

Within each L1 stratum, the private schedule contains 30 randomized permuted blocks of ten starts. Every block includes R01–R10 once. Ten routes are crossed with six canonical-first Williams option-column layouts across five 60-start macroreplicates, giving 30 starts per route, 50 per layout, and five per route × layout cell at 300 starts. Prompt rows remain canonical. These are start-level guarantees, not completer-level guarantees; attrition, replacement, and any reserve allocation must be fixed before recruitment.

The stimulus-free reproducibility analysis under `design/` compares fixed capacities of 300, 360, and 420 starts per L1 at 0%–20% common independent attrition. It uses a disclosed planning seed, 20,000 Monte Carlo replicates per condition, exact binomial target probabilities, Wilson intervals, and route/layout/cell balance summaries. At 20% attrition, 420 is the only evaluated capacity with an exact per-L1 probability of at least 300 completers above 0.9999 (`0.9999899`); 360 falls to `0.0625`. No adequacy threshold or staged opening rule has yet been adopted. A 360+60 reserve rule is a candidate that requires its own sequential simulation and preregistration; neither 360 nor 420 is implemented in the present 300-slot runtime.

## Verify the code-only package

Use Node 24.9.0 and the exact npm lockfile:

```bash
npm ci
npm run build
```

The randomization suite uses only synthetic module/testlet labels and checks the canonical-first Williams square, HMAC counter RNG, exact block/crossing constraints, fixed known-answer hash, tamper rejection, and stimulus-free aggregate audit. The attrition analysis is byte-for-byte reproducible and reports its public seed, algorithm, software environment, assumptions, limitations, exact tails, Monte Carlo uncertainty, and artifact hash. The Worker integration suite applies the real D1 migration to an isolated database and uses only synthetic testlets. It checks fail-closed configuration, immutable active release/session assignment, exact Worker-version and release-binding digests, canonical D1 projection hashing (including coordinated content/self-hash mutation and balanced-route relabeling), allocation-row hashing, option placement and stored display position, live Prolific Study/submission verification, copied-launch rejection, raw-ID non-exposure, cookie-bound session resume, idempotent writes, conflicts, token expiry, all 100 testlets and nine breaks, completion-code withholding/release, and mismatched app/build/secret/action/version identities.

## Private deployment inputs

Licensed content and approved operational metadata must be supplied from an institutionally approved encrypted workspace. `.gitignore` does not prevent cloud synchronisation, backups, or inherited folder sharing. `cloudflare/tools/build-randomization-schedule.mjs` creates a frozen private participant-level schedule plus a stimulus-free aggregate audit; `cloudflare/tools/build-private-seed.mjs --print-projection-hashes` derives the release-specific D1 projection pins without writing a seed, while its normal mode validates the schedule and writes an always-inactive D1 seed. `cloudflare/tools/build-activation-sql.mjs` separately creates a version-bound, no-clobber activation file without applying it. These private artifacts accept only byte-identical regeneration. The D1 seed contains prompts/options, routes, and allocation slots, but no answer key or scoring fields.

Production preparation first uses `npm run upload:worker-version:dry-run` and then the explicit `npm run upload:worker-version` to create—but not deploy—the attested version. Production deployment is supported only through `npm run deploy`. Its predeploy lifecycle requires an approved finalized private release with the captured version ID, a matching immutable upload-input/release-handoff attestation, a private custom-domain configuration, a separate production D1 database, exactly three remotely stored Worker secrets, public-asset auditing, all tracked Node and Worker tests, type checking, and a local upload dry run. The deployment wrapper verifies the remote ID/tag, deploys only `<workerVersionId>@100%`, and rejects split or mismatched production traffic. Plaintext production secret files and direct `wrangler deploy` are outside the supported process. Version deployment does not apply custom-domain triggers. `npm run activate:production` remains a separate, explicitly acknowledged live mutation; it requires the exact release-binding digest and a full-integrity exactly-inactive preflight, rechecks the ID/tag and 100% traffic, requires exactly three one-row activation changes, and then machine-checks both D1 and the controlled domain.

See [cloudflare/README.md](cloudflare/README.md) for the full operational and privacy checklist. Participant launch remains blocked until content permission, ethics approval, consent/withdrawal and lost-cookie support flows, approved Japanese/Vietnamese instructions and practice, timing/fatigue piloting, compensation, the final start-versus-completer/reserve policy and corresponding runtime capacity, private-workspace approval, edge-log query minimization, retention/deletion, fresh schema-v5 D1 provisioning, exact-version custom-domain rehearsal, remote concurrency/read-back testing, independently reviewed activation, and prelaunch review are complete.

Official references:

- [Prolific identifiers](https://researcher-help.prolific.com/en/articles/445133-what-are-prolific-ids-and-how-do-i-use-them)
- [Prolific submission lookup](https://docs.prolific.com/api-reference/submissions/get-submission)
- [Prolific Study lookup](https://docs.prolific.com/api-reference/studies/get-study)
- [Cloudflare static assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Worker version metadata](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
- [Cloudflare Worker versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
