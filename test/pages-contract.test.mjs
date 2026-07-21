import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizePublicBank } from "../pages/bank.js";
import { normalizePublicRoutes } from "../pages/routes.js";

const indexSource = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const appSource = readFileSync(fileURLToPath(new URL("../pages/app.js", import.meta.url)), "utf8");
const bankPath = fileURLToPath(new URL("../pages/data/uvlt_bank.ab.content.json", import.meta.url));
const routesPath = fileURLToPath(new URL("../pages/data/uvlt_routes.ab.williams10.json", import.meta.url));
const publicBankSource = readFileSync(bankPath, "utf8");
const publicBank = JSON.parse(publicBankSource);
const publicRoutes = JSON.parse(readFileSync(routesPath, "utf8"));

test("root Pages entry uses repository-relative, self-hosted assets", () => {
  assert.match(indexSource, /href="\.\/pages\/styles\.css"/);
  assert.match(indexSource, /src="\.\/pages\/app\.js"/);
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
