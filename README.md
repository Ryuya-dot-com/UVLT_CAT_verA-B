# UVLT Form A+B Cloudflare–Prolific Runtime

This repository contains the code-only, collection-disabled runtime for a proposed fixed-form joint calibration of UVLT Forms A and B. It uses Cloudflare Workers, D1, and Prolific Study/launch/submission verification.

## Status

This is an engineering preview, not an authorized participant study. The checked-in configuration fails closed: it has placeholder D1 bindings, `COLLECTION_MODE=technical_only`, unconfigured release/app/build identities, no secrets, and no active Study IDs.

The repository intentionally excludes:

- UVLT stimuli and source workbooks;
- answer keys, scoring registries, and IRT parameters;
- private D1 seeds or exports;
- participant-level data and Prolific identifiers;
- HMAC keys, API tokens, and completion codes.

No permission to reproduce or redistribute UVLT content is conveyed by this code repository.

## Runtime boundary

Prolific opens `/join` with its three standard identifiers. Before allocation, the Worker verifies the live Study configuration, completion code/action, and submission through Prolific; maps the Study ID to the Japanese- or Vietnamese-L1 stratum; stores only domain-separated HMAC linkage values; issues an expiring HttpOnly cookie; and redirects to a clean URL. After first allocation, a relaunch can rotate the token only when the browser presents the exact still-valid session cookie; a copied launch URL alone cannot take over the session. D1 serves only the next keyless three-item testlet, and the completion URL remains withheld until the server verifies 100 testlets, 300 responses, and nine breaks.

The engineering gate pins the release ID, exact `package.json` app version, deterministic public build-manifest hash, manifest/bank/route SHA-256 values, both participant-linkage and completion-code fingerprints, expected completion action, and the Cloudflare Worker version tag. Browser assets are built from an explicit allowlist and audited against path, size, app-version, and SHA-256 constraints. The tag is not an immutable deployment identity: live collection remains blocked until a two-phase workflow captures the uploaded Worker version ID, stores it in the frozen D1 release, deploys that exact version, and verifies `CF_VERSION_METADATA.id`.

## Verify the code-only package

Use Node 24.9 and the exact npm lockfile:

```bash
npm ci
npm run check:worker
```

The Worker integration suite applies the real D1 migration to an isolated database and uses only synthetic testlets. It checks fail-closed configuration, immutable active release content, live Prolific Study/submission verification, copied-launch rejection, raw-ID non-exposure, cookie-bound session resume, idempotent writes, conflicts, token expiry, all 100 testlets and nine breaks, completion-code withholding/release, and mismatched app/build/secret/action/version identities.

## Private deployment inputs

Licensed content and approved operational metadata must be supplied from a restricted workspace. `cloudflare/tools/build-private-seed.mjs` validates those inputs and writes only to ignored `cloudflare/private/`. The resulting seed contains prompts/options and routes, but no answer key or scoring fields.

Production deployment is supported only through `npm run deploy`. Its predeploy lifecycle requires an approved active private release, a private custom-domain Wrangler configuration, a separate production D1 database, exactly three remotely stored Worker secrets, public-asset auditing, Worker tests, type checking, and a dry-run bundle. The pinned deployment wrapper passes the frozen release ID as the Cloudflare Worker version tag. Plaintext production secret files and direct `wrangler deploy` are outside the supported release process.

See [cloudflare/README.md](cloudflare/README.md) for the full operational and privacy checklist. Participant launch remains blocked until content permission, ethics approval, consent/withdrawal and lost-cookie support flows, approved Japanese/Vietnamese instructions and practice, timing/fatigue piloting, compensation, dropout replacement, edge-log query minimization, retention/deletion, immutable Worker-version-ID binding, and independent prelaunch review are complete.

Official references:

- [Prolific identifiers](https://researcher-help.prolific.com/en/articles/445133-what-are-prolific-ids-and-how-do-i-use-them)
- [Prolific submission lookup](https://docs.prolific.com/api-reference/submissions/get-submission)
- [Prolific Study lookup](https://docs.prolific.com/api-reference/studies/get-study)
- [Cloudflare static assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Worker version metadata](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
- [Cloudflare Worker versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
