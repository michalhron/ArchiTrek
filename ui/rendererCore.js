// === ui/rendererCore.js ===
/**
 * Shared renderer helpers (geometry + port math) extracted from `ui/renderer.js`.
 *
 * Load order (index.html):
 *   data/rendererVisuals.js → ui/rendererCore.js → ui/rendererLayout.js → ui/renderer.js
 *
 * This file intentionally defines globals (no bundler/module system).
 */

/**
 * Top Y of the layout bounding box. 3D cubes draw a roof at this Y; connectors must use the bbox edge,
 * not the inner front-face band, so lines do not pierce the roof.
 */
function hopPortFrontTopY(y, _elementName, _h) {
  return y;
}

function hopPortFrontBottomY(y, _elementName, h) {
  return y + h;
}

/** Horizontal center of the layout bounding box (matches EL_W cell). */
function hopPortFrontCenterX(x, _elementName, w) {
  return x + w / 2;
}

/** Outermost right X of the bbox (cube right wall is at x+w, not the inset front face). */
function hopPortRightEdgeX(x, _elementName, w) {
  return x + w;
}

function hopPortLeftEdgeX(x, _elementName, _w) {
  return x;
}

/** Mid-Y on the layout bounding box for east/west ports. */
function hopPortFrontMidY(y, _elementName, h) {
  return y + h / 2;
}

/** Distance path end is shortened from the target face so marker-end is not covered by node fill/stroke. */
const ARROW_MARKER_TARGET_CLEARANCE = 6;

/**
 * Minimum horizontal gap between the relationship stroke (spine or outer bus at tx) and the numbered badge
 * so the circle + stroke never visually merge.
 */
const BADGE_LINE_CLEARANCE = 10;

/** Max horizontal drift of spine-column label stack from column center (same-column / non-bypass hops). */
const SPINE_LABEL_MAX_NUDGE_X = 40;

/**
 * When true, composite elements render as a single main box (no illustrated sub-components).
 * Reasons: user toggle off, or pathFlow "compact" (orthogonal compact lanes keep a single-row layout).
 */
function shouldHideCompositeIllustrations() {
  if (typeof window === "undefined") return false;
  const s = window.state;
  if (!s) return false;
  if (s.showCompositeSubs === false) return true;
  if (s.pathFlow === "compact") return true;
  return false;
}

/**
 * Absolute layout bounding box for connector math (matches EL_W × EL_H cell; 3D cubes use full bbox, not inner front face).
 * @returns {{ top: number, bottom: number, left: number, right: number, cx: number, midY: number }}
 */
function layoutElementBBox(pos, w = EL_W, h = EL_H) {
  return {
    top: pos.y,
    bottom: pos.y + h,
    left: pos.x,
    right: pos.x + w,
    cx: pos.x + w / 2,
    midY: pos.y + h / 2,
  };
}

/**
 * Y of the visible front bottom edge for cube/Facility nodes (isometric base), not the layout bbox bottom.
 * Matches {@link DEPTH_3D_Y_PX} / drawShape `cube`.
 */
function hopCubePerspectiveBottomY(posY, elementName, h = EL_H) {
  const el = String(elementName || "");
  const cube = typeof SHAPES !== "undefined" && SHAPES[el]?.type === "cube";
  const d =
    cube && typeof DEPTH_3D_Y_PX === "number"
      ? DEPTH_3D_Y_PX
      : 0;
  return posY + h - d;
}

/**
 * Vertical compact: hops **into** a flanked-composite step (Communication Network, Path, collaborations)
 * place relationship notes west of the spine so they do not cover the right-hand illustration box;
 * hops **out** use the default east straddle. Two wide steps in a row alternate by hop index.
 */
function verticalStraddleWestForCompactHop(prevEl, curEl, hopIndex) {
  const srcP = COMPOSITE_PATTERNS[prevEl];
  const tgtP = COMPOSITE_PATTERNS[curEl];
  const srcWide = !!srcP;
  const tgtWide = !!tgtP;
  // West straddle only when entering a flanked-composite row (labels must clear illustration boxes).
  if (tgtWide && !srcWide) return true;
  if (srcWide && tgtWide && typeof hopIndex === "number" && Number.isFinite(hopIndex)) {
    return (hopIndex % 2) === 1;
  }
  if (srcWide && !tgtWide) return false;
  // Ordinary hops: keep labels east of the spine for consistent, tight placement.
  return false;
}

/** True if otherCy is strictly between source/target row centers (excludes adjacent path rows). */
function isCyStrictlyBetweenHopSpan(otherCy, srcCy, tgtCy) {
  const minY = Math.min(srcCy, tgtCy);
  const maxY = Math.max(srcCy, tgtCy);
  const half = EL_H / 2;
  return minY + half < otherCy && otherCy < maxY - half;
}

/**
 * Layer id from logic/graph.js ELEMENTS — does not depend on ui/renderer.js `getLayer` (load order safe).
 * Normalizes UI/waypoint aliases to the ids used by LAYERS / scaffold bands.
 */
function registryElementLayerForSwimlane(elementName) {
  const el = String(elementName || "").trim();
  let layer = "Unknown";
  if (typeof getElementLayer === "function") {
    layer = getElementLayer(el);
  } else if (typeof ELEMENTS !== "undefined" && ELEMENTS?.[el]) {
    layer = ELEMENTS[el].layer ?? "Unknown";
  }
  if (layer === "Implementation & Migration") layer = "Implementation";
  if (layer === "Physical") layer = "Technology";
  return layer;
}

/**
 * Swimlane band placement: there is no separate “composition layer” in the ArchiMate layer stack.
 * Location and Grouping are registered with layer "Composite" for filtering, but in swimlanes they
 * should sit in the lane of an adjacent non-Composite step (or Business as a last resort).
 */
function getSwimlaneLayer(elementName, index, flatSteps) {
  const raw = registryElementLayerForSwimlane(elementName);
  if (raw !== "Composite") return raw;
  for (let j = index - 1; j >= 0; j--) {
    const L = registryElementLayerForSwimlane(flatSteps[j].element);
    if (L !== "Composite") return L;
  }
  for (let j = index + 1; j < flatSteps.length; j++) {
    const L = registryElementLayerForSwimlane(flatSteps[j].element);
    if (L !== "Composite") return L;
  }
  return "Business";
}

/**
 * Connector endpoints for horizontal swimlanes. Same grid column + different layer: top/bottom centers
 * (straight vertical). Otherwise: right-center → left-center for east–west hops (including H–V–H cross-layer).
 *
 * Same-column vertical hops are mainly used in compact swimlanes when a column holds at most two stacked
 * layers; spread mode assigns a distinct column per step so cross-layer links are usually east–west.
 *
 * @param {number|undefined} [laneAlignedY] Mean main-box mid-Y for this swimlane row (same-layer hops only).
 *        When set, both endpoints share this Y so consecutive horizontal hops align even if composites
 *        shift individual boxes within the lane.
 */
function horizontalSwimlaneHopPorts(a, b, compactPacking, fromEl, toEl, laneAlignedY) {
  void fromEl;
  void toEl;
  const c = ARROW_MARKER_TARGET_CLEARANCE;
  const A = layoutElementBBox(a);
  const B = layoutElementBBox(b);
  // Same grid column + different layer row: straight vertical between top/bottom centers (compact stacks).
  {
    const sameCol = Math.abs(a.x - b.x) < 1;
    const cxA = A.cx;
    const cxB = B.cx;
    if (sameCol && Math.abs(a.cy - b.cy) > 2) {
      const cx = (cxA + cxB) / 2;
      if (a.cy > b.cy) {
        const y2 = hopCubePerspectiveBottomY(b.y, toEl, EL_H) + c;
        return { x1: cx, y1: A.top, x2: cx, y2 };
      }
      if (a.cy < b.cy) {
        const y2 = B.top - c;
        return { x1: cx, y1: A.bottom, x2: cx, y2 };
      }
    }
  }
  let x2 = B.left;
  const spanH = Math.abs(x2 - A.right);
  if (spanH > c) x2 += Math.sign(A.right - x2) * c;
  let y1 = A.midY;
  let y2 = B.midY;
  const sameLaneRow =
    laneAlignedY != null &&
    Number.isFinite(laneAlignedY) &&
    a.cy != null &&
    b.cy != null &&
    Math.abs(a.cy - b.cy) < 0.5;
  if (sameLaneRow) {
    const lo = Math.max(A.top + c, B.top + c);
    const hi = Math.min(A.bottom - c, B.bottom - c);
    const y =
      lo <= hi
        ? Math.min(Math.max(laneAlignedY, lo), hi)
        : (A.midY + B.midY) / 2;
    y1 = y2 = y;
  }
  return {
    x1: A.right,
    y1,
    x2,
    y2,
  };
}

function swimlaneCompositeAggGapY() {
  return typeof COMPOSITE_V_GAP_VERTICAL === "number" ? COMPOSITE_V_GAP_VERTICAL : 40;
}

/**
 * Bounding rect for obstacle tests: main box, or full swimlane diagonal-composite footprint (subs below).
 */
function swimlaneObstacleRectForStep(pos, elementName, swimlaneDiagSubs) {
  const base = layoutElementBBox(pos);
  const el = String(elementName || "");
  if (!swimlaneDiagSubs || !COMPOSITE_PATTERNS[el]) return base;
  const gapY = swimlaneCompositeAggGapY();
  const gapX = typeof COMPOSITE_H_GAP_VERTICAL === "number" ? COMPOSITE_H_GAP_VERTICAL : COMPOSITE_H_GAP;
  const dx = EL_W + gapX;
  const dy = EL_H + gapY;
  return {
    left: pos.x - dx,
    right: pos.x + EL_W + dx,
    top: pos.y,
    bottom: pos.y + EL_H + gapY + EL_H,
  };
}

/**
 * Horizontal band covering only the illustrated sub row (below the main box), same width as
 * {@link swimlaneObstacleRectForStep} for composites. Used when routing must skip source/target *main*
 * boxes (connector ports) but still treat illustrated subs as obstacles for the vertical bus.
 */
function swimlaneCompositeSubBandObstacleRect(pos, elementName, swimlaneDiagSubs) {
  const el = String(elementName || "");
  if (!swimlaneDiagSubs || !COMPOSITE_PATTERNS[el]) return null;
  const gapY = swimlaneCompositeAggGapY();
  const gapX = typeof COMPOSITE_H_GAP_VERTICAL === "number" ? COMPOSITE_H_GAP_VERTICAL : COMPOSITE_H_GAP;
  const dx = EL_W + gapX;
  const ySub = pos.y + EL_H + gapY;
  return {
    left: pos.x - dx,
    right: pos.x + EL_W + dx,
    top: ySub,
    bottom: ySub + EL_H,
  };
}

/**
 * Padded obstacle rects for all path steps (main + composite illustration footprint when enabled).
 * Used to nudge hop labels so relation names do not sit over illustrated sub-boxes.
 */
function buildSwimlaneLabelObstacles(positions, flatSteps, swimlaneDiagSubs) {
  const pad = 4;
  const out = [];
  for (let i = 0; i < positions.length; i++) {
    const r = swimlaneObstacleRectForStep(positions[i], flatSteps[i]?.element, swimlaneDiagSubs);
    out.push({
      left: r.left - pad,
      right: r.right + pad,
      top: r.top - pad,
      bottom: r.bottom + pad,
    });
  }
  return out;
}

function swimlaneHLineHitsRect(y, xA, xB, r) {
  if (y < r.top || y > r.bottom) return false;
  const lo = Math.min(xA, xB);
  const hi = Math.max(xA, xB);
  return hi >= r.left && lo <= r.right;
}

function swimlaneVLineHitsRect(x, y0, y1, r) {
  if (x < r.left || x > r.right) return false;
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  return hi >= r.top && lo <= r.bottom;
}

/**
 * Picks a vertical bus X for spread swimlane H–V–H routes so the polyline does not pass through other nodes
 * (including composite illustration footprints). Falls back to chord midpoint.
 */
function swimlaneOrthogonalBusXForHop(positions, flatSteps, hopIndex, x1, y1, x2, y2, swimlaneDiagSubs) {
  const pad = 6;
  const clrM = ARROW_MARKER_TARGET_CLEARANCE;
  const yTop = Math.min(y1, y2);
  const yBot = Math.max(y1, y2);
  /** @type {{ left: number, right: number, top: number, bottom: number }[]} */
  const obs = [];
  const pushPadded = (r) => {
    obs.push({
      left: r.left - pad,
      right: r.right + pad,
      top: r.top - pad,
      bottom: r.bottom + pad,
    });
  };
  for (let i = 0; i < positions.length; i++) {
    if (i === hopIndex - 1 || i === hopIndex) {
      // Source/target main boxes are excluded so H–V–H ports can attach; but the vertical segment
      // can still traverse a composite's illustrated sub row — add sub-band only for those steps.
      const subBand = swimlaneCompositeSubBandObstacleRect(positions[i], flatSteps[i]?.element, swimlaneDiagSubs);
      if (subBand) pushPadded(subBand);
      continue;
    }
    const r = swimlaneObstacleRectForStep(positions[i], flatSteps[i]?.element, swimlaneDiagSubs);
    pushPadded(r);
  }
  const tgtBox = layoutElementBBox(positions[hopIndex]);
  const midCandidateHits = (mx) => {
    let x2m =
      Math.abs(x2 - mx) > clrM ? x2 - Math.sign(x2 - mx) * clrM : x2;
    // Source/target bboxes are omitted from `obs` so ports can sit on edges; without these checks the
    // search can pick a bus X to the left of the source’s right port (or right of the target’s box),
    // so the first/last horizontal leg retraces through the node interior (see spread swimlanes).
    if (mx < x1 - 1e-3) return true;
    if (mx > tgtBox.right + 1e-3) return true;
    for (const r of obs) {
      if (swimlaneHLineHitsRect(y1, x1, mx, r)) return true;
    }
    for (const r of obs) {
      if (swimlaneVLineHitsRect(mx, yTop, yBot, r)) return true;
    }
    for (const r of obs) {
      if (swimlaneHLineHitsRect(y2, mx, x2m, r)) return true;
    }
    return false;
  };
  const mid = (x1 + x2) / 2;
  if (!midCandidateHits(mid)) return mid;
  const step = 28;
  for (let k = 1; k <= 48; k++) {
    for (const sgn of [1, -1]) {
      const mx = mid + sgn * k * step;
      if (!midCandidateHits(mx)) return mx;
    }
  }
  // Prefer a clamped midpoint over an unconstrained one when obstacle search fails (still avoids re-entering endpoints).
  return Math.min(Math.max(mid, x1), tgtBox.right);
}

const SWIMLANE_BUS_STRIP_PAD = 8;

function rectsOverlap2D(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

/**
 * True if any illustrated composite sub rect intersects another path step's layout box
 * (main cell, or full swimlane composite footprint when {@code swimlaneDiagSubs}).
 */
function swimlaneIllustrationSubsOverlapOtherPathNodes(subRects, stepIndex, positions, flatSteps, swimlaneDiagSubs) {
  if (!swimlaneDiagSubs) return false;
  for (const r of subRects) {
    for (let j = 0; j < positions.length; j++) {
      if (j === stepIndex) continue;
      const o =
        COMPOSITE_PATTERNS[flatSteps[j]?.element]
          ? swimlaneObstacleRectForStep(positions[j], flatSteps[j]?.element, true)
          : layoutElementBBox(positions[j]);
      if (rectsOverlap2D(r, o)) return true;
    }
  }
  return false;
}

function swimlaneBusStripHitsBox(busX, r) {
  if (busX == null || !Number.isFinite(busX)) return false;
  return busX >= r.left - SWIMLANE_BUS_STRIP_PAD && busX <= r.right + SWIMLANE_BUS_STRIP_PAD;
}

/**
 * Chooses composite illustration layout for spread horizontal swimlanes:
 * prefer one sub directly below the parent and one on a diagonal; fall back to dual-diagonal.
 * Uses the same vertical-bus X values as relationship routing so subs stay out of H–V–H corridors.
 *
 * @param swimlaneDiagSubs When true, reject placements where illustration subs overlap other path nodes.
 * @returns {{ mode: 'dual-diag' } | { mode: 'below-diag', diagOnRight: boolean }}
 */
function pickSwimlaneCompositeSubLayout(stepIndex, positions, flatSteps, swimlaneBusXByHop, swimlaneDiagSubs = false) {
  const pos = positions[stepIndex];
  if (!pos) return { mode: "dual-diag" };
  const x = pos.x;
  const y = pos.y;
  const gapX = typeof COMPOSITE_H_GAP_VERTICAL === "number" ? COMPOSITE_H_GAP_VERTICAL : COMPOSITE_H_GAP;
  const gapY = swimlaneCompositeAggGapY();
  const dx = EL_W + gapX;
  const dy = EL_H + gapY;
  const ySub = y + dy;
  const xLeft = x - dx;
  const xRight = x + dx;
  /** Sub box same width as main, centered under parent (stacked column). */
  const belowCenterX = x + EL_W / 2 - EL_W / 2;

  const leftBox = { left: xLeft, right: xLeft + EL_W, top: ySub, bottom: ySub + EL_H };
  const rightBox = { left: xRight, right: xRight + EL_W, top: ySub, bottom: ySub + EL_H };
  const belowBox = { left: belowCenterX, right: belowCenterX + EL_W, top: ySub, bottom: ySub + EL_H };

  const incomingBusX =
    stepIndex > 0 && flatSteps[stepIndex]?.codes ? swimlaneBusXByHop.get(stepIndex) : null;
  const outgoingBusX =
    stepIndex < flatSteps.length - 1 && flatSteps[stepIndex + 1]?.codes
      ? swimlaneBusXByHop.get(stepIndex + 1)
      : null;

  const pairOkBus = (boxA, boxB) => {
    for (const bx of [boxA, boxB]) {
      if (swimlaneBusStripHitsBox(incomingBusX, bx)) return false;
      if (swimlaneBusStripHitsBox(outgoingBusX, bx)) return false;
    }
    return true;
  };

  const accepts = (boxA, boxB) => {
    if (!pairOkBus(boxA, boxB)) return false;
    if (swimlaneIllustrationSubsOverlapOtherPathNodes([boxA, boxB], stepIndex, positions, flatSteps, swimlaneDiagSubs)) {
      return false;
    }
    return true;
  };

  /** Prefer diagonal sub on the side away from the next column (left) when the path continues rightward. */
  const preferBelowLeftDiagFirst = stepIndex < flatSteps.length - 1;
  const ordered = preferBelowLeftDiagFirst
    ? [
        [belowBox, leftBox, { mode: "below-diag", diagOnRight: false }],
        [belowBox, rightBox, { mode: "below-diag", diagOnRight: true }],
        [leftBox, rightBox, { mode: "dual-diag" }],
      ]
    : [
        [belowBox, rightBox, { mode: "below-diag", diagOnRight: true }],
        [belowBox, leftBox, { mode: "below-diag", diagOnRight: false }],
        [leftBox, rightBox, { mode: "dual-diag" }],
      ];

  for (const [ba, bb, out] of ordered) {
    if (accepts(ba, bb)) return out;
  }

  if (pairOkBus(belowBox, rightBox)) return { mode: "below-diag", diagOnRight: true };
  if (pairOkBus(belowBox, leftBox)) return { mode: "below-diag", diagOnRight: false };
  if (pairOkBus(leftBox, rightBox)) return { mode: "dual-diag" };
  return { mode: "below-diag", diagOnRight: true };
}

/** Vertical layer-gravity hops: same-row (aligned mid-Y) use east/west faces; cross-lane use top/bottom centers. */
function layerGravityHopPorts(a, b, fromEl, toEl) {
  void fromEl;
  const A = layoutElementBBox(a);
  const B = layoutElementBBox(b);
  const c = ARROW_MARKER_TARGET_CLEARANCE;
  /** Same visual row (e.g. column swimlanes): route horizontally between facing sides. */
  const sameRow = Math.abs(a.cy - b.cy) < 1.5;
  if (sameRow) {
    let x1;
    let y1 = A.midY;
    let x2;
    let y2 = B.midY;
    const bEastOfA = B.cx > A.cx;
    if (bEastOfA) {
      // Leave source east → enter target west (typical left-to-right columns).
      x1 = A.right;
      x2 = B.left;
    } else {
      // Target sits to the west: leave source west → enter target east (no shaft through either box).
      x1 = A.left;
      x2 = B.right;
    }
    const spanH = Math.abs(x2 - x1);
    if (spanH > c && x2 !== x1) {
      x2 += Math.sign(x1 - x2) * c;
    }
    return { x1, y1, x2, y2 };
  }
  const goingUp = b.cy < a.cy;
  let x1 = A.cx;
  let y1 = goingUp ? A.top : A.bottom;
  let x2 = B.cx;
  let y2 = goingUp ? hopCubePerspectiveBottomY(b.y, toEl, EL_H) + c : B.top - c;
  return { x1, y1, x2, y2 };
}

