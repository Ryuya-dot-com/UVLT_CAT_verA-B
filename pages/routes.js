function requireString(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label}がありません。`);
  return text;
}

function assertPublicationAllowed(raw) {
  if (raw?.distribution?.publicReleaseAllowed !== true) {
    throw new Error("この経路データは公開用として承認されていません。");
  }
  if (raw?.participantCollectionAllowed !== true) {
    throw new Error("この経路データは参加者実施用として承認されていません。");
  }
}

export function normalizePublicRoutes(raw, bank) {
  assertPublicationAllowed(raw);
  if (!Array.isArray(raw?.routes) || raw.routes.length === 0) {
    throw new Error("A/B実施経路を読み込めませんでした。");
  }
  const bankById = new Map(bank.testlets.map(testlet => [testlet.testletId, testlet]));
  return Object.freeze(raw.routes.map((rawRoute, routeIndex) => {
    const routeId = requireString(rawRoute.routeId, `経路${routeIndex + 1}のID`);
    if (!Array.isArray(rawRoute.modules) || !Array.isArray(rawRoute.testletOrder)) {
      throw new Error(`${routeId}の実施順序が正しくありません。`);
    }
    const flattenedOrder = rawRoute.modules.flatMap(module => module.testletOrder || []);
    if (JSON.stringify(flattenedOrder) !== JSON.stringify(rawRoute.testletOrder)) {
      throw new Error(`${routeId}のモジュール順序と問題順序が一致しません。`);
    }
    if (rawRoute.testletOrder.length !== bank.testlets.length) {
      throw new Error(`${routeId}の問題数が問題データと一致しません。`);
    }
    const uniqueIds = new Set(rawRoute.testletOrder);
    if (uniqueIds.size !== bank.testlets.length || [...uniqueIds].some(testletId => !bankById.has(testletId))) {
      throw new Error(`${routeId}に重複または不明な問題IDがあります。`);
    }
    const positions = new Map();
    rawRoute.modules.forEach((module, moduleIndex) => {
      const moduleId = requireString(module.moduleId, `${routeId}のModule ID`);
      if (!Array.isArray(module.testletOrder) || module.testletOrder.length === 0) {
        throw new Error(`${routeId}の${moduleId}に問題がありません。`);
      }
      module.testletOrder.forEach((testletId, testletIndex) => {
        if (bankById.get(testletId)?.moduleId !== moduleId) {
          throw new Error(`${routeId}の${testletId}が${moduleId}に属していません。`);
        }
        positions.set(testletId, Object.freeze({
          modulePosition: Number(module.modulePosition || moduleIndex + 1),
          testletPositionWithinModule: testletIndex + 1
        }));
      });
    });
    return Object.freeze({
      routeId,
      testlets: Object.freeze(rawRoute.testletOrder.map(testletId => Object.freeze({
        ...bankById.get(testletId),
        ...positions.get(testletId)
      })))
    });
  }));
}

export function chooseRandomRoute(routes, cryptoApi = globalThis.crypto) {
  if (!Array.isArray(routes) || routes.length === 0) throw new Error("選択できる実施経路がありません。");
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("このブラウザでは実施経路を安全に選択できません。");
  }
  const range = 0x100000000;
  const upperBound = range - (range % routes.length);
  const values = new Uint32Array(1);
  do cryptoApi.getRandomValues(values); while (values[0] >= upperBound);
  return routes[values[0] % routes.length];
}
