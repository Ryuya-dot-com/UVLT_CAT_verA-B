import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BREAK_POLICY_DEFINITION,
  INTERFACE_PRACTICE_DEFINITION,
  breakTiming,
  createUnsubmittedResponseGuard,
  formatBreakCountdown,
  mainSubmissionConfirmed,
  renderBreakPanel,
  renderInterfacePracticePanel,
  renderReadinessPanel,
  renderSafePausePanel,
  renderTestletPanel,
  validatePracticeSelections
} from "../cloudflare/public-src/field-task.js";

const fieldAppSource = readFileSync(
  fileURLToPath(new URL("../cloudflare/public-src/field-app.js", import.meta.url)),
  "utf8"
);

function breakStep(overrides = {}) {
  return {
    kind: "break",
    after_module_position: 4,
    before_module_position: 5,
    minimum_break_seconds: 45,
    remaining_break_seconds: 45,
    continue_available_at: "2026-07-21T04:05:06.000Z",
    break_policy_definition: BREAK_POLICY_DEFINITION,
    ...overrides
  };
}

test("readiness leads to one synthetic three-row, six-symbol practice", () => {
  const readiness = renderReadinessPanel();
  const practice = renderInterfacePracticePanel();

  assert.match(readiness, /id="begin-interface-practice"/);
  assert.match(readiness, /choices are not study responses and are not saved/i);
  assert.equal((practice.match(/type="radio"/g) || []).length, 18);
  assert.equal((practice.match(/Practice row [123]/g) || []).length, 3);
  for (const symbol of ["●", "▲", "■", "◆", "★", "✚"]) {
    assert.match(practice, new RegExp(symbol));
  }
  assert.match(practice, /Any three different symbols are accepted\./);
  assert.match(practice, /symbol choices are not sent or stored/i);
  assert.match(practice, /completion marker and its server time/i);
  assert.doesNotMatch(
    practice,
    /uvlt_[ab]_|answer key|correct option|sourceItemId|theta|scoring|difficulty|discrimination|guessing/i
  );

  assert.equal(validatePracticeSelections(["●", "▲", "■"]).valid, true);
  assert.equal(validatePracticeSelections(["◆", "★", "✚"]).valid, true);
  assert.equal(validatePracticeSelections(["●", "●", "■"]).valid, false);
  assert.equal(validatePracticeSelections(["●", null, "■"]).valid, false);
});

test("main-task progress is neutral and contains no performance feedback", () => {
  const markup = renderTestletPanel({
    module_position: 3,
    module_count: 10,
    testlet_position_within_module: 7,
    testlets_per_module: 10,
    testlet: {
      options: ["choice-a", "choice-b", "choice-c", "choice-d", "choice-e", "choice-f"],
      items: [
        { prompt: "Synthetic row A" },
        { prompt: "Synthetic row B" },
        { prompt: "Synthetic row C" }
      ]
    }
  });

  assert.match(markup, /Module 3 of 10/);
  assert.match(markup, /Set 7 \/ 10/);
  assert.match(markup, /aria-label="Module 3 of 10, set 7 of 10"/);
  assert.doesNotMatch(markup, /percent|remaining time|correct|incorrect|score|ability|difficulty|comparison/i);
});

test("break timing accepts only the server contract and renders an advisory countdown", () => {
  const standard = breakTiming(breakStep());
  const midpoint = breakTiming(breakStep({
    after_module_position: 5,
    before_module_position: 6,
    minimum_break_seconds: 90,
    remaining_break_seconds: 90
  }));

  assert.deepEqual(standard, {
    afterModule: 4,
    beforeModule: 5,
    minimumSeconds: 45,
    remainingSeconds: 45,
    availableAt: "2026-07-21T04:05:06.000Z"
  });
  assert.equal(midpoint.minimumSeconds, 90);
  assert.equal(breakTiming(breakStep({ minimum_break_seconds: 90 })), null);
  assert.equal(breakTiming(breakStep({ before_module_position: 7 })), null);
  assert.equal(breakTiming(breakStep({ continue_available_at: "2026-07-21 04:05:06" })), null);
  assert.equal(breakTiming(breakStep({ break_policy_definition: "another-policy" })), null);

  assert.equal(formatBreakCountdown(90), "Minimum break remaining: 1:30");
  assert.equal(formatBreakCountdown(45), "Minimum break remaining: 0:45");
  assert.equal(formatBreakCountdown(0), "Minimum break complete. Continue when ready.");

  const waitingMarkup = renderBreakPanel(breakStep());
  assert.match(waitingMarkup, /id="break-countdown" role="timer"/);
  assert.match(waitingMarkup, /id="pause-at-break"/);
  assert.match(waitingMarkup, /id="continue-after-break" type="button" disabled/);

  const readyMarkup = renderBreakPanel(breakStep({ remaining_break_seconds: 0 }));
  assert.match(readyMarkup, /id="continue-after-break" type="button">/);
});

test("safe pause reports confirmed progress and has a status target", () => {
  const markup = renderSafePausePanel({ completed_testlets: 40, total_testlets: 100 });
  assert.match(markup, /confirmed 40 of 100 sets/);
  assert.match(markup, /did not submit a break or another study response/);
  assert.match(markup, /Prolific study timer continues/);
  assert.match(markup, /id="pause-message"/);
  assert.match(markup, /id="resume-from-safe-pause"/);
});

test("beforeunload guard exists only while an unsubmitted main response exists", () => {
  class FakeEventTarget {
    constructor() {
      this.listeners = new Map();
      this.addCount = 0;
      this.removeCount = 0;
    }

    addEventListener(type, listener) {
      this.addCount += 1;
      this.listeners.set(type, listener);
    }

    removeEventListener(type, listener) {
      this.removeCount += 1;
      if (this.listeners.get(type) === listener) this.listeners.delete(type);
    }
  }

  const target = new FakeEventTarget();
  const guard = createUnsubmittedResponseGuard(target);
  assert.equal(guard.isActive(), false);
  assert.equal(target.listeners.has("beforeunload"), false);

  guard.setActive(true);
  guard.setActive(true);
  assert.equal(guard.isActive(), true);
  assert.equal(target.addCount, 1);

  const event = {
    prevented: false,
    returnValue: false,
    preventDefault() {
      this.prevented = true;
    }
  };
  target.listeners.get("beforeunload")(event);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, true);

  guard.setActive(false);
  assert.equal(target.listeners.has("beforeunload"), false);
  assert.equal(target.removeCount, 1);
  guard.dispose();
  assert.equal(target.removeCount, 1);
});

test("a conflict confirms a main response only after server progress advances", () => {
  assert.equal(mainSubmissionConfirmed({ completed_testlets: 8 }, 7), true);
  assert.equal(mainSubmissionConfirmed({ completed_testlets: 7 }, 7), false);
  assert.equal(mainSubmissionConfirmed({ completed_testlets: 6 }, 7), false);
  assert.equal(mainSubmissionConfirmed({ completed_testlets: "8" }, 7), false);
});

test("field app sends only the practice policy identifier and uses no client persistence", () => {
  assert.equal(
    INTERFACE_PRACTICE_DEFINITION,
    "one-synthetic-interface-only-three-row-six-symbol-practice-v1"
  );
  assert.doesNotMatch(fieldAppSource, /\blocalStorage\b|\bsessionStorage\b|\bsendBeacon\b/);
  assert.match(fieldAppSource, /Date\.parse\(timing\.availableAt\)/);
  assert.match(fieldAppSource, /deadline - Date\.now\(\)/);

  const practiceStart = fieldAppSource.indexOf("function renderInterfacePractice()");
  const practiceEnd = fieldAppSource.indexOf("function renderTestlet(", practiceStart);
  const practiceSource = fieldAppSource.slice(practiceStart, practiceEnd);
  assert.match(
    practiceSource,
    /api\("\/api\/session\/practice-complete",\s*\{\s*method: "POST",\s*body: \{ practice_definition: INTERFACE_PRACTICE_DEFINITION \}\s*\}\)/
  );
  assert.equal((practiceSource.match(/body:/g) || []).length, 1);

  const pauseStart = fieldAppSource.indexOf("function renderSafePause()");
  const pauseEnd = fieldAppSource.indexOf("function renderBreak(", pauseStart);
  const pauseSource = fieldAppSource.slice(pauseStart, pauseEnd);
  assert.doesNotMatch(pauseSource, /method:\s*"POST"/);
  assert.match(pauseSource, /await refreshState\(\)/);

  const conflictStart = fieldAppSource.indexOf("async function reconcileTestletConflict(");
  const conflictEnd = fieldAppSource.indexOf("function renderReadiness(", conflictStart);
  const conflictSource = fieldAppSource.slice(conflictStart, conflictEnd);
  assert.match(conflictSource, /mainSubmissionConfirmed\(state, step\.testlet_ordinal\)/);
  assert.match(conflictSource, /unsubmittedResponseGuard\.setActive\(true\)/);
  assert.match(
    fieldAppSource,
    /event\.persisted[\s\S]*unsubmittedResponseGuard\.isActive\(\)[\s\S]*setTestletControlsDisabled\(pendingSubmission !== null\)[\s\S]*button\.disabled = false/
  );
  assert.match(
    conflictSource,
    /setTestletControlsDisabled\(pendingSubmission !== null\)[\s\S]*retryButton\.disabled = false/
  );
});
