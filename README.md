# UVLT Form A+B Cloudflare–Prolific Runtime

This repository contains the code-only, collection-disabled runtime for a proposed fixed-form joint calibration of UVLT Forms A and B. It uses Cloudflare Workers, D1, and Prolific Study/launch/submission verification.

## Status

This is an engineering preview, not an authorized participant study. The checked-in configuration fails closed: it has placeholder D1 bindings, `COLLECTION_MODE=technical_only`, unconfigured release/app/build identities, no secrets, and no active Study IDs.

Version `0.2.0-dev` implements the collection-disabled schema-v7 administration contract. One synthetic interaction-practice set precedes the protected main bank; the server retains only its versioned completion marker, not its selections, correctness, score, or response time. Nine server-observed breaks follow Modules 1–9: eight require at least 45 seconds and the midpoint break after Module 5 requires at least 90 seconds. A participant may safely pause only from the break screen after a module-boundary save has been confirmed. Safe pause records no response, pause reason, focus event, or extra timestamp, and resume preserves the original server-side assignment.

This GitHub repository and its commit history are not an anonymous-review artifact. For blinded review, export only the reviewed worktree files (never `.git`) to the journal-facing OSF component and use OSF's anonymized view-only link.

The repository intentionally excludes:

- UVLT stimuli and source workbooks;
- answer keys, scoring registries, and IRT parameters;
- private D1 seeds or exports;
- participant-level data and Prolific identifiers;
- HMAC keys, API tokens, and completion codes.

No permission to reproduce or redistribute UVLT content is conveyed by this code repository.

## Runtime boundary

Prolific opens `/join` with its three standard identifiers. Before allocation, the Worker verifies the live Study configuration, requested 300 places, completion code/action, and submission through Prolific; maps the Study ID to the Japanese- or Vietnamese-L1 stratum; stores only domain-separated HMAC linkage values; issues an expiring HttpOnly cookie; and redirects to a clean URL. After first allocation, a relaunch can rotate the token only when the browser presents the exact still-valid session cookie; a copied launch URL alone cannot take over the session. The runtime presents the synthetic practice and, after its completion is confirmed, D1 serves only the next keyless three-item main testlet. The completion URL remains withheld until the server verifies practice completion, 100 testlets, 300 main responses, and all nine minimum break intervals. The browser countdown is advisory and cannot shorten a server-enforced break. The frozen policy defines eligible partial data as successfully committed complete three-response testlets from consented, nonwithdrawn incomplete sessions; selections that were never submitted are not server data. This engineering preview does not yet implement or persist consent/withdrawal state, so collection remains blocked until an approved consent gate and response-bearing redaction procedure are added and tested.

Schema v7 minimizes process data to what is needed for administration, integrity checks, and preregistered analyses: linkage and allocation fields, committed main-response strings and displayed positions, permitted testlet-level client/server timing, necessary state-transition events, and the server timestamps used to derive break intervals. It excludes practice selections and timing, item-level clickstreams, page-visibility telemetry, pause reasons, and unsent selections. The restricted records remain linkable and are not anonymous; participant-level responses, linkage hashes, and row-level process data stay outside this public repository and any public OSF package.

The engineering gate pins the release ID, exact `package.json` app version, deterministic public build-manifest hash, manifest/bank/route/allocation-schedule SHA-256 values, canonical D1 bank/route projection hashes, randomization seed fingerprint and algorithms, the target/cap/retention policy, both participant-linkage and completion-code fingerprints, expected completion action, and the Cloudflare Worker version ID and one-time tag. It also requires the exact canonical schema-v7 administration-policy object and its SHA-256 (`55588091b7c85cf698e076283503c663eaacf77540d3ec9d03abf5b06b229b43` in the checked-in example), plus an independent-review approval gate. Browser assets are built from an explicit allowlist and audited against path, size, app-version, and SHA-256 constraints. The two-phase workflow uploads without deploying from a private frozen snapshot, captures the immutable version ID in a no-clobber attestation bound to Worker source, assets, production config, migrations, package metadata, and lockfile, stores that ID in the inactive D1 release, deploys exactly that ID at 100%, verifies deployment status, and requires both `CF_VERSION_METADATA.id` and its tag to match at runtime. Before activation, the Worker reconstructs and hashes every D1 testlet and route row, reconstructs all 840 allocation rows, and exposes only non-secret integrity/readiness values plus a release/app/Worker-version binding digest.

Within each L1 stratum, the private schedule contains 42 randomized permuted blocks of ten starts. Every block includes R01–R10 once. Ten routes are crossed with six canonical-first Williams option-column layouts across seven 60-start macroreplicates, giving 42 starts per route, 70 per layout, and seven per route × layout cell at the 420-start hard cap. Prompt rows remain canonical.

The target is 300 protocol completers per L1, defined by the server-verified 100-testlet/300-response/nine-break completion state. The Worker atomically stops new allocations for that L1 at the target or the immutable 420-start cap, whichever occurs first. Already allocated sessions can resume and finish, so final completers can exceed 300. Minimal append-only start and completion ledgers containing only release, L1, and allocation index prevent index reuse after participant-data redaction; exclusions do not replenish starts and the cap is not extended after outcomes are observed. These are start-level guarantees, not completer-level guarantees.

The stimulus-free reproducibility analysis under `design/` compares fixed capacities of 300, 360, and 420 starts per L1 at 0%–20% common independent attrition. It uses a disclosed planning seed, 20,000 Monte Carlo replicates per condition, exact binomial target probabilities, Wilson intervals, and route/layout/cell balance summaries. At 20% attrition, the exact per-L1 probability that 420 starts produce at least 300 completers is `0.9999899`; for 360 it is `0.0625`. This supports the adopted hard cap but is not a sequential same-day arrival model. Pilot-informed simulation of completion latency, Prolific pause delay, in-flight overshoot, and the recruitment deadline remains a preregistration gate.

## Verify the code-only package

Use Node 24.9.0 and the exact npm lockfile:

```bash
npm ci
npm run build
```

The randomization suite uses only synthetic module/testlet labels and checks the canonical-first Williams square, HMAC counter RNG, exact 840-slot block/crossing constraints, route and route × layout prefix balance, fixed known-answer hash, tamper rejection, and stimulus-free aggregate audit. The attrition analysis is byte-for-byte reproducible and reports its public seed, algorithm, software environment, assumptions, limitations, exact tails, Monte Carlo uncertainty, and artifact hash. The Worker integration suite applies the real D1 migration to an isolated database and uses only synthetic testlets. It checks fail-closed configuration, immutable active release/session assignment, exact Worker-version and release-binding digests, canonical D1 projection hashing (including coordinated content/self-hash mutation and balanced-route relabeling), allocation-row hashing, 300-completer L1-specific stopping, the 420-start cap, partial-session resume, allocation-index nonreuse, option placement and stored display position, live Prolific Study/submission verification, copied-launch rejection, raw-ID non-exposure, cookie-bound session resume, idempotent writes, conflicts, token expiry, mandatory practice completion without retained practice choices, exact 44,999/45,000 ms and 89,999/90,000 ms break boundaries, reload-safe countdown behavior, all 100 testlets and nine breaks, completion-code withholding/release, and mismatched app/build/secret/action/version/policy identities.

## Private deployment inputs

Licensed content and approved operational metadata must be supplied from an institutionally approved encrypted workspace. `.gitignore` does not prevent cloud synchronisation, backups, or inherited folder sharing. `cloudflare/tools/build-randomization-schedule.mjs` creates a frozen private participant-level schedule plus a stimulus-free aggregate audit; `cloudflare/tools/build-private-seed.mjs --print-projection-hashes` derives the release-specific D1 projection pins without writing a seed, while its normal mode validates the schedule and writes an always-inactive D1 seed. `cloudflare/tools/build-activation-sql.mjs` separately creates a version-bound, no-clobber activation file without applying it. These private artifacts accept only byte-identical regeneration. The D1 seed contains prompts/options, routes, and allocation slots, but no answer key or scoring fields.

Production preparation first uses `npm run upload:worker-version:dry-run` and then the explicit `npm run upload:worker-version` to create—but not deploy—the attested version. Production deployment is supported only through `npm run deploy`. Its predeploy lifecycle requires an approved finalized private release with the captured version ID, a matching immutable upload-input/release-handoff attestation, a private custom-domain configuration, a separate production D1 database, exactly three remotely stored Worker secrets, public-asset auditing, all tracked Node and Worker tests, type checking, and a local upload dry run. The deployment wrapper verifies the remote ID/tag, deploys only `<workerVersionId>@100%`, and rejects split or mismatched production traffic. Plaintext production secret files and direct `wrangler deploy` are outside the supported process. Version deployment does not apply custom-domain triggers. `npm run activate:production` remains a separate, explicitly acknowledged live mutation; it requires the exact release-binding digest and a full-integrity exactly-inactive preflight, rechecks the ID/tag and 100% traffic, requires exactly three one-row activation changes, and then machine-checks both D1 and the controlled domain.

The current `cloudflare/migrations/0001_initial.sql` is a fresh-database schema-v7 baseline. Do not reuse a schema-v6 engineering database on which an earlier file with that migration name was already recorded: Wrangler will not reapply an edited migration filename. Provision a fresh empty schema-v7 staging/production D1 database, or create and independently validate an explicit upgrade migration.

See [cloudflare/README.md](cloudflare/README.md) for the full operational and privacy checklist and [design/full-length-soft-launch-protocol.md](design/full-length-soft-launch-protocol.md) for the fixed administration, operational-only monitoring, go/no-go, and preregistered sensitivity-analysis plan. Participant launch remains blocked until content permission, ethics approval, consent/withdrawal and lost-cookie support flows, approved Japanese/Vietnamese instructions and synthetic practice, timing/fatigue piloting, compensation, the operational pause/deadline/grace/overshoot procedure and sequential simulation, private-workspace approval, edge-log query minimization, retention/deletion, a separately identified full-length soft launch, fresh schema-v7 D1 provisioning, exact-version custom-domain rehearsal, remote concurrency/read-back testing, independently reviewed administration policy and activation, and prelaunch review are complete.

Official references:

- [Prolific identifiers](https://researcher-help.prolific.com/en/articles/445133-what-are-prolific-ids-and-how-do-i-use-them)
- [Prolific submission lookup](https://docs.prolific.com/api-reference/submissions/get-submission)
- [Prolific Study lookup](https://docs.prolific.com/api-reference/studies/get-study)
- [Cloudflare static assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Worker version metadata](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
- [Cloudflare Worker versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
