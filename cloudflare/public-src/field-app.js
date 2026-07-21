import {
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
  selectedOptionStrings,
  selectedPracticeSymbols,
  validatePracticeSelections,
  validateSelections
} from "/field-task.js";

const root = document.getElementById("app");
const progressRoot = document.getElementById("study-progress");
const saveState = document.getElementById("save-state");
const API_TIMEOUT_MS = 20_000;

let currentState = null;
let pendingSubmission = null;
let readinessAcknowledged = false;
let breakCountdownInterval = null;
const unsubmittedResponseGuard = createUnsubmittedResponseGuard(window);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clearBreakCountdown() {
  if (breakCountdownInterval === null) return;
  window.clearInterval(breakCountdownInterval);
  breakCountdownInterval = null;
}

function renderProgress(stage) {
  const stages = ["start", "study", "complete"];
  const current = Math.max(0, stages.indexOf(stage));
  const steps = [
    ["Step 1", "Get ready"],
    ["Step 2", "Vocabulary study"],
    ["Step 3", "Return to Prolific"]
  ];
  progressRoot.innerHTML = steps.map(([small, strong], index) => `
    <div class="progress-step${index < current ? " complete" : ""}${index === current ? " active" : ""}"
      ${index === current ? 'aria-current="step"' : ""}>
      <small>${small}</small><strong>${strong}</strong>
    </div>
  `).join("");
}

function focusMainHeading() {
  const heading = root.querySelector("h1");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus();
}

function showFormMessage(element, message, { assertive = false, focus = false } = {}) {
  element.textContent = message;
  element.classList.toggle("visible", Boolean(message));
  element.setAttribute("role", assertive ? "alert" : "status");
  element.setAttribute("aria-live", assertive ? "assertive" : "polite");
  if (focus) element.focus();
}

function setTestletControlsDisabled(disabled) {
  root.querySelectorAll('input[type="radio"]').forEach(input => {
    input.disabled = disabled;
  });
  const button = root.querySelector("#submit-testlet");
  if (button) button.disabled = disabled;
}

function setPracticeControlsDisabled(disabled) {
  root.querySelectorAll('input[type="radio"]').forEach(input => {
    input.disabled = disabled;
  });
  const button = root.querySelector("#complete-interface-practice");
  if (button) button.disabled = disabled;
}

function renderMessage(title, message, { danger = false, retry = false, busy = false, focus = true } = {}) {
  clearBreakCountdown();
  renderProgress("start");
  root.setAttribute("aria-busy", String(busy));
  root.innerHTML = `<section class="task-panel">
    <p class="eyebrow">Secure study connection</p>
    <h1>${escapeHtml(title)}</h1>
    <div class="notice${danger ? " danger" : ""}" role="${danger ? "alert" : "status"}">${escapeHtml(message)}</div>
    ${retry ? '<div class="button-row"><button class="primary-button" id="retry" type="button">Try again</button></div>' : ""}
  </section>`;
  root.querySelector("#retry")?.addEventListener("click", initialise);
  if (focus) focusMainHeading();
}

async function api(path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;
  let payload;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    try {
      payload = await response.json();
    } catch (cause) {
      if (controller.signal.aborted) throw cause;
      payload = { ok: false, error: "The study server returned an unreadable response." };
    }
  } catch (cause) {
    const timedOut = controller.signal.aborted;
    const error = new Error(
      timedOut ? "The study server took too long to respond." : "The study server could not be reached.",
      { cause }
    );
    error.retryable = true;
    error.timedOut = timedOut;
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || "The study server could not complete the request.");
    error.status = response.status;
    error.retryable = payload.retryable !== false &&
      (response.status === 408 || response.status === 429 || response.status >= 500);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function updateSaveState(state) {
  if (!state) {
    saveState.textContent = "Connecting securely…";
    return;
  }
  const complete = Number(state.completed_testlets || 0);
  const total = Number(state.total_testlets || 100);
  saveState.textContent = `Saved to study server · ${complete}/${total} sets`;
}

function verifiedProlificCompletionUrl(value) {
  const url = new URL(String(value || ""));
  const parameterNames = [...url.searchParams.keys()];
  if (url.origin !== "https://app.prolific.com" ||
      url.pathname !== "/submissions/complete" ||
      url.username || url.password || url.port || url.hash ||
      parameterNames.length !== 1 || parameterNames[0] !== "cc" ||
      !/^[A-Za-z0-9]{4,32}$/.test(url.searchParams.get("cc") || "")) {
    throw new Error("The completion link failed its Prolific safety check. Your responses remain saved; please contact the researcher through Prolific.");
  }
  return url.href;
}

async function refreshState() {
  root.setAttribute("aria-busy", "true");
  try {
    applyConfirmedState(await api("/api/session/state"));
  } catch (error) {
    root.setAttribute("aria-busy", "false");
    throw error;
  }
}

function applyConfirmedState(state) {
  pendingSubmission = null;
  unsubmittedResponseGuard.setActive(false);
  clearBreakCountdown();
  currentState = state;
  updateSaveState(currentState);
  renderState();
}

async function recoverFromStaleState(onFailure) {
  try {
    await refreshState();
    return true;
  } catch (error) {
    onFailure(error);
    return false;
  }
}

async function reconcileTestletConflict(step, message) {
  try {
    const state = await api("/api/session/state");
    if (mainSubmissionConfirmed(state, step.testlet_ordinal)) {
      applyConfirmedState(state);
      return;
    }

    currentState = state;
    updateSaveState(currentState);
    root.setAttribute("aria-busy", "false");
    const next = state?.next_step;
    const sameTestlet = next?.kind === "testlet" &&
      next.testlet_ordinal === step.testlet_ordinal;
    setTestletControlsDisabled(pendingSubmission !== null);
    const retryButton = root.querySelector("#submit-testlet");
    if (retryButton) retryButton.disabled = false;
    unsubmittedResponseGuard.setActive(true);
    showFormMessage(
      message,
      sameTestlet
        ? "The server has not confirmed this set. Your selections are preserved; press Save and continue to retry the same response."
        : "The server could not confirm that this set was saved. Your selections are preserved in this tab; try again or contact the researcher through Prolific.",
      { assertive: true, focus: true }
    );
  } catch (error) {
    root.setAttribute("aria-busy", "false");
    setTestletControlsDisabled(pendingSubmission !== null);
    const retryButton = root.querySelector("#submit-testlet");
    if (retryButton) retryButton.disabled = false;
    unsubmittedResponseGuard.setActive(true);
    showFormMessage(
      message,
      `${error.message} Your unconfirmed selections are preserved in this tab.`,
      { assertive: true, focus: true }
    );
  }
}

function renderReadiness() {
  clearBreakCountdown();
  unsubmittedResponseGuard.setActive(false);
  renderProgress("start");
  root.setAttribute("aria-busy", "false");
  root.innerHTML = renderReadinessPanel();
  focusMainHeading();
  root.querySelector("#begin-interface-practice").addEventListener("click", () => {
    readinessAcknowledged = true;
    renderInterfacePractice();
  });
}

function renderInterfacePractice() {
  clearBreakCountdown();
  unsubmittedResponseGuard.setActive(false);
  renderProgress("start");
  root.setAttribute("aria-busy", "false");
  root.innerHTML = renderInterfacePracticePanel();
  const button = root.querySelector("#complete-interface-practice");
  focusMainHeading();
  button.addEventListener("click", async () => {
    const message = root.querySelector("#practice-message");
    const selections = selectedPracticeSymbols(root);
    const validation = validatePracticeSelections(selections);
    if (!validation.valid) {
      showFormMessage(message, validation.message, { assertive: true, focus: true });
      return;
    }
    setPracticeControlsDisabled(true);
    root.setAttribute("aria-busy", "true");
    showFormMessage(message, "Recording completion of the interface practice…");
    try {
      applyConfirmedState(await api("/api/session/practice-complete", {
        method: "POST",
        body: { practice_definition: INTERFACE_PRACTICE_DEFINITION }
      }));
    } catch (error) {
      root.setAttribute("aria-busy", "false");
      if (error.status === 409) {
        await recoverFromStaleState(refreshError => {
          setPracticeControlsDisabled(false);
          showFormMessage(message, refreshError.message, { assertive: true, focus: true });
        });
        return;
      }
      setPracticeControlsDisabled(false);
      showFormMessage(message, error.retryable
        ? "Practice completion was not confirmed. Your practice choices remain on this screen; try again."
        : error.message, { assertive: true, focus: true });
    }
  });
}

function renderTestlet(step) {
  clearBreakCountdown();
  renderProgress("study");
  root.setAttribute("aria-busy", "false");
  const startedAt = new Date().toISOString();
  const startedMonotonic = performance.now();
  root.innerHTML = renderTestletPanel(step);
  const button = root.querySelector("#submit-testlet");
  root.querySelectorAll('input[type="radio"][data-item-index]').forEach(input => {
    input.addEventListener("change", () => unsubmittedResponseGuard.setActive(true));
  });
  focusMainHeading();
  button.addEventListener("click", async () => {
    const message = root.querySelector("#response-message");
    const selections = selectedOptionStrings(root, step.testlet);
    const validation = validateSelections(step.testlet, selections);
    if (!validation.valid) {
      showFormMessage(message, validation.message, { assertive: true, focus: true });
      return;
    }
    unsubmittedResponseGuard.setActive(true);
    if (pendingSubmission && pendingSubmission.testlet_ordinal !== step.testlet_ordinal) {
      await recoverFromStaleState(error => {
        setTestletControlsDisabled(false);
        showFormMessage(message, error.message, { assertive: true, focus: true });
      });
      return;
    }
    if (!pendingSubmission) {
      pendingSubmission = {
        testlet_ordinal: step.testlet_ordinal,
        selected_options: selections,
        testlet_started_at: startedAt,
        testlet_submitted_at: new Date().toISOString(),
        elapsed_ms: Math.max(0, Math.round(performance.now() - startedMonotonic)),
        idempotency_key: crypto.randomUUID()
      };
    }
    setTestletControlsDisabled(true);
    root.setAttribute("aria-busy", "true");
    showFormMessage(message, "Saving securely…");
    try {
      applyConfirmedState(await api("/api/session/testlet-response", {
        method: "POST",
        body: pendingSubmission
      }));
    } catch (error) {
      root.setAttribute("aria-busy", "false");
      if (error.status === 409) {
        await reconcileTestletConflict(step, message);
        return;
      }
      button.disabled = false;
      if (!error.retryable) {
        pendingSubmission = null;
        setTestletControlsDisabled(false);
      }
      showFormMessage(message, error.retryable
        ? (error.status === 429
          ? "The study server is busy. Wait briefly, then press Save and continue again; your selections are preserved."
          : "The response has not been confirmed. Check your connection and press Save and continue again; your selections are preserved.")
        : error.message, { assertive: true, focus: true });
    }
  });
}

function renderSafePause() {
  clearBreakCountdown();
  unsubmittedResponseGuard.setActive(false);
  renderProgress("study");
  root.setAttribute("aria-busy", "false");
  root.innerHTML = renderSafePausePanel(currentState);
  const message = root.querySelector("#pause-message");
  const button = root.querySelector("#resume-from-safe-pause");
  focusMainHeading();
  button.addEventListener("click", async () => {
    button.disabled = true;
    root.setAttribute("aria-busy", "true");
    showFormMessage(message, "Refreshing your saved study state…");
    try {
      await refreshState();
    } catch (error) {
      root.setAttribute("aria-busy", "false");
      button.disabled = false;
      showFormMessage(message, error.message, { assertive: true, focus: true });
    }
  });
}

function renderBreak(step) {
  clearBreakCountdown();
  unsubmittedResponseGuard.setActive(false);
  const timing = breakTiming(step);
  if (timing === null) {
    renderMessage("Study state unavailable", "The server did not provide a valid required-break state.", { danger: true, retry: true });
    return;
  }
  renderProgress("study");
  root.setAttribute("aria-busy", "false");
  root.innerHTML = renderBreakPanel(step);
  const message = root.querySelector("#break-message");
  const countdown = root.querySelector("#break-countdown");
  const announcement = root.querySelector("#break-ready-announcement");
  const confirmation = root.querySelector("#break-confirmation");
  const pauseButton = root.querySelector("#pause-at-break");
  const continueButton = root.querySelector("#continue-after-break");
  const deadline = Date.parse(timing.availableAt);
  let advisoryRemaining = -1;
  let readyAnnounced = false;
  let submitting = false;

  const updateCountdown = () => {
    const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (next !== advisoryRemaining) {
      advisoryRemaining = next;
      countdown.textContent = formatBreakCountdown(advisoryRemaining);
    }
    if (advisoryRemaining === 0) {
      if (!readyAnnounced) {
        announcement.textContent = "The minimum break is complete. Continue when ready.";
        readyAnnounced = true;
      }
      continueButton.disabled = submitting;
      clearBreakCountdown();
    }
  };

  updateCountdown();
  if (advisoryRemaining > 0) {
    breakCountdownInterval = window.setInterval(updateCountdown, 250);
  }
  focusMainHeading();
  pauseButton.addEventListener("click", renderSafePause);
  continueButton.addEventListener("click", async () => {
    updateCountdown();
    if (advisoryRemaining > 0) {
      showFormMessage(message, "The server-set minimum break has not finished yet.", { assertive: true, focus: true });
      return;
    }
    if (!confirmation.checked) {
      showFormMessage(message, "Confirm that you took the required break before continuing.", { assertive: true, focus: true });
      return;
    }
    submitting = true;
    continueButton.disabled = true;
    pauseButton.disabled = true;
    confirmation.disabled = true;
    root.setAttribute("aria-busy", "true");
    showFormMessage(message, "Asking the study server to verify the break…");
    try {
      applyConfirmedState(await api("/api/session/break-complete", {
        method: "POST",
        body: { after_module_position: timing.afterModule }
      }));
    } catch (error) {
      root.setAttribute("aria-busy", "false");
      if (error.status === 409) {
        await recoverFromStaleState(refreshError => {
          submitting = false;
          continueButton.disabled = advisoryRemaining > 0;
          pauseButton.disabled = false;
          confirmation.disabled = false;
          showFormMessage(message, refreshError.message, { assertive: true, focus: true });
        });
        return;
      }
      submitting = false;
      continueButton.disabled = advisoryRemaining > 0;
      pauseButton.disabled = false;
      confirmation.disabled = false;
      showFormMessage(message, error.message, { assertive: true, focus: true });
    }
  });
}

function renderCompletionReady() {
  clearBreakCountdown();
  unsubmittedResponseGuard.setActive(false);
  renderProgress("complete");
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<section class="task-panel completion-card">
    <div class="completion-mark">✓</div>
    <p class="eyebrow">Responses saved</p>
    <h1>Finish the study</h1>
    <p class="lead">Your completion link is issued only after the server verifies all required responses, the interface-practice completion, and all breaks.</p>
    <p class="form-message" id="completion-message" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p>
    <div class="button-row"><button class="primary-button" id="complete-study" type="button">Verify and return to Prolific</button></div>
  </section>`;
  focusMainHeading();
  root.querySelector("#complete-study").addEventListener("click", async event => {
    const message = root.querySelector("#completion-message");
    event.currentTarget.disabled = true;
    root.setAttribute("aria-busy", "true");
    showFormMessage(message, "Verifying the complete response record…");
    try {
      const result = await api("/api/session/complete", { method: "POST", body: {} });
      if (!result.completion_url) throw new Error("The completion link is not configured. Your responses remain saved; please contact the researcher through Prolific.");
      location.assign(verifiedProlificCompletionUrl(result.completion_url));
    } catch (error) {
      root.setAttribute("aria-busy", "false");
      if (error.status === 409) {
        await recoverFromStaleState(refreshError => {
          event.currentTarget.disabled = false;
          showFormMessage(message, refreshError.message, { assertive: true, focus: true });
        });
        return;
      }
      event.currentTarget.disabled = false;
      showFormMessage(message, error.message, { assertive: true, focus: true });
    }
  });
}

function renderState() {
  const step = currentState?.next_step;
  if (!step) {
    renderMessage("Study state unavailable", "The server did not provide a valid next step.", { danger: true, retry: true });
    return;
  }
  if (step.kind === "practice") {
    if (!readinessAcknowledged) return renderReadiness();
    return renderInterfacePractice();
  }
  if (step.kind === "testlet") return renderTestlet(step);
  if (step.kind === "break") return renderBreak(step);
  if (step.kind === "complete_ready" || step.kind === "completed") return renderCompletionReady();
  renderMessage("Study paused safely", "The server returned an unsupported study state. Your confirmed responses remain saved.", { danger: true, retry: true });
}

async function initialise() {
  clearBreakCountdown();
  pendingSubmission = null;
  readinessAcknowledged = false;
  unsubmittedResponseGuard.setActive(false);
  updateSaveState(null);
  if (window.location.pathname === "/recruitment-closed") {
    progressRoot.hidden = true;
    document.title = "Recruitment closed · UVLT Vocabulary Study";
    renderMessage(
      "This study is not accepting new participants",
      "No new study session was started on this site. Please return to Prolific and follow the instructions shown there. If you need help, contact the researcher through Prolific."
    );
    saveState.textContent = "No session started";
    return;
  }
  progressRoot.hidden = false;
  renderMessage("Connecting to the study", "Checking the collection release and your secure Prolific session.", { busy: true, focus: false });
  try {
    const config = await api("/api/config");
    if (!config.collection_enabled) {
      renderMessage("Data collection is not open", "This study is not accepting participant responses. No session was started.");
      saveState.textContent = "Collection closed";
      return;
    }
    await refreshState();
  } catch (error) {
    if (error.status === 401) {
      renderMessage("Open this study from Prolific", "A valid Prolific launch session was not found. Close this tab and reopen the study from Prolific.", { danger: true });
      saveState.textContent = "Secure launch required";
      return;
    }
    renderMessage("The study server is temporarily unavailable", "No unconfirmed response was advanced. Please try again.", { danger: true, retry: true });
    saveState.textContent = "Connection not confirmed";
  }
}

window.addEventListener("pageshow", event => {
  if (!event.persisted) return;
  if (unsubmittedResponseGuard.isActive() && root.querySelector("#response-message")) {
    root.setAttribute("aria-busy", "false");
    setTestletControlsDisabled(pendingSubmission !== null);
    const button = root.querySelector("#submit-testlet");
    if (button) button.disabled = false;
    showFormMessage(
      root.querySelector("#response-message"),
      pendingSubmission
        ? "This page was restored before the previous save was confirmed. Press Save and continue to verify the same response safely."
        : "This page was restored with unsubmitted selections. Complete the set, then press Save and continue.",
      { assertive: true, focus: true }
    );
    return;
  }
  initialise();
});

initialise();
