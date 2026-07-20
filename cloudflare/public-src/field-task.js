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

function matrixMarkup(testlet) {
  const header = testlet.options.map((option, index) => `
    <th scope="col" id="option-${index + 1}"><span class="option-number">${index + 1}</span>${escapeHtml(option)}</th>
  `).join("");
  const rows = testlet.items.map((item, itemIndex) => {
    const promptId = `meaning-${itemIndex + 1}`;
    const cells = testlet.options.map((option, optionIndex) => `<td><label class="matrix-choice">
      <input type="radio" name="meaning-${itemIndex + 1}"
        data-item-index="${itemIndex}" value="${escapeHtml(option)}"
        aria-labelledby="${promptId} option-${optionIndex + 1}">
      <span>${escapeHtml(option)}</span>
    </label></td>`).join("");
    return `<tr><th scope="row" id="${promptId}"><span class="prompt-number">${itemIndex + 1}</span>${escapeHtml(item.prompt)}</th>${cells}</tr>`;
  }).join("");
  return `<p class="sr-only" id="matrix-help">For each meaning, choose one of the six words. Each word may be used at most once in this set.</p>
  <div class="matrix-scroll" tabindex="0" aria-label="Vocabulary matching table" aria-describedby="matrix-help">
    <table class="matching-matrix">
      <caption class="sr-only">Three meanings and six word choices</caption>
      <thead><tr><th scope="col">Meaning</th>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function renderTestletPanel(step) {
  const practice = step.phase === "practice";
  const moduleLabel = practice
    ? "Practice"
    : `Module ${step.module_position} of ${step.module_count}`;
  const setTotal = practice ? step.phase_testlet_count : step.testlets_per_module;
  const setPosition = practice ? step.phase_testlet_ordinal : step.testlet_position_within_module;
  return `<section class="task-panel">
    <div class="task-heading">
      <div>
        <p class="eyebrow">${escapeHtml(moduleLabel)}</p>
        <h1>Match each meaning to one word</h1>
      </div>
      <div class="progress-chip">Set ${escapeHtml(setPosition)} / ${escapeHtml(setTotal)}</div>
    </div>
    <p class="task-instruction">Choose one word for each of the three meanings. Three words will not be used.</p>
    ${matrixMarkup(step.testlet)}
    <p class="form-message" id="response-message" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p>
    <div class="task-actions">
      <span class="save-indicator">Your response must reach the study server before the next set opens.</span>
      <button class="primary-button" id="submit-testlet" type="button">Save and continue</button>
    </div>
  </section>`;
}
