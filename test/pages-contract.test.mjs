import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizePublicBank } from "../pages/bank.js";
import { normalizePublicRoutes, parseAdministrationForm, singleFormRoute } from "../pages/routes.js";
import { createResultSnapshot } from "../pages/result-export.js";

const indexSource = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const appSource = readFileSync(fileURLToPath(new URL("../pages/app.js", import.meta.url)), "utf8");
const bankPath = fileURLToPath(new URL("../pages/data/uvlt_bank.ab.content.json", import.meta.url));
const routesPath = fileURLToPath(new URL("../pages/data/uvlt_routes.ab.williams10.json", import.meta.url));
const publicBankSource = readFileSync(bankPath, "utf8");
const publicBank = JSON.parse(publicBankSource);
const publicRoutes = JSON.parse(readFileSync(routesPath, "utf8"));

test("root Pages entry uses repository-relative, self-hosted assets", () => {
  assert.match(indexSource, /href="\.\/pages\/styles\.css"/);
  assert.match(indexSource, /src="\.\/pages\/app\.js\?v=pages-v2-20261001"/);
  assert.match(indexSource, /href="\.\/pages\/favicon\.svg"/);
  assert.doesNotMatch(indexSource, /https?:\/\//);
});

test("Pages app keeps responses local and exposes automatic and retry downloads", () => {
  assert.doesNotMatch(appSource, /localStorage|sessionStorage|sendBeacon/);
  assert.doesNotMatch(appSource, /fetch\([^)]*api\//);
  assert.match(appSource, /triggerResultDownload\(state\.snapshot\)/);
  assert.match(appSource, /id="download-again"/);
  assert.match(appSource, /Google Classroom/);
  assert.match(appSource, /participantName/);
  assert.match(appSource, /studentId/);
  assert.equal((appSource.match(/<input /g) || []).length, 2);
  assert.match(appSource, /new URL\("\.\/data\/uvlt_bank\.ab\.content\.json", import\.meta\.url\)/);
});

test("public A+B bank is authorized, keyless, and contains both forms", () => {
  assert.equal(publicBank.distribution.publicReleaseAllowed, true);
  assert.equal(publicBank.participantCollectionAllowed, true);
  assert.equal(Array.isArray(publicBank.testlets), true);
  assert.equal(publicBank.testlets.length, 100);
  assert.equal(publicBank.testlets.reduce((count, testlet) => count + testlet.items.length, 0), 300);
  assert.deepEqual([...new Set(publicBank.testlets.map(testlet => testlet.formId))].sort(), ["A", "B"]);
  assert.doesNotMatch(publicBankSource, /"(?:answer|answers|correctOption|answerKey|score|difficulty|discrimination|guessing)"\s*:/i);
});

test("public route artifact contains ten authorized 100-testlet routes", () => {
  assert.equal(publicRoutes.distribution.publicReleaseAllowed, true);
  assert.equal(publicRoutes.participantCollectionAllowed, true);
  assert.equal(publicRoutes.routes.length, 10);
  assert.equal(publicRoutes.routes.every(route => route.testletOrder.length === 100), true);
  assert.deepEqual(publicRoutes.routes.map(route => route.routeId), [
    "R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10"
  ]);
  const normalizedBank = normalizePublicBank(publicBank);
  assert.equal(normalizePublicRoutes(publicRoutes, normalizedBank).length, 10);
});

test("administration URLs select exactly one supported form", () => {
  assert.equal(parseAdministrationForm(""), "AB");
  for (const form of ["AB", "A", "B"]) {
    assert.equal(parseAdministrationForm(`?form=${form}`), form);
    assert.equal(parseAdministrationForm(`?form=${form.toLowerCase()}`), form);
  }
  for (const search of ["?form=", "?form=C", "?form=A&form=B", "?form=AB&form=AB"]) {
    assert.throws(() => parseAdministrationForm(search), /実施リンク/);
  }
});

test("single-form routes preserve all 150 items in canonical order and export the correct form", () => {
  const bank = normalizePublicBank(publicBank);
  for (const form of ["A", "B"]) {
    const route = singleFormRoute(bank, form);
    const original = publicBank.testlets.filter(t => t.formId === form);
    assert.equal(route.routeId, `${form}-canonical-v1`);
    assert.equal(route.testlets.length, 50);
    assert.deepEqual(route.testlets.map(t => t.testletId), original.map(t => t.testletId));
    assert.equal(new Set(route.testlets.flatMap(t => t.items.map(i => i.itemId))).size, 150);
    route.testlets.forEach((t, index) => {
      assert.equal(t.formId, form);
      assert.equal(t.band, `${Math.floor(index / 10) + 1}k`);
      assert.equal(t.modulePosition, Math.floor(index / 10) + 1);
      assert.equal(t.testletPositionWithinModule, index % 10 + 1);
    });
    const session = {
      identity: { participantName: "Synthetic test", studentId: "TEST-ONLY" },
      submissionCode: "UAB-TEST", administrationForm: form,
      startedAt: "2026-10-01T00:00:00Z", completedAt: "2026-10-01T01:00:00Z",
      responses: route.testlets.flatMap(t => t.items.map(item => ({
        form_id: t.formId, item_id: item.itemId, route_id: route.routeId
      })))
    };
    const snapshot = createResultSnapshot(session);
    assert.equal(snapshot.filename, `UVLT_${form}_result_UAB-TEST.csv`);
    const rows = snapshot.csv.trim().split("\r\n");
    assert.equal(rows.length, 151);
    const columns = rows[0].replace(/^\uFEFF/, "").split(",");
    for (const row of rows.slice(1)) {
      assert.equal(row.split(",")[columns.indexOf('"administration_form"')], `"${form}"`);
      assert.equal(row.split(",")[columns.indexOf('"form_id"')], `"${form}"`);
    }
  }
  assert.throws(() => singleFormRoute(bank, "AB"), /単独実施/);
  assert.throws(() => singleFormRoute({ testlets: bank.testlets.slice(1) }, "A"), /50セット/);
});
