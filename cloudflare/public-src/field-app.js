import {
  renderTestletPanel,
  selectedOptionStrings,
  validateSelections
} from "/field-task.js";

const root = document.getElementById("app");
const progressRoot = document.getElementById("study-progress");
const saveState = document.getElementById("save-state");
const API_TIMEOUT_MS = 20_000;

let currentState = null;
let pendingSubmission = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderProgress(stage) {
  const stages = ["start", "study", "complete"];
  const current = Math.max(0, stages.indexOf(stage));
  const steps = [
    ["Step 1", "Secure start"],
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

function renderMessage(title, message, { danger = false, retry = false, busy = false, focus = true } = {}) {
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
  currentState = state;
  updateSaveState(currentState);
  renderState();
}

async function recoverFromStaleState(onFailure) {
  pendingSubmission = null;
  try {
    await refreshState();
    return true;
  } catch (error) {
    onFailure(error);
    return false;
  }
}

function renderTestlet(step) {
  renderProgress("study");
  root.setAttribute("aria-busy", "false");
  const startedAt = new Date().toISOString();
  const startedMonotonic = performance.now();
  root.innerHTML = renderTestletPanel(step);
  const button = root.querySelector("#submit-testlet");
  focusMainHeading();
  button.addEventListener("click", async () => {
    const message = root.querySelector("#response-message");
    const selections = selectedOptionStrings(root, step.testlet);
    const validation = validateSelections(step.testlet, selections);
    if (!validation.valid) {
      showFormMessage(message, validation.message, { assertive: true, focus: true });
      return;
    }
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
        phase: step.phase || "main",
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
      const confirmedState = await api("/api/session/testlet-response", {
        method: "POST",
        body: pendingSubmission
      });
      pendingSubmission = null;
      applyConfirmedState(confirmedState);
    } catch (error) {
      root.setAttribute("aria-busy", "false");
      if (error.status === 409) {
        await recoverFromStaleState(refreshError => {
          setTestletControlsDisabled(false);
          showFormMessage(message, refreshError.message, { assertive: true, focus: true });
        });
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

function renderBreak(step) {
  renderProgress("study");
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<section class="task-panel break-card">
    <div class="break-mark">Ⅱ</div>
    <p class="eyebrow">Required module boundary</p>
    <h1>Module ${escapeHtml(step.after_module_position)} is complete</h1>
    <p class="lead">Please take a short break before starting Module ${escapeHtml(step.before_module_position)}.</p>
    <label class="check-field break-confirmation">
      <input id="break-confirmation" type="checkbox">
      <span>I took a break and am ready to continue.</span>
    </label>
    <p class="form-message" id="break-message" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p>
    <div class="button-row">
      <button class="primary-button" id="continue-after-break" type="button">Start Module ${escapeHtml(step.before_module_position)}</button>
    </div>
  </section>`;
  focusMainHeading();
  root.querySelector("#continue-after-break").addEventListener("click", async event => {
    const message = root.querySelector("#break-message");
    if (!root.querySelector("#break-confirmation").checked) {
      showFormMessage(message, "Confirm that you took the required break before continuing.", { assertive: true, focus: true });
      return;
    }
    event.currentTarget.disabled = true;
    root.setAttribute("aria-busy", "true");
    showFormMessage(message, "Saving the break confirmation…");
    try {
      const confirmedState = await api("/api/session/break-complete", {
        method: "POST",
        body: { after_module_position: step.after_module_position }
      });
      applyConfirmedState(confirmedState);
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

function renderCompletionReady() {
  renderProgress("complete");
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<section class="task-panel completion-card">
    <div class="completion-mark">✓</div>
    <p class="eyebrow">Responses saved</p>
    <h1>Finish the study</h1>
    <p class="lead">Your completion link is issued only after the server verifies all required responses and breaks.</p>
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
  if (step.kind === "testlet") return renderTestlet(step);
  if (step.kind === "break") return renderBreak(step);
  if (step.kind === "complete_ready" || step.kind === "completed") return renderCompletionReady();
  renderMessage("Study paused safely", "The server returned an unsupported study state. Your confirmed responses remain saved.", { danger: true, retry: true });
}

async function initialise() {
  pendingSubmission = null;
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
  if (pendingSubmission && root.querySelector("#response-message")) {
    root.setAttribute("aria-busy", "false");
    const button = root.querySelector("#submit-testlet");
    if (button) button.disabled = false;
    showFormMessage(
      root.querySelector("#response-message"),
      "This page was restored before the previous save was confirmed. Press Save and continue to verify the same response safely.",
      { assertive: true, focus: true }
    );
    return;
  }
  initialise();
});

initialise();
