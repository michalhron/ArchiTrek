// === logic/pathfinder.js ===
/**
 * logic/pathfinder.js
 * ArchiMate Path Navigator — BFS Pathfinder
 *
 * Finds valid relationship paths between ArchiMate elements.
 * Supports:
 *   - Two-endpoint queries (start → end)
 *   - Multi-waypoint queries (start → mid1 → mid2 → ... → end)
 *   - Direct-only or direct+derived traversal
 *   - Max hop depth per segment
 *   - Path scoring (fewest hops, fewest derived edges)
 *
 * EXPORTS:
 *   findPaths(graph, waypoints, options) → PathResult[]
 *   scorePath(path) → number (lower = better)
 *   findBestChainForSet(graph, points, options) → { orderedPoints, segments, totalScore }
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (JSDoc for editor support)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} PathStep
 * @property {string} element   — element name at this node
 * @property {string[]|null} codes — relationship codes on the edge arriving here
 *                                   null for the first node (no incoming edge)
 * @property {boolean|null} isDirect — whether the edge is direct; null for first node
 */

/**
 * @typedef {PathStep[]} Path
 * A sequence of steps from start to end of one segment.
 */

/**
 * @typedef {object} SegmentResult
 * @property {string} from
 * @property {string} to
 * @property {Path[]} paths — top N paths for this segment, sorted by score
 */

/**
 * @typedef {object} PathResult
 * @property {string[]} waypoints — the full waypoint chain [start, ...mids, end]
 * @property {SegmentResult[]} segments — one entry per consecutive waypoint pair
 * @property {number} totalHops — sum of hops across all segments (shortest combo)
 * @property {number} derivedCount — number of derived edges in the best combo
 */

// ─────────────────────────────────────────────────────────────────────────────
// BFS — single segment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run BFS from `start` to `target` on the given adjacency graph.
 *
 * Returns up to `maxPaths` paths, sorted by (hopCount ASC, derivedEdges ASC).
 *
 * Each path is an array of PathStep objects:
 *   [{ element: "Device", codes: null, isDirect: null },
 *    { element: "Technology Service", codes: ["I","V"], isDirect: true },
 *    { element: "Application Component", codes: ["R","V"], isDirect: true }]
 *
 * @param {Map} graph — adjacency list from buildGraph()
 * @param {string} start
 * @param {string} target
 * @param {object} options
 * @param {number} options.maxDepth — max hops per segment (default 4)
 * @param {number} options.maxPaths — max paths to return (default 5)
 * @returns {Path[]}
 */
function bfsSegment(graph, start, target, { maxDepth = 6, maxPaths = 5 } = {}) {
  if (start === target) {
    return [[{ element: start, codes: null, isDirect: null }]];
  }

  if (!graph.has(start)) return [];

  const results = [];

  // NOTE: Avoid Array.prototype.shift() here — it is O(n) and can freeze the UI
  // when the queue grows large (especially with derived edges enabled).
  const queue = [{
    path: [{ element: start, codes: null, isDirect: null }],
    visited: new Set([start]),
  }];
  let qh = 0; // queue head index for O(1) dequeue

  // Hard cap to keep the UI responsive even on dense graphs.
  // This bounds worst-case work without changing typical results.
  const maxStates = 25000;
  let exploredStates = 0;

  while (qh < queue.length && results.length < maxPaths * 4) {
    const { path, visited } = queue[qh++];
    const current = path[path.length - 1].element;

    // path.length - 1 = number of hops so far
    // stop expanding if we've already hit maxDepth hops
    if (path.length - 1 >= maxDepth) continue;

    const edges = graph.get(current) ?? [];

    for (const edge of edges) {
      if (++exploredStates > maxStates) {
        // Bail out deterministically; return best-so-far results.
        // Sorting still ensures we keep the most relevant candidates.
        return results
          .sort((a, b) => scorePath(a) - scorePath(b))
          .slice(0, maxPaths);
      }

      const { to, codes, isDirect } = edge;

      if (visited.has(to)) continue;

      const newPath = [...path, { element: to, codes, isDirect }];

      if (to === target) {
        results.push(newPath);
      } else {
        const newVisited = new Set(visited);
        newVisited.add(to);
        queue.push({ path: newPath, visited: newVisited });
      }
    }
  }

  return results
    .sort((a, b) => scorePath(a) - scorePath(b))
    .slice(0, maxPaths);
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a path: lower is better.
 * Primary: fewest hops (edges = path.length - 1)
 * Secondary: fewest derived edges
 *
 * @param {Path} path
 * @returns {number}
 */
function scorePath(path) {
  const hops = path.length - 1;
  const derivedCount = path.filter(step => step.isDirect === false).length;
  // Weight hops heavily so 1-hop always beats 2-hop regardless of derived count
  return hops * 100 + derivedCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// UNORDERED SET → BEST ORDERED CHAIN
// ─────────────────────────────────────────────────────────────────────────────

function pathScoreOrInfinity(path) {
  if (!path || path.length === 0) return Infinity;
  return scorePath(path);
}

function pairKey(a, b) {
  return `${a}→${b}`;
}

/**
 * Compute best path + score between two points (directed).
 * Cached because the ordering solver queries many pairs repeatedly.
 */
function makePairwiseBestPathGetter(graph, { maxDepth = 6, maxPaths = 5 } = {}) {
  const cache = new Map(); // key: "A→B" -> { bestPath, score }
  return (a, b) => {
    const k = pairKey(a, b);
    const hit = cache.get(k);
    if (hit) return hit;
    const paths = bfsSegment(graph, a, b, { maxDepth, maxPaths });
    const bestPath = paths?.[0] ?? null;
    const score = pathScoreOrInfinity(bestPath);
    const res = { bestPath, score };
    cache.set(k, res);
    return res;
  };
}

/**
 * Exact best Hamiltonian PATH (not cycle) by brute-force permutations.
 * Use for small N only.
 */
function bestOrderingExact(points, getPair) {
  const n = points.length;
  let best = null; // { order, score }

  const used = new Array(n).fill(false);
  const order = new Array(n);

  const dfs = (depth, runningScore) => {
    if (runningScore >= (best?.score ?? Infinity)) return;
    if (depth === n) {
      best = { order: order.slice(), score: runningScore };
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const el = points[i];
      if (depth > 0) {
        const prev = order[depth - 1];
        const { score } = getPair(prev, el);
        if (!Number.isFinite(score)) continue; // unreachable edge kills this ordering
        used[i] = true;
        order[depth] = el;
        dfs(depth + 1, runningScore + score);
        used[i] = false;
      } else {
        used[i] = true;
        order[depth] = el;
        dfs(depth + 1, runningScore);
        used[i] = false;
      }
    }
  };

  dfs(0, 0);
  return best;
}

/**
 * Greedy heuristic for larger sets:
 * - pick a good start (try a few candidates)
 * - nearest-neighbor build
 * - optional 2-opt improvement
 */
function bestOrderingHeuristic(points, getPair, { tries = 4, do2opt = true } = {}) {
  const uniq = [...new Set(points)];
  const n = uniq.length;
  if (n <= 2) return { order: uniq.slice(), score: n === 2 ? getPair(uniq[0], uniq[1]).score : 0 };

  const scoreChain = (ord) => {
    let s = 0;
    for (let i = 1; i < ord.length; i++) {
      const w = getPair(ord[i - 1], ord[i]).score;
      if (!Number.isFinite(w)) return Infinity;
      s += w;
    }
    return s;
  };

  const buildFromStart = (startIdx) => {
    const remaining = new Set(uniq);
    const order = [];
    let current = uniq[startIdx];
    order.push(current);
    remaining.delete(current);

    while (remaining.size) {
      let bestNext = null;
      let bestScore = Infinity;
      for (const cand of remaining) {
        const w = getPair(current, cand).score;
        if (w < bestScore) {
          bestScore = w;
          bestNext = cand;
        }
      }
      if (!bestNext || !Number.isFinite(bestScore)) return { order: null, score: Infinity };
      order.push(bestNext);
      remaining.delete(bestNext);
      current = bestNext;
    }
    return { order, score: scoreChain(order) };
  };

  // Candidate starts: first, plus a few spread-out picks.
  const startCandidates = [0];
  for (let i = 1; i < Math.min(n, tries); i++) startCandidates.push(Math.floor((i * (n - 1)) / (tries - 1)));

  let best = null;
  for (const idx of startCandidates) {
    const cand = buildFromStart(idx);
    if (cand.score < (best?.score ?? Infinity)) best = cand;
  }
  if (!best || !best.order) return { order: null, score: Infinity };

  if (do2opt) {
    // Standard 2-opt for path (not cycle): reverse subsegments to reduce cost.
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < n - 2; i++) {
        for (let k = i + 1; k < n - 1; k++) {
          const ord = best.order;
          const a = ord[i - 1], b = ord[i];
          const c = ord[k], d = ord[k + 1];
          const before = getPair(a, b).score + getPair(c, d).score;
          const after  = getPair(a, c).score + getPair(b, d).score;
          if (after < before) {
            const newOrd = ord.slice(0, i).concat(ord.slice(i, k + 1).reverse(), ord.slice(k + 1));
            const newScore = scoreChain(newOrd);
            if (newScore < best.score) {
              best = { order: newOrd, score: newScore };
              improved = true;
            }
          }
        }
      }
    }
  }

  return { order: best.order, score: best.score };
}

/**
 * Given an unordered set of element names, choose an ordered chain that minimizes
 * total segment score, then return standard `segments` for rendering.
 *
 * Notes:
 * - This respects directionality (uses directed BFS A→B).
 * - If no Hamiltonian path exists (some consecutive pair unreachable), returns
 *   empty segments.
 */
function findBestChainForSet(graph, points, {
  maxDepth = 6,
  maxPaths = 5,
  exactMaxPoints = 8,
} = {}) {
  const uniq = [...new Set((points ?? []).filter(Boolean))];
  if (uniq.length < 2) {
    return { orderedPoints: uniq, segments: [], totalScore: 0 };
  }

  const getPair = makePairwiseBestPathGetter(graph, { maxDepth, maxPaths });

  let best;
  if (uniq.length <= exactMaxPoints) {
    best = bestOrderingExact(uniq, getPair);
    if (!best?.order) return { orderedPoints: [], segments: [], totalScore: Infinity };
  } else {
    const h = bestOrderingHeuristic(uniq, getPair);
    if (!h?.order) return { orderedPoints: [], segments: [], totalScore: Infinity };
    best = { order: h.order, score: h.score };
  }

  // Build segments using the actual best path for each consecutive pair.
  const orderedPoints = best.order;
  const segments = [];
  let totalScore = 0;
  for (let i = 0; i < orderedPoints.length - 1; i++) {
    const from = orderedPoints[i];
    const to   = orderedPoints[i + 1];
    const paths = bfsSegment(graph, from, to, { maxDepth, maxPaths });
    segments.push({ from, to, paths });
    if (!paths?.length) {
      // In case cache/heuristic picked something that became unreachable under depth caps.
      return { orderedPoints, segments, totalScore: Infinity };
    }
    totalScore += scorePath(paths[0]);
  }

  return { orderedPoints, segments, totalScore };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-WAYPOINT PATHFINDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find paths through an ordered list of waypoints.
 *
 * Waypoints = [start, ...optionalMidpoints, end]
 * Minimum: 2 waypoints (start + end).
 *
 * For each consecutive pair in the waypoint chain, BFS is run independently.
 * The results are returned as an array of SegmentResult — one per pair.
 *
 * The caller (UI) is responsible for combining segment paths into full chains
 * and rendering them.  Keeping segments separate means the UI can highlight
 * each segment individually and show the best combo.
 *
 * @param {Map} graph — from buildGraph()
 * @param {string[]} waypoints — e.g. ["Device", "Application Component", "Business Process"]
 * @param {object} options
 * @param {number} [options.maxDepth=4] — max hops per segment
 * @param {number} [options.maxPaths=5] — max paths per segment
 * @returns {SegmentResult[]}
 */
function findPaths(graph, waypoints, { maxDepth = 4, maxPaths = 5 } = {}) {
  if (!waypoints || waypoints.length < 2) {
    throw new Error("findPaths requires at least 2 waypoints (start and end).");
  }

  // Validate all waypoints exist in the graph
  for (const wp of waypoints) {
    if (!graph.has(wp)) {
      // Return an empty result rather than throwing — UI will show "no path"
      console.warn(`findPaths: element "${wp}" not found in graph (may be filtered by viewpoint).`);
    }
  }

  const segments = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to   = waypoints[i + 1];
    const paths = bfsSegment(graph, from, to, { maxDepth, maxPaths });
    segments.push({ from, to, paths });
  }

  return segments;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summarise segment results into a flat PathResult for display.
 *
 * Picks the best (lowest-score) path from each segment and stitches them
 * together into a single summary object.
 *
 * @param {string[]} waypoints
 * @param {SegmentResult[]} segments
 * @returns {PathResult|null} null if any segment has no paths
 */
function buildBestPathResult(waypoints, segments) {
  const bestPaths = [];
  let totalHops = 0;
  let derivedCount = 0;

  for (const seg of segments) {
    if (seg.paths.length === 0) return null; // No route through this segment
    const best = seg.paths[0]; // already sorted by score
    bestPaths.push(best);
    totalHops    += best.length - 1;
    derivedCount += best.filter(s => s.isDirect === false).length;
  }

  return { waypoints, segments, bestPaths, totalHops, derivedCount };
}

/**
 * Get a human-readable label for a path's relationship codes.
 * Used by the explanation panel.
 *
 * @param {string[]} codes — e.g. ["I","V"]
 * @param {boolean} isDirect
 * @returns {string} — e.g. "Assignment, Serving (direct)"
 */
function describeEdge(codes, isDirect) {
  const CODE_NAMES = {
    S:"Specialization", C:"Composition", G:"Aggregation",
    I:"Assignment",     R:"Realization", V:"Serving",
    A:"Access",         N:"Influence",   T:"Triggering",
    F:"Flow",
    // derived (lowercase) — same names, isDirect flag distinguishes them
    s:"Specialization", c:"Composition", g:"Aggregation",
    i:"Assignment",     r:"Realization", v:"Serving",
    a:"Access",         n:"Influence",   t:"Triggering",
    f:"Flow",
  };
  const names = codes.map(c => CODE_NAMES[c] ?? c).join(", ");
  return `${names} (${isDirect ? "direct" : "derived"})`;
}
