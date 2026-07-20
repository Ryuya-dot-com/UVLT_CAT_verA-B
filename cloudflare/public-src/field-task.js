export const INTERFACE_PRACTICE_DEFINITION =
  "one-synthetic-interface-only-three-row-six-symbol-practice-v1";
export const BREAK_POLICY_DEFINITION =
  "server-minimum-45s-standard-90s-after-module-5-v1";

const PRACTICE_SYMBOLS = Object.freeze(["●", "▲", "■", "◆", "★", "✚"]);
const PRACTICE_ROWS = Object.freeze([
  Object.freeze({ prompt: "Practice row 1" }),
  Object.freeze({ prompt: "Practice row 2" }),
  Object.freeze({ prompt: "Practice row 3" })
]);
const PRACTICE_TESTLET = Object.freeze({
  options: PRACTICE_SYMBOLS,
  items: PRACTICE_ROWS
});

const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function selectedOptionStrings(root, testlet) {
  return testlet.items.map((_item, itemIndex) => {
    const selected = root.querySelector(`input[data-item-index="${itemIndex}"]:checked`);
    return selected ? selected.value : null;
  });
}

export function selectedPracticeSymbols(root) {
  return selectedOptionStrings(root, PRACTICE_TESTLET);
}

export function validateSelections(testlet, selections) {
  if (!Array.isArray(selections) || selections.length !== 3) {
    return { valid: false, message: "Exactly three responses are required." };
  }
  if (selections.some(value => value == null || !testlet.options.includes(value))) {
    return { valid: false, message: "Select one word for each meaning." };
  }
  if (new Set(selections).size !== selections.length) {
    return { valid: false, message: "Use each word only once within this set." };
  }
  return { valid: true, message: null };
}

export function validatePracticeSelections(selections) {
  if (!Array.isArray(selections) || selections.length !== 3 ||
      selections.some(value => value == null || !PRACTICE_SYMBOLS.includes(value))) {
    return { valid: false, message: "Choose one symbol in each practice row." };
  }
  if (new Set(selections).size !== selections.length) {
    return { valid: false, message: "Choose a different symbol in each practice row." };
  }
  return { valid: true, message: null };
}

export function mainSubmissionConfirmed(state, submittedOrdinal) {
  return Number.isInteger(submittedOrdinal) && submittedOrdinal >= 0 &&
    Number.isInteger(state?.completed_testlets) && state.completed_testlets > submittedOrdinal;
}

function matrixMarkup(testlet, {
  idPrefix,
  rowHeader,
  help,
  ariaLabel,
  caption
}) {
  const header = testlet.options.map((option, index) => `
    <th scope="col" id="${idPrefix}-option-${index + 1}"><span class="option-number">${index + 1}</span>${escapeHtml(option)}</th>
  `).join("");
  const rows = testlet.items.map((item, itemIndex) => {
    const promptId = `${idPrefix}-row-${itemIndex + 1}`;
    const cells = testlet.options.map((option, optionIndex) => `<td><label class="matrix-choice">
      <input type="radio" name="${idPrefix}-row-${itemIndex + 1}"
        data-item-index="${itemIndex}" value="${escapeHtml(option)}"
        aria-labelledby="${promptId} ${idPrefix}-option-${optionIndex + 1}">
      <span>${escapeHtml(option)}</span>
    </label></td>`).join("");
    return `<tr><th scope="row" id="${promptId}"><span class="prompt-number">${itemIndex + 1}</span>${escapeHtml(item.prompt)}</th>${cells}</tr>`;
  }).join("");
  return `<p class="sr-only" id="${idPrefix}-help">${escapeHtml(help)}</p>
  <div class="matrix-scroll" tabindex="0" aria-label="${escapeHtml(ariaLabel)}" aria-describedby="${idPrefix}-help">
    <table class="matching-matrix">
      <caption class="sr-only">${escapeHtml(caption)}</caption>
      <thead><tr><th scope="col">${escapeHtml(rowHeader)}</th>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function renderReadinessPanel() {
  return `<section class="task-panel readiness-card">
    <p class="eyebrow">Before the vocabulary study</p>
    <h1>Get ready to begin</h1>
    <ul class="readiness-list">
      <li>Use a quiet place and a stable internet connection.</li>
      <li>The study has 10 modules and 9 required breaks.</li>
      <li>Only a complete three-row set is saved to the study server.</li>
    </ul>
    <div class="notice" role="note">The next screen is a one-time interface practice. Its choices are not study responses and are not saved.</div>
    <div class="button-row">
      <button class="primary-button" id="begin-interface-practice" type="button">Continue to interface practice</button>
    </div>
  </section>`;
}

export function renderInterfacePracticePanel() {
  return `<section class="task-panel practice-card">
    <div class="task-heading">
      <div>
        <p class="eyebrow">Interface practice</p>
        <h1>Try the response controls</h1>
      </div>
      <div class="progress-chip" aria-label="One interface practice screen">Practice only</div>
    </div>
    <p class="task-instruction">Choose one symbol in each row. Use three different symbols. Any three different symbols are accepted.</p>
    <div class="notice" role="note">These choices are not study responses and are not saved.</div>
    ${matrixMarkup(PRACTICE_TESTLET, {
      idPrefix: "practice",
      rowHeader: "Practice row",
      help: "Choose one of the six symbols in each practice row. Use each symbol at most once.",
      ariaLabel: "Interface practice table",
      caption: "Three practice rows and six symbol choices"
    })}
    <p class="form-message" id="practice-message" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p>
    <div class="task-actions">
      <span class="save-indicator">Your symbol choices are not sent or stored. Only a completion marker and its server time are recorded.</span>
      <button class="primary-button" id="complete-interface-practice" type="button">Finish interface practice</button>
    </div>
  </section>`;
}

export function renderTestletPanel(step) {
  return `<section class="task-panel">
    <div class="task-heading">
      <div>
        <p class="eyebrow">Module ${escapeHtml(step.module_position)} of ${escapeHtml(step.module_count)}</p>
        <h1>Match each meaning to one word</h1>
      </div>
      <div class="progress-chip" aria-label="Module ${escapeHtml(step.module_position)} of ${escapeHtml(step.module_count)}, set ${escapeHtml(step.testlet_position_within_module)} of ${escapeHtml(step.testlets_per_module)}">Set ${escapeHtml(step.testlet_position_within_module)} / ${escapeHtml(step.testlets_per_module)}</div>
    </div>
    <p class="task-instruction">Choose one word for each of the three meanings. Three words will not be used.</p>
    ${matrixMarkup(step.testlet, {
      idPrefix: "main",
      rowHeader: "Meaning",
      help: "For each meaning, choose one of the six words. Each word may be used at most once in this set.",
      ariaLabel: "Vocabulary matching table",
      caption: "Three meanings and six word choices"
    })}
    <p class="form-message" id="response-message" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p>
    <div class="task-actions">
      <span class="save-indicator">Your response must reach the study server before the next set opens.</span>
      <button class="primary-button" id="submit-testlet" type="button">Save and continue</button>
    </div>
  </section>`;
}

export function breakTiming(step) {
  if (!step || typeof step !== "object") return null;
  const afterModule = step.after_module_position;
  const beforeModule = step.before_module_position;
  const minimumSeconds = step.minimum_break_seconds;
  const remainingSeconds = step.remaining_break_seconds;
  const availableAt = step.continue_available_at;
  const expectedMinimum = afterModule === 5 ? 90 : 45;
  if (!Number.isInteger(afterModule) || afterModule < 1 || afterModule > 9 ||
      beforeModule !== afterModule + 1 || minimumSeconds !== expectedMinimum ||
      !Number.isInteger(remainingSeconds) || remainingSeconds < 0 || remainingSeconds > minimumSeconds ||
      typeof availableAt !== "string" || !ISO_UTC_PATTERN.test(availableAt) ||
      !Number.isFinite(Date.parse(availableAt)) ||
      step.break_policy_definition !== BREAK_POLICY_DEFINITION) {
    return null;
  }
  return Object.freeze({
    afterModule,
    beforeModule,
    minimumSeconds,
    remainingSeconds,
    availableAt
  });
}

export function formatBreakCountdown(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) throw new TypeError("Invalid break countdown");
  if (seconds === 0) return "Minimum break complete. Continue when ready.";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const clock = minutes > 0
    ? `${minutes}:${String(remainder).padStart(2, "0")}`
    : `0:${String(remainder).padStart(2, "0")}`;
  return `Minimum break remaining: ${clock}`;
}

export function renderBreakPanel(step) {
  const timing = breakTiming(step);
  if (timing === null) throw new TypeError("Invalid server break state");
  const disabled = timing.remainingSeconds > 0 ? " disabled" : "";
  return `<section class="task-panel break-card">
    <div class="break-mark">Ⅱ</div>
    <p class="eyebrow">Required module boundary</p>
    <h1>Module ${timing.afterModule} is complete</h1>
    <p class="lead">Please look away from the screen, change posture, or take water before starting Module ${timing.beforeModule}.</p>
    <p class="break-policy-note">The study server set a minimum ${timing.minimumSeconds}-second break and will verify it again when you continue.</p>
    <p class="break-countdown" id="break-countdown" role="timer" aria-atomic="true">${escapeHtml(formatBreakCountdown(timing.remainingSeconds))}</p>
    <p class="sr-only" id="break-ready-announcement" aria-live="polite" aria-atomic="true"></p>
    <label class="check-field break-confirmation">
      <input id="break-confirmation" type="checkbox">
      <span>I took a break and am ready to continue.</span>
    </label>
    <p class="form-message" id="break-message" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p>
    <div class="button-row">
      <button class="secondary-button" id="pause-at-break" type="button">Stop here and resume later</button>
      <button class="primary-button" id="continue-after-break" type="button"${disabled}>Start Module ${timing.beforeModule}</button>
    </div>
  </section>`;
}

export function renderSafePausePanel(state) {
  const completed = Number(state?.completed_testlets);
  const total = Number(state?.total_testlets);
  if (!Number.isInteger(completed) || !Number.isInteger(total) || completed < 0 || total < 1 || completed > total) {
    throw new TypeError("Invalid saved progress state");
  }
  return `<section class="task-panel interruption-card">
    <p class="eyebrow">Safe stopping point</p>
    <h1>You can stop here</h1>
    <p class="lead">The study server has confirmed ${completed} of ${total} sets. Opening this screen did not submit a break or another study response.</p>
    <div class="notice" role="note">The Prolific study timer continues. Closing this tab does not complete the study or issue a completion code. To resume, return through your active Prolific submission. If you cannot resume, contact the researcher through Prolific.</div>
    <p class="form-message" id="pause-message" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p>
    <div class="button-row">
      <button class="primary-button" id="resume-from-safe-pause" type="button">Return to the required break</button>
    </div>
  </section>`;
}

export function createUnsubmittedResponseGuard(eventTarget) {
  if (!eventTarget || typeof eventTarget.addEventListener !== "function" ||
      typeof eventTarget.removeEventListener !== "function") {
    throw new TypeError("An event target is required");
  }
  let active = false;
  const beforeUnload = event => {
    event.preventDefault();
    event.returnValue = true;
  };
  return Object.freeze({
    setActive(next) {
      const desired = next === true;
      if (desired === active) return;
      active = desired;
      if (active) eventTarget.addEventListener("beforeunload", beforeUnload);
      else eventTarget.removeEventListener("beforeunload", beforeUnload);
    },
    isActive() {
      return active;
    },
    dispose() {
      if (!active) return;
      active = false;
      eventTarget.removeEventListener("beforeunload", beforeUnload);
    }
  });
}
