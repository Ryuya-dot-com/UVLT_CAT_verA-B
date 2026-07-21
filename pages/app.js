import {
  createResultSnapshot,
  createSubmissionCode,
  normalizeIdentity,
  triggerResultDownload
} from "./result-export.js";
import { normalizePublicBank } from "./bank.js";
import { chooseRandomRoute, normalizePublicRoutes } from "./routes.js";

const BANK_URL = new URL("./data/uvlt_bank.ab.content.json", import.meta.url);
const ROUTES_URL = new URL("./data/uvlt_routes.ab.williams10.json", import.meta.url);
const root = document.getElementById("app");
const localState = document.getElementById("local-state");
const progressTrack = document.getElementById("progress-track");
const progressFill = document.getElementById("progress-fill");

const state = {
  bank: null,
  routes: null,
  route: null,
  session: null,
  currentIndex: 0,
  currentStartedAt: 0,
  snapshot: null
};

function focusHeading() {
  const heading = root.querySelector("h1");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus();
}

function showProgress(completed, total) {
  progressTrack.hidden = false;
  const percent = total > 0 ? Math.min(100, Math.max(0, (completed / total) * 100)) : 0;
  progressFill.style.width = `${percent}%`;
  progressTrack.setAttribute("aria-label", `${total}セット中${completed}セット完了`);
}

function renderLoadError(message) {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<section class="panel"><p class="eyebrow">読み込みエラー</p><h1>テストを開始できません</h1><p class="notice danger" role="alert"></p><button class="button secondary" id="reload" type="button">再読み込み</button></section>`;
  root.querySelector(".notice").textContent = message;
  root.querySelector("#reload").addEventListener("click", () => location.reload());
  localState.textContent = "問題データを確認できません";
  focusHeading();
}

function renderIdentityForm() {
  progressTrack.hidden = true;
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<section class="panel intro-panel">
    <p class="eyebrow">Updated Vocabulary Levels Test</p>
    <h1>Form A + Form B</h1>
    <p class="lead">氏名と学籍番号を入力してテストを開始してください。</p>
    <div class="notice privacy-note">
      <strong>このページから回答は送信されません。</strong>
      <span>完了時に結果CSVが端末へ自動保存されます。保存したファイルをGoogle Classroomで提出してください。</span>
    </div>
    <form id="identity-form" class="identity-form" novalidate>
      <label class="field">
        <span>氏名</span>
        <input id="participant-name" name="participant_name" type="text" maxlength="100" autocomplete="off" required>
      </label>
      <label class="field">
        <span>学籍番号</span>
        <input id="student-id" name="student_id" type="text" maxlength="64" autocomplete="off" inputmode="text" required>
      </label>
      <p class="form-message" id="identity-message" role="alert" aria-live="assertive"></p>
      <button class="button primary" type="submit">テストを開始</button>
    </form>
    <details class="details">
      <summary>実施方法</summary>
      <ul>
        <li>各セットには6語と3つの意味が表示されます。</li>
        <li>各意味に最も合う語を1つずつ選んでください。</li>
        <li>同じセット内で同じ語を2回選ぶことはできません。</li>
        <li>途中の回答はサーバーやブラウザ内へ保存されません。</li>
      </ul>
    </details>
  </section>`;
  localState.textContent = `問題データ確認済み · ${state.bank.testlets.length}セット`;
  const form = root.querySelector("#identity-form");
  form.addEventListener("submit", event => {
    event.preventDefault();
    const message = root.querySelector("#identity-message");
    try {
      const identity = normalizeIdentity({
        participantName: root.querySelector("#participant-name").value,
        studentId: root.querySelector("#student-id").value
      });
      const route = chooseRandomRoute(state.routes);
      state.route = route;
      state.session = {
        identity,
        submissionCode: createSubmissionCode(),
        routeId: route.routeId,
        releaseId: state.bank.releaseId,
        appVersion: state.bank.appVersion,
        startedAt: new Date().toISOString(),
        completedAt: null,
        responses: []
      };
      state.currentIndex = 0;
      state.snapshot = null;
      renderTestlet();
    } catch (error) {
      message.textContent = error.message;
    }
  });
  focusHeading();
}

function selectedOptionIndexes(form, itemCount) {
  return Array.from({ length: itemCount }, (_unused, itemIndex) => {
    const selected = form.querySelector(`input[name="item-${itemIndex}"]:checked`);
    return selected ? Number(selected.value) : null;
  });
}

function validateSelections(selections) {
  if (selections.some(value => !Number.isInteger(value))) return "3つの意味すべてに回答してください。";
  if (new Set(selections).size !== selections.length) return "同じ語は1セット内で1回だけ選んでください。";
  return null;
}

function appendQuestion(form, testlet, item, itemIndex) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "question";
  const legend = document.createElement("legend");
  const number = document.createElement("span");
  number.className = "question-number";
  number.textContent = String(itemIndex + 1);
  const prompt = document.createElement("span");
  prompt.textContent = item.prompt;
  legend.append(number, prompt);
  fieldset.append(legend);

  const optionGrid = document.createElement("div");
  optionGrid.className = "option-grid";
  testlet.options.forEach((option, optionIndex) => {
    const label = document.createElement("label");
    label.className = "option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `item-${itemIndex}`;
    input.value = String(optionIndex);
    input.required = true;
    const text = document.createElement("span");
    text.textContent = option;
    label.append(input, text);
    optionGrid.append(label);
  });
  fieldset.append(optionGrid);
  form.append(fieldset);
}

function renderTestlet() {
  const testlet = state.route.testlets[state.currentIndex];
  const total = state.route.testlets.length;
  showProgress(state.currentIndex, total);
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<section class="panel test-panel">
    <div class="test-meta"><span class="pill"></span><span class="set-count"></span></div>
    <h1>最も合う語を選んでください</h1>
    <p class="instruction">各語は、このセット内で1回だけ使えます。</p>
    <div class="word-bank" aria-label="選択肢"></div>
    <form id="response-form" class="response-form" novalidate></form>
    <p class="form-message" id="response-message" role="alert" aria-live="assertive"></p>
  </section>`;
  root.querySelector(".pill").textContent = `Form ${testlet.formId} · ${testlet.band}`;
  root.querySelector(".set-count").textContent = `${state.currentIndex + 1} / ${total}セット`;
  const wordBank = root.querySelector(".word-bank");
  testlet.options.forEach(option => {
    const word = document.createElement("span");
    word.textContent = option;
    wordBank.append(word);
  });
  const form = root.querySelector("#response-form");
  testlet.items.forEach((item, itemIndex) => appendQuestion(form, testlet, item, itemIndex));
  const submit = document.createElement("button");
  submit.className = "button primary submit-response";
  submit.type = "submit";
  submit.textContent = state.currentIndex === total - 1 ? "回答を完了して結果を保存" : "回答を確定して次へ";
  form.append(submit);
  state.currentStartedAt = performance.now();

  form.addEventListener("submit", event => {
    event.preventDefault();
    const selections = selectedOptionIndexes(form, testlet.items.length);
    const validationMessage = validateSelections(selections);
    if (validationMessage) {
      root.querySelector("#response-message").textContent = validationMessage;
      return;
    }
    const elapsedMs = Math.max(0, Math.round(performance.now() - state.currentStartedAt));
    testlet.items.forEach((item, itemIndex) => {
      const selectedIndex = selections[itemIndex];
      state.session.responses.push({
        testlet_ordinal: state.currentIndex + 1,
        route_id: state.route.routeId,
        form_id: testlet.formId,
        band: testlet.band,
        module_id: testlet.moduleId,
        module_position: testlet.modulePosition,
        testlet_position_within_module: testlet.testletPositionWithinModule,
        testlet_id: testlet.testletId,
        item_position: item.itemPosition,
        item_id: item.itemId,
        prompt: item.prompt,
        selected_option_position: selectedIndex + 1,
        selected_option: testlet.options[selectedIndex],
        testlet_elapsed_ms: elapsedMs
      });
    });

    const finished = state.currentIndex === total - 1;
    if (finished) {
      state.session.completedAt = new Date().toISOString();
      state.snapshot = createResultSnapshot(state.session);
      try {
        triggerResultDownload(state.snapshot);
        renderCompletion(true);
      } catch (error) {
        renderCompletion(false, error.message);
      }
      return;
    }

    state.currentIndex += 1;
    if (state.currentIndex % 10 === 0) renderBreak();
    else renderTestlet();
  });
  localState.textContent = "このページから回答は送信されません";
  focusHeading();
}

function renderBreak() {
  showProgress(state.currentIndex, state.route.testlets.length);
  root.innerHTML = `<section class="panel break-panel">
    <p class="eyebrow">休憩</p>
    <h1>${state.currentIndex}セット完了しました</h1>
    <p class="lead">必要に応じて休憩してください。準備ができたら次へ進んでください。</p>
    <p class="notice">この画面を閉じたり再読み込みしたりすると、未保存の回答は失われます。</p>
    <button class="button primary" id="continue" type="button">次のセットへ</button>
  </section>`;
  root.querySelector("#continue").addEventListener("click", renderTestlet);
  focusHeading();
}

function renderCompletion(downloadStarted, errorMessage = "") {
  showProgress(state.route.testlets.length, state.route.testlets.length);
  root.innerHTML = `<section class="panel completion-panel">
    <div class="completion-mark" aria-hidden="true">✓</div>
    <p class="eyebrow">テスト完了</p>
    <h1>結果ファイルを保存しました</h1>
    <p class="lead completion-lead"></p>
    <div class="file-card"><span>保存ファイル</span><strong id="result-filename"></strong></div>
    <p class="form-message" id="download-message" role="status" aria-live="polite"></p>
    <button class="button primary" id="download-again" type="button">結果ファイルをもう一度保存</button>
    <p class="fine-print">保存したCSVファイルをGoogle Classroomで提出してください。氏名と学籍番号はCSV内に記録されています。</p>
  </section>`;
  root.querySelector("#result-filename").textContent = state.snapshot.filename;
  root.querySelector(".completion-lead").textContent = downloadStarted
    ? "ダウンロードが始まらない場合は、下のボタンからもう一度保存してください。"
    : "自動ダウンロードを開始できませんでした。下のボタンから保存してください。";
  if (errorMessage) root.querySelector("#download-message").textContent = errorMessage;
  root.querySelector("#download-again").addEventListener("click", () => {
    const message = root.querySelector("#download-message");
    try {
      const filename = triggerResultDownload(state.snapshot);
      message.textContent = `${filename} を保存しました。`;
    } catch (error) {
      message.textContent = error.message;
    }
  });
  localState.textContent = "完了 · Google Classroomへ提出してください";
  focusHeading();
}

window.addEventListener("beforeunload", event => {
  if (!state.session || state.snapshot) return;
  event.preventDefault();
  event.returnValue = true;
});

async function initialise() {
  try {
    const [bankResponse, routesResponse] = await Promise.all([
      fetch(BANK_URL, { cache: "no-store", credentials: "same-origin" }),
      fetch(ROUTES_URL, { cache: "no-store", credentials: "same-origin" })
    ]);
    if (!bankResponse.ok) throw new Error(`問題データの取得に失敗しました（${bankResponse.status}）。`);
    if (!routesResponse.ok) throw new Error(`実施経路の取得に失敗しました（${routesResponse.status}）。`);
    state.bank = normalizePublicBank(await bankResponse.json());
    state.routes = normalizePublicRoutes(await routesResponse.json(), state.bank);
    renderIdentityForm();
  } catch (error) {
    renderLoadError(error.message || "問題データを読み込めませんでした。");
  }
}

initialise();
