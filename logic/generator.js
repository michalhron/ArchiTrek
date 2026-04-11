// === logic/generator.js ===
/**
 * Procedural Study Graph Generator (Seed + Grow + Mesh).
 *
 * Output shape is renderer-friendly:
 * {
 *   nodes: string[],
 *   edges: Array<{
 *     from: string,
 *     to: string,
 *     codes: string[],
 *     isDirect: boolean,
 *     matrixDirectCodes: string[],
 *     matrixDerivedCodes: string[],
 *     isAssociation?: boolean
 *   }>
 * }
 */
(function generatorBootstrap() {
  "use strict";

  const DEFAULT_TARGET_SIZE = 6;
  const MAX_NODE_CONNECTIONS = 3;
  const SEED_STORY_STARTERS = new Set([
    "Business Actor",
    "Business Role",
    "Business Process",
  ]);
  /**
   * Study graphs: dependency (Serving,Realization) + dynamic (Triggering,Flow) only.
   * Composition (C), Aggregation (G), and all other codes are excluded via this allowlist.
   */
  const STUDY_STORY_REL_CODES = new Set(["V", "R", "T", "F"]);

  function studyStoryCodeFilter(code) {
    return STUDY_STORY_REL_CODES.has(String(code || "").toUpperCase());
  }

  function toUpperCodes(list) {
    if (!Array.isArray(list)) return [];
    return list.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  }

  function pickRandom(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function weightedPick(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    let total = 0;
    for (const item of list) total += Math.max(0, Number(item?.weight) || 0);
    if (!(total > 0)) return pickRandom(list);
    let r = Math.random() * total;
    for (const item of list) {
      r -= Math.max(0, Number(item?.weight) || 0);
      if (r <= 0) return item;
    }
    return list[list.length - 1];
  }

  function normalizeTargetSize(targetSize) {
    const n = Math.floor(Number(targetSize));
    if (!Number.isFinite(n)) return DEFAULT_TARGET_SIZE;
    return Math.max(2, n);
  }

  function normalizeAllowedElements(allowedElements) {
    if (allowedElements && typeof allowedElements.has === "function") return allowedElements;
    return null;
  }

  function getLayerIndex(name, rank) {
    if (typeof getElementLayer !== "function") return rank.get("Unknown") ?? 999;
    return rank.get(getElementLayer(name)) ?? 999;
  }

  function filteredCodesForRow(row, includeDerived, allowedRelCodes) {
    const directAll = toUpperCodes(row?.direct);
    const derivedAll = includeDerived ? toUpperCodes(row?.derived) : [];
    const keep = (code) =>
      studyStoryCodeFilter(code) &&
      (!allowedRelCodes || allowedRelCodes.has(code));
    const direct = directAll.filter(keep);
    const derived = derivedAll.filter(keep);
    return { direct, derived };
  }

  function getDegree(node, degreeByNode) {
    return degreeByNode.get(node) || 0;
  }

  function canAcceptMoreEdges(node, degreeByNode, maxNodeConnections) {
    return getDegree(node, degreeByNode) < maxNodeConnections;
  }

  function bumpEdgeDegree(from, to, degreeByNode) {
    degreeByNode.set(from, getDegree(from, degreeByNode) + 1);
    degreeByNode.set(to, getDegree(to, degreeByNode) + 1);
  }

  function collectElementPool(allowedElements) {
    const pool = [];
    const excluded = typeof EXCLUDED_APP_ELEMENTS !== "undefined" && EXCLUDED_APP_ELEMENTS
      ? EXCLUDED_APP_ELEMENTS
      : new Set();
    const names = typeof ELEMENTS !== "undefined" && ELEMENTS ? Object.keys(ELEMENTS) : [];
    for (const name of names) {
      if (excluded.has(name)) continue;
      if (allowedElements && !allowedElements.has(name)) continue;
      pool.push(name);
    }
    return pool;
  }

  function pickSeedNode(pool) {
    const business = pool.filter((name) => {
      if (typeof getElementLayer !== "function") return false;
      return getElementLayer(name) === "Business";
    });
    if (business.length === 0) return pickRandom(pool);
    const story = business.filter((name) => SEED_STORY_STARTERS.has(name));
    if (story.length > 0) return pickRandom(story);
    return pickRandom(business);
  }

  function buildGrowthMoves(parent, opts) {
    const {
      nodesSet,
      includeDerived,
      allowedElements,
      allowedRelCodes,
      layerRank,
      degreeByNode,
      maxNodeConnections,
    } = opts;
    const rows = typeof MATRIX !== "undefined" && Array.isArray(MATRIX) ? MATRIX : [];
    const out = [];
    if (!canAcceptMoreEdges(parent, degreeByNode, maxNodeConnections)) {
      return out;
    }
    for (const row of rows) {
      if (!row || (row.from !== parent && row.to !== parent)) continue;
      const neighbor = row.from === parent ? row.to : row.from;
      if (!neighbor || neighbor === parent) continue;
      if (allowedElements && !allowedElements.has(neighbor)) continue;
      if (!canAcceptMoreEdges(neighbor, degreeByNode, maxNodeConnections)) continue;
      const { direct, derived } = filteredCodesForRow(row, includeDerived, allowedRelCodes);
      const merged = [...direct, ...derived];
      if (merged.length === 0) continue;
      const chosenCode = pickRandom(merged);
      if (!chosenCode) continue;
      const parentIx = getLayerIndex(parent, layerRank);
      const neighborIx = getLayerIndex(neighbor, layerRank);
      const upLayerBoost = neighborIx < parentIx ? 1.65 : 1.0;
      const servingUpBoost = chosenCode === "V" && neighborIx < parentIx ? 2.1 : 1.0;
      const relBoost = chosenCode === "V" || chosenCode === "R" ? 1.3 : 1.0;
      const growthBoost = !nodesSet.has(neighbor) ? 2.2 : 0.7;
      out.push({
        from: row.from,
        to: row.to,
        neighbor,
        code: chosenCode,
        isDirect: direct.includes(chosenCode),
        matrixDirectCodes: direct,
        matrixDerivedCodes: derived,
        weight: upLayerBoost * servingUpBoost * relBoost * growthBoost,
      });
    }
    return out;
  }

  function rowCodesForDirection(from, to, includeDerived, allowedRelCodes) {
    if (typeof mergeMatrixRowForPair === "function") {
      const row = mergeMatrixRowForPair(from, to, includeDerived);
      const direct = toUpperCodes(row?.direct).filter(
        (c) => studyStoryCodeFilter(c) && (!allowedRelCodes || allowedRelCodes.has(c))
      );
      const derived = toUpperCodes(row?.derived).filter(
        (c) => studyStoryCodeFilter(c) && (!allowedRelCodes || allowedRelCodes.has(c))
      );
      return { direct, derived };
    }
    const rows = typeof MATRIX !== "undefined" && Array.isArray(MATRIX) ? MATRIX : [];
    const row = rows.find((r) => r?.from === from && r?.to === to);
    return filteredCodesForRow(row, includeDerived, allowedRelCodes);
  }

  function generateProceduralGraph(targetSize = DEFAULT_TARGET_SIZE, options = {}) {
    const sizeTarget = normalizeTargetSize(targetSize);
    const includeDerived = options?.includeDerived !== false;
    const viewpointKey = options?.viewpointKey ? String(options.viewpointKey) : null;
    const allowedElements = normalizeAllowedElements(options?.allowedElements);
    const allowedRelCodes =
      typeof getViewpointRelationshipAllowance === "function"
        ? getViewpointRelationshipAllowance(viewpointKey)
        : null;
    const pool = collectElementPool(allowedElements);
    if (pool.length === 0) {
      return { nodes: [], edges: [], meta: { error: "empty_element_pool" } };
    }

    const layerRank = new Map();
    if (Array.isArray(LAYERS)) {
      for (let i = 0; i < LAYERS.length; i++) layerRank.set(LAYERS[i].id, i);
    }

    const target = Math.min(sizeTarget, pool.length);
    const seed = pickSeedNode(pool);
    if (!seed) {
      return { nodes: [], edges: [], meta: { error: "no_seed_node" } };
    }

    const nodes = [seed];
    const nodesSet = new Set(nodes);
    const edges = [];
    const directedEdgePairs = new Set();
    const degreeByNode = new Map();
    degreeByNode.set(seed, 0);
    const maxNodeConnections = Math.max(1, Number(options?.maxNodeConnections) || MAX_NODE_CONNECTIONS);

    let growthEdgeCount = 0;
    let meshEdgeCount = 0;
    let safety = 0;
    const maxSafety = Math.max(80, target * 36);
    while (nodes.length < target && safety < maxSafety) {
      safety += 1;
      const parentCandidates = nodes.filter((n) => canAcceptMoreEdges(n, degreeByNode, maxNodeConnections));
      const parent = pickRandom(parentCandidates.length ? parentCandidates : nodes);
      if (!parent) break;
      const moves = buildGrowthMoves(parent, {
        nodesSet,
        includeDerived,
        allowedElements,
        allowedRelCodes,
        layerRank,
        degreeByNode,
        maxNodeConnections,
      });
      if (moves.length === 0) continue;
      const pick = weightedPick(moves);
      if (!pick) continue;
      const edgeKey = `${pick.from}\0${pick.to}`;
      if (!directedEdgePairs.has(edgeKey)) {
        edges.push({
          from: pick.from,
          to: pick.to,
          codes: [pick.code],
          isDirect: pick.isDirect,
          matrixDirectCodes: pick.matrixDirectCodes,
          matrixDerivedCodes: pick.matrixDerivedCodes,
        });
        directedEdgePairs.add(edgeKey);
        growthEdgeCount += 1;
        bumpEdgeDegree(pick.from, pick.to, degreeByNode);
      }
      if (!nodesSet.has(pick.neighbor)) {
        nodesSet.add(pick.neighbor);
        nodes.push(pick.neighbor);
        if (!degreeByNode.has(pick.neighbor)) degreeByNode.set(pick.neighbor, 0);
      }
    }

    const hasEdgeBetween = (a, b) =>
      directedEdgePairs.has(`${a}\0${b}`) || directedEdgePairs.has(`${b}\0${a}`);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (hasEdgeBetween(a, b)) continue;
        if (!canAcceptMoreEdges(a, degreeByNode, maxNodeConnections)) continue;
        if (!canAcceptMoreEdges(b, degreeByNode, maxNodeConnections)) continue;
        const ab = rowCodesForDirection(a, b, includeDerived, allowedRelCodes);
        const ba = rowCodesForDirection(b, a, includeDerived, allowedRelCodes);
        const abCodes = [...ab.direct, ...ab.derived];
        const baCodes = [...ba.direct, ...ba.derived];
        if (abCodes.length === 0 && baCodes.length === 0) continue;
        if (Math.random() > 0.3) continue;
        const orient =
          abCodes.length && baCodes.length
            ? (abCodes.length >= baCodes.length ? "ab" : "ba")
            : (abCodes.length ? "ab" : "ba");
        const from = orient === "ab" ? a : b;
        const to = orient === "ab" ? b : a;
        const direct = orient === "ab" ? ab.direct : ba.direct;
        const derived = orient === "ab" ? ab.derived : ba.derived;
        const code = pickRandom([...direct, ...derived]);
        if (!code) continue;
        const key = `${from}\0${to}`;
        if (directedEdgePairs.has(key)) continue;
        edges.push({
          from,
          to,
          codes: [code],
          isDirect: direct.includes(code),
          matrixDirectCodes: direct,
          matrixDerivedCodes: derived,
        });
        directedEdgePairs.add(key);
        meshEdgeCount += 1;
        bumpEdgeDegree(from, to, degreeByNode);
      }
    }

    const relCodeHistogram = Object.create(null);
    for (const e of edges) {
      const c = Array.isArray(e?.codes) && e.codes.length ? String(e.codes[0] || "").toUpperCase() : "?";
      relCodeHistogram[c] = (relCodeHistogram[c] || 0) + 1;
    }

    const layerOrder = Array.isArray(LAYERS) ? LAYERS.map((l) => l.id) : [];
    const layerSet = new Set();
    if (typeof getElementLayer === "function") {
      for (const n of nodes) layerSet.add(getElementLayer(n));
    }
    const layersPresent = [...layerSet].sort(
      (a, b) =>
        (layerOrder.indexOf(a) === -1 ? 999 : layerOrder.indexOf(a)) -
        (layerOrder.indexOf(b) === -1 ? 999 : layerOrder.indexOf(b))
    );

    const vpAllow =
      allowedRelCodes && typeof allowedRelCodes.has === "function" && allowedRelCodes.size > 0
        ? [...allowedRelCodes].map((c) => String(c).toUpperCase()).sort()
        : null;

    const meta = {
      seedElement: seed,
      requestedTargetSize: sizeTarget,
      cappedTarget: target,
      actualNodeCount: nodes.length,
      actualEdgeCount: edges.length,
      growthEdgeCount,
      meshEdgeCount,
      growthLoopIterations: safety,
      growthReachedTarget: nodes.length >= target,
      includeDerived,
      maxNodeConnections,
      viewpointKey: viewpointKey || null,
      viewpointRelationshipAllowlist: vpAllow,
      studyStoryAllowlist: ["V", "R", "T", "F"],
      elementPoolSize: pool.length,
      meshPairAttemptProbability: 0.3,
      layersPresent,
      relationshipHistogram: relCodeHistogram,
    };

    return { nodes, edges, meta };
  }

  window.generateProceduralGraph = generateProceduralGraph;
})();
