import assert from "node:assert/strict";
import test from "node:test";

import { normalizePublicRoutes, chooseRandomRoute } from "../pages/routes.js";

const bank = {
  testlets: ["A-1", "A-2", "B-1", "B-2"].map(testletId => ({
    testletId,
    moduleId: testletId.slice(0, 1),
    formId: testletId.slice(0, 1),
    band: "1k",
    options: [],
    items: []
  }))
};

function publicRoutes(overrides = {}) {
  return {
    distribution: { publicReleaseAllowed: true },
    participantCollectionAllowed: true,
    routes: [{
      routeId: "R01",
      modules: [
        { moduleId: "A", modulePosition: 1, testletOrder: ["A-2", "A-1"] },
        { moduleId: "B", modulePosition: 2, testletOrder: ["B-1", "B-2"] }
      ],
      testletOrder: ["A-2", "A-1", "B-1", "B-2"]
    }],
    ...overrides
  };
}

test("public routes preserve module and within-module positions", () => {
  const [route] = normalizePublicRoutes(publicRoutes(), bank);
  assert.equal(route.routeId, "R01");
  assert.deepEqual(route.testlets.map(testlet => testlet.testletId), ["A-2", "A-1", "B-1", "B-2"]);
  assert.deepEqual(route.testlets.map(testlet => testlet.modulePosition), [1, 1, 2, 2]);
  assert.deepEqual(route.testlets.map(testlet => testlet.testletPositionWithinModule), [1, 2, 1, 2]);
});

test("route selection uses browser cryptographic randomness", () => {
  const routes = [{ routeId: "R01" }, { routeId: "R02" }];
  const selected = chooseRandomRoute(routes, { getRandomValues(values) { values[0] = 3; } });
  assert.equal(selected.routeId, "R02");
});

test("routes refuse unauthorized and inconsistent artifacts", () => {
  assert.throws(
    () => normalizePublicRoutes(publicRoutes({ participantCollectionAllowed: false }), bank),
    /参加者実施用として承認/
  );
  const inconsistent = publicRoutes();
  inconsistent.routes[0].testletOrder = ["A-1", "A-2", "B-1", "B-2"];
  assert.throws(() => normalizePublicRoutes(inconsistent, bank), /一致しません/);

  const wrongModule = publicRoutes();
  wrongModule.routes[0].modules[0].moduleId = "B";
  assert.throws(() => normalizePublicRoutes(wrongModule, bank), /属していません/);
});
