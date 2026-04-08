// === logic/quizEngine.js ===
/**
 * Procedural “Spot the Error” quiz generation using MATRIX + pathfinder rules.
 * Depends on globals: SCENARIOS, VIEWPOINTS, ELEMENTS, MATRIX, RELATIONSHIPS,
 * buildGraph, findBestChainForSet, mergeMatrixRowForPair.
 */

/**
 * @typedef {{ random(): number }} Rng
 */

function defaultRng() {
  return { random: () => Math.random() };
}

/**
 * @param {unknown[]} arr
 * @param {Rng} rng
 */
function pickRandom(arr, rng) {
  if (!arr.length) return undefined;
  return arr[Math.floor(rng.random() * arr.length)];
}

/**
 * @param {unknown[]} arr
 * @param {Rng} rng
 */
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @param {string} viewpointName
 * @returns {{ key: string, def: object }|null}
 */
function resolveViewpointKey(viewpointName) {
  if (!viewpointName || typeof VIEWPOINTS === "undefined") return null;
  const raw = String(viewpointName).trim();
  if (VIEWPOINTS[raw]) return { key: raw, def: VIEWPOINTS[raw] };
  const lower = raw.toLowerCase();
  for (const key of Object.keys(VIEWPOINTS)) {
    if (key.toLowerCase() === lower) return { key, def: VIEWPOINTS[key] };
  }
  for (const key of Object.keys(VIEWPOINTS)) {
    const name = VIEWPOINTS[key].name || "";
    if (name && (name === raw || `${name} Viewpoint` === raw || raw.toLowerCase().includes(name.toLowerCase()))) {
      return { key, def: VIEWPOINTS[key] };
    }
  }
  return null;
}

/** @param {object} def */
function viewpointAllowedElements(def) {
  if (!def || def.allElements) return null;
  return new Set(def.elements || []);
}

/**
 * @param {{ label: string, element: string }[]} terms
 * @param {Set<string>|null} allowedElements
 */
function termsUsableInViewpoint(terms, allowedElements) {
  return terms.filter((t) => {
    if (!t || !t.element || typeof ELEMENTS === "undefined" || !ELEMENTS[t.element]) return false;
    if (!allowedElements) return true;
    return allowedElements.has(t.element);
  });
}

/**
 * @param {{ label: string, element: string }[]} usableTerms
 * @param {string} element
 * @param {Rng} rng
 */
function randomLabelForElement(usableTerms, element, rng) {
  const pool = usableTerms.filter((t) => t.element === element).map((t) => t.label);
  return pool.length ? pickRandom(pool, rng) : element;
}

/**
 * Prefer a direct matrix code on the path step when present.
 * @param {object} step
 * @returns {string|undefined}
 */
function primaryCodeFromStep(step) {
  if (!step) return undefined;
  const md = step.matrixDirectCodes;
  if (Array.isArray(md) && md.length) return String(md[0]).toUpperCase();
  const mder = step.matrixDerivedCodes;
  if (Array.isArray(mder) && mder.length) return String(mder[0]).toUpperCase();
  const c = step.codes;
  if (Array.isArray(c) && c.length) return String(c[0]).toUpperCase();
  return undefined;
}

/**
 * @param {string} fromEl
 * @param {string} toEl
 * @param {string} code
 * @param {boolean} includeDerived
 */
function matrixAllowsCode(fromEl, toEl, code, includeDerived) {
  const row = mergeMatrixRowForPair(fromEl, toEl, includeDerived);
  const U = String(code).toUpperCase();
  return row.merged.some((c) => String(c).toUpperCase() === U);
}

/**
 * @param {{ id: string, element: string, label: string }[]} nodes
 * @param {{ fromNodeId: string, toNodeId: string, code: string }[]} edges
 * @param {boolean} includeDerived
 */
function edgesStillMatrixConsistent(nodes, edges, includeDerived) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = byId[e.fromNodeId]?.element;
    const b = byId[e.toNodeId]?.element;
    if (!a || !b) return false;
    if (!matrixAllowsCode(a, b, e.code, includeDerived)) return false;
  }
  return true;
}

/**
 * @param {string} scenarioName
 * @param {string} viewpointName
 * @param {{ includeDerived?: boolean, rng?: Rng, maxAttempts?: number }} [options]
 */
function generateValidSubGraph(scenarioName, viewpointName, options = {}) {
  const rng = options.rng ?? defaultRng();
  const includeDerived = options.includeDerived !== false;
  const maxAttempts = options.maxAttempts ?? 80;

  if (typeof SCENARIOS === "undefined") {
    return { ok: false, reason: "SCENARIOS is not defined" };
  }
  const scenario = SCENARIOS[scenarioName];
  if (!scenario || !Array.isArray(scenario.terms)) {
    return { ok: false, reason: `Unknown scenario "${scenarioName}"` };
  }

  const vp = resolveViewpointKey(viewpointName);
  if (!vp) {
    return { ok: false, reason: `Unknown viewpoint "${viewpointName}"` };
  }

  const allowedElements = viewpointAllowedElements(vp.def);
  const usableTerms = termsUsableInViewpoint(scenario.terms, allowedElements);
  const distinctElements = [...new Set(usableTerms.map((t) => t.element))];

  if (distinctElements.length < 3) {
    return {
      ok: false,
      reason: "Not enough distinct ArchiMate element types in this scenario for the selected viewpoint (need ≥3).",
    };
  }

  const graph = buildGraph({
    allowedElements,
    includeDerived,
    includeAssociationBridges: false,
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const k = rng.random() < 0.5 ? 3 : 4;
    const cap = Math.min(k, distinctElements.length);
    const pool = shuffleInPlace([...distinctElements], rng).slice(0, cap);
    if (pool.length < 3) continue;

    const chain = findBestChainForSet(graph, pool, {
      maxDepth: 1,
      allowAssociationFallback: false,
      includeDerived,
      maxPaths: 5,
      maxStates: 25000,
    });

    if (chain.totalScore === Infinity || !chain.segments?.length) continue;
    const broken = chain.segments.some((s) => !s.paths || !s.paths.length);
    if (broken) continue;

    const orderedElements = chain.orderedPoints;
    const nodes = orderedElements.map((element, i) => ({
      id: `n${i}`,
      element,
      label: randomLabelForElement(usableTerms, element, rng),
    }));

    const edges = [];
    for (let i = 0; i < chain.segments.length; i++) {
      const seg = chain.segments[i];
      const path = seg.paths[0];
      if (!path || path.length < 2) {
        edges.length = 0;
        break;
      }
      const step = path[1];
      const code = primaryCodeFromStep(step);
      if (!code) {
        edges.length = 0;
        break;
      }
      const type = RELATIONSHIPS?.[code]?.name ?? code;
      edges.push({
        fromNodeId: `n${i}`,
        toNodeId: `n${i + 1}`,
        code,
        type,
        isDirect: step.isDirect === true,
        isValid: true,
      });
    }

    if (edges.length !== orderedElements.length - 1) continue;

    return {
      ok: true,
      scenarioName,
      domain: scenario.domain || scenarioName,
      viewpointKey: vp.key,
      viewpointLabel: vp.def.name || vp.key,
      viewpointSection: vp.def.section || "",
      allowedElements,
      includeDerived,
      terms: scenario.terms,
      nodes,
      edges,
    };
  }

  return {
    ok: false,
    reason: "Could not find a valid single-hop chain for random element samples; try another viewpoint or add terms.",
  };
}

const REL_CODES_EXAM = ["C", "G", "I", "R", "V", "A", "N", "T", "F", "S"];

/**
 * @param {object} validGraph — result of generateValidSubGraph with ok true
 * @param {"relationshipViolation"|"viewpointViolation"} errorType
 * @param {{ rng?: Rng, maxAttempts?: number }} [options]
 */
function mutateGraphForExam(validGraph, errorType, options = {}) {
  const rng = options.rng ?? defaultRng();
  const maxAttempts = options.maxAttempts ?? 60;

  if (!validGraph || !validGraph.ok) {
    return { ok: false, reason: "Invalid validGraph" };
  }

  const nodes = validGraph.nodes.map((n) => ({ ...n }));
  const edges = validGraph.edges.map((e) => ({ ...e }));
  const includeDerived = validGraph.includeDerived;
  const allowedElements = validGraph.allowedElements;

  if (errorType === "relationshipViolation") {
    if (!edges.length) return { ok: false, reason: "No edges to mutate" };
    const edgeIndex = Math.floor(rng.random() * edges.length);
    const edge = edges[edgeIndex];
    const fromEl = nodes.find((n) => n.id === edge.fromNodeId)?.element;
    const toEl = nodes.find((n) => n.id === edge.toNodeId)?.element;
    if (!fromEl || !toEl) return { ok: false, reason: "Edge endpoint missing" };

    const row = mergeMatrixRowForPair(fromEl, toEl, includeDerived);
    const allowedCodes = row.merged.map((c) => String(c).toUpperCase());
    const allowedSet = new Set(allowedCodes);
    const wrongPool = REL_CODES_EXAM.filter((c) => !allowedSet.has(c));
    if (!wrongPool.length) {
      return { ok: false, reason: "No disallowed relationship code available for this edge" };
    }
    const wrongCode = pickRandom(wrongPool, rng);
    const wrongName = RELATIONSHIPS?.[wrongCode]?.name ?? wrongCode;

    edges[edgeIndex] = {
      ...edge,
      code: wrongCode,
      type: wrongName,
      isValid: false,
    };

    const rule =
      `Appendix B (normative relationship matrix) does not list ${wrongName} (${wrongCode}) from "${fromEl}" to "${toEl}". ` +
      `Permitted codes for this direction${includeDerived ? " (direct and derived)" : " (direct only)"}: ` +
      `${allowedCodes.length ? allowedCodes.join(", ") : "none"}.`;

    return {
      ok: true,
      violation: "relationship",
      graph: { nodes, edges },
      answerKey: {
        kind: "edge",
        edgeIndex,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        fromElement: fromEl,
        toElement: toEl,
        wrongCode,
        allowedCodes,
        rule,
        reference: "data/matrix.js (Appendix B)",
      },
    };
  }

  if (errorType === "viewpointViolation") {
    if (allowedElements == null) {
      return {
        ok: false,
        reason: "Viewpoint allows all elements (e.g. Layered); cannot synthesize a viewpoint violation.",
      };
    }

    const scenarioTerms = Array.isArray(validGraph.terms) ? validGraph.terms : [];
    const illegalPool = scenarioTerms.filter((t) => t.element && !allowedElements.has(t.element));
    if (!illegalPool.length) {
      return {
        ok: false,
        reason: "No scenario term uses an element type outside this viewpoint palette.",
      };
    }

    const endpointIndices = [0, nodes.length - 1].filter((i, idx, a) => a.indexOf(i) === idx);

    for (let t = 0; t < maxAttempts; t++) {
      const nodeIndex = pickRandom(endpointIndices, rng);
      const illegal = pickRandom(illegalPool, rng);
      if (illegal == null || nodeIndex == null) break;

      const trialNodes = nodes.map((n, i) =>
        i === nodeIndex ? { ...n, element: illegal.element, label: illegal.label } : { ...n }
      );

      if (!edgesStillMatrixConsistent(trialNodes, edges, includeDerived)) continue;

      const old = nodes[nodeIndex];
      nodes.splice(0, nodes.length, ...trialNodes);

      const vpName = validGraph.viewpointLabel || validGraph.viewpointKey;
      const rule =
        `"${illegal.element}" is not in the "${vpName}" example viewpoint element set (Appendix C). ` +
        `Replacing "${old.label}" (${old.element}) pollutes the view with an out-of-palette element type.`;

      return {
        ok: true,
        violation: "viewpoint",
        graph: { nodes, edges },
        answerKey: {
          kind: "node",
          nodeIndex,
          nodeId: nodes[nodeIndex].id,
          element: illegal.element,
          label: illegal.label,
          previousElement: old.element,
          previousLabel: old.label,
          viewpointKey: validGraph.viewpointKey,
          rule,
          reference: "data/viewpoints.js (Appendix C example viewpoints)",
        },
      };
    }

    return {
      ok: false,
      reason: "Could not replace an endpoint with an out-of-palette element while keeping matrix-consistent edges.",
    };
  }

  return { ok: false, reason: `Unknown errorType "${errorType}"` };
}

/**
 * @param {string} scenarioName
 * @param {string} viewpointName
 * @param {"relationshipViolation"|"viewpointViolation"} errorType
 * @param {object} [options]
 */
function buildSpotTheErrorQuiz(scenarioName, viewpointName, errorType, options = {}) {
  const gen = generateValidSubGraph(scenarioName, viewpointName, options);
  if (!gen.ok) {
    return {
      ok: false,
      reason: gen.reason,
      meta: { scenarioName, viewpointName, errorType },
    };
  }

  const mutated = mutateGraphForExam(gen, errorType, options);
  if (!mutated.ok) {
    return {
      ok: false,
      reason: mutated.reason,
      meta: {
        scenarioName,
        viewpointKey: gen.viewpointKey,
        viewpointLabel: gen.viewpointLabel,
        errorType,
      },
    };
  }

  const byId = Object.fromEntries(mutated.graph.nodes.map((n) => [n.id, n]));
  const uiEdges = mutated.graph.edges.map((e) => ({
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    fromLabel: byId[e.fromNodeId]?.label ?? "",
    toLabel: byId[e.toNodeId]?.label ?? "",
    fromElement: byId[e.fromNodeId]?.element ?? "",
    toElement: byId[e.toNodeId]?.element ?? "",
    relationship: e.type,
    code: e.code,
    isValid: e.isValid !== false,
    isDirect: e.isDirect,
  }));

  let viewpointContext = gen.viewpointLabel;
  if (gen.viewpointSection) viewpointContext += ` — ${gen.viewpointSection}`;

  return {
    ok: true,
    scenarioDomain: gen.domain,
    viewpointContext,
    graph: { nodes: mutated.graph.nodes, edges: uiEdges },
    answerKey: mutated.answerKey,
    meta: {
      scenarioName,
      viewpointKey: gen.viewpointKey,
      errorType,
      violation: mutated.violation,
    },
  };
}
