# Schema-v7 Full-Length Soft-Launch and Administration Protocol

## Status and authority

This document specifies the schema-v7 participant-administration policy for the UVLT Fixed A+B calibration study. The committed source targets this policy, but source implementation and local synthetic tests are not evidence of deployment, ethics approval, participant authorization, or activation. The checked-in configuration remains collection-disabled.

No participant may be recruited under this protocol until the schema-v7 code and migration, synthetic tests, approved participant information and consent, withdrawal/redaction procedure, bilingual materials, compensation, protected workspace, Prolific configuration, private release artifacts, exact Worker-version handoff, controlled-domain rehearsal, and independent activation review are complete.

The raw 300-item bank, canonical keys, raw participant responses, linkage values, participant-level schedules, and row-level process records are restricted data. This protocol does not authorize their publication or placement in OSF.

## Purpose

The soft launch tests the complete burden and operational path that confirmatory participants would experience:

1. verified Prolific entry and approved consent;
2. synthetic interaction practice;
3. all 100 intact three-item testlets, or 300 main responses;
4. nine server-observed module breaks;
5. safe pause and resume at module boundaries;
6. server verification and return to Prolific.

It is an operational and feasibility study, not an opportunity to tune items after viewing correctness, scores, ability estimates, or item parameters.

## Fixed administration sequence

### Consent and entry

The approved participant-information and consent version must be presented before practice or main-task responses can be accepted. Only the minimum consent state needed by the approved protocol may be persisted. The current schema-v7 runtime does not yet implement consent or withdrawal and these remain hard launch blockers.

The verified Prolific submission, L1 stratum, allocation index, route, and option layout remain server-authoritative. Refresh, safe pause, or resume must not create a second start, replace an allocation index, or change route or option layout.

### Synthetic practice

One synthetic three-row/six-option matching set precedes the protected main bank. Its only purpose is to teach the interaction.

- Practice prompts and options are artificial and are not UVLT content.
- Practice has no canonical answer key, correctness, score, or performance feedback.
- The browser may require three structurally valid, nonduplicated selections before continuing.
- The server retains only one versioned `practice_completed` state or event.
- Practice option strings, displayed positions, answer status, response time, and click history are not retained.
- If practice completion has not been confirmed, resume returns to practice. Once confirmed, reload does not repeat it.

Synthetic practice completion is required before the first protected main testlet, but it is not part of the 300 main responses and is not an analytic outcome.

### Main testlets and neutral progress

The main task retains the existing atomic unit: one complete three-response testlet. A testlet advances only after the server confirms all three selections. An unfinished or unsubmitted testlet is not server data and must not be copied into `localStorage`, `sessionStorage`, a URL, a log, or a background beacon.

Progress language is neutral and factual. The interface may display module number, set number, and server-confirmed saved-set count. It must not display or imply accuracy, score, ability, speed rank, item difficulty, improvement, evaluative praise, or comparison with other participants. Neutral progress prevents route- or L1-dependent motivational feedback from becoming an uncontrolled intervention.

## Break schedule and measurement

There is no break after Module 10. The nine required intervals are fixed as follows:

| Completed module | Minimum server-observed interval |
|---:|---:|
| 1 | 45,000 ms |
| 2 | 45,000 ms |
| 3 | 45,000 ms |
| 4 | 45,000 ms |
| 5 | 90,000 ms |
| 6 | 45,000 ms |
| 7 | 45,000 ms |
| 8 | 45,000 ms |
| 9 | 45,000 ms |

For break `m`, the authoritative start is the immutable server timestamp for successful submission of testlet ordinal `m * 10 - 1`. The authoritative end is the immutable server timestamp at which break completion is accepted. The Worker and D1 boundary must reject completion before the applicable threshold and must not open the next testlet while that break remains incomplete. Client time, a checkbox, a countdown reaching zero, or a claimed duration cannot satisfy the requirement.

The browser displays a clear countdown and keeps the continue control disabled locally, but this is usability support rather than the security boundary. If an early request reaches the server because of timer throttling, clock behavior, replay, or manual API use, the server returns the participant to the same break without advancing the counter. Reload and resume use the original start timestamp and never restart the interval.

The derived variable is named `server_observed_break_interval_ms`:

```text
break-completion server epoch milliseconds
  minus module-boundary submission server epoch milliseconds
```

Both source timestamps must be retained in the restricted export, and the integer derivation must be implemented in pinned, reviewable analysis code. The derived value is a reproducible server-observed interval. It is not a measure of gaze, sustained attention, continuous page visibility, actual rest, or physiological recovery. It may include request latency and time with the tab backgrounded, the device asleep, or the page closed. Reports must preserve this limitation and must not relabel the quantity as “rest duration” without qualification.

## Break-boundary safe pause

The affirmative safe-pause control appears only on a module-break screen, after the tenth testlet in that module has been confirmed. This gives participants a low-risk place to stop without introducing a new analytic state.

- Choosing safe pause records no answer, pause event, pause reason, focus event, or new timestamp.
- It does not change session status, allocation index, route, option layout, response counters, or the break start.
- The pause screen states the last confirmed saved-set count and distinguishes saved data from any unconfirmed selection.
- Continue refreshes the authoritative server state; it does not reconstruct progress from browser storage.
- Resume requires the same valid authenticated session and remains subject to the approved Prolific and cookie time limits.
- Participant instructions must not promise multi-day recovery or a replacement session.
- Closing during a main testlet may discard that unsubmitted testlet; the browser should warn, but must not persist those selections.

Time away during a break-boundary pause contributes to the server-observed interval. This is expected and is handled in prespecified sensitivity analyses rather than by resetting the break or rerandomizing the participant.

## Minimal process-data policy

Schema v7 collects only process fields necessary for administration, integrity, and the preregistered analyses.

### Restricted fields that may be retained

- domain-separated HMAC linkage values and immutable allocation fields;
- committed main-task option strings and displayed option positions;
- testlet-level client start/submission time, elapsed milliseconds, and server receipt time, if approved in consent;
- minimum session-start, testlet-submission, break-completion, and protocol-completion events;
- the server timestamps needed to reproduce break intervals;
- completion status; any prespecified quality or integrity flags are derived offline rather than written by the runtime.

### Fields not collected

- practice selections, practice correctness, or practice response times;
- per-click or per-keystroke histories;
- mouse movement, scrolling, focus/blur, visibility, or countdown-tick telemetry;
- free-text pause reasons;
- device fingerprints or browser-storage copies of answers;
- scores, correctness, theta, item parameters, or answer keys in the field runtime;
- plaintext Prolific identifiers in D1, application logs, URLs after the clean redirect, or analysis extracts.

The minimum process dataset remains linkable and is not anonymous. Access, retention, incident response, backup, export, withdrawal, and deletion follow the approved institutional plan. A response-bearing withdrawal must remove participant-linked records through the reviewed redaction path while preserving only the approved minimal start/completion ledgers. Public materials contain synthetic fixtures and aggregate summaries only.

## Full-length soft launch

### Release separation and size

The default schema-v7 soft launch uses a dedicated release ID, D1 database or logically isolated release, Worker-version attestation, and two controlled Prolific studies. Its responses are excluded from confirmatory calibration by default. Confirmatory participants must not have participated in the soft launch.

The default maximum is one complete ten-start allocation block per L1, or 20 starts total. This exposes all ten routes once within each L1 while keeping the operational cohort small. A different maximum or L1 composition requires a revised, approved protocol before the first soft-launch start; the cohort must not be extended after observing response or completion outcomes. Every soft-launch participant receives the full 300-item administration.

If investigators propose pooling any soft-launch data with the confirmatory cohort, eligibility, maximum sample, no-change rule, analysis role, and inclusion sensitivity must instead be preregistered before the first soft-launch start. Pooling cannot be decided after inspecting answers or model results.

### Operational monitoring boundary

The soft-launch dashboard is limited to:

- verified join, duplicate-launch, and session-resume success;
- unique starts and completion status by L1;
- number of confirmed testlets and module reached;
- missing or duplicate event counts;
- practice, break-transition, and completion-link success;
- aggregate total-administration and server-observed break intervals;
- HTTP/server error counts and approved support contacts;
- confirmation that raw identifiers and answers are absent from URLs, browser storage, public APIs, and logs.

Investigators must not use answer keys, correctness, total scores, item statistics, IRT estimates, DIF results, or participant ability to make the operational go/no-go decision. Access to raw soft-launch data remains restricted even when the dashboard shows only approved aggregates.

### Go/no-go decision

Before activation, freeze numerical or categorical thresholds for completion-link success, missing/duplicate records, early-break rejection, timing plausibility, support burden, and identifier leakage. The decision has three possible outcomes:

1. **Proceed:** every hard integrity/privacy criterion passes and only previously approved, non-substantive operational actions remain.
2. **Revise and repeat:** instructions, UI, timing, storage, or runtime behavior changes; issue a new app/Worker/release identity and repeat the required rehearsal or soft launch.
3. **Stop:** ethics, privacy, content security, compensation, burden, or technical integrity cannot be resolved within the approved protocol.

No active release is edited in place. A substantive change after participant exposure requires a new immutable release and a documented disposition of the earlier data.

## Preregistered primary and sensitivity analyses

The preregistration must identify the primary analysis population and model before confirmatory recruitment. At minimum, it must distinguish protocol completers from all eligible participants with one or more committed main testlets and must state how retained partial responses enter each analysis.

Prespecified sensitivity analyses should include:

- protocol-complete records only versus all eligible committed main-task responses;
- confirmatory data alone versus the separately identified soft-launch cohort, only if pooling was authorized in advance;
- inclusion versus exclusion or categorical adjustment for server-observed break intervals above a fixed long-interruption threshold;
- alternative prespecified handling of implausible testlet-level elapsed times and documented operational-error sessions;
- models with and without module position, cumulative testlet position, and testlet-level time covariates;
- missingness and completion patterns by L1, route, option layout, module position, and their prespecified interactions;
- start-level balance versus completer-level balance, without adaptive reassignment or silent replacement;
- complete-case conclusions compared with the preregistered method for retained partial responses;
- analyses that treat break intervals only as server-observed process measures, not as verified rest or attention.

Flags do not automatically justify exclusion. No cutoff may be chosen after examining score, item difficulty, DIF, ability, or substantive model results. Report the number of participants and committed responses affected by every sensitivity rule.

## Evidence required before any live activation

The following remain hard blockers:

- content-owner permission and authoritative-key approval;
- ethics approval and approved consent, withdrawal, redaction, and compensation procedures;
- reviewed Japanese and Vietnamese participant-facing language;
- schema-v7 Worker, D1, browser, release-identity, and export implementation;
- synthetic tests of practice gating, 44,999/45,000 ms and 89,999/90,000 ms boundaries, duplicate/reload behavior, safe pause, and completion withholding;
- timing/fatigue pilot and approved Prolific maximum-time setting;
- approved private workspace, raw-data retention, backup, access, and incident-response controls;
- staging and Prolific test-participant rehearsal;
- successful full-length soft launch and documented go/no-go decision;
- frozen preregistration, including sensitivity analyses and soft-launch disposition;
- new immutable version upload, inactive D1 load, controlled-domain readback, and independent one-time activation review.

Until every item is evidenced, `collection_enabled` must remain false and no Prolific participant study may be opened.
