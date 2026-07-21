const FORBIDDEN_RESPONSE_KEY = /^(?:answer|answers|answerKey|correct|correctAnswer|correctOption|correctIndex|correctPosition|difficulty|discrimination|guessing|irt|parameter|parameters)$/i;

function valueFrom(source, ...keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function requireString(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label}がありません。`);
  return text;
}

function assertKeyless(value, path = "問題データ") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertKeyless(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_KEY.test(key)) {
      throw new Error(`${path}.${key} に採点情報が含まれています。`);
    }
    assertKeyless(entry, `${path}.${key}`);
  }
}

function assertPublicationAllowed(raw) {
  if (raw?.distribution?.publicReleaseAllowed !== true) {
    throw new Error("この問題データは公開用として承認されていません。");
  }
  if (raw?.participantCollectionAllowed !== true) {
    throw new Error("この問題データは参加者実施用として承認されていません。");
  }
  if (raw?.scoringStatus && raw.scoringStatus !== "stimuli_only_no_answer_key") {
    throw new Error("採点情報を含まない問題データだけを使用できます。");
  }
  if (Array.isArray(raw?.parameterFieldsPresent) && raw.parameterFieldsPresent.length > 0) {
    throw new Error("項目パラメータを含まない問題データだけを使用できます。");
  }
  assertKeyless(raw);
}

export function normalizePublicBank(raw) {
  assertPublicationAllowed(raw);
  const rawTestlets = valueFrom(raw, "testlets", "bank");
  if (!Array.isArray(rawTestlets) || rawTestlets.length === 0) {
    throw new Error("A/B問題データを読み込めませんでした。");
  }
  const testlets = rawTestlets.map((testlet, testletIndex) => {
    const options = valueFrom(testlet, "options", "optionStrings", "option_strings");
    const rawItems = valueFrom(testlet, "items");
    if (!Array.isArray(options) || options.length !== 6) {
      throw new Error(`セット${testletIndex + 1}の選択肢が正しくありません。`);
    }
    if (!Array.isArray(rawItems) || rawItems.length !== 3) {
      throw new Error(`セット${testletIndex + 1}の問題が正しくありません。`);
    }
    const formId = requireString(valueFrom(testlet, "formId", "form_id"), "Form ID").toUpperCase();
    if (formId !== "A" && formId !== "B") throw new Error("Form IDはAまたはBである必要があります。");
    return Object.freeze({
      testletId: requireString(valueFrom(testlet, "testletId", "testlet_id"), "Testlet ID"),
      moduleId: requireString(valueFrom(testlet, "moduleId", "module_id"), "Module ID"),
      formId,
      band: requireString(valueFrom(testlet, "band"), "Band"),
      options: Object.freeze(options.map(option => requireString(option, "選択肢"))),
      items: Object.freeze(rawItems.map((item, itemIndex) => Object.freeze({
        itemId: requireString(valueFrom(item, "itemId", "item_id"), "Item ID"),
        prompt: requireString(valueFrom(item, "prompt"), "問題文"),
        itemPosition: Number(valueFrom(item, "itemPositionWithinTestlet", "item_position_within_testlet") || itemIndex + 1)
      })))
    });
  });
  const forms = new Set(testlets.map(testlet => testlet.formId));
  if (!forms.has("A") || !forms.has("B")) throw new Error("Form AとForm Bの両方が必要です。");
  return Object.freeze({
    releaseId: requireString(valueFrom(raw, "releaseId", "release_id", "packId"), "Release ID"),
    appVersion: String(valueFrom(raw, "appVersion", "app_version") || "pages-v1"),
    testlets: Object.freeze(testlets)
  });
}
