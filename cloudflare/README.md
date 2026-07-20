# Cloudflare + Prolific Operations

This directory contains a collection-disabled Cloudflare Workers integration for the fixed UVLT Form A + Form B calibration study. It is designed for two independent Prolific studies—Japanese L1 and Vietnamese L1—using one private, frozen 300-item bank.

## Security and data boundary

The deployed public asset directory is `dist/`, generated from an explicit five-file source allowlist plus its deterministic v2 build manifest. The manifest records the exact `package.json` app version and per-file hashes. The repository root is never a Cloudflare asset directory.

| Location | Permitted content |
|---|---|
| Public `dist/` | Participant HTML, CSS, and browser JavaScript only |
| Private D1 | Frozen keyless prompts/options, route order, allocation slots, HMAC linkage values, unscored selected-option strings/positions, timings, and server events |
| Worker secrets | Prolific API token, participant-linkage HMAC key, and completion code |
| Offline restricted environment only | Canonical answer keys, scoring, correctness, scores, IRT parameters, and source workbooks |

Prolific identifiers are pseudonymous personal data. The Worker receives the three launch identifiers, verifies them against Prolific, stores only domain-separated HMAC linkage values, sets an HttpOnly session cookie, and redirects to a clean URL. The cookie and its server-side token expire after 24 hours. The response data remain linkable—not anonymous—and require restricted handling.

`cloudflare/private/` is excluded from Git, but that does not exclude it from Dropbox, other synchronisation software, device backups, or inherited folder sharing. Before generating either the participant-level schedule or the stimulus-bearing D1 seed, inspect the actual working-copy location and have the institutional data-governance owner approve that storage account, device encryption, synchronisation, retention, and access list. If it is not approved, create the private operational working copy in approved encrypted storage first; do not rely on `.gitignore` as a confidentiality control.

A first verified launch does not require a pre-existing cookie. Once that launch has allocated a session, however, the launch URL alone is not a recovery credential: `/join` rotates the token only when the browser presents the still-valid cookie for that exact D1 session. A missing, wrong, stale, or expired cookie fails closed with `SESSION_RECOVERY_REQUIRED` and never receives a replacement cookie. This prevents a copied Prolific launch URL from taking over an existing session, but it also means cookie loss currently requires an approved study-team support decision; there is no automated or investigator bypass endpoint.

The v1 field API administers the 100 main testlets only. The two local technical practice testlets are not yet represented in the server state machine, and consent/withdrawal state is not yet captured. An approved practice/participant-information/consent flow, a response-bearing withdrawal-redaction procedure, and Japanese/Vietnamese instruction review therefore remain launch gates.

## Request flow

```text
Prolific launch URL
  -> GET /join with three official IDs
  -> Prolific GET Study configuration verification
  -> Prolific GET submission verification
  -> Study ID maps to ja or vi in D1
  -> existing session requires its exact still-valid cookie
  -> D1 allocates index 0...419 within that L1 while completers < 300
     or sends an unallocated participant to a generic closed-recruitment page
  -> frozen schedule supplies route + option layout
  -> HttpOnly cookie + 303 redirect to /
  -> one authenticated testlet at a time
  -> 100 atomic testlet saves + 9 required breaks
  -> server coverage verification
  -> Prolific completion redirect
```

The schedule is generated before release freeze from a secret seed. Japanese- and Vietnamese-L1 strata are randomized independently in 42 permuted blocks of ten starts. Every block contains R01–R10 once. Routes are crossed with six option-column layouts so that, at the 420-start hard cap per L1, each route receives 42 starts, each layout 70, and each route × layout cell seven. A duplicate launch with the current valid session cookie resumes the same route/layout and does not consume another allocation index. A duplicate launch without that cookie is rejected rather than creating a new allocation.

Within each L1, the recruitment target is 300 protocol completers and the immutable allocation hard cap is 420 unique starts. A protocol completer is entered in the append-only completion ledger only after D1 has verified 100 testlets, 300 item responses, and nine required breaks. The allocation statement atomically refuses a new session when that L1 has reached 300 ledgered completers or has consumed all 420 slots. Already allocated sessions remain resumable and may finish, so the final completer count can exceed 300. A second append-only ledger containing only release, L1, and allocation index prevents index reuse even if participant-linked session data are later removed under an approved withdrawal/redaction procedure. Exclusions and quality flags do not replenish starts, and 420 is not extended if the completer target is missed.

The frozen policy defines retained partial data as successfully server-committed responses from consented, nonwithdrawn incomplete sessions. The atomic storage unit is one complete three-response testlet; selections made in a testlet but never submitted to the server are not retained. The current engineering preview enforces committed-record immutability but does not yet implement or persist consent/withdrawal state. The Worker exposes no delete endpoint, and D1 guards reject updates and deletes of committed submissions, responses, events, and sessions. A withdrawal that requires erasure therefore needs a separately reviewed redaction migration that removes participant-linked rows while leaving the minimal start/completion ledgers intact. Retention does not itself determine analytic inclusion, and collection remains blocked until the approved consent gate and redaction path are implemented and tested with response-bearing sessions.

The six layouts are an even-order Williams square relabelled so layout 0 reproduces canonical option order. Across them, each canonical option appears once in every displayed position and every directed adjacent pair appears once. Prompt-row order is intentionally kept canonical to preserve the original testlet definition and Form A/B comparison. Accordingly, this design controls option-column position and first-order adjacency but does not identify prompt-row-order effects.

## Local fail-closed checks

Install the exact lockfile and run the public/private build checks:

```bash
npm ci
npm run build:field
npm run audit:field
npm run check:worker
```

`build:randomization-schedule` requires `UVLT_RANDOMIZATION_SEED` from the process environment and writes the participant-level schedule plus a stimulus-free aggregate balance audit only to ignored `cloudflare/private/`. Supply the seed through an approved secret manager; never paste it into a command, shell history, file, issue, or log. The tool validates the Williams balance of the frozen routes before producing any schedule. Record the reported `allocationScheduleSha256` payload hash (not `allocationScheduleFileSha256`) and `seedFingerprint`, but keep the raw seed and participant-level schedule restricted throughout recruitment.

`build:private-seed` is an optional preview command that may be run only in an approved private workspace. Its default input and output paths are `cloudflare/release-config.example.json` and ignored `cloudflare/private/runtime-seed.preview.sql`, physically distinct from the frozen production path; it writes only when the matching private artifacts and non-placeholder hash pins are present. The code-only public copy intentionally lacks those artifacts and therefore fails closed. The example release is inactive, has `workerVersionId: null`, contains no Study IDs, and has every approval gate set to `false`. For a real release, always pass the reviewed private config and the explicit `cloudflare/private/runtime-seed.sql` output shown below. The builder requires the release app version to equal `package.json`, verifies the raw SHA-256 and app version of `dist/build-manifest.json`, validates the schema-v6 recruitment policy, and validates the frozen schedule and its hash/fingerprint. It also derives and pins canonical hashes of the exact testlet and route projections inserted into D1. Even when `--require-active` validates a finalized schema-v6 config, the generated SQL always inserts the release and studies inactive. Activation is deliberately separate and may occur only after exact-version, route, and live-domain verification.

The committed `wrangler.jsonc` and its named staging/production environments are intentionally unusable for collection:

- `COLLECTION_MODE` is `technical_only`.
- `EXPECTED_RELEASE_ID` is `UNCONFIGURED`.
- `EXPECTED_APP_VERSION`, the public build-manifest hash, the six private artifact/projection hashes (including the canonical D1 bank/route projections and allocation schedule), both runtime-secret fingerprints, and the completion action are `UNCONFIGURED`.
- the D1 UUID is all zeroes.
- preview URLs are disabled.
- required secrets are declared but absent.

The default and production targets disable `workers.dev`; staging is the only target that may use it. Production additionally requires the separately reviewed private configuration and a controlled custom domain. Staging and production must use different D1 databases.

## Private release preparation

1. Copy `cloudflare/release-config.example.json` to ignored `cloudflare/private/release-config.json`.
2. Keep `appVersion` equal to the exact `package.json` version. Initially keep schema-v6 `workerVersionId` null and `active` false. Preserve the exact recruitment-policy object from the example config; it binds target 300, hard cap 420, target stopping, committed-partial retention, and their operational definitions into the release identity. Record the reviewed release ID, public build-manifest hash, exact runtime-manifest/bank/route hashes, canonical D1 bank/route projection hashes, SHA-256 fingerprints of the exact UTF-8 HMAC key and completion code, the expected `MANUALLY_REVIEW` or `AUTOMATICALLY_APPROVE` action, approval gates, and the two 24-character Study IDs. Because the canonical projections bind the release ID, derive their two hashes for the intended inactive private release before freezing it:

   ```bash
   npm run derive:runtime-projections -- --config cloudflare/private/release-config.json
   ```

   This inspection mode validates the source artifacts and prints the two hashes without writing a seed.
3. Set the Japanese Study row to `l1: "ja"` and the Vietnamese Study row to `l1: "vi"`. L1 is never accepted from participant input.
4. From an approved secret-management environment, inject a cryptographically random seed of at least 32 UTF-8 bytes as `UVLT_RANDOMIZATION_SEED` and generate the schedule. Do not place the seed literal in the command itself:

```bash
# UVLT_RANDOMIZATION_SEED is already injected by the approved secret manager.
npm run build:randomization-schedule -- \
  --config cloudflare/private/release-config.json \
  --routes data/uvlt_routes.ab.williams10.dev.json \
  --schedule-output cloudflare/private/randomization-schedule.json \
  --audit-output cloudflare/private/design-balance.audit.json
```

Independently review the stimulus-free balance audit, then copy the reported `allocationScheduleSha256`, `seedFingerprint`, `randomizationAlgorithm`, and `optionLayoutAlgorithm` values into the corresponding release-config fields. The similarly named `allocationScheduleFileSha256` covers serialized file bytes and is provenance information, not the release-config payload hash. Destroy any unnecessary plaintext copy of the raw seed while retaining an approved recoverable secret-manager record. Once either output is written, the generator accepts only byte-identical regeneration and refuses to overwrite it with a different schedule or audit.
5. Keep both the release and studies inactive through Worker upload, D1 loading, exact-version deployment, custom-domain trigger application, and the inactive live rehearsal. Activate them only after the complete staging rehearsal and independent launch review.
6. After capturing and freezing the Worker version ID through the two-phase procedure below, set the final config fields and build the D1 seed:

```bash
node cloudflare/tools/build-private-seed.mjs \
  --config cloudflare/private/release-config.json \
  --output cloudflare/private/runtime-seed.sql \
  --require-active
```

The D1 seed contains prompts/options and the frozen participant-level allocation schedule but no answer key or scoring field. Every row is loaded inactive; `active: true` in the private config means “finalized and eligible for gates,” not “activate during import.” The seed must never be committed, uploaded to OSF, placed in `dist/`, or attached to a public issue. Once written, the builder permits only byte-identical regeneration and refuses to overwrite the seed with different bytes. The aggregate design-balance audit contains no stimuli, prompts, options, testlet IDs, raw seed, or slot rows and may be released after independent inspection. Before recruitment, preregister whether the raw seed and participant-level schedule will be disclosed after a stated embargo, made available only under controlled access, or withheld for ethics/test-security reasons. The public OSF package must follow that frozen policy and otherwise excludes both artifacts.

## Cloudflare setup

Choose the D1 location with the institutional privacy/data-governance owner before creation; this choice cannot be treated as an afterthought. Create separate staging and production databases. For an Asia-Pacific deployment, the technical commands are:

```bash
npx wrangler d1 create uvlt-fixed-ab-calibration-staging --location=apac
npx wrangler d1 create uvlt-fixed-ab-calibration-production --location=apac
```

Keep the returned UUIDs in their corresponding controlled deployment configurations. Never bind staging to production D1. Copy the production template into the ignored private directory and replace every placeholder:

```bash
cp cloudflare/wrangler.production.example.json \
  cloudflare/private/wrangler.production.json
```

The committed template deliberately uses the reserved placeholder domain `uvlt-study.example.edu` and a zero D1 UUID. The production verifier rejects that domain; `example.edu`, `example.com`, `example.net`, `example.org`, and their subdomains; the reserved `.example`/`.invalid`/`.test`/`.localhost` suffixes; `workers.dev`; `pages.dev`; and any database name other than `uvlt-fixed-ab-calibration-production`. Replace the template route with exactly one institutionally controlled custom domain before attempting the field gate.

Schema v6 was finalized before any authorized collection and therefore remains the baseline `0001_initial.sql`. It adds the immutable recruitment policy, 840 allocation slots, and minimal append-only start/completion ledgers (release, L1, allocation index only) alongside the Cloudflare Worker version UUID and canonical D1 bank/route projection hashes. If an earlier engineering-preview copy of `0001_initial.sql` was already recorded in a local, staging, or remote D1 migration table, Wrangler will not reapply the changed filename. Do not reuse that database for this release. Provision a fresh empty staging/production database (or write and independently validate an explicit upgrade migration) and verify its migration history before loading the seed. Never infer schema v6 readiness from the filename alone.

Apply the tracked migration first. Apply the private seed only after completing the immutable Worker upload/ID-capture step below and rebuilding the finalized seed with `--require-active`; the document presents the D1 commands here for reference, not as permission to skip that dependency:

```bash
npx wrangler d1 migrations apply uvlt-fixed-ab-calibration-production --remote \
  --config cloudflare/private/wrangler.production.json
npx wrangler d1 execute uvlt-fixed-ab-calibration-production --remote \
  --config cloudflare/private/wrangler.production.json \
  --file=cloudflare/private/runtime-seed.sql
```

The generated seed deliberately omits explicit `BEGIN TRANSACTION` and `COMMIT` statements. Cloudflare's D1 import guidance requires those statements to be removed before `wrangler d1 execute --file`; leaving them in can produce a nested-transaction failure that local SQLite checks do not reveal.

Do not create a plaintext production secrets file. Keep each value in an approved secret manager and enter it only through Wrangler's interactive prompt. In particular, never place `production.secrets.env` or an equivalent file in a local working tree, the repository, an OSF package, a shell command, or shell history:

```bash
npm exec -- wrangler secret put PARTICIPANT_HMAC_KEY \
  --config cloudflare/private/wrangler.production.json
npm exec -- wrangler secret put PROLIFIC_API_TOKEN \
  --config cloudflare/private/wrangler.production.json
npm exec -- wrangler secret put PROLIFIC_COMPLETION_CODE \
  --config cloudflare/private/wrangler.production.json
npm run verify:remote-secrets
```

Each command prompts for the value without requiring a local secret file. Obtain the HMAC key and completion code SHA-256 fingerprints in the approved secret-management environment, then pin both fingerprints in the release config, D1 seed, and Worker variables before entering the values interactively. The Prolific API token has broad, non-expiring account authority. Never send it to the browser, commit it, put it in a Wrangler `vars` block, paste it into an issue, or include it in an export. Rotate it immediately if exposure is suspected. Do not rotate the participant HMAC key or completion code during a release.

Finish all three `secret put` operations before the immutable version upload. Cloudflare secret changes create and deploy a new Worker version; changing a secret after ID capture invalidates the version handoff and requires abandoning that release ID and restarting the freeze with a new release.

The predeploy gate runs the locally installed, exactly pinned Wrangler 4 executable with `secret list --format json` and accepts exactly the three approved remote secret names. Cloudflare does not reveal their values, and the gate neither requests nor prints them. The Worker independently hashes `PARTICIPANT_HMAC_KEY` and `PROLIFIC_COMPLETION_CODE` at runtime; if either fingerprint differs from the release row or expected Worker variable, readiness fails closed and `/api/config` reports `collection_enabled: false`.

## Immutable Worker version handoff

The Worker version ID cannot be placed in a Worker environment variable: changing that variable would itself create another version and therefore a circular identity. Use the D1 release row as the external immutable pin.

1. With the schema-v6 release config still inactive and `workerVersionId: null`, finish the private Wrangler config and all local gates. Then intentionally upload, but do not deploy, one version:

```bash
npm run upload:worker-version:dry-run
npm run upload:worker-version
```

The npm dry-run command rebuilds and audits the public assets, checks the tracked attrition artifacts and Cloudflare tools, runs the Node and Worker tests and type check, verifies the exact remote secret-name set, and then runs `wrangler versions upload --strict --dry-run` without contacting the version-upload endpoint. The intentional second command repeats that gate, freezes the standalone Worker source, production config, migrations, TypeScript config, built assets, package metadata, and lockfile into a private snapshot, uploads that snapshot with the exactly pinned local Wrangler, and passes the unique release ID as the version annotation. It captures the assigned ID from Wrangler's machine output, then independently reads that exact remote version and requires `annotations["workers/tag"]` to equal the release ID; Wrangler's opaque receipt `worker_tag` is not treated as the version annotation.

The no-clobber attestation records a canonical manifest and SHA-256 of every upload input, the production-config byte hash, the preupload release-config byte hash, the exact Node/Wrangler versions, and a normalized release-handoff hash. The latter permits only the documented post-upload changes to `workerVersionId`, `frozenAt`, release/study activation state, and final independent-review flag. Deployment recomputes these hashes after rebuilding and refuses changed source, assets, package metadata, lockfile, config, release identity, or toolchain version. If any step fails after the remote upload begins, the raw machine receipt, frozen snapshot, and mode-0600 attempt marker are deliberately retained; do not rerun. Inspect remote versions and perform an explicit recovery or abandon that release ID.

2. Copy the attested `workerVersionId` exactly into `cloudflare/private/release-config.json`, record `frozenAt`, set the finalized config and both Study records active, and generate both private SQL artifacts:

```bash
node cloudflare/tools/build-private-seed.mjs \
  --config cloudflare/private/release-config.json \
  --output cloudflare/private/runtime-seed.sql \
  --require-active
npm run build:activation-sql
```

The seed still loads the release and both Study rows inactive. The separate no-clobber activation SQL contains only the final version-bound opening operation; generating it does not execute it. Review the attestation, finalized config, seed, activation SQL, and hashes before applying the seed to the fresh production D1 database.

3. `npm run deploy` is the only supported exact-version deployment entry point. Its automatic predeploy gate rebuilds and audits `dist/`, validates the finalized release and always-inactive D1 seed, requires the no-clobber attestation to match the release ID, app version, Worker ID/tag, exact Node/Wrangler versions, normalized release handoff, production-config bytes, and complete upload-input manifest, checks the custom-domain/D1/variable configuration and exact remote secret-name set, runs all tracked Node tests, the Worker tests and type check, and uses `wrangler versions upload --dry-run` only for its local deployment dry run. The actual wrapper first verifies the remote version ID and tag, deploys exactly `<workerVersionId>@100%`, and then requires `wrangler deployments status --json` to report one version at exactly 100% traffic:

```bash
npm run deploy
```

Do not bypass this lifecycle with a raw `wrangler deploy` command, and never reuse a release ID/version tag for changed code, assets, bindings, or compatibility settings. Versions deployment does not apply a custom-domain route; apply and inspect the controlled route separately with `wrangler triggers deploy --config cloudflare/private/wrangler.production.json`. A deployment or route change is not launch authorization. Before D1 activation, the controlled domain must resolve to the exact version while `/api/config` reports `collection_enabled: false`, `release_integrity_verified: true`, and `activation_preflight_ready: true`. The integrity value is a read-only full preflight: even while inactive, the Worker reconstructs and hashes the canonical testlet and route projections, validates every testlet self-hash and both Williams structures, reconstructs the canonical schedule artifact from all 840 D1 slot rows, checks the immutable recruitment policy, every pinned hash, and asset/secret fingerprints, and requires both `CF_VERSION_METADATA.id` to equal D1 `worker_version_id` and its tag to equal the release ID. The response also exposes only a non-secret `release_binding_sha256`; the activation wrapper recomputes it from the local release ID, app version, and Worker version ID, so a different valid deployment cannot authorize this release. The activation-specific value additionally proves that the release and both Study rows are exactly inactive. Inactive successes are never cached because those rows remain mutable. A coordinated content/self-hash rewrite, a differently labeled but still balanced route set, or a merely count-balanced schedule fails preflight.

No activation command is embedded in the seed or deployment wrapper. `npm run build:activation-sql` deterministically creates the ignored, mode-0600 `cloudflare/private/runtime-activate.sql` without applying it and refuses to overwrite different bytes. Only after exact-version deployment/status, custom-domain verification, inactive D1 readback, a controlled `/api/config` rehearsal showing `collection_enabled: false`, `release_integrity_verified: true`, and `activation_preflight_ready: true`, and independent sign-off may the reviewed wrapper be invoked. This is a live, collection-opening mutation and must never be run during code review:

```bash
npm run activate:production
```

The wrapper reruns the full field gate, revalidates the immutable upload attestation and its exact production-config/D1 UUID bytes, requires the exact local release-binding digest in the inactive full-integrity preflight, rechecks the version tag and 100% deployment, leaves a durable no-clobber recovery marker before mutation, applies the reviewed SQL with pinned Wrangler, verifies exactly one change for each of the two Study rows and release row, performs a separate exact D1 readback, and finally requires the same release binding with full integrity and `collection_enabled: true`. The two Study rows are opened first and the exact-version-bound release is the final mutation. A zero-row update, wrong Worker ID, missing/duplicate active Study, malformed CLI result, or unsuccessful domain readback is not reported as success; on uncertainty the marker remains and the command must not be rerun blindly. The generated SQL is exercised against the committed D1 schema in SQLite for both successful activation and rollback after a partial zero-row attempt, the validation helpers are behavior-tested, and the orchestration wrapper is syntax-checked. Production D1 execution and an independent live rehearsal have not occurred, so collection remains blocked.

Immediately after deployment, inspect the public, non-secret readiness response from the controlled domain:

```bash
curl --fail --silent --show-error \
  https://<controlled-study-domain>/api/config
```

After controlled activation, verify `ok: true`, the expected protocol/count fields, and `collection_enabled: true`. A false value—including an app version, public manifest, allocation-schedule row/hash, Worker version ID/tag, or participant-HMAC fingerprint mismatch—is a hard stop: do not open either Prolific study until the package, release identity, D1 state, deployed version/assets, Worker variables, and remotely stored secret have been reconciled.

## Prolific configuration

Create separate Japanese-L1 and Vietnamese-L1 studies. Configure both external Study URLs in the official form:

```text
https://<controlled-study-domain>/join?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

Set `total_available_places` to 300 in each Prolific Study. Returned, timed-out, or otherwise reopened places can produce more than 300 cumulative D1 starts, but the Worker's immutable per-L1 cap remains 420. Use the same completion code stored as the Worker secret, or revise the Worker to use an audited per-study mapping before creating different codes. Before allocation or resume, the Worker retrieves `GET /api/v1/studies/{STUDY_ID}/` and requires the exact Study ID, `total_available_places: 300`, URL-parameter mode, publish-ready flag, one `COMPLETED` code equal to the Worker secret, and exactly the configured manual-review or automatic-approval action. It then verifies `SESSION_ID` through `GET /api/v1/submissions/{SESSION_ID}/` and requires the returned participant and Study ID to match the launch values. Only an `ACTIVE` submission may create a new local session; `AWAITING_REVIEW` or `APPROVED` can resume an existing one but cannot create a replacement. An unavailable or inconsistent Prolific response fails closed.

Prolific Secure external URL verification is not implemented in this release and remains a future launch gate. If the workspace supports it, add and test signed-JWT verification as an additional control before enabling that setting; do not use the two-minute JWT as the long-lived study session. The server-side submission lookup plus the exact current session cookie remain the current authorization path. The participant information and support protocol must explain what happens if that cookie is cleared, blocked, or expires, and the study team must approve whether such a participant can restart or requires manual follow-up.

### Recruitment stopping and reconciliation

D1 is authoritative for protocol starts and completers. During recruitment, run the following read-only query against the controlled database and reconcile it with the two Prolific Study dashboards:

```sql
SELECT
  strata.l1,
  (SELECT COUNT(*) FROM allocation_start_ledger starts
    WHERE starts.release_id = strata.release_id AND starts.l1 = strata.l1) AS cumulative_starts,
  (SELECT COUNT(*) FROM protocol_completion_ledger completed
    WHERE completed.release_id = strata.release_id AND completed.l1 = strata.l1) AS protocol_completers,
  420 - (SELECT COUNT(*) FROM allocation_start_ledger starts
    WHERE starts.release_id = strata.release_id AND starts.l1 = strata.l1) AS unused_start_slots
FROM (
  SELECT release_id, l1 FROM studies WHERE release_id = '<reviewed-release-id>'
) strata
ORDER BY strata.l1;
```

Pause the matching Prolific Study when D1 first reports 300 completers or 420 starts for that L1. The Worker enforces the same rule atomically, so a delayed pause cannot allocate beyond the cap or begin a new session after the observed target. Do not set the D1 `studies.active` flag to zero for a routine target stop: current release readiness deliberately requires both Study rows to remain active, and changing one would also prevent the other L1 and already-started sessions from resuming. Existing sessions may finish during the preregistered grace period and all late completers remain in the recorded cohort; the final count can therefore exceed 300. Before launch, freeze the monitoring interval, pause owner, grace period, recruitment deadline, and Prolific-versus-D1 discrepancy procedure in the runbook and preregistration.

Official references:

- [Prolific identifiers and secure external URLs](https://researcher-help.prolific.com/en/articles/445133-what-are-prolific-ids-and-how-do-i-use-them)
- [Prolific submission lookup](https://docs.prolific.com/api-reference/submissions/get-submission)
- [Prolific Study lookup](https://docs.prolific.com/api-reference/studies/get-study)
- [Prolific completion codes](https://docs.prolific.com/api-reference/studies/the-study-object)
- [Prolific submission statuses](https://researcher-help.prolific.com/en/articles/445206-submission-statuses-explained)
- [Prolific pausing and stopping](https://researcher-help.prolific.com/en/articles/445200-pausing-stopping-a-study)
- [Cloudflare Workers static asset binding](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Worker version metadata](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
- [Cloudflare Worker versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 import and export guidance](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare zone HTTP-request log fields](https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/zone/http_requests/)

## Live launch gates

All items must be evidenced, not merely asserted:

- content-owner permission for protected UVLT stimuli;
- authoritative answer-key approval for the separate offline scorer;
- ethics approval and approved participant information/consent/withdrawal flow;
- Japanese and Vietnamese instruction review;
- timing and fatigue pilot for 100 testlets and nine breaks;
- Prolific compensation and maximum-time settings based on the pilot;
- an approved return/contact/compensation procedure for verified Prolific participants whom the Worker blocks at the target or hard cap, tested against the generic closed-recruitment page;
- a single frozen 840-slot allocation schedule whose hash, seed fingerprint, algorithm identifiers, Williams checks, within-block route counts, and L1 × route × option-layout cell counts have been independently reviewed;
- a preregistered operational stopping plan implementing target 300/hard cap 420 per L1, including authoritative D1 count queries, Prolific pause ownership and latency, in-flight grace period, recruitment deadline/pool-exhaustion rule, overshoot inclusion, duplicate/exclusion handling, and Prolific-versus-D1 reconciliation;
- a pilot-informed sequential simulation of completion latency, same-day concurrency, pause delay, in-flight overshoot, and completer balance; the tracked fixed-cap binomial simulation alone is not this evidence;
- a withdrawal/redaction procedure that removes response-bearing participant-linked data in the required foreign-key order while preserving the minimal append-only start/completion ledgers, with a tested prohibition on deleting or updating either ledger;
- D1 location, retention, deletion, incident-response, and backup/restore decisions;
- explicit approval of the private operational workspace, including any synchronisation and inherited sharing configuration, or relocation to institutionally approved encrypted storage before schedule/seed generation;
- a production custom domain and separate staging/production D1 bindings;
- rate-limit/WAF rules for `/join` and write endpoints, tested without blocking legitimate shared-network participants;
- private export and offline HMAC-linkage rehearsal;
- local Worker/D1 tests, concurrency stress test, and duplicate/reload test;
- staging preview using Prolific test participants;
- an approved lost/blocked/expired-cookie support and restart policy, tested against `SESSION_RECOVERY_REQUIRED`;
- an explicit decision on Prolific Secure external URL availability; JWT verification remains unimplemented and must be added before treating that feature as a launch gate;
- an independently reviewed execution of the two-phase Cloudflare version workflow, including the private no-clobber upload attestation, inactive D1 load, exact-ID 100% deployment readback, custom-domain trigger verification, inactive live rehearsal, and separate one-time activation;
- 299-response and missing-break completion rejection checks;
- confirmation that no raw identifier appears in the browser, localStorage, sessionStorage, participant API, application logs, or default analysis export;
- confirmation that zone HTTP logs, Logpush/Log Explorer, WAF/security events, and their retention settings do not store the study host's full launch URI or query; use path-only fields and exclude or redact `ClientRequestURI`-style query-bearing fields;
- independent review of the final release hashes and live configuration.

None of the remote D1 application, production Cloudflare deployment, custom-domain routing, or Prolific test-participant rehearsal has yet been performed by this code review. The command examples and local synthetic tests are procedures and evidence for local behavior, not evidence that those live launch gates have passed.

## Export, linkage, and reproducibility

Do not expose a public export endpoint. Export D1 from a restricted researcher machine and write only to an approved encrypted location:

```bash
npx wrangler d1 export uvlt-fixed-ab-calibration-production --remote \
  --config cloudflare/private/wrangler.production.json \
  --output=cloudflare/exports/uvlt-fixed-ab-restricted.sql
```

Cloudflare notes that a D1 export blocks other database requests, so schedule it outside active collection. Preserve the migration files, release configuration without secrets, package lock, randomization algorithm identifiers, seed fingerprint, allocation-schedule hash, stimulus-free balance audit, Worker version ID and one-time release tag, public/private artifact SHA-256 values, export SHA-256, and export timestamp. Apply the same domain-separated HMAC procedure to the restricted Prolific CSV to join records offline; do not export or publish the HMAC key. The analysis extract should retain route, option-layout ID, displayed option position, start/completion status, and L1 so that balance and position effects can be reported explicitly.

The public/OSF package may contain code, schemas, synthetic tests, aggregate outputs, and software provenance. It must exclude the private D1 seed, raw D1 export, row-level response data, HMAC linkage values, Prolific identifiers, secrets, stimuli without permission, and canonical keys. The raw randomization seed and participant-level allocation schedule are included only if the preregistered postcollection disclosure policy and ethics/test-security review explicitly authorize them; otherwise publish only their fingerprints/hashes and the stimulus-free balance audit.
