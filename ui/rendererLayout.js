// === ui/rendererLayout.js ===
/**
 * Coordinate math / layout decisions extracted from `ui/renderer.js`.
 *
 * This file intentionally defines globals (no bundler/module system).
 * See `ui/rendererCore.js` for shared geometry helpers.
 */

/**
 * Horizontal span of a vertical-compact row (main box + optional T-bone flanks). Must match drawElement(alignVertical).
 */
function nodeRowExtentVerticalCompact(pos, elementName) {
  const el = String(elementName || "");
  const left = pos.x;
  const right = pos.x + EL_W;
  if (!COMPOSITE_PATTERNS[el]) return { left, right };
  if (shouldHideCompositeIllustrations()) return { left, right };
  // Vertical compact composite: diagonal subs extend both left and right from the spine.
  return {
    left: pos.x - (EL_W + COMPOSITE_H_GAP_VERTICAL),
    right: pos.x + EL_W + COMPOSITE_H_GAP_VERTICAL + EL_W,
  };
}

/** Union of horizontal extents (spine + flanks) for all steps at main-box origin x = 0. */
function verticalLaneContentBoundsFromSteps(steps) {
  let minL = Infinity;
  let maxR = -Infinity;
  for (let i = 0; i < steps.length; i++) {
    const e = nodeRowExtentVerticalCompact({ x: 0, y: 0 }, steps[i]?.element);
    minL = Math.min(minL, e.left);
    maxR = Math.max(maxR, e.right);
  }
  if (!Number.isFinite(minL)) minL = 0;
  if (!Number.isFinite(maxR)) maxR = EL_W;
  const span = maxR - minL;
  return { minL, maxR, span };
}

/**
 * Lane column width: content span + pad, capped by MAX; never below intrinsic span (composites may exceed MAX).
 */
function verticalLaneColumnWidthPx(span) {
  // Guardrail: keep the vertical lane width bounded (prevents “horizontal figure” bleed),
  // but never crop intrinsic content width (composites/right flanks may exceed the soft cap).
  const want = span + VERTICAL_LANE_CONTENT_PAD;
  const capped = Math.min(MAX_VERTICAL_LANE_WIDTH, want);
  return Math.max(EL_W, want > MAX_VERTICAL_LANE_WIDTH ? want : capped);
}

function layoutHorizontalExtentVerticalCompact(positions, steps) {
  let minL = Infinity;
  let maxR = -Infinity;
  for (let i = 0; i < positions.length; i++) {
    const e = nodeRowExtentVerticalCompact(positions[i], steps[i]?.element);
    minL = Math.min(minL, e.left);
    maxR = Math.max(maxR, e.right);
  }
  if (!Number.isFinite(minL)) minL = 0;
  if (!Number.isFinite(maxR)) maxR = EL_W;
  return { minL, maxR };
}

function verticalSegHitsOtherNodeWithSteps(cx, yA, yB, positions, steps, exclude, srcCy, tgtCy) {
  const yLo = Math.min(yA, yB);
  const yHi = Math.max(yA, yB);
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const el = steps[i]?.element;
    const includeMain = !exclude.has(i);
    const obs = compositeObstaclesVerticalCompact(p, el, { includeMain });
    for (const o of obs) {
      if (!isCyStrictlyBetweenHopSpan((o.top + o.bottom) / 2, srcCy, tgtCy)) continue;
      if (cx < o.left || cx > o.right) continue;
      if (yHi <= o.top || yLo >= o.bottom) continue;
      return true;
    }
  }
  return false;
}

function horizontalSegHitsOtherNodeWithSteps(yM, xA, xB, positions, steps, exclude, srcCy, tgtCy) {
  const xLo = Math.min(xA, xB);
  const xHi = Math.max(xA, xB);
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const el = steps[i]?.element;
    const includeMain = !exclude.has(i);
    const obs = compositeObstaclesVerticalCompact(p, el, { includeMain });
    for (const o of obs) {
      if (!isCyStrictlyBetweenHopSpan((o.top + o.bottom) / 2, srcCy, tgtCy)) continue;
      if (yM < o.top || yM > o.bottom) continue;
      if (xHi <= o.left || xLo >= o.right) continue;
      return true;
    }
  }
  return false;
}

function compositeObstaclesVerticalCompact(pos, elementName, { includeMain = true } = {}) {
  const el = String(elementName || "");
  /** @type {{ left: number, right: number, top: number, bottom: number }[]} */
  const out = [];
  // Main box blocks unless excluded (we still want composite "decorations" to block routing).
  if (includeMain) out.push({ left: pos.x, right: pos.x + EL_W, top: pos.y, bottom: pos.y + EL_H });
  if (!COMPOSITE_PATTERNS[el]) return out;
  if (shouldHideCompositeIllustrations()) return out;
  const gapY = typeof COMPOSITE_V_GAP_VERTICAL === "number" ? COMPOSITE_V_GAP_VERTICAL : 40;
  const dy = EL_H + gapY;
  // Upper sub-element (diagonal; side depends on hop context, but for obstacles we conservatively include both sides).
  out.push({
    left: pos.x - (EL_W + COMPOSITE_H_GAP_VERTICAL),
    right: pos.x - COMPOSITE_H_GAP_VERTICAL,
    top: pos.y - dy,
    bottom: pos.y - dy + EL_H,
  });
  out.push({
    left: pos.x + EL_W + COMPOSITE_H_GAP_VERTICAL,
    right: pos.x + EL_W + COMPOSITE_H_GAP_VERTICAL + EL_W,
    top: pos.y - dy,
    bottom: pos.y - dy + EL_H,
  });
  // Lower sub-element (also diagonal).
  out.push({
    left: pos.x - (EL_W + COMPOSITE_H_GAP_VERTICAL),
    right: pos.x - COMPOSITE_H_GAP_VERTICAL,
    top: pos.y + dy,
    bottom: pos.y + dy + EL_H,
  });
  out.push({
    left: pos.x + EL_W + COMPOSITE_H_GAP_VERTICAL,
    right: pos.x + EL_W + COMPOSITE_H_GAP_VERTICAL + EL_W,
    top: pos.y + dy,
    bottom: pos.y + dy + EL_H,
  });
  return out;
}

function computeVerticalCompactBypassNeeded(positions, steps, vFrom, vTo, fromEl, toEl, hopIndex, pathStepCodes = null) {
  const a = positions[vFrom];
  const b = positions[vTo];
  const { x1, y1, x2, y2 } = layerGravityHopPorts(a, b, fromEl, toEl);
  const crossLane = a.bandId !== b.bandId;
  const exclude = new Set([vFrom, vTo]);
  const sameX = Math.abs(x1 - x2) < 0.5;
  const len = Math.abs(y2 - y1);
  const srcCy = a.cy;
  const tgtCy = b.cy;
  const applyVertStartInset = hopCodesIncludeAppendixStartMarker(pathStepCodes);

  if (crossLane) {
    if (sameX) {
      const insetStart = verticalSameColumnStartMarkerInset(len, applyVertStartInset);
      let y1s = y1;
      let y2s = y2;
      if (y1 < y2) y1s = y1 + insetStart;
      else if (y1 > y2) y1s = y1 - insetStart;
      if (verticalSegHitsOtherNodeWithSteps(x1, y1s, y2s, positions, steps, exclude, srcCy, tgtCy)) return true;
    } else {
      const ym = (y1 + y2) / 2;
      if (horizontalSegHitsOtherNodeWithSteps(ym, x1, x2, positions, steps, exclude, srcCy, tgtCy)) return true;
      if (verticalSegHitsOtherNodeWithSteps(x1, y1, ym, positions, steps, exclude, srcCy, tgtCy)) return true;
      if (verticalSegHitsOtherNodeWithSteps(x2, ym, y2, positions, steps, exclude, srcCy, tgtCy)) return true;
    }
  } else {
    if (sameX && len > 1e-6) {
      const insetStart = verticalSameColumnStartMarkerInset(len, applyVertStartInset);
      let y1s = y1;
      let y2s = y2;
      if (y1 < y2) y1s = y1 + insetStart;
      else y1s = y1 - insetStart;
      if (verticalSegHitsOtherNodeWithSteps(x1, y1s, y2s, positions, steps, exclude, srcCy, tgtCy)) return true;
    } else if (!sameX && Math.abs(y1 - y2) >= 0.5) {
      if (x2 >= x1) {
        if (verticalSegHitsOtherNodeWithSteps(x1, y1, y2, positions, steps, exclude, srcCy, tgtCy)) return true;
        if (horizontalSegHitsOtherNodeWithSteps(y2, x1, x2, positions, steps, exclude, srcCy, tgtCy)) return true;
      } else {
        if (horizontalSegHitsOtherNodeWithSteps(y1, x1, x2, positions, steps, exclude, srcCy, tgtCy)) return true;
        if (verticalSegHitsOtherNodeWithSteps(x2, y1, y2, positions, steps, exclude, srcCy, tgtCy)) return true;
      }
    }
  }
  void hopIndex;
  return false;
}

function estimateVerticalCompactOuterArcTx(positions, steps, preferWest) {
  const { minL, maxR } = layoutHorizontalExtentVerticalCompact(positions, steps);
  // Two-right-angles rule: ensure the outer bus sits far enough out that the final segment
  // into the target face can be a clearly horizontal "return elbow".
  const minReturnLegPx =
    Math.max(
      OUTER_ROUTE_BASE_GAP,
      // Must include marker clearance because the path end is inset from the target face.
      50 + (typeof ARROW_MARKER_TARGET_CLEARANCE === "number" ? ARROW_MARKER_TARGET_CLEARANCE : 0)
    );
  return preferWest ? minL - minReturnLegPx : maxR + minReturnLegPx;
}

/**
 * Approximate horizontal bounds of all vertical-compact relationship label stacks.
 * Used during layout to expand the container width so labels are never clipped by viewBox / lane bounds.
 *
 * Notes:
 * - We intentionally approximate text width using the same heuristics as `makeRelLabel`.
 * - We choose the longest candidate relationship name among codes to avoid under-sizing.
 * - This runs during layout (no SVG text measurement available here).
 *
 * @returns {{ minX: number, maxX: number }}
 */
function verticalCompactRelationshipLabelBoundsPx(pathFlatSteps, steps, positions, sortedIndices) {
  const origToVisual = new Map();
  sortedIndices.forEach((origIdx, visualIdx) => origToVisual.set(origIdx, visualIdx));

  // Include staggered outer-bypass buses (these can push labels further out than content bounds).
  const badgeStairForBounds = computeVerticalBadgeStairOffsetsByHop(pathFlatSteps, positions, sortedIndices);
  const outerByHop = computeVerticalCompactOuterArcByHop(steps, positions, pathFlatSteps, sortedIndices, badgeStairForBounds);

  let minX = Infinity;
  let maxX = -Infinity;

  const fontSize = 9.5;
  const perChar = fontSize * 0.55; // matches `makeRelLabel` approx

  for (let hop = 1; hop < pathFlatSteps.length; hop++) {
    const step = pathFlatSteps[hop];
    if (!step?.codes || !step.codes.length) continue;

    const vFrom = origToVisual.get(hop - 1);
    const vTo = origToVisual.get(hop);
    if (vFrom == null || vTo == null || vFrom === vTo) continue;

    const a = positions[vFrom];
    const b = positions[vTo];
    const fromEl = steps[vFrom]?.element;
    const toEl = steps[vTo]?.element;
    if (!a || !b || !fromEl || !toEl) continue;

    // Determine the "worst-case" label text length for this hop (longest relationship name among options).
    let maxLen = 0;
    for (const c of step.codes) {
      const U = String(c || "").toUpperCase();
      const name = (typeof RELATIONSHIPS !== "undefined" && RELATIONSHIPS && RELATIONSHIPS[U] && RELATIONSHIPS[U].name)
        ? String(RELATIONSHIPS[U].name)
        : U;
      maxLen = Math.max(maxLen, name.length);
    }
    const hasChoices = step.codes.length > 1;
    const badgeR = hasChoices ? 11 : 9;
    const textGap = Math.max(VERT_BADGE_NAME_GAP, SPINE_TEXT_GAP_AFTER_BADGE);
    /** Match makeRelLabel: flip corridor only on east straddle; west fits flip in the text↔badge gap. */
    const _flipR = 10;
    const _flipGap = 8;
    const flipCorridor = 2 * _flipGap + 2 * _flipR;
    const layoutTextW = Math.min(170, Math.max(48, maxLen * perChar + 7));

    const sameColumnVertical = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.cy - b.cy) > 1e-6;
    const straddleExtraX = sameColumnVertical ? VERT_STRADDLE_PAST_MAIN : 0;

    const outer = outerByHop.get(hop) || null;
    const anchorX = hopPortFrontCenterX(a.x, fromEl, EL_W);

    let centerX;
    let halfW;
    if (outer && Number.isFinite(outer.tx)) {
      const tx = outer.tx;
      const eastBus = tx > a.x + EL_W + 2;
      const approxWEast = 2 * badgeR + flipCorridor + VERT_BADGE_NAME_GAP + layoutTextW;
      const approxWWest = 2 * badgeR + textGap + layoutTextW;
      const approxWOuter = eastBus ? approxWEast : approxWWest;
      halfW = approxWOuter / 2;
      centerX = eastBus
        ? tx + BADGE_LINE_CLEARANCE + halfW
        : tx - BADGE_LINE_CLEARANCE - halfW;
    } else {
      const preferWest = verticalStraddleWestForCompactHop(fromEl, toEl, hop);
      const approxW = preferWest
        ? 2 * badgeR + textGap + layoutTextW
        : 2 * badgeR + flipCorridor + VERT_BADGE_NAME_GAP + layoutTextW;
      halfW = approxW / 2;
      centerX = preferWest
        ? anchorX - straddleExtraX - BADGE_LINE_CLEARANCE - halfW
        : anchorX + straddleExtraX + BADGE_LINE_CLEARANCE + halfW;
    }

    const left = centerX - halfW;
    const right = centerX + halfW;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
  }

  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(maxX)) maxX = 0;
  return { minX, maxX };
}

/**
 * Badge horizontal staircase offsets (same-band hops) — must match {@link renderVerticalCompactDiagram}.
 * @returns {Map<number, number>}
 */
function computeVerticalBadgeStairOffsetsByHop(pathFlatSteps, positions, sortedIndices) {
  const origToVisual = new Map();
  sortedIndices.forEach((origIdx, visualIdx) => origToVisual.set(origIdx, visualIdx));
  const badgeOffsetByHop = new Map();
  const BADGE_STAIR_STEP_PX = 15;
  const BADGE_STAIR_MAX_Y_GAP = Math.max(24, Math.ceil(EL_H * 0.65));
  const verticalHopRows = [];
  for (let hop = 1; hop < pathFlatSteps.length; hop++) {
    const step = pathFlatSteps[hop];
    if (!step.codes) continue;
    const vFrom = origToVisual.get(hop - 1);
    const vTo = origToVisual.get(hop);
    if (vFrom == null || vTo == null || vFrom === vTo) continue;
    const a = positions[vFrom];
    const b = positions[vTo];
    verticalHopRows.push({
      hop,
      rawY: (a.cy + b.cy) / 2,
      fromBand: a.bandId,
      toBand: b.bandId,
    });
  }
  verticalHopRows.sort((p, q) => p.rawY - q.rawY);
  let prevBadgeSeq = null;
  for (const row of verticalHopRows) {
    const sameBandSeq = row.fromBand === row.toBand;
    if (
      prevBadgeSeq &&
      sameBandSeq &&
      prevBadgeSeq.sameBandSeq &&
      Math.abs(row.rawY - prevBadgeSeq.rawY) <= BADGE_STAIR_MAX_Y_GAP
    ) {
      badgeOffsetByHop.set(row.hop, prevBadgeSeq.offset + BADGE_STAIR_STEP_PX);
    } else {
      badgeOffsetByHop.set(row.hop, 0);
    }
    prevBadgeSeq = { rawY: row.rawY, sameBandSeq, offset: badgeOffsetByHop.get(row.hop) || 0 };
  }
  return badgeOffsetByHop;
}

/**
 * Same-column vertical hops with badge stair offsets: east straddle + fixed spine x fights clearance — prefer outer bypass.
 */
function badgeStairWantsOuterBypass(positions, steps, vFrom, vTo, hop, badgeOffsetByHop) {
  if (!badgeOffsetByHop || (badgeOffsetByHop.get(hop) || 0) === 0) return false;
  const a = positions[vFrom];
  const b = positions[vTo];
  if (!a || !b || a.bandId !== b.bandId) return false;
  const fromEl = steps[vFrom]?.element;
  const toEl = steps[vTo]?.element;
  const { x1, x2 } = layerGravityHopPorts(a, b, fromEl, toEl);
  return Math.abs(x1 - x2) < 0.5;
}

/**
 * Per-hop outer C-shape: side ports at main-box faces, bus at tx. Stagger parallel east/west bypasses.
 * @param {Map<number, number>|null} [badgeOffsetByHop] Optional staircase offsets — when non-zero on same-column same-band hops, triggers bypass over straddle nudging.
 * @returns {Map<number, { tx: number, sx: number, sy: number, ex: number, ey: number }>}
 */
function computeVerticalCompactOuterArcByHop(steps, positions, pathFlatSteps, sortedIndices, badgeOffsetByHop = null) {
  const origToVisual = new Map();
  sortedIndices.forEach((origIdx, visualIdx) => origToVisual.set(origIdx, visualIdx));
  const { minL, maxR } = layoutHorizontalExtentVerticalCompact(positions, steps);

  const pending = [];
  // Strict alternation for bypass routing (removes "least congestion" / heuristic scoring).
  // First bypass encountered in hop sequence goes West, second East, then West, etc.
  let bypassSeq = 0;
  for (let hop = 1; hop < pathFlatSteps.length; hop++) {
    const step = pathFlatSteps[hop];
    if (!step?.codes) continue;
    const vFrom = origToVisual.get(hop - 1);
    const vTo = origToVisual.get(hop);
    if (vFrom == null || vTo == null || vFrom === vTo) continue;
    const fromEl = steps[vFrom].element;
    const toEl = steps[vTo].element;
    const needGeomBypass = computeVerticalCompactBypassNeeded(positions, steps, vFrom, vTo, fromEl, toEl, hop, step.codes);
    const needStairBypass = badgeStairWantsOuterBypass(positions, steps, vFrom, vTo, hop, badgeOffsetByHop);
    const a = positions[vFrom];
    const b = positions[vTo];
    const crossLane = a.bandId !== b.bandId;
    const { x1: xA, x2: xB } = layerGravityHopPorts(a, b, fromEl, toEl);
    const sameColumn = Math.abs(xA - xB) < 0.5;
    // Obstacle hits are rare on a clean single-column layer stack (segments sit in band gaps). Without a
    // bypass, every hop shares one spine x — connectors and labels collapse visually. Stagger when the
    // path has multiple steps so routes alternate west/east like the original H–V–H outer-track design.
    const needAestheticStagger =
      pathFlatSteps.length >= 3 && crossLane && sameColumn;
    if (!needGeomBypass && !needStairBypass && !needAestheticStagger) continue;
    const preferWest = (bypassSeq % 2) === 0;
    bypassSeq++;
    pending.push({ hop, preferWest, vFrom, vTo });
  }

  const map = new Map();
  // Index-based stagger: when a hop between two cross-band segments is routed on the center spine (no
  // pending entry), west/west hops are no longer adjacent in the westIx counter — separate counters
  // could both use offset 0 and overlap. One slot per bypass keeps every outer track distinct.
  for (let pi = 0; pi < pending.length; pi++) {
    const p = pending[pi];
    const stagger = pi * OUTER_ROUTE_STAGGER_PX;
    // Two-right-angles rule: the bus must be far enough out that the final horizontal leg
    // into the target side is at least 50px after applying marker clearance.
    const minReturnLegPx =
      Math.max(
        OUTER_ROUTE_BASE_GAP,
        50 + (typeof ARROW_MARKER_TARGET_CLEARANCE === "number" ? ARROW_MARKER_TARGET_CLEARANCE : 0)
      );
    const tx = p.preferWest
      ? minL - minReturnLegPx - stagger
      : maxR + minReturnLegPx + stagger;
    const a = positions[p.vFrom];
    const b = positions[p.vTo];
    const fromEl = steps[p.vFrom].element;
    const toEl = steps[p.vTo].element;
    const eastBus = !p.preferWest;
    const sx = eastBus ? hopPortRightEdgeX(a.x, fromEl, EL_W) : hopPortLeftEdgeX(a.x, fromEl, EL_W);
    const ex = eastBus ? hopPortRightEdgeX(b.x, toEl, EL_W) : hopPortLeftEdgeX(b.x, toEl, EL_W);
    const sy = hopPortFrontMidY(a.y, fromEl, EL_H);
    const ey = hopPortFrontMidY(b.y, toEl, EL_H);
    map.set(p.hop, { tx, sx, sy, ex, ey });
  }
  return map;
}

/** Rough outer-bus X for layout scoring (no stagger). */
function computeVerticalCompactOuterArcTrackX(positions, steps, vFrom, vTo, fromEl, toEl, hopIndex, pathStepCodes = null) {
  if (!computeVerticalCompactBypassNeeded(positions, steps, vFrom, vTo, fromEl, toEl, hopIndex, pathStepCodes)) return null;
  return estimateVerticalCompactOuterArcTx(
    positions,
    steps,
    verticalStraddleWestForCompactHop(fromEl, toEl, hopIndex)
  );
}

function getScaffoldBandId(layerId) {
  const L = layerId === "Implementation & Migration" ? "Implementation" : layerId;
  if (L === "Motivation" || L === "Strategy") return "top";
  if (L === "Business") return "midUpper";
  if (L === "Application") return "midLower";
  if (L === "Technology") return "bottom";
  if (L === "Implementation") return "impl";
  return "midUpper";
}

/**
 * Shared layout for vertical compact diagrams (same geometry as Compact + Vertical).
 * Used by renderSwimlane (vertical); lane bands optional via showLaneBands.
 * Y positions follow fixed ArchiMate layer gravity, while X preserves path order.
 */
function computeVerticalCompactLayout(flatSteps) {
  if (!flatSteps.length) return null;

  const steps = flatSteps.map((s) => ({ ...s }));
  const sortedIndices = steps.map((_, i) => i);
  const bandByStep = flatSteps.map((step, i) => getScaffoldBandId(getSwimlaneLayer(step.element, i, flatSteps)));
  const usedBandIds = [...new Set(bandByStep)];
  const usedBands = SCAFFOLD_BANDS.filter((band) => usedBandIds.includes(band.id));
  if (usedBands.length === 0) return null;

  const laneHeightsById = {};
  const bandCounts = {};
  bandByStep.forEach((bid) => { bandCounts[bid] = (bandCounts[bid] ?? 0) + 1; });
  const bandInnerPad = 14;
  const pathFlow =
    typeof window !== "undefined" && window.state ? window.state.pathFlow : "horizontal";
  // Compact UI / orthogonal compact path: no illustrated composite subs — skip extra lane spacing.
  const showSubsForLayout = !shouldHideCompositeIllustrations() && pathFlow !== "compact";
  const sameBandStepGapBase = Math.max(24, Math.ceil(EL_H * 0.58));
  // Diagonal composite subs extend below the parent; ensure rows have enough clearance to avoid overlaps.
  const sameBandStepGap = showSubsForLayout
    ? Math.max(sameBandStepGapBase, EL_H + COMPOSITE_V_GAP_VERTICAL)
    : sameBandStepGapBase;

  // Reserve headroom so diagonal composite sub-elements stay inside their lane bands.
  const bandTopHeadroomById = {};
  const bandBottomHeadroomById = {};
  for (const bid of usedBandIds) {
    bandTopHeadroomById[bid] = 0;
    bandBottomHeadroomById[bid] = 0;
  }
  const firstIndexByBand = {};
  const lastIndexByBand = {};
  for (let i = 0; i < flatSteps.length; i++) {
    const bid = bandByStep[i];
    if (firstIndexByBand[bid] == null) firstIndexByBand[bid] = i;
    lastIndexByBand[bid] = i;
  }
  if (showSubsForLayout) {
    const headroom = EL_H + COMPOSITE_V_GAP_VERTICAL;
    for (const bid of usedBandIds) {
      const fi = firstIndexByBand[bid];
      const li = lastIndexByBand[bid];
      if (fi != null && COMPOSITE_PATTERNS[flatSteps[fi]?.element]) bandTopHeadroomById[bid] = headroom;
      if (li != null && COMPOSITE_PATTERNS[flatSteps[li]?.element]) bandBottomHeadroomById[bid] = headroom;
    }
  }

  for (const bid of usedBandIds) {
    const count = bandCounts[bid] ?? 0;
    // Base: uniform gaps + extra "headroom" gaps before composites (incoming hop protection).
    const baseGaps = Math.max(0, count - 1) * sameBandStepGap;
    let extraBeforeComposite = 0;
    if (count > 1) {
      let seen = 0;
      for (let i = 0; i < flatSteps.length; i++) {
        if (bandByStep[i] !== bid) continue;
        const isComposite = !!COMPOSITE_PATTERNS[flatSteps[i]?.element];
        if (seen > 0 && isComposite) extraBeforeComposite += sameBandStepGap;
        seen++;
      }
    }
    const topHeadroom = bandTopHeadroomById[bid] ?? 0;
    const bottomHeadroom = bandBottomHeadroomById[bid] ?? 0;
    const stackH = count > 0
      ? (2 * bandInnerPad) + topHeadroom + bottomHeadroom + count * EL_H + baseGaps + extraBeforeComposite
      : 0;
    laneHeightsById[bid] = Math.max(LANE_H_MIN, stackH);
  }

  const topPad = 20;
  const bottomPad = 40;
  const { minL: relMin, maxR: relMax, span: contentSpan } = verticalLaneContentBoundsFromSteps(steps);
  const laneCoreW = verticalLaneColumnWidthPx(contentSpan);
  /** Tight side margin for hop labels / outer routing (vertical aspect ratio). */
  const labelSideReserve = Math.min(72, Math.max(32, Math.floor(VERT_LABEL_TEXT_RESERVE * 0.26)));
  const hasComposite =
    showSubsForLayout && steps.some((s) => !!COMPOSITE_PATTERNS[s?.element]);
  const compositeRightFlankW = hasComposite ? (COMPOSITE_H_GAP + EL_W) : 0;
  const leftPad = labelSideReserve;
  const spineX = leftPad + (laneCoreW - contentSpan) / 2 - relMin;
  const laneMetrics = {};
  let currentY = topPad;
  usedBands.forEach((band) => {
    const laneH = laneHeightsById[band.id] ?? LANE_H_MIN;
    laneMetrics[band.id] = { y: currentY, h: laneH, center: currentY + laneH / 2 };
    currentY += laneH;
  });
  const stepIndexByBand = {};
  const nextYByBand = {};

  const positions = flatSteps.map((step, i) => {
    const bandId = bandByStep[i];
    const m = laneMetrics[bandId];
    const slot = stepIndexByBand[bandId] ?? 0;
    stepIndexByBand[bandId] = slot + 1;
    const isComposite = !!COMPOSITE_PATTERNS[step?.element];
    const baseY = nextYByBand[bandId] ?? (m.y + bandInnerPad + (bandTopHeadroomById[bandId] ?? 0));
    // Dynamic headroom: double the gap *before* a composite parent (if it is not the first in its band).
    const y = (slot > 0 && isComposite) ? (baseY + sameBandStepGap) : baseY;
    nextYByBand[bandId] = y + EL_H + sameBandStepGap;
    const x = spineX;
    return { x, y, cy: y + EL_H / 2, cx: x + EL_W / 2, bandId };
  });

  /** Only reserve east-side bypass track width when at least one hop actually uses an outer C-route. */
  const badgeOffsetByHopForPad = computeVerticalBadgeStairOffsetsByHop(flatSteps, positions, sortedIndices);
  const outerArcByHopForPad = computeVerticalCompactOuterArcByHop(steps, positions, flatSteps, sortedIndices, badgeOffsetByHopForPad);
  let bypassTrackW = 0;
  if (outerArcByHopForPad.size > 0) {
    // East-side buses use slot index 0…n−1; reserve enough width for the furthest track (see computeVerticalCompactOuterArcByHop).
    bypassTrackW =
      OUTER_ROUTE_BASE_GAP + Math.max(0, outerArcByHopForPad.size - 1) * OUTER_ROUTE_STAGGER_PX;
  }
  const rightPad = labelSideReserve + compositeRightFlankW + bypassTrackW + 40;

  // Expand container width based on furthest relationship label reach (east/west),
  // plus a global safety buffer so text never kisses lane/viewBox edges.
  let totalW = leftPad + laneCoreW + rightPad;
  try {
    const { minX, maxX } = verticalCompactRelationshipLabelBoundsPx(flatSteps, steps, positions, sortedIndices);
    const pad = 20;
    const needLeft = Math.max(0, -(minX - pad));
    const needRight = Math.max(0, (maxX + pad) - totalW);
    if (needLeft > 0.5) {
      for (const p of positions) {
        p.x += needLeft;
        p.cx += needLeft;
      }
    }
    // After shifting for west overflow, recompute the required lane width so lane boundaries track labels.
    // Use union of node row extents (relMin/relMax) and estimated label stacks — do not double the east reach.
    const spineXAbs = spineX + needLeft;
    const minXAbs = minX + needLeft;
    const maxXAbs = maxX + needLeft;
    const nodeLeftAbs = spineXAbs + relMin;
    const nodeRightAbs = spineXAbs + relMax;
    const sceneLeft = Math.min(minXAbs - pad, nodeLeftAbs);
    const sceneRight = Math.max(maxXAbs + pad, nodeRightAbs);
    const sceneSpan = sceneRight - sceneLeft;
    const laneWidthByLabels = Math.max(laneCoreW, sceneSpan);
    totalW = Math.max(totalW + needLeft + needRight, leftPad + laneWidthByLabels + rightPad);
  } catch (_) {
    // Layout must remain robust even if relationship metadata is missing.
  }
  const totalH = currentY + bottomPad;

  return {
    steps,
    positions,
    totalW,
    totalH,
    sortedIndices,
    pathFlatSteps: flatSteps,
    usedBands,
    laneMetrics,
    laneOrientation: "rows",
  };
}

/**
 * Vertical swimlanes (rotated lanes): layer lanes as vertical columns.
 * Path still flows top-to-bottom; cross-layer hops move between columns.
 */
function computeVerticalRotatedLaneLayout(flatSteps) {
  if (!flatSteps.length) return null;

  const steps = flatSteps.map((s) => ({ ...s }));
  const sortedIndices = steps.map((_, i) => i);
  const bandByStep = flatSteps.map((step, i) => getScaffoldBandId(getSwimlaneLayer(step.element, i, flatSteps)));
  const usedBandIds = [...new Set(bandByStep)];
  const usedBands = SCAFFOLD_BANDS.filter((band) => usedBandIds.includes(band.id));
  if (usedBands.length === 0) return null;

  const bandCounts = {};
  bandByStep.forEach((bid) => { bandCounts[bid] = (bandCounts[bid] ?? 0) + 1; });

  const topPad = 70;
  const bottomPad = 40;
  const leftPad = 50;
  const rightPad = 50;
  const bandInnerPad = 14;
  /** Space below lane band top for {@link drawSwimlaneColumnLabel} (clip height 34px) before first node. */
  const columnLaneLabelTopReserve = 40;
  const sameBandStepGap = Math.max(24, Math.ceil(EL_H * 0.58));
  const laneGap = 36;
  const { span: contentSpan } = verticalLaneContentBoundsFromSteps(steps);
  const laneWidth = verticalLaneColumnWidthPx(contentSpan);

  const laneHeightsById = {};
  for (const bid of usedBandIds) {
    const count = bandCounts[bid] ?? 0;
    const stackH = count > 0
      ? columnLaneLabelTopReserve + (2 * bandInnerPad) + count * EL_H + Math.max(0, count - 1) * sameBandStepGap
      : 0;
    laneHeightsById[bid] = Math.max(LANE_H_MIN, stackH);
  }

  const laneMetrics = {};
  let currentX = leftPad;
  let maxLaneH = LANE_H_MIN;
  usedBands.forEach((band) => {
    const laneH = laneHeightsById[band.id] ?? LANE_H_MIN;
    maxLaneH = Math.max(maxLaneH, laneH);
    laneMetrics[band.id] = {
      x: currentX,
      y: topPad,
      w: laneWidth,
      h: laneH,
      centerX: currentX + laneWidth / 2,
    };
    currentX += laneWidth + laneGap;
  });

  const stepIndexByBand = {};
  const positions = flatSteps.map((step, i) => {
    const bandId = bandByStep[i];
    const m = laneMetrics[bandId];
    const slot = stepIndexByBand[bandId] ?? 0;
    stepIndexByBand[bandId] = slot + 1;
    const x = m.x + (m.w - EL_W) / 2;
    const y = m.y + bandInnerPad + columnLaneLabelTopReserve + slot * (EL_H + sameBandStepGap);
    return { x, y, cy: y + EL_H / 2, cx: x + EL_W / 2, bandId };
  });

  const totalW = currentX - laneGap + rightPad;
  const totalH = topPad + maxLaneH + bottomPad;

  return {
    steps,
    positions,
    totalW,
    totalH,
    sortedIndices,
    pathFlatSteps: flatSteps,
    usedBands,
    laneMetrics,
    laneOrientation: "columns",
  };
}

function estimateVerticalHopLabelRect(a, b, fromEl, toEl, hop, outerArcTxOrShape = null, pathStepCodes = null) {
  const { x1, y1, x2, y2 } = layerGravityHopPorts(a, b, fromEl, toEl);
  const crossLane = a.bandId !== b.bandId;
  const westByDirection = !crossLane && b.x < a.x;
  const verticalStraddleWest = westByDirection || verticalStraddleWestForCompactHop(fromEl, toEl, hop);
  const sameX = Math.abs(x1 - x2) < 0.5;
  const sameColumnVertical = sameX && Math.abs(y2 - y1) > 1e-6;
  const outerBypassShape =
    outerArcTxOrShape != null &&
    typeof outerArcTxOrShape === "object" &&
    outerArcTxOrShape.tx != null;
  const arcTx = outerBypassShape
    ? outerArcTxOrShape.tx
    : outerArcTxOrShape;
  const sameColumnOuter =
    outerArcTxOrShape != null &&
    typeof outerArcTxOrShape === "object" &&
    Number.isFinite(outerArcTxOrShape.sx) &&
    Number.isFinite(outerArcTxOrShape.ex) &&
    Math.abs(outerArcTxOrShape.sx - outerArcTxOrShape.ex) < 0.5;
  const straddleExtraX =
    outerBypassShape
      ? 0
      : sameColumnVertical || sameColumnOuter
        ? VERT_STRADDLE_PAST_MAIN
        : 0;
  /** Match drawArrow same-column vertical inset so nudge / viewBox estimates align with rendered labels. */
  const lenPorts = Math.abs(y2 - y1);
  let ySegLo = Math.min(y1, y2);
  let ySegHi = Math.max(y1, y2);
  if (sameColumnVertical && !outerBypassShape && !sameColumnOuter && lenPorts > 1e-6) {
    const applyVertStartInset = hopCodesIncludeAppendixStartMarker(pathStepCodes);
    const insetStart = verticalSameColumnStartMarkerInset(lenPorts, applyVertStartInset);
    let y1s = y1;
    let y2s = y2;
    if (y1 < y2) y1s = y1 + insetStart;
    else if (y1 > y2) y1s = y1 - insetStart;
    ySegLo = Math.min(y1s, y2s);
    ySegHi = Math.max(y1s, y2s);
  }
  const baseY =
    outerArcTxOrShape != null &&
    typeof outerArcTxOrShape === "object" &&
    Number.isFinite(outerArcTxOrShape.sy) &&
    Number.isFinite(outerArcTxOrShape.ey)
      ? (outerArcTxOrShape.sy + outerArcTxOrShape.ey) / 2
      : sameColumnVertical && !outerBypassShape
        ? (ySegLo + ySegHi) / 2
        : ((y1 + y2) / 2) + (crossLane ? (y2 > y1 ? -4 : 4) : 0);
  const stackHalfW = 66;
  const stackHalfH = 16;
  const columnAnchorX = arcTx != null ? arcTx : x1;
  let stackCenterX;
  if (outerBypassShape) {
    const tx = outerArcTxOrShape.tx;
    const eastBus = tx > a.x + EL_W + 2;
    stackCenterX = eastBus
      ? tx + BADGE_LINE_CLEARANCE + stackHalfW
      : tx - BADGE_LINE_CLEARANCE - stackHalfW;
  } else {
    stackCenterX = verticalStraddleWest
      ? columnAnchorX - straddleExtraX - BADGE_LINE_CLEARANCE - stackHalfW
      : columnAnchorX + straddleExtraX + BADGE_LINE_CLEARANCE + stackHalfW;
  }
  return {
    hop,
    x: stackCenterX,
    y: baseY,
    w: stackHalfW * 2,
    h: stackHalfH * 2,
  };
}

function boxOverlap(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx < (a.w + b.w) / 2 && dy < (a.h + b.h) / 2;
}

function scoreVerticalLayoutReadability(layout, flatSteps) {
  if (!layout) return Number.POSITIVE_INFINITY;
  const { positions, steps } = layout;
  let score = 0;

  const labels = [];
  for (let hop = 1; hop < flatSteps.length; hop++) {
    const step = flatSteps[hop];
    if (!step?.codes) continue;
    const a = positions[hop - 1];
    const b = positions[hop];
    const fromEl = steps[hop - 1].element;
    const toEl = steps[hop].element;
    const arcX = computeVerticalCompactOuterArcTrackX(positions, steps, hop - 1, hop, fromEl, toEl, hop, step.codes);
    labels.push(estimateVerticalHopLabelRect(a, b, fromEl, toEl, hop, arcX, step.codes));
  }

  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (boxOverlap(labels[i], labels[j])) score += 40;
    }
  }

  for (const lab of labels) {
    for (const pos of positions) {
      const nodeRect = { x: pos.x + EL_W / 2, y: pos.y + EL_H / 2, w: EL_W, h: EL_H };
      if (boxOverlap(lab, nodeRect)) score += 28;
    }
  }

  for (let i = 1; i < positions.length; i++) {
    const gap = Math.abs(positions[i].cy - positions[i - 1].cy) - EL_H;
    if (gap < 20) score += 6;
  }

  if (layout.laneOrientation === "columns") score += 2;
  return score;
}

function computeVerticalLabelNudges(pathFlatSteps, steps, positions, sortedIndices, badgeOffsetByHop, outerArcTrackByHop = null) {
  const origToVisual = new Map();
  sortedIndices.forEach((origIdx, visualIdx) => origToVisual.set(origIdx, visualIdx));
  const nudgesByHop = new Map();
  const placed = [];
  const candidates = [
    { x: 0, y: 0 },
    { x: 12, y: -8 },
    { x: 12, y: 8 },
    { x: 24, y: -14 },
    { x: 24, y: 14 },
    { x: 36, y: 0 },
  ];
  /** Outer bypass: resolve overlaps by Y only — horizontal nudges fight the fixed tx ± clearance badge anchor. */
  const outerVerticalCandidates = [
    { x: 0, y: 0 },
    { x: 0, y: -8 },
    { x: 0, y: 8 },
    { x: 0, y: -14 },
    { x: 0, y: 14 },
    { x: 0, y: -20 },
    { x: 0, y: 20 },
  ];

  const rows = [];
  for (let hop = 1; hop < pathFlatSteps.length; hop++) {
    const step = pathFlatSteps[hop];
    if (!step?.codes) continue;
    const vFrom = origToVisual.get(hop - 1);
    const vTo = origToVisual.get(hop);
    if (vFrom == null || vTo == null || vFrom === vTo) continue;
    const a = positions[vFrom];
    const b = positions[vTo];
    const fromEl = steps[vFrom].element;
    const toEl = steps[vTo].element;
    const arcX = outerArcTrackByHop?.get(hop) ?? null;
    const base = estimateVerticalHopLabelRect(a, b, fromEl, toEl, hop, arcX, step.codes);
    base.x += badgeOffsetByHop.get(hop) || 0;
    rows.push(base);
  }

  rows.sort((u, v) => (u.y - v.y) || (u.x - v.x) || (u.hop - v.hop));
  for (const row of rows) {
    const hop = row.hop;
    const vFrom = origToVisual.get(hop - 1);
    const vTo = origToVisual.get(hop);
    const a = positions[vFrom];
    const outerShape = outerArcTrackByHop?.get(hop);
    const isOuterBypass =
      outerShape != null && typeof outerShape === "object" && outerShape.tx != null;
    const cands = isOuterBypass ? outerVerticalCandidates : candidates;
    let chosen = cands[cands.length - 1];
    for (const c of cands) {
      const probe = {
        x: row.x + c.x,
        y: row.y + c.y,
        w: row.w,
        h: row.h,
      };
      if (!placed.some((p) => boxOverlap(probe, p))) {
        chosen = c;
        break;
      }
    }
    if (!isOuterBypass) {
      const spineCx = a.x + EL_W / 2;
      const targetX = row.x + chosen.x;
      const lo = spineCx - SPINE_LABEL_MAX_NUDGE_X;
      const hi = spineCx + SPINE_LABEL_MAX_NUDGE_X;
      let nx = chosen.x;
      if (targetX < lo) nx += lo - targetX;
      if (targetX > hi) nx -= targetX - hi;
      chosen = { x: nx, y: chosen.y };
    }
    nudgesByHop.set(row.hop, chosen);
    placed.push({
      x: row.x + chosen.x,
      y: row.y + chosen.y,
      w: row.w,
      h: row.h,
    });
  }
  return nudgesByHop;
}

