# Cloudflare + Prolific Operations

This directory contains a collection-disabled Cloudflare Workers integration for the fixed UVLT Form A + Form B calibration study. It is designed for two independent Prolific studies—Japanese L1 and Vietnamese L1—using one private, frozen 300-item bank.

## Security and data boundary

The deployed public asset directory is `dist/`, generated from an explicit five-file source allowlist plus its deterministic v2 build manifest. The manifest records the exact `package.json` app version and per-file hashes. The repository root is never a Cloudflare asset directory.

| Location | Permitted content |
|---|---|
| Public `dist/` | Participant HTML, CSS, and browser JavaScript only |
| Private D1 | Frozen keyless prompts/options, route order, HMAC linkage values, unscored selected-option strings, timings, and server events |
| Worker secrets | Prolific API token, participant-linkage HMAC key, and completion code |
| Offline restricted environment only | Canonical answer keys, scoring, correctness, scores, IRT parameters, and source workbooks |

Prolific identifiers are pseudonymous personal data. The Worker receives the three launch identifiers, verifies them against Prolific, stores only domain-separated HMAC linkage values, sets an HttpOnly session cookie, and redirects to a clean URL. The cookie and its server-side token expire after 24 hours. The response data remain linkable—not anonymous—and require restricted handling.

A first verified launch does not require a pre-existing cookie. Once that launch has allocated a session, however, the launch URL alone is not a recovery credential: `/join` rotates the token only when the browser presents the still-valid cookie for that exact D1 session. A missing, wrong, stale, or expired cookie fails closed with `SESSION_RECOVERY_REQUIRED` and never receives a replacement cookie. This prevents a copied Prolific launch URL from taking over an existing session, but it also means cookie loss currently requires an approved study-team support decision; there is no automated or investigator bypass endpoint.

The v1 field API administers the 100 main testlets only. The two local technical practice testlets are not yet represented in the server state machine. An approved practice/participant-information flow and Japanese/Vietnamese instruction review therefore remain launch gates.

## Request flow

```text
Prolific launch URL
  -> GET /join with three official IDs
  -> Prolific GET Study configuration verification
  -> Prolific GET submission verification
  -> Study ID maps to ja or vi in D1
  -> existing session requires its exact still-valid cookie
  -> D1 allocates index 0...299 within that L1
  -> route = R(1 + allocation_index mod 10)
  -> HttpOnly cookie + 303 redirect to /
  -> one authenticated testlet at a time
  -> 100 atomic testlet saves + 9 required breaks
  -> server coverage verification
  -> Prolific completion redirect
```

At 300 starts per L1, the allocation invariant yields exactly 30 starts on each of R01–R10. A duplicate launch with the current valid session cookie resumes the existing D1 session and does not consume another allocation index. A duplicate launch without that cookie is rejected rather than creating a new allocation. The current schema does not reuse dropout indices; any replacement policy beyond 300 starts must be specified before recruitment.

## Local fail-closed checks

Install the exact lockfile and run the code-only checks:

```bash
npm ci
npm run check:worker
```

In the restricted content workspace, `build:private-seed` uses `cloudflare/release-config.example.json` by default and writes the keyless D1 seed to ignored `cloudflare/private/runtime-seed.sql`. Its public example contains four zero-hash sentinels, null completion-code controls, no Study IDs, an inactive release, and every approval gate set to `false`; replace the sentinels and null controls only with reviewed private-artifact, public-build, and Prolific settings. The public code-only repository deliberately lacks the required bank/route inputs, so invoking this command there must fail. The builder requires the release app version to equal `package.json`, verifies the raw SHA-256 and app version of `dist/build-manifest.json`, and refuses to create an active release unless all gates are `true`, a freeze time is recorded, both L1 Study IDs are supplied, and all reviewed hashes and completion controls match exactly.

The committed `wrangler.jsonc` and its named staging/production environments are intentionally unusable for collection:

- `COLLECTION_MODE` is `technical_only`.
- `EXPECTED_RELEASE_ID` is `UNCONFIGURED`.
- `EXPECTED_APP_VERSION`, the public build-manifest hash, the three private artifact hashes, both secret fingerprints, and the completion action are `UNCONFIGURED`.
- the D1 UUID is all zeroes.
- preview URLs are disabled.
- required secrets are declared but absent.

The default and production targets disable `workers.dev`; staging is the only target that may use it. Production additionally requires the separately reviewed private configuration and a controlled custom domain. Staging and production must use different D1 databases.

## Private release preparation

1. Copy `cloudflare/release-config.example.json` to ignored `cloudflare/private/release-config.json`.
2. Keep `appVersion` equal to the exact `package.json` version. Record the reviewed release ID, public build-manifest hash, exact private artifact hashes, SHA-256 fingerprints of the exact UTF-8 HMAC key and completion code, the expected `MANUALLY_REVIEW` or `AUTOMATICALLY_APPROVE` action, approval gates, freeze time, and the two 24-character Study IDs.
3. Set the Japanese Study row to `l1: "ja"` and the Vietnamese Study row to `l1: "vi"`. L1 is never accepted from participant input.
4. Keep both the release and studies inactive for staging. Activate them only after the complete staging rehearsal and independent launch review.
5. Build the seed:

```bash
node cloudflare/tools/build-private-seed.mjs \
  --config cloudflare/private/release-config.json \
  --output cloudflare/private/runtime-seed.sql
```

The seed contains prompts/options but no answer key or scoring field. It must never be committed, uploaded to OSF, placed in `dist/`, or attached to a public issue.

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

Then apply the tracked migration and private seed explicitly to the intended database using its controlled config:

```bash
npx wrangler d1 migrations apply uvlt-fixed-ab-calibration-production --remote \
  --config cloudflare/private/wrangler.production.json
npx wrangler d1 execute uvlt-fixed-ab-calibration-production --remote \
  --config cloudflare/private/wrangler.production.json \
  --file=cloudflare/private/runtime-seed.sql
```

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

The predeploy gate runs the locally installed, exactly pinned Wrangler 4 executable with `secret list --format json` and accepts exactly the three approved remote secret names. Cloudflare does not reveal their values, and the gate neither requests nor prints them. The Worker independently hashes `PARTICIPANT_HMAC_KEY` and `PROLIFIC_COMPLETION_CODE` at runtime; if either fingerprint differs from the release row or expected Worker variable, readiness fails closed and `/api/config` reports `collection_enabled: false`.

`npm run deploy` is the only supported production deployment entry point. Its automatic predeploy gate rebuilds and audits `dist/` first, requires an active approved release, verifies the package/release/D1-seed/public-manifest identity, validates the private custom-domain/D1/variable configuration and exact remote secret-name set, runs Worker tests and type checking, and invokes the same deployment wrapper in dry-run mode. The wrapper executes only the exactly pinned local Wrangler with `shell: false`, preserves the Worker secrets already stored by Cloudflare, and passes the frozen release ID as the Cloudflare Worker version tag:

```bash
npm run deploy
```

Do not bypass this lifecycle with a raw `wrangler deploy` command, and never reuse a release ID/version tag for changed code, assets, bindings, or compatibility settings. A deployment is not launch authorization. Production activation requires a controlled configuration whose `COLLECTION_MODE` is `field` and whose expected release ID, app version, public manifest hash, private hashes, secret fingerprints, and completion action exactly match the active D1 release. At runtime the Worker also requires the actual static manifest bytes/app version and `CF_VERSION_METADATA.tag` to match. Do not make those changes until all launch gates and live checks below pass.

Immediately after deployment, inspect the public, non-secret readiness response from the controlled domain:

```bash
curl --fail --silent --show-error \
  https://<controlled-study-domain>/api/config
```

For an approved active release, verify `ok: true`, the expected protocol/count fields, and `collection_enabled: true`. A false value—including an app version, public manifest, Worker version tag, or participant-HMAC fingerprint mismatch—is a hard stop: do not open either Prolific study until the package, release identity, D1 state, deployed version/assets, Worker variables, and remotely stored secret have been reconciled.

## Prolific configuration

Create separate Japanese-L1 and Vietnamese-L1 studies. Configure both external Study URLs in the official form:

```text
https://<controlled-study-domain>/join?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

Use the same completion code stored as the Worker secret, or revise the Worker to use an audited per-study mapping before creating different codes. Before allocation or resume, the Worker retrieves `GET /api/v1/studies/{STUDY_ID}/` and requires the exact Study ID, URL-parameter mode, publish-ready flag, one `COMPLETED` code equal to the Worker secret, and exactly the configured manual-review or automatic-approval action. It then verifies `SESSION_ID` through `GET /api/v1/submissions/{SESSION_ID}/` and requires the returned participant and Study ID to match the launch values. Only an `ACTIVE` submission may create a new local session; `AWAITING_REVIEW` or `APPROVED` can resume an existing one but cannot create a replacement. An unavailable or inconsistent Prolific response fails closed.

Prolific Secure external URL verification is not implemented in this release and remains a future launch gate. If the workspace supports it, add and test signed-JWT verification as an additional control before enabling that setting; do not use the two-minute JWT as the long-lived study session. The server-side submission lookup plus the exact current session cookie remain the current authorization path. The participant information and support protocol must explain what happens if that cookie is cleared, blocked, or expires, and the study team must approve whether such a participant can restart or requires manual follow-up.

Official references:

- [Prolific identifiers and secure external URLs](https://researcher-help.prolific.com/en/articles/445133-what-are-prolific-ids-and-how-do-i-use-them)
- [Prolific submission lookup](https://docs.prolific.com/api-reference/submissions/get-submission)
- [Prolific Study lookup](https://docs.prolific.com/api-reference/studies/get-study)
- [Prolific completion codes](https://docs.prolific.com/api-reference/studies/the-study-object)
- [Cloudflare Workers static asset binding](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Worker version metadata](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
- [Cloudflare Worker versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
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
- D1 location, retention, deletion, incident-response, and backup/restore decisions;
- a production custom domain and separate staging/production D1 bindings;
- rate-limit/WAF rules for `/join` and write endpoints, tested without blocking legitimate shared-network participants;
- private export and offline HMAC-linkage rehearsal;
- local Worker/D1 tests, concurrency stress test, and duplicate/reload test;
- staging preview using Prolific test participants;
- an approved lost/blocked/expired-cookie support and restart policy, tested against `SESSION_RECOVERY_REQUIRED`;
- an explicit decision on Prolific Secure external URL availability; JWT verification remains unimplemented and must be added before treating that feature as a launch gate;
- a two-phase Cloudflare version workflow that captures the immutable uploaded Worker version ID, stores it in the frozen D1 release, deploys that exact ID, and verifies `CF_VERSION_METADATA.id`; the current one-time tag check alone is not sufficient for live collection;
- 299-response and missing-break completion rejection checks;
- confirmation that no raw identifier appears in the browser, localStorage, sessionStorage, participant API, application logs, or default analysis export;
- confirmation that zone HTTP logs, Logpush/Log Explorer, WAF/security events, and their retention settings do not store the study host's full launch URI or query; use path-only fields and exclude or redact `ClientRequestURI`-style query-bearing fields;
- independent review of the final release hashes and live configuration.

## Export, linkage, and reproducibility

Do not expose a public export endpoint. Export D1 from a restricted researcher machine and write only to an approved encrypted location:

```bash
npx wrangler d1 export uvlt-fixed-ab-calibration-production --remote \
  --config cloudflare/private/wrangler.production.json \
  --output=cloudflare/exports/uvlt-fixed-ab-restricted.sql
```

Cloudflare notes that a D1 export blocks other database requests, so schedule it outside active collection. Preserve the migration files, release configuration without secrets, package lock, Worker version ID and one-time release tag, public/private artifact SHA-256 values, export SHA-256, and export timestamp. Apply the same domain-separated HMAC procedure to the restricted Prolific CSV to join records offline; do not export or publish the HMAC key.

The public/OSF package may contain code, schemas, synthetic tests, aggregate outputs, and software provenance. It must exclude the private seed, raw D1 export, row-level response data, HMAC linkage values, Prolific identifiers, secrets, stimuli without permission, and canonical keys.
