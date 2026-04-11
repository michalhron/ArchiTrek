// === ui/renderer.js ===
/**
 * ui/renderer.js
 * ArchiTrek — SVG Renderer
 *
 * Draws path diagrams as SVG:
 * compact   — linear left-to-right only
 * swimlane  — horizontal lanes: spread = packed columns (reuse column on layer change) + cross-layer vertical hops; compact = same packing + tighter gaps (same element shapes, including composites)
 * compact-lanes (pathFlow compact) — layer-aligned positions like swimlanes, tight columns, 90° L-connectors (no curves)
 * Vertical — one implementation (renderSwimlane); swimlane mode adds lane bands only.
 *
 * EXPORTS:
 * renderPath(container, segments, options)
 * clearDiagram(container)
 *
 * Layout constants, SHAPES, COMPOSITE_PATTERNS, ICONS, ARROW_STYLES, and §4.2 metamodel
 * geometry live in data/rendererVisuals.js (loaded before this script; see index.html).
 */

const {
  clamp,
  horizontalStrokeEndXForLabel,
  horizontalRelLabelStackHalfH,
  shadeHex,
  wrapLabel,
  swimlaneLabelRectHitsObstacles,
  swimlaneCountLabelObstacleHits,
  clampVertStraddleLabelYToSegment,
  estimateSwimlaneVertStraddleLabelRect,
  estimateSwimlaneHorizontalLabelRect,
  segmentsFromOrthogonalD,
  verticalStraddleYExtentFromOrthoPath,
  rectEdgeLabelInflate,
  rectsOverlapLabelSpace,
  createEdgeLabelSpaceRegistry,
  buildEdgeLabelCollisionOffsets,
  nudgeSwimlaneRelLabelAgainstObstacles,
  startsWithArticle,
  looksLikeProperNoun,
  withArticle,
  sentenceCaseStart,
  compositeIllustrationAggPath,
  escPathDiag,
} = window.rendererUtils || {};
const { computeCompactPlan } = window.layoutEngine || {};

function compositePatternSubCandidates(pattern) {
  if (!pattern) return [];
  if (Array.isArray(pattern.subCandidates) && pattern.subCandidates.length) return pattern.subCandidates;
  return pattern.sub ? [pattern.sub] : [];
}

function hashStringFNV1a(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic pair of part types for composite decoration; stable for a given seed string.
 * @param {Set<string>|null} excludeCanonicals Optional canonical element names to avoid (e.g. adjacent path hops)
 *        so illustrated subs do not duplicate a real neighbor node’s type when alternatives exist.
 */
function pickCompositeIllustrationSubs(pattern, seedStr, excludeCanonicals = null) {
  let pool = compositePatternSubCandidates(pattern);
  if (pool.length === 0) return { subFirst: "Node", subSecond: "Node", moreCount: 0 };
  if (pool.length === 1) return { subFirst: pool[0], subSecond: pool[0], moreCount: 0 };
  if (excludeCanonicals && excludeCanonicals.size) {
    const filtered = pool.filter((c) => !excludeCanonicals.has(c));
    if (filtered.length >= 2) pool = filtered;
  }
  let h = hashStringFNV1a(String(seedStr));
  const i0 = h % pool.length;
  h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
  let i1 = h % pool.length;
  if (i1 === i0) i1 = (i0 + 1) % pool.length;
  const moreCount = pool.length > 2 ? pool.length - 2 : 0;
  return { subFirst: pool[i0], subSecond: pool[i1], moreCount };
}

/**
 * Inline explanation for illustrated composite hops (same sub pick as drawElement / pickCompositeIllustrationSubs).
 * @param {string} compositeCanonical
 * @param {string} illustrationSeed
 * @returns {string} HTML fragment or ""
 */
function formatCompositeArchitectNote(compositeCanonical, illustrationSeed) {
  if (shouldHideCompositeIllustrations()) return "";
  const pattern = COMPOSITE_PATTERNS[compositeCanonical];
  if (!pattern) return "";
  const { subFirst, subSecond } = pickCompositeIllustrationSubs(pattern, illustrationSeed);
  const compositePhrase = sentenceCaseStart(withArticle(getDomainLabel(compositeCanonical)));
  const a = withArticle(getDomainLabel(subFirst));
  const b = withArticle(getDomainLabel(subSecond));
  const subPhrase = subFirst === subSecond ? a : `${a} and ${b}`;
  const inner = `(Architect's Note: ${compositePhrase} structurally aggregates components such as ${subPhrase}.)`;
  return `<span class="architect-note">${escPathDiag(inner)}</span>`;
}

function compositeAggGapY() {
  return typeof COMPOSITE_V_GAP_VERTICAL === "number" ? COMPOSITE_V_GAP_VERTICAL : 40;
}

function compositeTopY(y, el, { alignVertical = false, swimlaneCompositeSubsBelowDiagonal = false } = {}) {
  const p = COMPOSITE_PATTERNS[el];
  if (!p) return y;
  if (swimlaneCompositeSubsBelowDiagonal) return y;
  if (shouldHideCompositeIllustrations()) return y;
  if (alignVertical) {
    if (p.subsSideBySide) return y - (EL_H + compositeAggGapY());
    return y;
  }
  if (p.subsSideBySide) return y;
  return y - COMPOSITE_V_OFF;
}

function compositeBottomY(y, el, { alignVertical = false, swimlaneCompositeSubsBelowDiagonal = false } = {}) {
  const p = COMPOSITE_PATTERNS[el];
  if (!p) return y + EL_H;
  if (swimlaneCompositeSubsBelowDiagonal && p) return y + EL_H + compositeAggGapY() + EL_H;
  if (shouldHideCompositeIllustrations()) return y + EL_H;
  if (alignVertical) return y + EL_H;
  if (p.subsSideBySide) return y + EL_H;
  return y + COMPOSITE_V_OFF + EL_H;
}

function compositeMainTopDelta(el, { swimlaneCompositeSubsBelowDiagonal = false } = {}) {
  const p = COMPOSITE_PATTERNS[el];
  if (swimlaneCompositeSubsBelowDiagonal && p) return 0;
  if (!p || p.subsSideBySide) return 0;
  if (shouldHideCompositeIllustrations()) return 0;
  return COMPOSITE_V_OFF;
}

function compositeMainBottomDelta(el) {
  const p = COMPOSITE_PATTERNS[el];
  if (!p) return EL_H;
  if (p.subsSideBySide) return EL_H;
  if (shouldHideCompositeIllustrations()) return EL_H;
  return COMPOSITE_V_OFF + EL_H;
}

function elementShapeType(elementName) {
  const key = String(elementName || "");
  return (SHAPES[key] ?? { type: "rounded" }).type;
}

/**
 * Vertical span of a path step in horizontal compact / horizontal swimlanes (`drawElement` without `alignVertical`).
 * Collaboration / Path / CN composites use side-by-side illustrated subs (no extra vertical stack); only
 * non-`subsSideBySide` patterns would reserve stacked above/below space (none in current COMPOSITE_PATTERNS).
 */
function horizontalLayoutStepOuterHeight(elementName, { swimlaneCompositeSubsBelowDiagonal = false } = {}) {
  if (shouldHideCompositeIllustrations()) return EL_H;
  const p = COMPOSITE_PATTERNS[elementName];
  if (!p) return EL_H;
  if (swimlaneCompositeSubsBelowDiagonal) return EL_H + compositeAggGapY() + EL_H;
  if (p.subsSideBySide) return EL_H;
  return 2 * COMPOSITE_V_OFF + EL_H;
}

/** In vertical compact, composites are side-loaded (left/right), so row height is element height. */
function verticalLayoutStepOuterHeight(_elementName) {
  return EL_H;
}

/**
 * ArchiMate-style technology component (tabs + body), canonical view 140×90;
 * scaled uniformly to fit the inner box (x, y, w, h). Order: three tabs, then main rect on top.
 */
function technologyComponentRectSpecs(x, y, w, h) {
  const vw = 140;
  const vh = 90;
  const scale = Math.min(w / vw, h / vh);
  const bw = vw * scale;
  const bh = vh * scale;
  const ox = x + (w - bw) / 2;
  const oy = y + (h - bh) / 2;
  const R = (rx, ry, rw, rh) => ({
    x: ox + rx * scale,
    y: oy + ry * scale,
    width: rw * scale,
    height: rh * scale,
  });
  return [R(10, 15, 30, 12), R(10, 39, 30, 12), R(10, 63, 30, 12), R(35, 5, 95, 80)];
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI ICONS FOR SELECTORS
// Exposed as a global helper for the visual element picker (ui/app.js).
// ─────────────────────────────────────────────────────────────────────────────

window.getElementMiniSvg = function getElementMiniSvg(elementName, size = 18) {
  const shape = SHAPES[elementName] ?? { type: "rounded" };
  const fill = getColor(elementName);
  const iconFn = ICONS[elementName];

  const w = 120, h = 52;
  const stroke = "#2f2f2b";
  const sw = 1.6;

  const shapeMarkup = (() => {
    switch (shape.type) {
      case "beveled": {
        const d = 6; // slightly smaller cut for the mini preview
        return `<path d="M${0.8+d},0.8 L${w-0.8-d},0.8 L${w-0.8},${0.8+d} L${w-0.8},${h-0.8-d} L${w-0.8-d},${h-0.8} L${0.8+d},${h-0.8} L0.8,${h-0.8-d} L0.8,${0.8+d} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "rounded":
        return `<rect x="0.8" y="0.8" width="${w-1.6}" height="${h-1.6}" rx="6" ry="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "rect":
        return `<rect x="0.8" y="0.8" width="${w-1.6}" height="${h-1.6}" rx="0" ry="0" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "parallelogram": {
        const skew = 8;
        return `<polygon points="${0.8+skew},0.8 ${w-0.8},0.8 ${w-0.8-skew},${h-0.8} 0.8,${h-0.8}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "ellipse":
        return `<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2-0.8}" ry="${h/2-0.8}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "cloud": {
        const cx = w/2, cy = h/2;
        return `<path d="M${cx-20},${cy+8} C${cx-30},${cy+8} ${cx-30},${cy-8} ${cx-15},${cy-8}
                 C${cx-12},${cy-18} ${cx+12},${cy-18} ${cx+15},${cy-8}
                 C${cx+30},${cy-8} ${cx+30},${cy+8} ${cx+20},${cy+8} Z"
                 fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "chevron": {
        const tip = 14;
        return `<polygon points="0.8,0.8 ${w-tip},0.8 ${w-0.8},${h/2} ${w-tip},${h-0.8} 0.8,${h-0.8} ${0.8+tip},${h/2}"
                 fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "rounded-arrow": {
        const tip = 16;
        const r = 10;
        return `<path d="M${0.8+r},0.8
                 L${w-tip},0.8
                 L${w-0.8},${h/2}
                 L${w-tip},${h-0.8}
                 L${0.8+r},${h-0.8}
                 Q0.8,${h-0.8} 0.8,${h-r}
                 L0.8,${0.8+r}
                 Q0.8,0.8 ${0.8+r},0.8
                 Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "pill": {
        const iw = w - 1.6;
        const ih = h - 1.6;
        const rx = Math.min(iw, ih) / 2;
        return `<rect x="0.8" y="0.8" width="${iw}" height="${ih}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "document": {
        const fold = DOCUMENT_SHAPE_FOLD;
        const d = `
          <path d="M0.8,0.8 L${w-fold},0.8 L${w-0.8},${fold} L${w-0.8},${h-0.8} L0.8,${h-0.8} Z"
                fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
          <path d="M${w-fold},0.8 L${w-fold},${fold} L${w-0.8},${fold} Z"
                fill="${shadeHex(fill, +0.18)}" stroke="${stroke}" stroke-width="${sw}"/>`;
        return d.trim();
      }
      case "cube": {
        const d = 10;
        return `
          <polygon points="${d},0.8 ${w-0.8},0.8 ${w-0.8-d},${0.8+d} 0.8,${0.8+d}"
                   fill="${shadeHex(fill, +0.10)}" stroke="${stroke}" stroke-width="${sw}"/>
          <polygon points="${w-0.8},0.8 ${w-0.8},${h-d} ${w-0.8-d},${h-0.8} ${w-0.8-d},${0.8+d}"
                   fill="${shadeHex(fill, -0.06)}" stroke="${stroke}" stroke-width="${sw}"/>
          <polygon points="0.8,${0.8+d} ${w-0.8-d},${0.8+d} ${w-0.8-d},${h-0.8} 0.8,${h-0.8}"
                   fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`.trim();
      }
      case "technology-component": {
        const specs = technologyComponentRectSpecs(0.8, 0.8, w - 1.6, h - 1.6);
        return specs
          .map(
            (r) =>
              `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
          )
          .join("");
      }
      case "plateau":
        return `
          <rect x="0.8" y="0.8" width="${w-1.6}" height="${h-1.6}" rx="0" ry="0" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
          <line x1="2" y1="${h+3}" x2="${w-0.8}" y2="${h+3}" stroke="#555" stroke-width="1"/>
          <line x1="4" y1="${h+6}" x2="${w-0.8}" y2="${h+6}" stroke="#555" stroke-width="1"/>`.trim();
      case "dashed":
        return `<rect x="0.8" y="0.8" width="${w-1.6}" height="${h-1.6}" rx="6" ry="6" fill="none" stroke="#888" stroke-width="${sw}" stroke-dasharray="5,3"/>`;
      default:
        return `<rect x="0.8" y="0.8" width="${w-1.6}" height="${h-1.6}" rx="6" ry="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
  })();

  const badgeMarkup =
    iconFn && elementName !== "Value"
      ? (() => {
    const pad = 3;
    const d = shape.type === "cube" ? SHAPE_CUBE_DEPTH : 0;
    const doc = shape.type === "document";
    const gx = w - ICON_GLYPH_SIZE - pad - d - (doc ? DOCUMENT_ICON_INSET_X : 0) - CORNER_GLYPH_NUDGE_X;
    const gy = pad + d + (doc ? DOCUMENT_ICON_INSET_Y : 0) + CORNER_GLYPH_NUDGE_Y;
    return `<g transform="translate(${gx}, ${gy})" color="${stroke}">${iconFn()}</g>`;
  })()
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg"
    width="${size}" height="${Math.max(12, Math.round(size * (h / w)))}"
    viewBox="0 0 ${w} ${h}"
    preserveAspectRatio="xMidYMid meet"
    style="display:block">
      ${shapeMarkup}
      ${badgeMarkup}
    </svg>`;
};

/**
 * ArchiMate corner glyph on a small tile filled with the same color as diagram boxes ({@link getColor}).
 * Glyph is slightly scaled down so strokes read a bit finer at breadcrumb size.
 */
window.getElementGlyphSvg = function getElementGlyphSvg(elementName, size = 20) {
  const boxFill = getColor(elementName);
  /** Hairline: barely darker than fill (same hue family), not a neutral charcoal */
  const edgeStroke =
    typeof shadeHex === "function" ? shadeHex(boxFill, -0.065) : boxFill;
  const glyphStroke = "#2f2f2b";
  const iconFn = ICONS[elementName];
  const inner =
    typeof iconFn === "function"
      ? iconFn()
      : `<rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`;
  const glyph = `<g transform="translate(6,6) scale(0.86) translate(-6,-6)" style="color:${glyphStroke}">${inner}</g>`;
  const bg = `<rect x="0.5" y="0.5" width="11" height="11" rx="2.4" fill="${boxFill}" stroke="${edgeStroke}" stroke-width="0.28"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg"
    width="${size}"
    height="${size}"
    viewBox="0 0 12 12"
    preserveAspectRatio="xMidYMid meet"
    style="display:block">${bg}${glyph}</svg>`;
};

window.getElementPickerTileSvg = function getElementPickerTileSvg(elementName, width = 240, height = 72) {
  const shape = SHAPES[elementName] ?? { type: "rounded" };
  const fill = getColor(elementName);
  const iconFn = ICONS[elementName];
  const meta = ELEMENTS[elementName];

  const x = 0.8, y = 0.8;
  const w = Math.max(120, width);
  const h = Math.max(52, height);

  const stroke = "#2f2f2b";
  const sw = 1.8;

  const shapeEl = drawShape(shape.type, x, y, w - 1.6, h - 1.6, fill);
  shapeEl.setAttribute("stroke", stroke);
  shapeEl.setAttribute("stroke-width", String(sw));
  if (shape.type === "rounded" && shapeEl.tagName.toLowerCase() === "rect") {
    shapeEl.setAttribute("rx", "16");
    shapeEl.setAttribute("ry", "16");
  }

  const g = svgEl("g", {});
  g.appendChild(shapeEl);

  if (iconFn && elementName !== "Value") {
    const pad = 8;
    const glyphSize = ICON_GLYPH_SIZE;
    const d = shape.type === "cube" ? SHAPE_CUBE_DEPTH : 0;
    const doc = shape.type === "document";
    const innerW = w - 1.6;
    const iconX = x + innerW - glyphSize - pad - d - (doc ? DOCUMENT_ICON_INSET_X : 0) - CORNER_GLYPH_NUDGE_X;
    const iconY = y + pad + d + (doc ? DOCUMENT_ICON_INSET_Y : 0) + CORNER_GLYPH_NUDGE_Y;
    const iconG = svgEl("g", { transform: `translate(${iconX}, ${iconY})`, color: stroke });
    const glyph = document.createElementNS(SVG_NS, "svg");
    glyph.setAttribute("viewBox", "0 0 12 12");
    glyph.setAttribute("width", String(glyphSize));
    glyph.setAttribute("height", String(glyphSize));
    glyph.innerHTML = iconFn();
    iconG.appendChild(glyph);
    g.appendChild(iconG);
  }

  const leftPad = 18;
  const fontSize = 20;
  const innerW = w - 1.6;
  const textLeft = x + leftPad;
  const padIcon = 8;
  const glyphSize = ICON_GLYPH_SIZE;
  const d = shape.type === "cube" ? SHAPE_CUBE_DEPTH : 0;
  const docShape = shape.type === "document";
  const maxTextPxWidth =
    iconFn && elementName !== "Value"
      ? Math.max(
          40,
          x +
            innerW -
            glyphSize -
            padIcon -
            d -
            (docShape ? DOCUMENT_ICON_INSET_X : 0) -
            CORNER_GLYPH_NUDGE_X -
            6 -
            textLeft,
        )
      : Math.max(40, x + innerW - 12 - textLeft);
  const approxChar = fontSize * 0.52;
  const maxChars = Math.max(8, Math.floor(maxTextPxWidth / approxChar));

  const words = String(elementName).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length >= 2) break;
  }
  if (lines.length < 2 && current) lines.push(current);
  if (lines.length >= 2 && words.join(" ").length > lines.join(" ").length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s+$/, "") + "…";
  }
  const nameLines = lines.length ? lines : [String(elementName)];

  const nameStartY = y + h / 2 - (nameLines.length === 2 ? 6 : 0);
  for (let i = 0; i < nameLines.length; i++) {
    const t = svgEl("text", {
      x: x + leftPad,
      y: nameStartY + i * 18,
      "text-anchor": "start",
      "dominant-baseline": "middle",
      "font-size": String(fontSize),
      "font-family": "DM Sans, system-ui, sans-serif",
      "font-weight": "800",
      fill: "#111",
    });
    t.textContent = nameLines[i];
    g.appendChild(t);
  }

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  const vbPad = 3;
  svg.setAttribute("viewBox", `${-vbPad} ${-vbPad} ${w + vbPad * 2} ${h + vbPad * 2}`);
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("style", "display:block;width:100%;height:auto");
  svg.appendChild(g);
  return svg.outerHTML;
};

// ─────────────────────────────────────────────────────────────────────────────
// SVG HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function svgEl(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const child of children) {
    if (typeof child === "string") {
      el.innerHTML += child;
    } else if (child) {
      el.appendChild(child);
    }
  }
  return el;
}

function getColor(elementName) { return typeof ELEMENTS !== 'undefined' && ELEMENTS[elementName]?.color ? ELEMENTS[elementName].color : "#f0f0f0"; }

function makeRelLabel(mx, my, labelLines, {
  // Match element subtitle scale (e.g. "Business Role") more closely.
  fontSize = 8.5,
  lineH = 10.0,
  hopIndex = null,
  /** Number printed on the badge; defaults to hopIndex (path step). Use visual index when path order ≠ diagram order. */
  badgeDisplayNumber = null,
  showHopNumbers = true,
  showFlipIcons = true,
  hasChoices = false,
  /** @deprecated Kept for call-site compatibility; horizontal labels use a centered badge+name row above the stroke. */
  horizontalBadgeAnchorX = null,
  /** Vertical edges: hop number + relation name beside the connector (east by default; west when verticalStraddleWest). */
  verticalStraddle = false,
  /** Connector x (column center) for vertical edges; falls back to mx. */
  straddleAnchorX = null,
  /**
   * Single-column vertical: shift the label cluster east of the node box (connector is at column center;
   * anchor + small gap was still inside the 120px rect and overlapped titles).
   */
  straddleExtraX = 0,
  /** Same as verticalStraddle but place the badge+text cluster west of the connector (for flanked composites). */
  verticalStraddleWest = false,
  /**
   * World X of the vertical relationship stroke (spine or outer bus), excluding label nudges.
   * When set, enforces min clearance so the badge does not sit on the line.
   */
  straddleLineStrokeX = null,
  /**
   * Force the badge center to be offset from the vertical spine/bus stroke by a fixed amount (east side).
   * Used to keep spine badges from being bisected by the line.
   */
  forceBadgeCenterOffsetFromLineEast = null,
  /** Solid rect behind badge+text (off by default; text uses stroked halo for contrast on lines). */
  labelSolidBackground = false,
  /** When set (main diagram SVG), relation-name width is measured so west-straddle labels clear the flip control. */
  measureSvg = null,
} = {}) {
  const labelG = svgEl("g", { class: "rel-label" });
  const bgFill = "var(--surface, #ffffff)";

  if (verticalStraddle) {
    const anchor = straddleAnchorX != null ? straddleAnchorX : mx;
    const badgeR = hasChoices ? 9 : 7;
    const textGap =
      straddleLineStrokeX != null && Number.isFinite(straddleLineStrokeX)
        ? Math.max(VERT_BADGE_NAME_GAP, SPINE_TEXT_GAP_AFTER_BADGE)
        : VERT_BADGE_NAME_GAP;
    const lines = labelLines && labelLines.length ? labelLines : [];
    const nLines = lines.length;

    const badgeCy = 0;
    const showHop = hopIndex != null && showHopNumbers;
    /** Same radius as `.path-edge-flip` circle (r=10); horizontal gap matches flip placement below. */
    const FLIP_ICON_R = 10;
    const FLIP_GAP = 8;
    /**
     * When a hop badge is shown, inline flip/lock anchors sit between badge and relation name on vertical edges.
     * Reserve this width so the control does not paint over the first glyphs of the name (east: start anchor).
     */
    const flipCorridor = showHop ? 2 * FLIP_GAP + 2 * FLIP_ICON_R : 0;
    const relLineH = lineH;
    const textHalfHVert =
      nLines === 0 ? 0 : Math.max(relLineH * 0.56, (nLines * relLineH) / 2);
    const stackHalfH = Math.max((showHop ? badgeR : 0) + 2, textHalfHVert);
    const badgeNum = badgeDisplayNumber != null ? badgeDisplayNumber : hopIndex;
    const approxTextW =
      nLines === 0 ? 0 : Math.min(170, Math.max(48, lines.join(" ").length * (fontSize * 0.55)));
    /** Ink width + halo: {@link codeLabel} uses stroke-width 4; getComputedTextLength ignores stroke. */
    const REL_NAME_STROKE_PAD = 7;
    let layoutTextW = approxTextW;
    if (nLines > 0 && measureSvg && typeof measureSvg.appendChild === "function") {
      try {
        const probe = svgEl("text", {
          x: "-8000",
          y: "-8000",
          "font-size": String(fontSize),
          "font-family": "DM Sans, system-ui, sans-serif",
          fill: "#000",
          visibility: "hidden",
        });
        measureSvg.appendChild(probe);
        let maxInk = 0;
        for (const ln of lines) {
          probe.textContent = ln;
          const len =
            typeof probe.getComputedTextLength === "function" ? probe.getComputedTextLength() : 0;
          if (Number.isFinite(len)) maxInk = Math.max(maxInk, len);
        }
        probe.remove();
        if (maxInk > 0) {
          layoutTextW = Math.min(170, Math.max(approxTextW, maxInk + REL_NAME_STROKE_PAD));
        }
      } catch (_) {
        layoutTextW = approxTextW;
      }
    }
    /**
     * East: badge → flip → name. {@link textGap} can grow to SPINE_TEXT_GAP_AFTER_BADGE for badge↔stroke
     * clearance — that value must not stack *after* the flip slot or a large empty band appears before the name.
     */
    const gapFlipToNameEast = VERT_BADGE_NAME_GAP;
    const textStartXEast = showHop ? 2 * badgeR + flipCorridor + gapFlipToNameEast : 0;
    const approxW = verticalStraddleWest
      ? showHop
        ? 2 * badgeR + textGap + layoutTextW
        : layoutTextW
      : textStartXEast + layoutTextW;

    let stackX;
    let textAnchor;
    let textBlockX;
    let circleCx;
    if (verticalStraddleWest) {
      // West: stroke is to the right; badge hugs the line; relation name flows left (text-anchor end).
      stackX = anchor - straddleExtraX - BADGE_LINE_CLEARANCE - approxW;
      textAnchor = "end";
      // Text’s trailing edge sits left of the hop badge by (flipCorridor + textGap); flip is centered in that strip.
      textBlockX = showHop
        ? Math.max(0, layoutTextW + textGap - flipCorridor)
        : layoutTextW;
      circleCx = layoutTextW + textGap + badgeR;
    } else {
      // East / spine: default placement clears the stroke by BADGE_LINE_CLEARANCE.
      stackX = anchor + straddleExtraX + BADGE_LINE_CLEARANCE;
      textAnchor = "start";
      textBlockX = textStartXEast;
      circleCx = badgeR;
    }

    if (straddleLineStrokeX != null && Number.isFinite(straddleLineStrokeX)) {
      const lineX = straddleLineStrokeX;
      const lineBuf = Math.max(
        SPINE_BADGE_CLEAR_FROM_LINE,
        typeof LABEL_TO_LINE_BUFFER_PX === "number" ? LABEL_TO_LINE_BUFFER_PX : 15,
      );
      if (verticalStraddleWest) {
        const circleRight = stackX + circleCx + badgeR;
        const maxRight = lineX - lineBuf;
        if (circleRight > maxRight) {
          stackX -= circleRight - maxRight;
        }
      } else {
        if (forceBadgeCenterOffsetFromLineEast != null && Number.isFinite(forceBadgeCenterOffsetFromLineEast)) {
          // Exact spine/bus offset: badge center sits at (lineX + offset), not "minimum clearance".
          // Staircase/nudges in straddleAnchorX must not pull the stack past the line — line buffer wins.
          stackX = lineX + forceBadgeCenterOffsetFromLineEast - circleCx + (straddleAnchorX - lineX);
        }
        const leftEdge = stackX;
        const minLeft = lineX + lineBuf;
        if (leftEdge < minLeft) {
          stackX += minLeft - leftEdge;
        }
      }
    }

    const stackG = svgEl("g", { class: "rel-label-stack" });
    stackG.setAttribute("transform", `translate(${stackX}, ${my})`);

    if (labelSolidBackground) {
      const bgPad = 5;
      const bw = approxW + 2 * bgPad;
      const bh = 2 * stackHalfH + 2 * bgPad;
      stackG.appendChild(svgEl("rect", {
        class: "rel-label-bg",
        x: -bgPad,
        y: -stackHalfH - bgPad,
        width: bw,
        height: bh,
        rx: 4,
        fill: bgFill,
        "pointer-events": "none",
      }));
    }

    let badgeG = null;
    if (showHop) {
      badgeG = svgEl("g", { class: "rel-label-badge" });
      badgeG.appendChild(svgEl("circle", {
        cx: circleCx,
        cy: badgeCy,
        r: badgeR,
        fill: "var(--accent, #1e3a5f)",
        stroke: "none",
        style: "transition: all 0.15s ease;",
      }));
      const badgeText = svgEl("text", {
        x: circleCx,
        y: badgeCy + 1,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "font-size": "8.5",
        "font-family": "DM Sans, system-ui, sans-serif",
        "font-weight": "800",
        fill: "#ffffff",
        style: "transition: all 0.15s ease;",
      });
      badgeText.textContent = hasChoices ? `${badgeNum} ▾` : String(badgeNum);
      badgeG.appendChild(badgeText);
    }

    let codeLabel = null;
    if (nLines > 0) {
      codeLabel = svgEl("text", {
        x: textBlockX,
        "text-anchor": textAnchor,
        "font-size": String(fontSize),
        "font-family": "DM Sans, system-ui, sans-serif",
        fill: "var(--lbl-fill, #2f2f2b)",
        "paint-order": "stroke",
        stroke: "var(--lbl-stroke, var(--surface, #ffffff))",
        "stroke-width": "4",
        "stroke-linejoin": "round",
        style: "transition: fill 0.15s ease, stroke 0.15s ease;",
      });
      if (nLines === 1) {
        codeLabel.setAttribute("y", "0");
        codeLabel.setAttribute("dominant-baseline", "central");
      } else {
        codeLabel.setAttribute("y", String(-lineH / 2));
        codeLabel.setAttribute("dominant-baseline", "alphabetic");
      }
      lines.forEach((ln, i) => {
        const tspan = svgEl("tspan", { x: textBlockX, dy: i === 0 ? "0" : String(lineH) });
        tspan.textContent = ln;
        codeLabel.appendChild(tspan);
      });
    }
    if (verticalStraddleWest) {
      if (codeLabel) stackG.appendChild(codeLabel);
      if (badgeG) stackG.appendChild(badgeG);
    } else {
      if (badgeG) stackG.appendChild(badgeG);
      if (codeLabel) stackG.appendChild(codeLabel);
    }

    labelG.appendChild(stackG);
    const hitCenterX = stackX + approxW / 2;
    const hitCenterY = my;
    const hitPadX = Math.max(72, approxW / 2 + 14);
    const hitPadY = nLines > 1 ? 36 : 28;
    labelG.appendChild(svgEl("rect", {
      class: "rel-label-hit",
      x: hitCenterX - hitPadX,
      y: hitCenterY - hitPadY,
      width: hitPadX * 2,
      height: hitPadY * 2,
      fill: "transparent",
      "pointer-events": "all",
      cursor: "pointer",
    }));
    /** World-space center for the path-edge flip: in the corridor between hop badge and relation name. */
    let flipIconWorld = null;
    if (showHop) {
      if (verticalStraddleWest) {
        // [text][flip][badge]: anchor flip from the reserved text trailing edge (measured width).
        flipIconWorld = {
          x: stackX + textBlockX + FLIP_GAP + FLIP_ICON_R,
          y: my,
        };
      } else {
        // [badge][flip][text]: center of flip in gap after badge’s right edge.
        flipIconWorld = {
          x: stackX + 2 * badgeR + FLIP_GAP + FLIP_ICON_R,
          y: my,
        };
      }
    } else if (showFlipIcons) {
      if (verticalStraddleWest) {
        flipIconWorld = {
          x: stackX - FLIP_GAP - FLIP_ICON_R,
          y: my,
        };
      } else {
        flipIconWorld = {
          x: stackX + approxW + FLIP_GAP + FLIP_ICON_R,
          y: my,
        };
      }
    }
    return { labelG, codeLabel, flipIconWorld };
  }

  // Horizontal: my is the vertical center of the badge+name row (drawArrow places it just above the stroke).
  const linesH = labelLines && labelLines.length ? labelLines : [];
  const nLinesH = linesH.length;
  const approxTextWHoriz =
    nLinesH === 0 ? 0 : Math.min(170, Math.max(48, linesH.join(" ").length * (fontSize * 0.55)));
  const badgeRHoriz = hasChoices ? 9 : 7;
  const showHopH = hopIndex != null && showHopNumbers;
  const horizTextGap = VERT_BADGE_NAME_GAP;
  const textStartXHoriz = showHopH ? 2 * badgeRHoriz + horizTextGap : 0;
  const totalWHoriz = textStartXHoriz + approxTextWHoriz;
  const textHalfHHoriz =
    nLinesH === 0 ? 0 : Math.max(lineH * 0.56, (nLinesH * lineH) / 2);
  const multilineExtraHoriz = nLinesH > 1 ? 2 : 0;
  const stackHalfHHoriz = Math.max(showHopH ? badgeRHoriz + 1 : 0, textHalfHHoriz) + multilineExtraHoriz;
  const stackOriginX = mx - totalWHoriz / 2;

  const hitPadX = Math.max(90, totalWHoriz / 2 + 24);
  const hitPadY = Math.max(22, stackHalfHHoriz + 12);

  const stackG = svgEl("g", { class: "rel-label-stack rel-label-stack--horizontal" });
  stackG.setAttribute("transform", `translate(${stackOriginX}, ${my})`);

  if (labelSolidBackground) {
    const bgPad = 5;
    stackG.appendChild(svgEl("rect", {
      class: "rel-label-bg",
      x: -bgPad,
      y: -stackHalfHHoriz - bgPad,
      width: totalWHoriz + 2 * bgPad,
      height: 2 * stackHalfHHoriz + 2 * bgPad,
      rx: 4,
      fill: bgFill,
      "pointer-events": "none",
    }));
  }

  let badgeG = null;
  if (showHopH) {
    badgeG = svgEl("g", { class: "rel-label-badge" });
    const bcx = badgeRHoriz;
    badgeG.appendChild(svgEl("circle", {
      cx: bcx,
      cy: 0,
      r: String(badgeRHoriz),
      fill: "var(--accent, #1e3a5f)",
      stroke: "none",
      style: "transition: all 0.15s ease;",
    }));
    const badgeText = svgEl("text", {
      x: bcx,
      y: 1,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": "8.5",
      "font-family": "DM Sans, system-ui, sans-serif",
      "font-weight": "800",
      fill: "#ffffff",
      style: "transition: all 0.15s ease;",
    });
    const badgeNumH = badgeDisplayNumber != null ? badgeDisplayNumber : hopIndex;
    badgeText.textContent = hasChoices ? `${badgeNumH} ▾` : String(badgeNumH);
    badgeG.appendChild(badgeText);
    stackG.appendChild(badgeG);
  }

  const textAnchorX = showHopH ? textStartXHoriz : totalWHoriz / 2;
  /** Multi-line: baselines sit above the geometric text center; nudge down so the block lines up with the badge. */
  const multiLineVisualNudge = nLinesH > 1 ? 2 : 0;
  let codeLabel = null;
  if (nLinesH > 0) {
    codeLabel = svgEl("text", {
      x: textAnchorX,
      "text-anchor": showHopH ? "start" : "middle",
      "font-size": String(fontSize),
      "font-family": "DM Sans, system-ui, sans-serif",
      fill: "var(--lbl-fill, #2f2f2b)",
      "paint-order": "stroke",
      stroke: "var(--lbl-stroke, var(--surface, #ffffff))",
      "stroke-width": "4",
      "stroke-linejoin": "round",
      style: "transition: fill 0.15s ease, stroke 0.15s ease;",
    });
    if (nLinesH === 1) {
      codeLabel.setAttribute("y", "0");
      codeLabel.setAttribute("dominant-baseline", "central");
    } else {
      codeLabel.setAttribute("y", String(-lineH / 2 + multiLineVisualNudge));
      codeLabel.setAttribute("dominant-baseline", "alphabetic");
    }
    linesH.forEach((ln, i) => {
      const tspan = svgEl("tspan", { x: textAnchorX, dy: i === 0 ? "0" : String(lineH) });
      tspan.textContent = ln;
      codeLabel.appendChild(tspan);
    });
    stackG.appendChild(codeLabel);
  }
  labelG.appendChild(stackG);
  labelG.appendChild(svgEl("rect", {
    class: "rel-label-hit",
    x: mx - hitPadX,
    y: my - hitPadY,
    width: hitPadX * 2,
    height: hitPadY * 2,
    fill: "transparent",
    "pointer-events": "all",
    cursor: "pointer",
  }));

  const FLIP_ICON_R_H = 10;
  const FLIP_UNDER_BADGE_GAP = 4;
  let flipIconWorld = null;
  if (showHopH) {
    // Centered under the hop badge (same for compact lanes — left-of-stack overlapped neighbor nodes).
    flipIconWorld = {
      x: stackOriginX + badgeRHoriz,
      y: my + badgeRHoriz + FLIP_ICON_R_H + FLIP_UNDER_BADGE_GAP,
    };
  } else if (showFlipIcons) {
    flipIconWorld = {
      x: mx,
      y: my + stackHalfHHoriz + FLIP_ICON_R_H + FLIP_UNDER_BADGE_GAP,
    };
  }

  return { labelG, codeLabel, flipIconWorld };
}

function wrapSvgTextLines(svg, text, maxWidthPx, {
  fontSize = 12,
  fontFamily = "DM Sans, system-ui, sans-serif",
  fontWeight = "800",
  maxLines = LANE_LABEL_MAX_LINES,
} = {}) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const probe = svgEl("text", {
    x: "-1000",
    y: "-1000",
    "font-size": String(fontSize),
    "font-family": fontFamily,
    "font-weight": fontWeight,
    visibility: "hidden",
  });
  svg.appendChild(probe);

  const lines = [];
  let current = "";

  const measure = (s) => {
    probe.textContent = s;
    try { return probe.getComputedTextLength(); } catch { return s.length * (fontSize * 0.6); }
  };

  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (measure(next) <= maxWidthPx || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = w;
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  const consumed = lines.join(" ").length;
  if (consumed < raw.length && lines.length) {
    let last = lines[lines.length - 1].replace(/\s+$/, "") + "…";
    while (last.length > 2 && measure(last) > maxWidthPx) last = last.slice(0, -2) + "…";
    lines[lines.length - 1] = last;
  } else {
    for (let i = 0; i < lines.length; i++) {
      let s = lines[i];
      while (s.length > 2 && measure(s) > maxWidthPx) s = s.slice(0, -1);
      lines[i] = s;
    }
  }

  probe.remove();
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// ELEMENT BOX DRAWING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polished Element Drawer with Multi-line Text Wrapping
 */

// ─────────────────────────────────────────────────────────────────────────────
// Hover tooltip for SVG elements (styled, theme-aware)
// ─────────────────────────────────────────────────────────────────────────────

let _archiHoverTip = null;
let _archiHoverTipRaf = 0;
let _archiHoverTipLastXY = null;

function ensureArchiHoverTip() {
  if (_archiHoverTip) return _archiHoverTip;
  const el = document.createElement("div");
  el.id = "archi-hover-tip";
  el.className = "archi-hover-tip";
  el.style.display = "none";
  el.setAttribute("role", "tooltip");
  document.body.appendChild(el);
  _archiHoverTip = el;

  const hide = () => hideArchiHoverTip();
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("blur", hide);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });

  return el;
}

function setArchiHoverTipContent({
  displayName,
  canonicalName,
  fill,
  stroke,
  iconSvg,
} = {}) {
  const tip = ensureArchiHoverTip();
  tip.classList.remove("archi-hover-tip--rich");
  const e = typeof escPathDiag === "function" ? escPathDiag : (s) => String(s ?? "");
  const title = e(displayName || canonicalName || "");
  const icon = iconSvg ? `<span class="archi-hover-tip__icon" aria-hidden="true">${iconSvg}</span>` : "";

  tip.style.setProperty("--archi-tip-fill", fill || "#ffffff");
  tip.style.setProperty("--archi-tip-stroke", stroke || "#2f2f2b");
  tip.innerHTML = `
    <div class="archi-hover-tip__inner">
      <div class="archi-hover-tip__title-row">
        ${icon}
        <div class="archi-hover-tip__title">${title}</div>
      </div>
    </div>
  `.trim();
}

function labelWouldTruncateInBox(measureSvg, label, w, { subtitle = "" } = {}) {
  const safeLabel = String(label || "");
  if (!safeLabel.trim()) return false;
  const baseFontSize = 11;
  const fontSize = subtitle ? Math.max(9, baseFontSize - 2) : baseFontSize;
  const padX = 10;
  const maxTextW = Math.max(24, w - padX * 2 - SAFE_TEXT_RIGHT_TRIM);
  const maxLines = 3;

  try {
    if (measureSvg && typeof wrapSvgTextLines === "function") {
      const lines = wrapSvgTextLines(measureSvg, safeLabel, maxTextW, {
        fontSize,
        fontWeight: "700",
        maxLines,
      });
      if (!lines || !lines.length) return false;
      if (lines.length >= maxLines && String(lines[lines.length - 1] || "").includes("…")) return true;
      const joined = lines.join(" ").replace(/\s+/g, " ").trim();
      return joined.length < safeLabel.replace(/\s+/g, " ").trim().length;
    }
  } catch (_) {
    /* ignore */
  }

  // Fallback heuristic (no measuring available): approximate chars per line.
  const approxChar = fontSize * 0.52;
  const maxChars = Math.max(8, Math.floor(maxTextW / approxChar));
  return safeLabel.trim().length > (maxChars * maxLines);
}

function positionArchiHoverTip(clientX, clientY) {
  const tip = ensureArchiHoverTip();
  const pad = 12;
  const offset = 14;
  const wasHidden = tip.style.display === "none";
  if (wasHidden) {
    tip.style.display = "block";
    tip.style.opacity = "0";
  }

  const rect = tip.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;

  let left = clientX + offset;
  let top = clientY + offset;
  if (left + rect.width + pad > vw) left = Math.max(pad, clientX - rect.width - offset);
  if (top + rect.height + pad > vh) top = Math.max(pad, clientY - rect.height - offset);

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  if (wasHidden) tip.style.opacity = "1";
}

function showArchiHoverTip(evt) {
  const tip = ensureArchiHoverTip();
  tip.style.display = "block";
  tip.style.opacity = "1";
  if (evt && typeof evt.clientX === "number" && typeof evt.clientY === "number") {
    positionArchiHoverTip(evt.clientX, evt.clientY);
  }
}

function hideArchiHoverTip() {
  if (!_archiHoverTip) return;
  _archiHoverTip.classList.remove("archi-hover-tip--rich");
  _archiHoverTip.style.display = "none";
  _archiHoverTip.style.opacity = "0";
  _archiHoverTipLastXY = null;
  if (_archiHoverTipRaf) cancelAnimationFrame(_archiHoverTipRaf);
  _archiHoverTipRaf = 0;
}

/** Rich HTML for explanation-panel pills (native <code>title</code> is flaky inside &lt;summary&gt;). */
const EXPLAIN_BADGE_TIP_HTML = {
  association: `
    <div class="explain-rich-tip">
      <p class="explain-rich-tip__p"><strong>Generic link (Association)</strong></p>
      <p class="explain-rich-tip__p">In ArchiMate, Association is intentionally generic: it does not assert a direction between elements, and it is not one of the relationships created by applying the §5.7 derivation rules to other links.</p>
    </div>
  `.trim(),
  waypoint: `
    <div class="explain-rich-tip">
      <p class="explain-rich-tip__p"><strong>Waypoint:</strong> A &ldquo;must-visit&rdquo; milestone on your architectural road trip. It breaks your journey into manageable phases (segments).</p>
      <p class="explain-rich-tip__p"><strong>Manual:</strong> You set this yourself to force a specific strategic constraint.</p>
      <p class="explain-rich-tip__p"><strong>Automatic:</strong> The logic identified this as a necessary bridge to complete your selected path.</p>
    </div>
  `.trim(),
  "forced-direction": `
    <div class="explain-rich-tip">
      <p class="explain-rich-tip__p"><strong>Forced direction</strong></p>
      <p class="explain-rich-tip__p">You chose a directional constraint between two waypoints. The pathfinder respects it: this hop is shown and interpreted in the direction illustrated (left &rarr; right in the summary), even when the underlying matrix relationship could be read the other way.</p>
      <p class="explain-rich-tip__p">Arrowheads and relationship labels follow that reading so they stay consistent with your waypoint order.</p>
    </div>
  `.trim(),
};

function explainSemanticStrengthTipHtml(sourceEl) {
  const strengthRaw = sourceEl?.getAttribute?.("data-semantic-strength") || "Strong";
  const mappingRaw = sourceEl?.getAttribute?.("data-semantic-mapping") || "";
  const ruleRaw = sourceEl?.getAttribute?.("data-semantic-rule") || "the active modeling rule";
  const rule = escPathDiag(ruleRaw);
  const fullLabel = mappingRaw ? `${strengthRaw} (${mappingRaw})` : strengthRaw;
  const labelHtml = `<strong>${escPathDiag(fullLabel)}</strong>`;
  const tone =
    strengthRaw === "Informal"
      ? "This hop is semantically loose under strict rigor."
      : strengthRaw === "Valid"
        ? "This hop is still normative and derived per §5.7."
        : "This hop is a direct or structural connection.";
  return `
    <div class="explain-rich-tip">
      <p class="explain-rich-tip__p">Semantic strength: ${labelHtml}</p>
      <p class="explain-rich-tip__p">This hop is considered ${labelHtml} because it follows ${rule}.</p>
      <p class="explain-rich-tip__p">${tone}</p>
    </div>
  `.trim();
}

function showExplainBadgeRichTip(evt, key, sourceEl = null) {
  const html =
    key === "semantic-strength"
      ? explainSemanticStrengthTipHtml(sourceEl)
      : EXPLAIN_BADGE_TIP_HTML[key];
  if (!html) return;
  const tip = ensureArchiHoverTip();
  tip.classList.add("archi-hover-tip--rich");
  tip.innerHTML = `<div class="archi-hover-tip__inner archi-hover-tip__inner--rich">${html}</div>`;
  tip.style.display = "block";
  tip.style.opacity = "1";
  let cx = evt && typeof evt.clientX === "number" ? evt.clientX : null;
  let cy = evt && typeof evt.clientY === "number" ? evt.clientY : null;
  if ((cx == null || cy == null) && evt?.target && typeof evt.target.getBoundingClientRect === "function") {
    const r = evt.target.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.bottom + 6;
  }
  if (cx != null && cy != null) positionArchiHoverTip(cx, cy);
}

/**
 * Delegated hover/focus for Association and Waypoint pills in the path explanation (see {@link EXPLAIN_BADGE_TIP_HTML}).
 */
function initExplainBadgeTips() {
  const container = document.getElementById("explanation-content");
  if (!container || container.dataset.explainBadgeTipsInit) return;
  container.dataset.explainBadgeTipsInit = "1";

  let badgeTipEl = null;
  const coarseNoHover = (() => {
    try {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
      return window.matchMedia("(hover: none), (pointer: coarse)").matches;
    } catch (_) {
      return false;
    }
  })();

  const targetFromEvent = (e) => {
    const raw = e.target;
    const el = raw?.nodeType === 3 ? raw.parentElement : raw;
    return el?.closest?.(".explain-badge-tip[data-explain-tip]");
  };

  container.addEventListener("pointerover", (e) => {
    if (coarseNoHover) return;
    const el = targetFromEvent(e);
    if (!el) return;
    if (badgeTipEl === el) return;
    badgeTipEl = el;
    const key = el.getAttribute("data-explain-tip");
    if (!key) return;
    showExplainBadgeRichTip(e, key, el);
  });

  container.addEventListener("pointerout", (e) => {
    if (coarseNoHover) return;
    const rel = e.relatedTarget;
    if (badgeTipEl && (!rel || !badgeTipEl.contains(rel))) {
      hideArchiHoverTip();
      badgeTipEl = null;
    }
  });

  container.addEventListener("focusin", (e) => {
    const el = targetFromEvent(e);
    if (!el) return;
    badgeTipEl = el;
    const key = el.getAttribute("data-explain-tip");
    if (key) showExplainBadgeRichTip(e, key, el);
  });

  container.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (a && a.closest?.(".explain-badge-tip") && container.contains(a)) return;
      hideArchiHoverTip();
      badgeTipEl = null;
    });
  });

  if (coarseNoHover) {
    container.addEventListener("click", (e) => {
      const el = targetFromEvent(e);
      if (!el) return;
      const key = el.getAttribute("data-explain-tip");
      if (!key) return;
      if (badgeTipEl === el && _archiHoverTip && _archiHoverTip.style.display !== "none") {
        hideArchiHoverTip();
        badgeTipEl = null;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      badgeTipEl = el;
      showExplainBadgeRichTip(e, key, el);
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!badgeTipEl) return;
        const t = e.target;
        if (t instanceof Element && t.closest(".explain-badge-tip[data-explain-tip]")) return;
        hideArchiHoverTip();
        badgeTipEl = null;
      },
      true
    );
  }
}

window.initExplainBadgeTips = initExplainBadgeTips;

function moveArchiHoverTip(evt) {
  if (!_archiHoverTip || _archiHoverTip.style.display === "none") return;
  if (!evt || typeof evt.clientX !== "number" || typeof evt.clientY !== "number") return;
  _archiHoverTipLastXY = { x: evt.clientX, y: evt.clientY };
  if (_archiHoverTipRaf) return;
  _archiHoverTipRaf = requestAnimationFrame(() => {
    _archiHoverTipRaf = 0;
    if (!_archiHoverTipLastXY) return;
    positionArchiHoverTip(_archiHoverTipLastXY.x, _archiHoverTipLastXY.y);
  });
}


function drawStandardElement(name, x, y, w, h, opts = {}) {
  const subtitle = typeof opts === "object" && opts ? String(opts.subtitle || "").trim() : "";
  const canonicalName =
    typeof opts === "object" && opts && opts.canonicalName
      ? String(opts.canonicalName)
      : String(name || "");
  const baseFontSize = typeof opts === "number" ? opts : (opts.fontSize ?? 11);
  const fontSize = subtitle ? Math.max(9, baseFontSize - 2) : baseFontSize;
  const measureSvg = typeof opts === "object" && opts && opts.measureSvg ? opts.measureSvg : null;
  const highlightMissingLabel =
    typeof opts === "object" && opts ? Boolean(opts.highlightMissingLabel) : false;

  const shape = SHAPES[canonicalName] ?? SHAPES[name] ?? { type: "rounded" };
  const color = getColor(canonicalName);
  const iconFn = ICONS[canonicalName];
  
  const g = document.createElementNS(SVG_NS, "g");
  g.appendChild(drawShape(shape.type, x, y, w, h, color));

  // Value (ellipse) has no corner glyph; Meaning shows a thought-bubble badge like other motivation types.
  const showCornerGlyph =
    iconFn && w > 60 && canonicalName !== "Value";
  if (showCornerGlyph) {
    const cube = shape.type === "cube";
    const doc = shape.type === "document";
    const badgeX = cube
      ? x + w - SHAPE_CUBE_DEPTH - ICON_GLYPH_SIZE - ICON_PAD - CORNER_GLYPH_NUDGE_X
      : x + w - ICON_BADGE_SIZE - ICON_PAD - (doc ? DOCUMENT_ICON_INSET_X : 0) - CORNER_GLYPH_NUDGE_X;
    const badgeY = cube
      ? y + SHAPE_CUBE_DEPTH + ICON_PAD + CORNER_GLYPH_NUDGE_Y
      : y + ICON_PAD + (doc ? DOCUMENT_ICON_INSET_Y : 0) + CORNER_GLYPH_NUDGE_Y;
    // color property passes down to the SVG "currentColor" strokes
    const iconG = svgEl("g", { transform: `translate(${badgeX}, ${badgeY})`, color: "#2f2f2b" });
    const glyph = document.createElementNS(SVG_NS, "svg");
    glyph.setAttribute("viewBox", "0 0 12 12");
    glyph.setAttribute("width", ICON_GLYPH_SIZE);
    glyph.setAttribute("height", ICON_GLYPH_SIZE);
    glyph.setAttribute("preserveAspectRatio", "xMidYMid meet");
    glyph.innerHTML = iconFn();
    iconG.appendChild(glyph);
    g.appendChild(iconG);
  }

  const padX = 10;
  const maxTextW = Math.max(24, w - padX * 2 - SAFE_TEXT_RIGHT_TRIM);
  const wrapApproxLines = (text, maxChars, maxLines) => {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return [String(text || "")];
    const wrapped = [];
    let cur = "";
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (next.length <= maxChars || !cur) {
        cur = next;
        continue;
      }
      wrapped.push(cur);
      cur = word;
      if (wrapped.length >= maxLines) break;
    }
    if (cur && wrapped.length < maxLines) wrapped.push(cur);
    if (wrapped.length >= maxLines && words.join(" ").length > wrapped.join(" ").length) {
      wrapped[wrapped.length - 1] = wrapped[wrapped.length - 1].replace(/\s+$/, "") + "…";
    }
    return wrapped.length ? wrapped : [String(text || "")];
  };

  let lines;
  if (measureSvg) {
    lines = wrapSvgTextLines(measureSvg, name, maxTextW, {
      fontSize,
      fontWeight: "700",
      maxLines: 3,
    });
    if (!lines.length) lines = [name];
  } else {
    const approxChar = fontSize * 0.52;
    const maxChars = Math.max(8, Math.floor(maxTextW / approxChar));
    lines = wrapApproxLines(name, maxChars, 3);
  }

  const subtitleFontSize = 8.5;
  const subtitleLineH = 9.5;
  let subtitleLines = [];
  if (subtitle) {
    if (measureSvg) {
      subtitleLines = wrapSvgTextLines(measureSvg, subtitle, maxTextW, {
        fontSize: subtitleFontSize,
        fontWeight: "600",
        maxLines: 2,
      });
    } else {
      const subtitleApproxChar = subtitleFontSize * 0.52;
      const subtitleMaxChars = Math.max(10, Math.floor(maxTextW / subtitleApproxChar));
      subtitleLines = wrapApproxLines(subtitle, subtitleMaxChars, 2);
    }
    if (!subtitleLines.length) subtitleLines = [subtitle];
  }

  const lineH = subtitle ? Math.max(10, fontSize + 1) : fontSize + 2;
  const subtitleReserved = subtitle ? subtitleLines.length * subtitleLineH + 6 : 0;
  const textBandTop = y + SAFE_TEXT_TOP_TRIM;
  const textBandBottom = y + h - subtitleReserved - 6;
  const textBandH = Math.max(textBandBottom - textBandTop, lineH);
  const titleCenterY = textBandTop + textBandH / 2 + (subtitle ? 1 : 0);
  const startY = titleCenterY - ((lines.length - 1) * (lineH / 2));
  const titleFill = highlightMissingLabel ? "#b45309" : "#111";
  const textAnchorX = x + padX + maxTextW / 2;
  /** Soft halo for contrast on tinted shapes — avoids thick stroked outlines that read as solid boxes per line. */
  const titleHaloStyle =
    "filter: drop-shadow(0 0 0.55px rgb(255,255,255)) drop-shadow(0 0 1.25px rgba(255,255,255,0.93));";
  const subtitleHaloStyle =
    "filter: drop-shadow(0 0 0.45px rgb(255,255,255)) drop-shadow(0 0 1px rgba(255,255,255,0.88));";

  lines.forEach((line, i) => {
    const txt = svgEl("text", {
      x: textAnchorX, y: startY + (i * lineH),
      "text-anchor": "middle", "dominant-baseline": "central",
      "font-size": fontSize, "font-family": "DM Sans, system-ui, sans-serif",
      "font-weight": "700", fill: titleFill, "pointer-events": "none",
      style: titleHaloStyle,
    });
    txt.textContent = line;
    g.appendChild(txt);
  });

  if (subtitle && subtitleLines.length) {
    const subtitleBottomY = y + h - 6;
    const subtitleStartY = subtitleBottomY - ((subtitleLines.length - 1) * subtitleLineH);
    subtitleLines.forEach((line, idx) => {
      g.appendChild(svgEl("text", {
        x: textAnchorX,
        y: subtitleStartY + (idx * subtitleLineH),
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "font-size": String(subtitleFontSize),
        "font-family": "DM Sans, system-ui, sans-serif",
        "font-weight": "600",
        fill: "#334155",
        opacity: "0.9",
        "pointer-events": "none",
        style: subtitleHaloStyle,
      }, line));
    });
  }

  return g;
}

function activeDomainContextKey() {
  const raw = window?.state?.domainContext;
  const key = String(raw || "abstract");
  if (typeof SCENARIOS !== "undefined" && SCENARIOS && SCENARIOS[key]) return key;
  return "abstract";
}

function shouldHighlightMissingThematicLabels() {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location?.search || "");
    if (q.get("debugLabels") === "1") return true;
  } catch (_) {}
  return window.location?.hostname === "localhost";
}

/** Caches one random pick per domain + element so labels do not flicker on redraw. */
const SCENARIO_LABEL_VARIANT_CACHE = new Map();
/** Invalidated when domain or {@code state.activeClusterIndex} changes. */
let scenarioLabelCacheSignature = null;

/**
 * Label map for the active theme: cluster slice when {@code SCENARIOS[key].clusters} exists,
 * otherwise the flat {@code labels} object.
 */
function getActiveScenarioLabelsMap(key) {
  const sc =
    typeof SCENARIOS !== "undefined" && SCENARIOS && SCENARIOS[key] ? SCENARIOS[key] : null;
  if (!sc) return {};
  const clusters = Array.isArray(sc.clusters) ? sc.clusters : [];
  if (clusters.length) {
    let idx = typeof window !== "undefined" && window.state ? window.state.activeClusterIndex : null;
    if (idx == null || !Number.isFinite(Number(idx))) idx = 0;
    idx = Math.max(0, Math.min(clusters.length - 1, Math.floor(Number(idx))));
    const slice = clusters[idx];
    return slice && slice.labels && typeof slice.labels === "object" ? slice.labels : {};
  }
  return sc.labels && typeof sc.labels === "object" ? sc.labels : {};
}

function getScenarioLabelCacheSignature(key) {
  const clusterIdx =
    typeof window !== "undefined" && window.state && window.state.activeClusterIndex != null
      ? String(window.state.activeClusterIndex)
      : "";
  return `${key}\0${clusterIdx}`;
}

function clearScenarioLabelVariantCache() {
  SCENARIO_LABEL_VARIANT_CACHE.clear();
  scenarioLabelCacheSignature = null;
}

if (typeof window !== "undefined") {
  window.clearScenarioLabelVariantCache = clearScenarioLabelVariantCache;
}

function resolveScenarioMappedLabel(domainKey, canonical, raw) {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const strs = raw.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (!strs.length) return null;
    if (strs.length === 1) return strs[0];
    const cacheKey = `${domainKey}\0${canonical}`;
    if (SCENARIO_LABEL_VARIANT_CACHE.has(cacheKey)) {
      return SCENARIO_LABEL_VARIANT_CACHE.get(cacheKey);
    }
    const idx = Math.floor(Math.random() * strs.length);
    const chosen = strs[idx];
    SCENARIO_LABEL_VARIANT_CACHE.set(cacheKey, chosen);
    return chosen;
  }
  if (raw == null) return null;
  return String(raw);
}

function getScenarioDisplayName(elementName) {
  const canonical = String(elementName || "");
  const key = activeDomainContextKey();
  const sig = getScenarioLabelCacheSignature(key);
  if (scenarioLabelCacheSignature !== sig) {
    SCENARIO_LABEL_VARIANT_CACHE.clear();
    scenarioLabelCacheSignature = sig;
  }
  const labels = getActiveScenarioLabelsMap(key);
  const hasKey = Object.prototype.hasOwnProperty.call(labels, canonical);
  const resolved = hasKey ? resolveScenarioMappedLabel(key, canonical, labels[canonical]) : null;
  const hasMapping = hasKey && resolved != null;
  const display = hasMapping ? resolved : canonical;
  const missingThematic = key !== "abstract" && !hasMapping;
  return {
    canonical,
    display,
    isThematic: key !== "abstract" && display !== canonical,
    domainContext: key,
    missingThematic,
    highlightMissing: missingThematic && shouldHighlightMissingThematicLabels(),
  };
}

/** Second line in step-by-step chips: ArchiMate element type when the primary label is a scenario/thematic name. */
function explainAbstractSublineFromScenario(scenario) {
  if (!scenario || scenario.display === scenario.canonical) return "";
  return `<span class="path-node-chip-abstract">${escPathDiag(scenario.canonical)}</span>`;
}

/** Hop summary row: always show the official element type on line 2 so every endpoint matches the stacked card chrome (icon + title + uppercase type). */
function explainHopSummaryAbstractSubline(scenario) {
  if (!scenario?.canonical) return "";
  return `<span class="path-node-chip-abstract">${escPathDiag(scenario.canonical)}</span>`;
}

function getDomainLabel(elementName) {
  return getScenarioDisplayName(elementName).display;
}

function drawElement(name, x, y, w = EL_W, h = EL_H, { measureSvg = null, alignVertical = false, illustrationSeed = "", hideCompositeIllustrations = false, diagUpperOnWest = null, compactCornerSide = "left", swimlaneCompositeSubsBelowDiagonal = false, swimlaneCompositePlacement = null, swimlaneExcludeAdjacentIllustrationSubs = null } = {}) {
  const safeName = String(name || "");
  const scenario = getScenarioDisplayName(safeName);
  const mainLabel = getDomainLabel(safeName);
  const subtitle = scenario.isThematic ? scenario.canonical : "";
  const pattern = COMPOSITE_PATTERNS[safeName];
  const g = svgEl("g", { class: "archimate-element", style: "cursor: pointer;" });
  g.setAttribute("data-node-id", safeName);
  const hoverTipsEnabled = (() => {
    try {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
      return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    } catch (_) {
      return true;
    }
  })();

  // Small tooltip: only show when the label is actually truncated in-box.
  if (hoverTipsEnabled) {
    g.addEventListener("mouseenter", (e) => {
      try {
        const wouldTruncate = labelWouldTruncateInBox(measureSvg, mainLabel, w, { subtitle });
        if (!wouldTruncate) {
          hideArchiHoverTip();
          return;
        }
        const fill = typeof getColor === "function" ? getColor(safeName) : "#ffffff";
        const stroke = "#2f2f2b";
        const iconSvg =
          (typeof window !== "undefined" && typeof window.getElementMiniSvg === "function")
            ? window.getElementMiniSvg(safeName, 18)
            : "";
        setArchiHoverTipContent({
          displayName: mainLabel,
          canonicalName: safeName,
          fill,
          stroke,
          iconSvg,
        });
        showArchiHoverTip(e);
      } catch (_) {}
    });
    g.addEventListener("mousemove", (e) => moveArchiHoverTip(e));
    g.addEventListener("mouseleave", () => hideArchiHoverTip());
  }

  if (!pattern) {
    const box = drawStandardElement(mainLabel, x, y, w, h, {
      measureSvg,
      subtitle,
      canonicalName: safeName,
      highlightMissingLabel: scenario.highlightMissing,
    });
    box.onclick = () => window.showElementDetails?.(safeName);
    g.appendChild(box);
    return g;
  }

  // Optional simplification: render composites as just the main box (no illustration sub-elements).
  if (hideCompositeIllustrations) {
    const box = drawStandardElement(mainLabel, x, y, w, h, {
      measureSvg,
      subtitle,
      canonicalName: safeName,
      highlightMissingLabel: scenario.highlightMissing,
    });
    box.onclick = () => window.showElementDetails?.(safeName);
    g.appendChild(box);
    return g;
  }

  const seed = illustrationSeed || `${safeName}:0`;
  const { subFirst, subSecond, moreCount } = pickCompositeIllustrationSubs(
    pattern,
    seed,
    swimlaneExcludeAdjacentIllustrationSubs
  );

  const appendMoreTypesHint = () => {
    if (moreCount <= 0) return;
    const hintG = svgEl("g", { class: "composite-illustration-more" });
    const tx = x + w - 6;
    const ty = y + 16;
    const ti = document.createElementNS(SVG_NS, "title");
    ti.textContent = `Example only: ${moreCount} more part type${moreCount === 1 ? "" : "s"} may aggregate here (not path hops).`;
    hintG.appendChild(ti);
    hintG.appendChild(svgEl("text", {
      x: tx,
      y: ty,
      "text-anchor": "end",
      "dominant-baseline": "central",
      "font-size": "14",
      "font-family": "DM Sans, system-ui, sans-serif",
      "font-weight": "700",
      fill: "#475569",
      "pointer-events": "none",
    }, "⋯"));
    g.appendChild(hintG);
  };

  // Vertical compact: all composites use T-bone side-loading to keep junctions visible.
  if (alignVertical) {
    // Vertical view: place illustrated subs on diagonals (≈45°) to keep the spine corridor clear.
    // Pick the diagonal orientation based on the incoming hop's label/bypass side (passed in).
    const gapX = typeof COMPOSITE_H_GAP_VERTICAL === "number" ? COMPOSITE_H_GAP_VERTICAL : COMPOSITE_H_GAP;
    const gapY = typeof COMPOSITE_V_GAP_VERTICAL === "number" ? COMPOSITE_V_GAP_VERTICAL : 40;
    const dx = w + gapX;
    const dy = h + gapY;
    const upperOnWest = (diagUpperOnWest == null) ? true : !!diagUpperOnWest;
    const xUpper = upperOnWest ? (x - dx) : (x + dx);
    const yUpper = y - dy;
    const xLower = upperOnWest ? (x + dx) : (x - dx);
    const yLower = y + dy;
    const illSubs = svgEl("g", { class: "composite-illustration composite-illustration--vertical" });
    const subLScenario = getScenarioDisplayName(subFirst);
    const subL = drawStandardElement(subLScenario.display, xUpper, yUpper, w, h, {
      fontSize: 10,
      measureSvg,
      subtitle: subLScenario.isThematic ? subLScenario.canonical : "",
      canonicalName: subFirst,
      highlightMissingLabel: subLScenario.highlightMissing,
    });
    subL.onclick = () => window.showElementDetails?.(subFirst);
    illSubs.appendChild(subL);
    const subRScenario = getScenarioDisplayName(subSecond);
    const subR = drawStandardElement(subRScenario.display, xLower, yLower, w, h, {
      fontSize: 10,
      measureSvg,
      subtitle: subRScenario.isThematic ? subRScenario.canonical : "",
      canonicalName: subSecond,
      highlightMissingLabel: subRScenario.highlightMissing,
    });
    subR.onclick = () => window.showElementDetails?.(subSecond);
    illSubs.appendChild(subR);
    g.appendChild(illSubs);

    const mainBox = drawStandardElement(mainLabel, x, y, w, h, {
      measureSvg,
      subtitle,
      canonicalName: safeName,
      highlightMissingLabel: scenario.highlightMissing,
    });
    mainBox.onclick = () => window.showElementDetails?.(safeName);
    g.appendChild(mainBox);

    const illEdges = svgEl("g", { class: "composite-illustration" });
    if (measureSvg) ensureMarkers(measureSvg);
    // Upper sub → Parent: open diamond at the parent corner (marker-end).
    {
      const sx = upperOnWest ? (xUpper + w) : xUpper;
      const sy = yUpper + h;
      const ex = upperOnWest ? x : (x + w);
      const ey = y;
      const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
      arrowG.appendChild(svgEl("path", {
        ...compositeIllustrationAggPath(sx, sy, ex, ey, "end"),
        stroke: "#333",
        "stroke-width": "1.5",
        fill: "none",
        "stroke-dasharray": "4,2",
      }));
      arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: subFirst, to: safeName, code: "G" }); };
      illEdges.appendChild(arrowG);
    }
    // Parent → Lower sub: open diamond at the parent corner (marker-start).
    {
      const sx = upperOnWest ? (x + w) : x;
      const sy = y + h;
      const ex = upperOnWest ? xLower : (xLower + w);
      const ey = yLower;
      const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
      arrowG.appendChild(svgEl("path", {
        ...compositeIllustrationAggPath(sx, sy, ex, ey, "start"),
        stroke: "#333",
        "stroke-width": "1.5",
        fill: "none",
        "stroke-dasharray": "4,2",
      }));
      arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: safeName, to: subSecond, code: "G" }); };
      illEdges.appendChild(arrowG);
    }
    g.appendChild(illEdges);
    appendMoreTypesHint();
    return g;
  }

  // Horizontal swimlanes: illustrated subs below the main box. Layout is chosen from routing (vertical bus X)
  // so subs avoid H–V–H corridors — prefer one sub centered under the parent + one diagonal; else dual-diagonal.
  if (swimlaneCompositeSubsBelowDiagonal) {
    const gapX = typeof COMPOSITE_H_GAP_VERTICAL === "number" ? COMPOSITE_H_GAP_VERTICAL : COMPOSITE_H_GAP;
    const gapY = compositeAggGapY();
    const dx = w + gapX;
    const dy = h + gapY;
    const xLeft = x - dx;
    const xRight = x + dx;
    const ySub = y + dy;
    const belowCenterX = x + w / 2 - EL_W / 2;
    const placement = swimlaneCompositePlacement && swimlaneCompositePlacement.mode
      ? swimlaneCompositePlacement
      : { mode: "dual-diag" };

    const illSubs = svgEl("g", { class: "composite-illustration composite-illustration--swimlane-below-diagonal" });

    const appendSub = (canonical, px, py) => {
      const subScenario = getScenarioDisplayName(canonical);
      const subEl = drawStandardElement(subScenario.display, px, py, w, h, {
        fontSize: 10,
        measureSvg,
        subtitle: subScenario.isThematic ? subScenario.canonical : "",
        canonicalName: canonical,
        highlightMissingLabel: subScenario.highlightMissing,
      });
      subEl.onclick = () => window.showElementDetails?.(canonical);
      illSubs.appendChild(subEl);
    };

    if (placement.mode === "below-diag") {
      const diagOnRight = !!placement.diagOnRight;
      appendSub(subFirst, belowCenterX, ySub);
      appendSub(subSecond, diagOnRight ? xRight : xLeft, ySub);
    } else {
      appendSub(subFirst, xLeft, ySub);
      appendSub(subSecond, xRight, ySub);
    }

    g.appendChild(illSubs);

    const mainBox = drawStandardElement(mainLabel, x, y, w, h, {
      measureSvg,
      subtitle,
      canonicalName: safeName,
      highlightMissingLabel: scenario.highlightMissing,
    });
    mainBox.onclick = () => window.showElementDetails?.(safeName);
    g.appendChild(mainBox);

    const illEdges = svgEl("g", { class: "composite-illustration" });
    if (measureSvg) ensureMarkers(measureSvg);

    if (placement.mode === "below-diag") {
      const diagOnRight = !!placement.diagOnRight;
      const cx = x + w / 2;
      const sy0 = y + h;
      {
        const ey = ySub;
        const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
        arrowG.appendChild(svgEl("path", {
          ...compositeIllustrationAggPath(cx, sy0, cx, ey, "start"),
          stroke: "#333",
          "stroke-width": "1.5",
          fill: "none",
          "stroke-dasharray": "4,2",
        }));
        arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: safeName, to: subFirst, code: "G" }); };
        illEdges.appendChild(arrowG);
      }
      if (diagOnRight) {
        const sx = x + w;
        const ex = xRight;
        const ey = ySub;
        const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
        arrowG.appendChild(svgEl("path", {
          ...compositeIllustrationAggPath(sx, sy0, ex, ey, "start"),
          stroke: "#333",
          "stroke-width": "1.5",
          fill: "none",
          "stroke-dasharray": "4,2",
        }));
        arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: safeName, to: subSecond, code: "G" }); };
        illEdges.appendChild(arrowG);
      } else {
        const sx = x;
        const ex = xLeft + w;
        const ey = ySub;
        const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
        arrowG.appendChild(svgEl("path", {
          ...compositeIllustrationAggPath(sx, sy0, ex, ey, "start"),
          stroke: "#333",
          "stroke-width": "1.5",
          fill: "none",
          "stroke-dasharray": "4,2",
        }));
        arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: safeName, to: subSecond, code: "G" }); };
        illEdges.appendChild(arrowG);
      }
    } else {
      {
        const sx = x;
        const sy = y + h;
        const ex = xLeft + w;
        const ey = ySub;
        const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
        arrowG.appendChild(svgEl("path", {
          ...compositeIllustrationAggPath(sx, sy, ex, ey, "start"),
          stroke: "#333",
          "stroke-width": "1.5",
          fill: "none",
          "stroke-dasharray": "4,2",
        }));
        arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: safeName, to: subFirst, code: "G" }); };
        illEdges.appendChild(arrowG);
      }
      {
        const sx = x + w;
        const sy = y + h;
        const ex = xRight;
        const ey = ySub;
        const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
        arrowG.appendChild(svgEl("path", {
          ...compositeIllustrationAggPath(sx, sy, ex, ey, "start"),
          stroke: "#333",
          "stroke-width": "1.5",
          fill: "none",
          "stroke-dasharray": "4,2",
        }));
        arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: safeName, to: subSecond, code: "G" }); };
        illEdges.appendChild(arrowG);
      }
    }
    g.appendChild(illEdges);
    appendMoreTypesHint();
    return g;
  }

  // COMPOSITE PATTERN: Illustration-only aggregation.
  // Default: stacked above/below. Compact lanes: bottom + right corner to avoid overlaps.
  const vOffset = COMPOSITE_V_OFF;
  const cornerCompact = typeof window !== "undefined" && window.state && window.state.pathFlow === "compact";
  const side = (compactCornerSide === "right") ? "right" : "left";
  const xSide =
    cornerCompact
      ? (side === "left" ? (x - (w + COMPOSITE_H_GAP)) : (x + w + COMPOSITE_H_GAP))
      : null;
  const ySide = cornerCompact ? y : null;
  const illSubs = svgEl("g", { class: "composite-illustration" });
  if (cornerCompact) {
    const xBottom = x;
    const yBottom = y + vOffset;
    const subRScenario = getScenarioDisplayName(subFirst);
    const subR = drawStandardElement(subRScenario.display, xSide, ySide, w, h, {
      fontSize: 10,
      measureSvg,
      subtitle: subRScenario.isThematic ? subRScenario.canonical : "",
      canonicalName: subFirst,
      highlightMissingLabel: subRScenario.highlightMissing,
    });
    subR.onclick = () => window.showElementDetails?.(subFirst);
    illSubs.appendChild(subR);
    const subBScenario = getScenarioDisplayName(subSecond);
    const subB = drawStandardElement(subBScenario.display, xBottom, yBottom, w, h, {
      fontSize: 10,
      measureSvg,
      subtitle: subBScenario.isThematic ? subBScenario.canonical : "",
      canonicalName: subSecond,
      highlightMissingLabel: subBScenario.highlightMissing,
    });
    subB.onclick = () => window.showElementDetails?.(subSecond);
    illSubs.appendChild(subB);
  } else {
    const subTopScenario = getScenarioDisplayName(subFirst);
    const subTop = drawStandardElement(subTopScenario.display, x, y - vOffset, w, h, {
      fontSize: 10,
      measureSvg,
      subtitle: subTopScenario.isThematic ? subTopScenario.canonical : "",
      canonicalName: subFirst,
      highlightMissingLabel: subTopScenario.highlightMissing,
    });
    subTop.onclick = () => window.showElementDetails?.(subFirst);
    illSubs.appendChild(subTop);
    const subBotScenario = getScenarioDisplayName(subSecond);
    const subBot = drawStandardElement(subBotScenario.display, x, y + vOffset, w, h, {
      fontSize: 10,
      measureSvg,
      subtitle: subBotScenario.isThematic ? subBotScenario.canonical : "",
      canonicalName: subSecond,
      highlightMissingLabel: subBotScenario.highlightMissing,
    });
    subBot.onclick = () => window.showElementDetails?.(subSecond);
    illSubs.appendChild(subBot);
  }
  g.appendChild(illSubs);

  const mainBox = drawStandardElement(mainLabel, x, y, w, h, {
    measureSvg,
    subtitle,
    canonicalName: safeName,
    highlightMissingLabel: scenario.highlightMissing,
  });
  mainBox.onclick = () => window.showElementDetails?.(safeName);
  g.appendChild(mainBox);

  const illEdges = svgEl("g", { class: "composite-illustration" });
  if (measureSvg) ensureMarkers(measureSvg);
  const drawAggVertical = (xLine, y0, y1, fromSub, diamondOn) => {
    const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
    arrowG.appendChild(svgEl("path", {
      ...compositeIllustrationAggPath(xLine, y0, xLine, y1, diamondOn),
      stroke: "#333",
      "stroke-width": "1.5",
      fill: "none",
      "stroke-dasharray": "4,2",
    }));
    arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: fromSub, to: safeName, code: "G" }); };
    return arrowG;
  };
  const drawAggHorizontal = (yLine, x0, x1, fromSub, diamondOn) => {
    const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
    arrowG.appendChild(svgEl("path", {
      ...compositeIllustrationAggPath(x0, yLine, x1, yLine, diamondOn),
      stroke: "#333",
      "stroke-width": "1.5",
      fill: "none",
      "stroke-dasharray": "4,2",
    }));
    arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: fromSub, to: safeName, code: "G" }); };
    return arrowG;
  };

  if (cornerCompact) {
    // Bottom sub → Parent: vertical dashed; diamond at main bottom (path ends at y + h).
    illEdges.appendChild(drawAggVertical(
      x + w / 2,
      y + vOffset,
      y + h,
      subSecond,
      "end"
    ));
    // Parent ↔ side sub: horizontal dashed; diamond on the parent face.
    if (xSide != null) {
      if (side === "left") {
        illEdges.appendChild(drawAggHorizontal(
          y + h / 2,
          xSide + w,
          x,
          subFirst,
          "end"
        ));
      } else {
        illEdges.appendChild(drawAggHorizontal(
          y + h / 2,
          x + w,
          xSide,
          subFirst,
          "start"
        ));
      }
    }
  } else {
    const drawAggLine = (fromY, isTop, fromSub) => {
      const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
      const xM = x + w / 2;
      const yS = isTop ? fromY + h : fromY;
      const yE = isTop ? y : y + h;
      arrowG.appendChild(svgEl("path", {
        ...compositeIllustrationAggPath(xM, yS, xM, yE, "end"),
        stroke: "#333",
        "stroke-width": "1.5",
        fill: "none",
        "stroke-dasharray": "4,2",
      }));
      arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: fromSub, to: safeName, code: "G" }); };
      return arrowG;
    };
    illEdges.appendChild(drawAggLine(y - vOffset, true, subFirst));
    illEdges.appendChild(drawAggLine(y + vOffset, false, subSecond));
  }
  g.appendChild(illEdges);
  appendMoreTypesHint();
  return g;
}

// (Removed experimental: collision-aware deferred composite overlays)

function drawShape(type, x, y, w, h, fill) {
  const stroke = "#2f2f2b";
  const sw = "1.6";
  switch (type) {
    case "beveled": {
      const cut = 10; 
      const d = `
        M ${x + cut} ${y} 
        L ${x + w - cut} ${y} 
        L ${x + w} ${y + cut} 
        L ${x + w} ${y + h - cut} 
        L ${x + w - cut} ${y + h} 
        L ${x + cut} ${y + h} 
        L ${x} ${y + h - cut} 
        L ${x} ${y + cut} 
        Z
      `.trim().replace(/\s+/g, ' ');

      return svgEl("path", { d, fill, stroke, "stroke-width": sw });
    }
    case "rounded":
      return svgEl("rect", { x, y, width: w, height: h, rx: 6, ry: 6, fill, stroke, "stroke-width": sw });
    case "rect":
      return svgEl("rect", { x, y, width: w, height: h, rx: 0, ry: 0, fill, stroke, "stroke-width": sw });
    case "parallelogram": {
      const skew = 8;
      return svgEl("polygon", {
        points: `${x+skew},${y} ${x+w},${y} ${x+w-skew},${y+h} ${x},${y+h}`,
        fill, stroke, "stroke-width": sw,
      });
    }
    case "ellipse":
      return svgEl("ellipse", { cx: x+w/2, cy: y+h/2, rx: w/2, ry: h/2, fill, stroke, "stroke-width": sw });
    case "cloud": {
      const cx = x + w/2, cy = y + h/2;
      return svgEl("path", {
        d: `M${cx-20},${cy+8} C${cx-30},${cy+8} ${cx-30},${cy-8} ${cx-15},${cy-8}
            C${cx-12},${cy-18} ${cx+12},${cy-18} ${cx+15},${cy-8}
            C${cx+30},${cy-8} ${cx+30},${cy+8} ${cx+20},${cy+8} Z`,
        fill, stroke, "stroke-width": sw,
      });
    }
    case "chevron": {
      const tip = 14;
      return svgEl("polygon", {
        points: `${x},${y} ${x+w-tip},${y} ${x+w},${y+h/2} ${x+w-tip},${y+h} ${x},${y+h} ${x+tip},${y+h/2}`,
        fill, stroke, "stroke-width": sw,
      });
    }
    case "rounded-arrow": {
      const tip = 16;
      const r = 10;
      return svgEl("path", {
        d: `M${x+r},${y}
            L${x+w-tip},${y}
            L${x+w},${y+h/2}
            L${x+w-tip},${y+h}
            L${x+r},${y+h}
            Q${x},${y+h} ${x},${y+h-r}
            L${x},${y+r}
            Q${x},${y} ${x+r},${y}
            Z`,
        fill, stroke, "stroke-width": sw,
      });
    }
    case "pill": {
      const rx = Math.min(w, h) / 2;
      return svgEl("rect", { x, y, width: w, height: h, rx, ry: rx, fill, stroke, "stroke-width": sw });
    }
    case "cube": {
      const d = 10; 
      const g = svgEl("g", {});
      const top = svgEl("polygon", {
        points: `${x+d},${y} ${x+w},${y} ${x+w-d},${y+d} ${x},${y+d}`,
        fill: shadeHex(fill, +0.10),
        stroke, "stroke-width": sw,
      });
      const side = svgEl("polygon", {
        points: `${x+w},${y} ${x+w},${y+h-d} ${x+w-d},${y+h} ${x+w-d},${y+d}`,
        fill: shadeHex(fill, -0.06),
        stroke, "stroke-width": sw,
      });
      const front = svgEl("polygon", {
        points: `${x},${y+d} ${x+w-d},${y+d} ${x+w-d},${y+h} ${x},${y+h}`,
        fill,
        stroke, "stroke-width": sw,
      });
      g.appendChild(top);
      g.appendChild(side);
      g.appendChild(front);
      return g;
    }
    case "technology-component": {
      const g = svgEl("g", {});
      for (const r of technologyComponentRectSpecs(x, y, w, h)) {
        g.appendChild(svgEl("rect", { ...r, fill, stroke, "stroke-width": sw }));
      }
      return g;
    }
    case "document": {
      const fold = DOCUMENT_SHAPE_FOLD;
      const g = svgEl("g", {});
      g.appendChild(svgEl("path", {
        d: `M${x},${y} L${x+w-fold},${y} L${x+w},${y+fold} L${x+w},${y+h} L${x},${y+h} Z`,
        fill, stroke, "stroke-width": sw,
      }));
      g.appendChild(svgEl("path", {
        d: `M${x+w-fold},${y} L${x+w-fold},${y+fold} L${x+w},${y+fold} Z`,
        fill: shadeHex(fill, +0.18),
        stroke, "stroke-width": sw,
      }));
      return g;
    }
    case "plateau": {
      const el = svgEl("g", {});
      el.appendChild(svgEl("rect", { x, y, width: w, height: h, rx: 2, fill, stroke, "stroke-width": sw }));
      el.appendChild(svgEl("line", { x1: x+2, y1: y+h+3, x2: x+w, y2: y+h+3, stroke: "#555", "stroke-width": "1" }));
      el.appendChild(svgEl("line", { x1: x+4, y1: y+h+6, x2: x+w, y2: y+h+6, stroke: "#555", "stroke-width": "1" }));
      return el;
    }
    case "dashed":
      return svgEl("rect", { x, y, width: w, height: h, rx: 6, fill: "none", stroke: "#888", "stroke-width": sw, "stroke-dasharray": "5,3" });
    default:
      return svgEl("rect", { x, y, width: w, height: h, rx: 8, fill, stroke, "stroke-width": sw });
  }
}

function describeRelCodesForTooltip(codes, isDirect) {
  const list = (codes ?? []).map(c => c.toUpperCase());
  const names = list.map(c => RELATIONSHIPS[c]?.name ?? c).join(" / ");
  const codeStr = list.length ? `[${list.join(", ")}]` : "";
  const directStr = isDirect ? "direct" : "derived (§5.7)";
  return `${names} ${codeStr} — ${directStr}`.trim();
}

function describeRelCodesForDiagramLabel(codes) {
  const list = (codes ?? []).map((c) => String(c).toUpperCase()).filter(Boolean);
  if (list.length > 1) {
    return "Undecided";
  }
  if (list.length === 0) return "";
  return list.map((c) => RELATIONSHIPS[c]?.name ?? c).join(" / ");
}


// ─────────────────────────────────────────────────────────────────────────────
// ARROW DRAWING (Restored Interaction & Orthogonal Routing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Slide the path’s first vertex along the opening segment so marker-start (Appendix B composition,
 * aggregation, triggering) clears the source element. Relationship strokes are drawn under node
 * layers; without this, a horizontal hop reads as a plain line because the rhombus sits under the
 * source box. Short first legs still get a small inset whenever a start marker is active so the
 * diamond is not clipped at degenerate spans.
 */
function hopPathStartInsetAlongAxis(from, toward, apply) {
  if (!apply || !Number.isFinite(from) || !Number.isFinite(toward)) return from;
  const span = Math.abs(toward - from);
  if (!(span > 1e-6)) return from;
  const insetMax = Math.min(VERT_EDGE_INSET, span * 0.38);
  const inset = Math.min(insetMax, span - 0.35);
  if (inset <= 1e-6) return from;
  return from + Math.sign(toward - from) * inset;
}

/** Inset the first point toward (xT, yT) along the chord (diagonal or first leg of a chord route). */
function hopPathStartInsetAlongChord(x1, y1, xT, yT, apply) {
  if (!apply) return { x: x1, y: y1 };
  const dx = xT - x1;
  const dy = yT - y1;
  const chordLen = Math.hypot(dx, dy);
  if (!(chordLen > 1e-6)) return { x: x1, y: y1 };
  const insetMax = Math.min(VERT_EDGE_INSET, chordLen * 0.38);
  const inset = Math.min(insetMax, chordLen - 0.35);
  if (inset <= 1e-6) return { x: x1, y: y1 };
  const ux = dx / chordLen;
  const uy = dy / chordLen;
  return { x: x1 + ux * inset, y: y1 + uy * inset };
}

/** Whether `activeCode` is a direct (Appendix B) vs §5.7 derived relationship for this hop. */
function isActiveCodeDirectInMatrix(step, activeCode) {
  if (!activeCode || !step) return step?.isDirect ?? true;
  const U = String(activeCode).toUpperCase();
  if (step.matrixDirectCodes?.length && step.matrixDirectCodes.includes(U)) return true;
  if (step.matrixDerivedCodes?.length && step.matrixDerivedCodes.includes(U)) return false;
  return step.isDirect ?? true;
}

/**
 * Path steps sometimes omit full Appendix B split lists (edge-only fallback). For UI tier/badge,
 * merge the normative row for this directed pair so derived letters classify as derived.
 */
function pathStepWithCanonicalMatrixRow(step, fromEl, toEl) {
  if (!step || !fromEl || !toEl || typeof mergeMatrixRowForPair !== "function") return step;
  const row = mergeMatrixRowForPair(fromEl, toEl, true);
  const md = (row.direct || []).map((c) => String(c).toUpperCase());
  const mder = (row.derived || []).map((c) => String(c).toUpperCase());
  if (md.length === 0 && mder.length === 0) return step;
  return { ...step, matrixDirectCodes: md, matrixDerivedCodes: mder };
}

/**
 * Short label for relationship-choice buttons: Appendix B explicit vs §5.7 inferred from the matrix row.
 * Association (O) is the universal fallback (§5.2.4), not an Appendix B cell code — show as distinct from Explicit/Inferred.
 */
function relChoiceMatrixKindLabel(code, matrixDirectCodes, matrixDerivedCodes) {
  const U = String(code || "").toUpperCase();
  if (U === "O") return "Generic";
  const d = (matrixDirectCodes || []).map((c) => String(c).toUpperCase());
  const der = (matrixDerivedCodes || []).map((c) => String(c).toUpperCase());
  if (d.includes(U)) return "Explicit";
  if (der.includes(U)) return "Inferred";
  return "";
}

/**
 * When a hop has multiple Appendix B options, the explanation UI also offers Association (O); see {@link explainEdge} {@code codesForButtons}.
 * @param {string[]} matrixCodes
 * @returns {string[]}
 */
function relationshipPickerCodesFromMatrixCodes(matrixCodes) {
  const raw = Array.isArray(matrixCodes) ? matrixCodes : [];
  if (raw.length <= 1) {
    return raw.map((c) => String(c));
  }
  const out = [];
  const seen = new Set();
  for (const c of raw) {
    const u = String(c || "").toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(c);
  }
  if (!seen.has("O")) out.push("O");
  return out;
}

/**
 * Appendix B codes for the reversed hop (to → from), after picker shaping.
 * Empty when the matrix defines no relationship in that direction — same basis as the edge context menu flip action.
 */
function reverseRelationshipCodesForDirectedPair(fromElement, toElement) {
  const from = String(fromElement ?? "").trim();
  const to = String(toElement ?? "").trim();
  if (!from || !to || from === to || typeof mergeMatrixRowForPair !== "function") return [];
  const row = mergeMatrixRowForPair(to, from, true);
  const merged = Array.isArray(row?.merged) ? row.merged : [];
  if (!merged.length) return [];
  const upper = merged.map((c) => String(c || "").toUpperCase()).filter(Boolean);
  const picker = upper.length > 1 ? relationshipPickerCodesFromMatrixCodes(upper) : upper;
  return picker.map((c) => String(c || "").toUpperCase()).filter(Boolean);
}

/**
 * {@code userChoices[hopIndex]} can be stale (different path alternative, session restore, etc.).
 * Only accept a stored choice if it appears in this hop's picker list (matrix codes, plus O when multi-option).
 * When {@code fromElement} is omitted, derives path endpoints from {@code window.state} so flipped hops
 * validate against the same Appendix B row as {@link drawArrow}.
 */
function resolvedRelationshipCodeForHop(step, hopIndex, fromElement, edgeConstraints) {
  let fromEl = fromElement;
  let ec = edgeConstraints;
  if (arguments.length < 3 && hopIndex != null && typeof window !== "undefined" && window.state?.segments) {
    const flat = flattenSegments(window.state.segments, window.state.activePathIdx ?? 0);
    const ix = Number(hopIndex);
    if (Number.isInteger(ix) && ix >= 1 && ix < flat.length) {
      fromEl = flat[ix - 1]?.element;
      if (ec === undefined) ec = window.state.edgeConstraints;
    }
  } else if (arguments.length >= 3 && ec === undefined && typeof window !== "undefined") {
    ec = window.state?.edgeConstraints;
  }

  const pathCodes = Array.isArray(step?.codes) ? step.codes : [];
  let toEl = String(step?.element || "").trim();
  let fromStr = fromEl != null ? String(fromEl).trim() : "";
  /**
   * {@link drawArrow} often passes only `{ codes }` (no `element`). Without the hop target, we cannot
   * merge {@link matrixCodesForPathAppendixBRow} — the picker shrinks to pathfinder letters, user picks
   * (e.g. Composition) fall out of that list, and {@link edgeChoiceCommittedForHop} keeps the edge
   * “provisional” (no markers) while the explanation panel still shows the chosen type.
   */
  if ((!toEl || !fromStr) && hopIndex != null && typeof window !== "undefined" && window.state?.segments) {
    const flat = flattenSegments(window.state.segments, window.state.activePathIdx ?? 0);
    const ix = Number(hopIndex);
    if (Number.isInteger(ix) && ix >= 1 && ix < flat.length) {
      if (!fromStr) fromStr = String(flat[ix - 1]?.element || "").trim();
      if (!toEl) toEl = String(flat[ix]?.element || "").trim();
    }
  }
  const matrixCodes =
    fromStr && toEl
      ? matrixCodesForPathAppendixBRow(fromStr, toEl, pathCodes, ec)
      : pathCodes.map((c) => String(c || "").toUpperCase()).filter(Boolean);

  const pickerCodes =
    matrixCodes.length > 1 ? relationshipPickerCodesFromMatrixCodes(matrixCodes) : matrixCodes;
  const list = pickerCodes.map((c) => String(c).toUpperCase());
  const fallback = (matrixCodes[0] != null ? String(matrixCodes[0]) : "O").toUpperCase();
  if (hopIndex == null || typeof window === "undefined") return fallback;
  const raw = window.state?.userChoices?.[hopIndex];
  if (raw == null || raw === "") return fallback;
  const u = String(raw).toUpperCase();
  if (!list.includes(u)) return fallback;
  const exact = pickerCodes.find((c) => String(c).toUpperCase() === u);
  return exact != null ? String(exact).toUpperCase() : u;
}

/**
 * True when the user has explicitly picked a code for this hop (multi-code hops only).
 * When {@code window.state.segments} is available, validates against {@link appendixMatrixCodesForPathHopIndex}
 * so picks line up with the same Appendix B row as {@link resolvedRelationshipCodeForHop} (path segment
 * `codes` alone can omit letters the matrix row still allows).
 */
function edgeChoiceCommittedForHop(hopIndex, codesList, edgeConstraints) {
  if (hopIndex == null) return true;
  let effective = Array.isArray(codesList)
    ? codesList.map((c) => String(c || "").toUpperCase()).filter(Boolean)
    : [];
  if (typeof window !== "undefined" && Array.isArray(window.state?.segments)) {
    const flat = flattenSegments(window.state.segments, window.state.activePathIdx ?? 0);
    const ix = Number(hopIndex);
    if (Number.isInteger(ix) && ix >= 1 && ix < flat.length) {
      const ec = edgeConstraints !== undefined ? edgeConstraints : window.state?.edgeConstraints;
      const ap = appendixMatrixCodesForPathHopIndex(flat, hopIndex, ec);
      if (ap.length) effective = ap;
    }
  }
  if (!effective.length || effective.length <= 1) return true;
  if (typeof window === "undefined") return false;
  const raw = window.state?.userChoices?.[hopIndex];
  if (raw == null || raw === "") return false;
  const u = String(raw).toUpperCase();
  const pickerCodes = relationshipPickerCodesFromMatrixCodes(effective);
  return pickerCodes.some((c) => String(c).toUpperCase() === u);
}

/**
 * Minimum horizontal gap between swimlane columns so the widest hop label fits in the inter-node channel.
 */
function estimateSwimlaneHopLabelWidthPx(step, hopIndex, flatSteps = null, edgeConstraints = null) {
  const ec =
    edgeConstraints ?? (typeof window !== "undefined" ? window.state?.edgeConstraints : null);
  const codesList =
    flatSteps && hopIndex != null
      ? appendixMatrixCodesForPathHopIndex(flatSteps, hopIndex, ec)
      : step?.codes?.length
        ? step.codes.map((c) => String(c || "").toUpperCase()).filter(Boolean)
        : [];
  if (!codesList.length) return SWIMLANE_COMPACT_COL_GAP;
  const choiceUndecided =
    hopIndex != null && codesList.length > 1 && !edgeChoiceCommittedForHop(hopIndex, codesList, ec);
  const active =
    hopIndex != null
      ? resolvedRelationshipCodeForHop(
          flatSteps && hopIndex != null
            ? { codes: codesList, element: flatSteps[hopIndex]?.element }
            : { codes: codesList },
          hopIndex,
          flatSteps && hopIndex != null ? flatSteps[hopIndex - 1]?.element : undefined,
          ec,
        )
      : String(codesList[0] ?? "O");
  const labelLines = wrapLabel(
    choiceUndecided ? describeRelCodesForDiagramLabel(codesList) : describeRelCodesForDiagramLabel([active])
  );
  const fontSize = 8.5;
  const lines = labelLines ?? [""];
  const approxTextW = Math.min(170, Math.max(48, lines.join(" ").length * (fontSize * 0.55)));
  const hasChoices = codesList.length > 1;
  const showHop = hopIndex != null;
  const hopBadgeR = showHop ? (hasChoices ? 9 : 7) : 0;
  const textStartW = showHop ? 2 * hopBadgeR + VERT_BADGE_NAME_GAP : 0;
  return textStartW + approxTextW + 20;
}

function normalizeEdgeConstraintForRender(raw) {
  if (!raw || typeof raw !== "object") return null;
  const sourceId = String(raw.sourceId ?? raw.source ?? "").trim();
  const targetId = String(raw.targetId ?? raw.target ?? "").trim();
  if (!sourceId || !targetId || sourceId === targetId) return null;
  const type = raw.type === "LOCKED_RELATIONSHIP" ? "LOCKED_RELATIONSHIP" : "FORCED_DIRECTION";
  return { sourceId, targetId, type };
}

function hasDirectedEdgeConstraint(edgeConstraints, source, target, type = "FORCED_DIRECTION") {
  if (!Array.isArray(edgeConstraints) || !source || !target) return false;
  for (const raw of edgeConstraints) {
    const c = normalizeEdgeConstraintForRender(raw);
    if (!c) continue;
    if (c.type !== type) continue;
    if (c.sourceId === source && c.targetId === target) return true;
  }
  return false;
}

/**
 * Appendix B merged relationship letters for a path hop, respecting {@code FORCED_DIRECTION} when
 * it reverses the reading relative to waypoint traversal (same basis as {@link drawArrow}).
 */
function matrixCodesForPathAppendixBRow(pathFromEl, pathToEl, pathStepCodes, edgeConstraints) {
  const list = Array.isArray(pathStepCodes)
    ? pathStepCodes.map((c) => String(c || "").toUpperCase()).filter(Boolean)
    : [];
  const from = String(pathFromEl || "").trim();
  const to = String(pathToEl || "").trim();
  if (!from || !to || from === to) return list;
  const ec = Array.isArray(edgeConstraints) ? edgeConstraints : [];
  if (
    hasDirectedEdgeConstraint(ec, to, from, "FORCED_DIRECTION") &&
    !hasDirectedEdgeConstraint(ec, from, to, "FORCED_DIRECTION")
  ) {
    if (typeof mergeMatrixRowForPair === "function") {
      const row = mergeMatrixRowForPair(to, from, true);
      if (row?.merged?.length) {
        return row.merged.map((c) => String(c || "").toUpperCase()).filter(Boolean);
      }
    }
  }
  return list;
}

function appendixMatrixCodesForPathHopIndex(flatSteps, hopIndex, edgeConstraints) {
  const i = Number(hopIndex);
  if (!Number.isInteger(i) || i < 1 || !Array.isArray(flatSteps) || i >= flatSteps.length) return [];
  const prevEl = String(flatSteps[i - 1]?.element || "").trim();
  const currEl = String(flatSteps[i]?.element || "").trim();
  const pathCodes = Array.isArray(flatSteps[i]?.codes) ? flatSteps[i].codes : [];
  return matrixCodesForPathAppendixBRow(prevEl, currEl, pathCodes, edgeConstraints);
}

/**
 * Shared “does this hop still need a relationship pick?” basis for diagram + explanation.
 * Uses Appendix B row codes when available; falls back to path step codes when Appendix data is absent.
 */
function hopRelationshipChoiceState(flatSteps, hopIndex, edgeConstraints) {
  const i = Number(hopIndex);
  if (!Number.isInteger(i) || i < 1 || !Array.isArray(flatSteps) || i >= flatSteps.length) {
    return {
      appendixCodes: [],
      choiceBasisCodes: [],
      pickerCodes: [],
      hasChoices: false,
      needsPick: false,
    };
  }
  const stepCodes = Array.isArray(flatSteps[i]?.codes)
    ? flatSteps[i].codes.map((c) => String(c || "").toUpperCase()).filter(Boolean)
    : [];
  const appendixCodes = appendixMatrixCodesForPathHopIndex(flatSteps, i, edgeConstraints);
  const choiceBasisCodes = appendixCodes.length ? appendixCodes : stepCodes;
  const pickerCodes =
    choiceBasisCodes.length > 1
      ? relationshipPickerCodesFromMatrixCodes(choiceBasisCodes)
      : choiceBasisCodes;
  const hasChoices = pickerCodes.length > 1;
  const needsPick = hasChoices && !edgeChoiceCommittedForHop(i, choiceBasisCodes, edgeConstraints);
  return {
    appendixCodes,
    choiceBasisCodes,
    pickerCodes,
    hasChoices,
    needsPick,
  };
}

/** Like {@link edgeChoiceCommittedForHop} but uses flattened path steps (respects direction flip). */
function edgeChoiceCommittedForPathHop(hopIndex, flatSteps, edgeConstraints) {
  const codesList = appendixMatrixCodesForPathHopIndex(flatSteps, hopIndex, edgeConstraints);
  return edgeChoiceCommittedForHop(hopIndex, codesList, edgeConstraints);
}

/**
 * If this hop’s element pair has a {@code FORCED_DIRECTION} constraint, returns the stored
 * source→target reading (Appendix B row used for that arrow). Otherwise null.
 * Stroke direct vs derived must follow this row — not path segment order — or flips mis-classify
 * when e.g. Serving is direct Interface→Collaboration but derived Collaboration→Interface.
 */
function forcedDirectionEndpointsForHop(edgeConstraints, semanticFrom, semanticTo) {
  if (!Array.isArray(edgeConstraints) || !semanticFrom || !semanticTo) return null;
  if (hasDirectedEdgeConstraint(edgeConstraints, semanticFrom, semanticTo, "FORCED_DIRECTION")) {
    return { from: semanticFrom, to: semanticTo };
  }
  if (hasDirectedEdgeConstraint(edgeConstraints, semanticTo, semanticFrom, "FORCED_DIRECTION")) {
    return { from: semanticTo, to: semanticFrom };
  }
  return null;
}

function drawArrow(x1, y1, x2, y2, codes, isDirect, svg, {
  hopIndex = null,
  /** Shown on the hop badge (1…n top-to-bottom). Defaults to hopIndex; set in vertical compact when path order ≠ visual order. */
  displayHopIndex = null,
  showHopNumbers = true,
  showFlipControls = true,
  showLockControls = true,
  /**
   * Show resolved relationship-type text on edges (diagram “relationship names” overlay); may combine with hop/flip overlays.
   */
  relationshipLabelsOnly = false,
  strokeOnly = false,
  interactiveOnly = false,
  /** True when this hop crosses a swimlane band (nudge labels off the lane divider line). */
  crossLaneEdge = false,
  /**
   * Swimlanes: route through horizontal gap between nodes (H–V–H) instead of a diagonal through boxes.
   * Endpoints stay right-center of source and left-center of target.
   */
  orthogonal = false,
  /**
   * When orthogonal and the hop changes layer (different y): draw a cubic Bézier instead of H–V–H so
   * the link reads as one smooth curve and does not waste horizontal space on long elbow legs.
   */
  smoothCrossLane = false,
  /** Orthogonal swimlane hops: mid = H–V–H at horizontal midpoint; source = one 90° bend at the source port (L or mirrored Γ). */
  orthogonalPin = "mid",
  /**
   * Vertical swimlanes: x1,y1,x2,y2 are bottom-center of source → top-center of target (never cy→cy).
   * If column centers differ, uses an elbow (vertical–horizontal–vertical) instead of a vertical through box centers.
   */
  verticalSwimlanePorts = false,
  /** Appendix B direct letters for this hop (enables correct dash/markers when cycling alternatives). */
  matrixDirectCodes = null,
  /** Appendix B derived letters for this hop */
  matrixDerivedCodes = null,
  /**
   * Vertical compact + flanked composite (Communication Network, Path, …): place hop notes west of the spine
   * when entering that row so labels do not sit over the right-hand illustration box.
   */
  verticalStraddleWest = false,
  /** Vertical scaffold only: for same-lane hops, route with a side jog instead of a straight center line. */
  sameLaneSideJog = false,
  /** Extra horizontal offset for badge/label stack (used by vertical staircase anti-overlap). */
  badgeStairOffsetX = 0,
  /** Optional per-edge label nudge (compact de-overlap). */
  labelNudgeX = 0,
  /** Optional per-edge label nudge (compact de-overlap). */
  labelNudgeY = 0,
  /** Disable short helper leader line for compact readability. */
  disableStraddleLeader = false,
  /**
   * Vertical compact: when set, replace default same-column / elbow / source-pin polylines with a bus
   * M x1 y… L tx y… L tx y… L x2 y… so labels and badges sit on the outer vertical track at x = tx.
   */
  outerArcTrackX = null,
  /**
   * Vertical compact outer bypass: orthogonal C-shape using main-box side ports (cy) and vertical bus at tx.
   * When set, takes precedence over {@code outerArcTrackX} and default top/bottom ports.
   */
  outerArcCShape = null,
  /**
   * Spread horizontal swimlanes: optional vertical-bus X for H–V–H cross-lane routes (obstacle-avoiding).
   * When null, uses chord midpoint.
   */
  swimlaneOrthogonalBusX = null,
  /**
   * Horizontal swimlanes: padded node/composite rects; nudges hop labels off illustrated sub-boxes and neighbors.
   */
  swimlaneLabelObstacles = null,
  /**
   * Horizontal swimlanes: target main-box right X so H–V–H bus clamping does not route the return leg through the target.
   * Optional; when null, only the source-side clamp (bus X ≥ x1) is applied after the return-elbow nudge.
   */
  swimlaneOrthoBusMaxX = null,
  /**
   * Optional shared registry of node obstacles + placed label bounds; {@link createEdgeLabelSpaceRegistry}.
   * Used to nudge labels so bounding boxes do not overlap during the interactive render pass.
   */
  labelSpaceRegistry = null,
  /** True for universal §5.2.4 Association bridge edges from {@link buildGraph} (informal last resort). */
  isAssociationBridge = false,
  /** Semantic source element for this hop (used by edge-constraint UI). */
  semanticFrom = null,
  /** Semantic target element for this hop (used by edge-constraint UI). */
  semanticTo = null,
  /**
   * Waypoint element set from current query (reserved for future stricter flip scope).
   * Flip visibility follows diagram overlay prefs; {@link window.__validateEdgeConstraintFlip} still
   * rejects impossible direction swaps.
   */
  waypointElementSet = null,
  /** Active user edge constraints. */
  edgeConstraints = null,
} = {}) {
  const showCanvasLabels = showHopNumbers || showFlipControls || showLockControls || relationshipLabelsOnly;
  const showInlineEdgeActionButtons = showFlipControls || showLockControls;
  const OUTER_BYPASS_RETURN_ELBOW_MIN_PX = 50;
  /**
   * Store holds FORCED_DIRECTION as user-chosen source→target. Path drawing uses semanticFrom→semanticTo
   * along the route; when the user flips, the constraint is the inverse pair — redraw the stroke from
   * target→source so arrowheads match the forced reading (matrix row + markers from reversed orientation).
   */
  const reverseLayout =
    !!semanticFrom &&
    !!semanticTo &&
    Array.isArray(edgeConstraints) &&
    hasDirectedEdgeConstraint(edgeConstraints, semanticTo, semanticFrom, "FORCED_DIRECTION") &&
    !hasDirectedEdgeConstraint(edgeConstraints, semanticFrom, semanticTo, "FORCED_DIRECTION");

  let codesList = codes && codes.length ? [...codes] : [];
  /**
   * Path segment codes (route order). {@code userChoices}, context menu, and sanitize all use this list.
   * {@code codesList} may switch to the reversed matrix row when drawing a forced opposite direction so
   * stroke geometry matches the constraint — do not use that list alone to validate user picks.
   */
  const codesForUserChoice = codesList.slice();
  if (reverseLayout && typeof mergeMatrixRowForPair === "function") {
    const row = mergeMatrixRowForPair(semanticTo, semanticFrom, true);
    if (row?.merged?.length) codesList = row.merged.map((c) => String(c).toUpperCase());
  }

  const appendixForChoice =
    hopIndex != null && typeof window !== "undefined" && Array.isArray(window.state?.segments)
      ? appendixMatrixCodesForPathHopIndex(
          flattenSegments(window.state.segments, window.state.activePathIdx ?? 0),
          hopIndex,
          edgeConstraints ?? window.state?.edgeConstraints,
        )
      : [];
  const codesForChoiceBasis = appendixForChoice.length ? appendixForChoice : codesForUserChoice;

  const choiceUndecided =
    hopIndex != null &&
    codesForChoiceBasis.length > 1 &&
    !edgeChoiceCommittedForHop(hopIndex, codesForUserChoice, edgeConstraints);
  /** No arrowheads until the user picks a code — path should meet ports without marker clearance gaps. */
  const markerTargetClr = choiceUndecided ? 0 : ARROW_MARKER_TARGET_CLEARANCE;
  const activeCode =
    hopIndex != null
      ? resolvedRelationshipCodeForHop(
          { codes: codesForUserChoice, element: semanticTo },
          hopIndex,
          semanticFrom,
          edgeConstraints,
        )
      : (codesList[0] ?? "O");
  const UPPER = activeCode.toUpperCase();
  const style = ARROW_STYLES[UPPER] ?? ARROW_STYLES["O"];
  /**
   * Shorten the path start along its opening segment so marker-start sits in the channel (see
   * {@link VERT_EDGE_INSET} for vertical; {@link hopPathStartInsetAlongAxis} for horizontal/diagonal).
   * Most codes have no start marker — applying inset anyway would truncate “plain” shafts.
   */
  const applyStartMarkerInset =
    !choiceUndecided && style.startMarker != null && style.startMarker !== "none";
  let rowMd = matrixDirectCodes;
  let rowMder = matrixDerivedCodes;
  if (reverseLayout && typeof mergeMatrixRowForPair === "function") {
    const row = mergeMatrixRowForPair(semanticTo, semanticFrom, true);
    if (row?.direct?.length) rowMd = row.direct.map((c) => String(c).toUpperCase());
    if (row?.derived?.length) rowMder = row.derived.map((c) => String(c).toUpperCase());
  }
  const isAssocBridge = !!isAssociationBridge;
  const forcedEnds = forcedDirectionEndpointsForHop(edgeConstraints, semanticFrom, semanticTo);
  const lockEligible =
    !!forcedEnds &&
    !!semanticFrom &&
    !!semanticTo &&
    showLockControls &&
    UPPER !== "O" &&
    !isAssocBridge;
  let isDirectForStroke;
  if (forcedEnds && typeof mergeMatrixRowForPair === "function") {
    const row = mergeMatrixRowForPair(forcedEnds.from, forcedEnds.to, true);
    if (row.direct.includes(UPPER)) isDirectForStroke = true;
    else if (row.derived.includes(UPPER)) isDirectForStroke = false;
    else isDirectForStroke = isDirect;
  } else {
    isDirectForStroke = (() => {
      if (rowMd && rowMd.includes(UPPER)) return true;
      if (rowMder && rowMder.includes(UPPER)) return false;
      return isDirect;
    })();
  }

  if (reverseLayout) {
    const sx = x1;
    const sy = y1;
    x1 = x2;
    y1 = y2;
    x2 = sx;
    y2 = sy;
    if (
      outerArcCShape &&
      Number.isFinite(outerArcCShape.tx) &&
      [outerArcCShape.sx, outerArcCShape.sy, outerArcCShape.ex, outerArcCShape.ey].every(Number.isFinite)
    ) {
      const o = outerArcCShape;
      outerArcCShape = { tx: o.tx, sx: o.ex, sy: o.ey, ex: o.sx, ey: o.sy };
    } else {
      outerArcCShape = null;
    }
    outerArcTrackX = null;
  }

  ensureMarkers(svg);

  const midX = x1 + (x2 - x1) / 2;
  const sameX = Math.abs(x1 - x2) < 0.5;
  const yLo = Math.min(y1, y2);
  const yHi = Math.max(y1, y2);
  const len = yHi - yLo;

  let d;
  /** True when stroke path is a smooth cubic (cross-lane swimlane); round caps look cleaner with markers. */
  let pathCurved = false;
  let y1s = y1;
  let y2s = y2;
  let orthoMidX = null;
  /** Orthogonal route with a vertical middle segment (labels straddle like pure vertical edges). */
  let orthoVertical = false;
  /** Straight vertical segment with inset (compact vertical, or swimlane same column). */
  let straightVerticalInset = false;
  /** Swimlane elbow between two column centers (bottom/top ports, not through box interiors). */
  let swimlaneColElbow = false;

  let outerArcCShapeApplied = false;
  /** @type {{ sy: number, ey: number, sx: number, ex: number } | null} */
  let outerArcCShapeMeta = null;
  let outerArcFixedLabelY = null;
  if (
    outerArcCShape &&
    Number.isFinite(outerArcCShape.tx) &&
    [outerArcCShape.sx, outerArcCShape.sy, outerArcCShape.ex, outerArcCShape.ey].every(Number.isFinite)
  ) {
    let { tx: txC, sx, sy, ex, ey } = outerArcCShape;
    const clr = markerTargetClr;
    const segDx = ex - txC;
    const exR =
      Math.abs(segDx) > clr ? ex - Math.sign(segDx || 1) * clr : ex;
    const returnSpan = Math.abs(exR - txC);
    if (returnSpan < OUTER_BYPASS_RETURN_ELBOW_MIN_PX) {
      // Ensure the marker-end lands on a clearly horizontal "return leg" (two right angles).
      txC = exR + Math.sign(txC - exR || 1) * OUTER_BYPASS_RETURN_ELBOW_MIN_PX;
    }
    const sx0 =
      Math.abs(sx - txC) > 0.5
        ? hopPathStartInsetAlongAxis(sx, txC, applyStartMarkerInset)
        : sx;
    d = `M ${sx0} ${sy} L ${txC} ${sy} L ${txC} ${ey} L ${exR} ${ey}`;
    orthoMidX = txC;
    orthoVertical = true;
    swimlaneColElbow = true;
    pathCurved = false;
    straightVerticalInset = false;
    outerArcCShapeApplied = true;
    outerArcCShapeMeta = { sx, sy, ex: exR, ey };
    outerArcFixedLabelY = (sy + ey) / 2;
  }

  if (!outerArcCShapeApplied) {
  if (verticalSwimlanePorts) {
    if (sameX) {
      const isLv = len > 8;
      // Inset only the path start so the start marker sits in the gap; end at the target edge so
      // marker-end (arrow/triangle) touches the destination box — symmetric inset on both ends
      // leaves both markers floating mid-gap (reads as “random” placement).
      const insetStart = verticalSameColumnStartMarkerInset(len, applyStartMarkerInset);
      if (y1 < y2) {
        y1s = y1 + insetStart;
        y2s = y2;
      } else {
        y1s = y1 - insetStart;
        y2s = y2;
      }
      d = `M ${x1} ${y1s} L ${x2} ${y2s}`;
      straightVerticalInset = isLv;
    } else {
      const ym = (y1 + y2) / 2;
      const clrE = markerTargetClr;
      const y2e =
        Math.abs(y2 - ym) > clrE ? y2 - Math.sign(y2 - ym) * clrE : y2;
      const y1a = hopPathStartInsetAlongAxis(y1, ym, applyStartMarkerInset);
      d = `M ${x1} ${y1a} L ${x1} ${ym} L ${x2} ${ym} L ${x2} ${y2e}`;
      orthoMidX = midX;
      orthoVertical = len > 10;
      swimlaneColElbow = true;
    }
  } else if (orthogonal && !sameX) {
    if (Math.abs(y1 - y2) < 0.5) {
      orthoMidX = midX;
      const clrF = markerTargetClr;
      const x2f =
        Math.abs(x2 - x1) > clrF ? x2 + Math.sign(x1 - x2) * clrF : x2;
      if (sameLaneSideJog) {
        const jogRise = Math.max(22, Math.ceil(EL_H * 0.75));
        const jogY = y1 - jogRise;
        const y1a = hopPathStartInsetAlongAxis(y1, jogY, applyStartMarkerInset);
        d = `M ${x1} ${y1a} L ${x1} ${jogY} L ${x2} ${jogY} L ${x2f} ${y2}`;
        orthoVertical = true;
      } else {
        const x1a = hopPathStartInsetAlongAxis(x1, x2f, applyStartMarkerInset);
        d = `M ${x1a} ${y1} L ${x2f} ${y2}`;
      }
    } else if (smoothCrossLane) {
      orthoMidX = midX;
      /**
       * Chord-aligned Bézier controls so B′(0) and B′(1) are parallel to (x1,y1)→(x2,y2).
       * If both inner controls share y with P0/P3, the end tangent is forced horizontal and
       * marker-end orient="auto" draws a flat arrowhead while the stroke still looks diagonal.
       */
      const clrB = markerTargetClr;
      const vx0 = x2 - x1;
      const vy0 = y2 - y1;
      const chordLen0 = Math.hypot(vx0, vy0) || 1;
      const x2b =
        chordLen0 > clrB ? x2 - (vx0 / chordLen0) * clrB : x2;
      const y2b =
        chordLen0 > clrB ? y2 - (vy0 / chordLen0) * clrB : y2;
      const vx = x2b - x1;
      const vy = y2b - y1;
      const chordLen = Math.hypot(vx, vy) || 1;
      const ux = vx / chordLen;
      const uy = vy / chordLen;
      const dxAbs = Math.abs(vx);
      const pullBase = Math.min(dxAbs * 0.38, chordLen * 0.36);
      const pull = Math.min(88, Math.max(20, pullBase));
      const p0 = hopPathStartInsetAlongChord(x1, y1, x2b, y2b, applyStartMarkerInset);
      const duX = p0.x - x1;
      const duY = p0.y - y1;
      const c1x = x1 + ux * pull + duX;
      const c1y = y1 + uy * pull + duY;
      const c2x = x2b - ux * pull;
      const c2y = y2b - uy * pull;
      d = `M ${p0.x} ${p0.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2b} ${y2b}`;
      pathCurved = true;
      orthoVertical = len > 8;
    } else if (orthogonalPin === "source") {
      // Mechanical "two right angles" for side-entry: force a 3-segment orthogonal route:
      // horizontal out → vertical bus → horizontal return into target (with a real return leg).
      //
      // This avoids the "lazy L" that makes open markers (triangle/arrow) look like floating tips.
      const clrS = markerTargetClr;
      let tx =
        swimlaneOrthogonalBusX != null && Number.isFinite(swimlaneOrthogonalBusX)
          ? swimlaneOrthogonalBusX
          : midX;
      let x2Bus =
        Math.abs(x2 - tx) > clrS ? x2 - Math.sign(x2 - tx) * clrS : x2;
      const returnSpan0 = Math.abs(x2Bus - tx);
      if (returnSpan0 < OUTER_BYPASS_RETURN_ELBOW_MIN_PX) {
        tx = x2Bus + Math.sign(tx - x2Bus || 1) * OUTER_BYPASS_RETURN_ELBOW_MIN_PX;
      }
      // Return-elbow nudge can push the bus left of the source’s right port (x1), so the first leg cuts through the source box.
      tx = Math.max(tx, x1);
      if (swimlaneOrthoBusMaxX != null && Number.isFinite(swimlaneOrthoBusMaxX)) {
        tx = Math.min(tx, swimlaneOrthoBusMaxX);
      }
      x2Bus =
        Math.abs(x2 - tx) > clrS ? x2 - Math.sign(x2 - tx) * clrS : x2;
      orthoMidX = tx;
      const x1a = hopPathStartInsetAlongAxis(x1, tx, applyStartMarkerInset);
      d = `M ${x1a} ${y1} L ${tx} ${y1} L ${tx} ${y2} L ${x2Bus} ${y2}`;
      orthoVertical = len > 8;
      swimlaneColElbow = true;
    } else {
      const clrM = markerTargetClr;
      const x2mForBus = (bx) =>
        Math.abs(x2 - bx) > clrM ? x2 - Math.sign(x2 - bx) * clrM : x2;
      let busX =
        swimlaneOrthogonalBusX != null && Number.isFinite(swimlaneOrthogonalBusX)
          ? swimlaneOrthogonalBusX
          : midX;
      let x2m = x2mForBus(busX);
      let returnSpan = Math.abs(x2m - busX);
      if (returnSpan < OUTER_BYPASS_RETURN_ELBOW_MIN_PX) {
        busX = x2m + Math.sign(busX - x2m || 1) * OUTER_BYPASS_RETURN_ELBOW_MIN_PX;
      }
      busX = Math.max(busX, x1);
      if (swimlaneOrthoBusMaxX != null && Number.isFinite(swimlaneOrthoBusMaxX)) {
        busX = Math.min(busX, swimlaneOrthoBusMaxX);
      }
      orthoMidX = busX;
      x2m = x2mForBus(busX);
      const x1b = hopPathStartInsetAlongAxis(x1, orthoMidX, applyStartMarkerInset);
      d = `M ${x1b} ${y1} L ${orthoMidX} ${y1} L ${orthoMidX} ${y2} L ${x2m} ${y2}`;
      orthoVertical = len > 10;
    }
  } else if (sameX) {
    const isLongVertical = len > 8;
    const insetStart = verticalSameColumnStartMarkerInset(len, applyStartMarkerInset);
    if (y1 < y2) {
      y1s = y1 + insetStart;
      y2s = y2;
    } else {
      y1s = y1 - insetStart;
      y2s = y2;
    }
    d = `M ${x1} ${y1s} L ${x2} ${y2s}`;
    straightVerticalInset = isLongVertical;
  } else {
    const clrD = markerTargetClr;
    let xe = x2;
    let ye = y2;
    const flatH = Math.abs(y1 - y2) < 0.5;
    const flatV = Math.abs(x1 - x2) < 0.5;
    if (flatH && Math.abs(x2 - x1) > clrD) {
      xe = x2 + Math.sign(x1 - x2) * clrD;
    } else if (flatV && Math.abs(y2 - y1) > clrD) {
      ye = y2 + Math.sign(y1 - y2) * clrD;
    } else if (!flatH && !flatV) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len > clrD) {
        xe = x2 - (dx / len) * clrD;
        ye = y2 - (dy / len) * clrD;
      }
    }
    let x1o = x1;
    let y1o = y1;
    if (flatH && Math.abs(xe - x1) > 1e-6) {
      x1o = hopPathStartInsetAlongAxis(x1, xe, applyStartMarkerInset);
    } else if (!flatH && !flatV) {
      const p0 = hopPathStartInsetAlongChord(x1, y1, xe, ye, applyStartMarkerInset);
      x1o = p0.x;
      y1o = p0.y;
    }
    d = `M ${x1o} ${y1o} L ${xe} ${ye}`;
  }
  }

  let txArc =
    !outerArcCShapeApplied && outerArcTrackX != null && Number.isFinite(outerArcTrackX)
      ? outerArcTrackX
      : null;
  if (txArc != null) {
    const clrTx = markerTargetClr;
    const x2Bus = (() => {
      const span = Math.abs(x2 - txArc);
      return span > clrTx ? x2 - Math.sign(x2 - txArc) * clrTx : x2;
    })();
    const returnSpan = Math.abs(x2Bus - txArc);
    if (returnSpan < OUTER_BYPASS_RETURN_ELBOW_MIN_PX) {
      // Keep a real horizontal return elbow so marker-end is unmistakably horizontal.
      txArc = x2Bus + Math.sign(txArc - x2Bus || 1) * OUTER_BYPASS_RETURN_ELBOW_MIN_PX;
    }
    if (verticalSwimlanePorts && sameX) {
      const x1a = hopPathStartInsetAlongAxis(x1, txArc, applyStartMarkerInset);
      d = `M ${x1a} ${y1s} L ${txArc} ${y1s} L ${txArc} ${y2s} L ${x2Bus} ${y2s}`;
      orthoMidX = txArc;
      orthoVertical = true;
      swimlaneColElbow = true;
      straightVerticalInset = false;
      pathCurved = false;
    } else if (verticalSwimlanePorts && !sameX) {
      const x1a = hopPathStartInsetAlongAxis(x1, txArc, applyStartMarkerInset);
      d = `M ${x1a} ${y1} L ${txArc} ${y1} L ${txArc} ${y2} L ${x2Bus} ${y2}`;
      orthoMidX = txArc;
      orthoVertical = true;
      swimlaneColElbow = true;
      pathCurved = false;
    } else if (!verticalSwimlanePorts && orthogonal && !sameX && Math.abs(y1 - y2) >= 0.5 && orthogonalPin === "source") {
      const x1a = hopPathStartInsetAlongAxis(x1, txArc, applyStartMarkerInset);
      d = `M ${x1a} ${y1} L ${txArc} ${y1} L ${txArc} ${y2} L ${x2Bus} ${y2}`;
      orthoMidX = txArc;
      orthoVertical = true;
      swimlaneColElbow = true;
      pathCurved = false;
    } else if (sameX && !verticalSwimlanePorts) {
      const x1a = hopPathStartInsetAlongAxis(x1, txArc, applyStartMarkerInset);
      d = `M ${x1a} ${y1s} L ${txArc} ${y1s} L ${txArc} ${y2s} L ${x2Bus} ${y2s}`;
      orthoMidX = txArc;
      orthoVertical = true;
      swimlaneColElbow = true;
      straightVerticalInset = false;
      pathCurved = false;
    }
  }

  /** Horizontal swimlanes: H–V–H between different columns (same as vertical elbow, needs straddle + leader even when len ≤ 10). */
  const orthogonalCornerRoute =
    !verticalSwimlanePorts && orthogonal && !sameX && Math.abs(y1 - y2) >= 0.5;

  const isLongVertical = straightVerticalInset;
  /** Any straight vertical segment in the same column: keep badges to the right of the line (short hops used to fall back to centered labels with a −10px offset and overlapped the source box). */
  const sameColumnVertical = sameX && len > 1e-6;
  const sameColumnOuterCShape =
    outerArcCShapeMeta != null && Math.abs(outerArcCShapeMeta.sx - outerArcCShapeMeta.ex) < 0.5;
  const useVertStraddle =
    sameColumnVertical ||
    sameColumnOuterCShape ||
    orthoVertical ||
    swimlaneColElbow ||
    orthogonalCornerRoute;

  const reverseCodesForFlip = reverseRelationshipCodesForDirectedPair(semanticFrom, semanticTo);
  /** Association (§5.2.4) is undirected in the metamodel — no meaningful direction flip on the diagram. */
  const flipEligible =
    !!semanticFrom &&
    !!semanticTo &&
    showFlipControls &&
    UPPER !== "O" &&
    !isAssocBridge &&
    reverseCodesForFlip.length > 0;
  /**
   * Association (O) is always solid. Serving (V) uses the §4.2-style solid stroke and open arrowhead
   * for every hop — not the derived-relationship dashed stroke — so it matches the language reference.
   */
  const isDash =
    !isAssocBridge &&
    (choiceUndecided ||
      style.line === "dashed" ||
      (!isDirectForStroke && UPPER !== "O" && UPPER !== "V"));

  const mkStrokePath = () => {
    const attrs = {
      d: d,
      stroke: isAssocBridge
        ? "var(--path-association-warning-stroke, #c27820)"
        : "#333",
      "stroke-width": isAssocBridge ? "1.85" : "1.6",
      fill: "none",
      class: isAssocBridge
        ? "archimate-arrow-stroke archimate-arrow-stroke--association-bridge graph-edge"
        : "archimate-arrow-stroke graph-edge",
      "stroke-dasharray": isAssocBridge ? "none" : isDash ? "6,3" : "none",
      "marker-end":
        choiceUndecided || style.endMarker === "none"
          ? ""
          : `url(#end-${UPPER}-${isDirectForStroke ? "d" : "r"})`,
      "marker-start":
        choiceUndecided || style.startMarker === "none" ? "" : `url(#start-${UPPER})`,
      "pointer-events": "none",
    };
    if (!choiceUndecided && (pathCurved || isAssocBridge)) attrs["stroke-linecap"] = "round";
    return svgEl("path", attrs);
  };

  if (strokeOnly) {
    const g = svgEl("g", {
      class: `archimate-arrow-stroke-layer${choiceUndecided ? " provisional" : ""}${
        isAssocBridge ? " archimate-arrow--association-bridge" : ""
      }`,
    });
    /**
     * Visible strokes live in this layer (under nodes in compact/swimlane). {@link renderWithAnimation}
     * must resolve `path.graph-edge` → hop id the same way as `.clickable-arrow[data-hop]` overlays.
     */
    if (hopIndex != null) g.setAttribute("data-hop", String(hopIndex));
    g.appendChild(mkStrokePath());
    return g;
  }

  const labelLines = wrapLabel(
    choiceUndecided
      ? describeRelCodesForDiagramLabel(codesForUserChoice)
      : describeRelCodesForDiagramLabel([activeCode])
  );
  /** Relationship-type text on arrows only when "Relationship names" overlay is on, or when the hop is still ambiguous. */
  const displayRelLines = relationshipLabelsOnly || choiceUndecided ? labelLines : [];

  const parsedOrtho = pathCurved ? null : segmentsFromOrthogonalD(d);
  let inlineLongestHorizontal = null;
  let verticalMidYFromLongestVSeg = null;
  if (parsedOrtho && parsedOrtho.segs.length) {
    let longest = parsedOrtho.segs[0];
    for (const s of parsedOrtho.segs) {
      if (s.len > longest.len) longest = s;
    }
    const maxVL = Math.max(0, ...parsedOrtho.segs.filter((s) => s.kind === "v").map((s) => s.len));
    const maxHL = Math.max(0, ...parsedOrtho.segs.filter((s) => s.kind === "h").map((s) => s.len));
    if (
      useVertStraddle &&
      !sameColumnVertical &&
      !sameColumnOuterCShape &&
      longest.kind === "h" &&
      longest.len > maxVL + 0.5 &&
      longest.len > 10 &&
      // Swimlane H–V–H cross-lane: longest horizontal legs must not switch to “inline row” mode — that
      // drops straddle placement and anchors Y to a lane’s horizontal leg or chord midpoint (often the
      // lane band divider), so badges float away from the vertical bus.
      !(crossLaneEdge && orthogonalCornerRoute)
    ) {
      inlineLongestHorizontal = { midX: longest.midX, midY: longest.midY };
    } else if (useVertStraddle && longest.kind === "v" && maxVL >= maxHL - 1e-6 && longest.len > 6) {
      verticalMidYFromLongestVSeg = longest.midY;
    } else if (useVertStraddle && crossLaneEdge && orthogonalCornerRoute && maxVL > 1e-6) {
      const vSegs = parsedOrtho.segs.filter((s) => s.kind === "v");
      if (vSegs.length) {
        verticalMidYFromLongestVSeg = vSegs.reduce((best, s) => (s.len > best.len ? s : best), vSegs[0]).midY;
      }
    }
  }
  const forLabelStraddle = useVertStraddle && !inlineLongestHorizontal;

  let yLoL = outerArcCShapeMeta
    ? Math.min(outerArcCShapeMeta.sy, outerArcCShapeMeta.ey)
    : isLongVertical
      ? Math.min(y1s, y2s)
      : orthoVertical
        ? yLo
        : Math.min(y1, y2);
  let yHiL = outerArcCShapeMeta
    ? Math.max(outerArcCShapeMeta.sy, outerArcCShapeMeta.ey)
    : isLongVertical
      ? Math.max(y1s, y2s)
      : orthoVertical
        ? yHi
        : Math.max(y1, y2);
  const vStraddleY = verticalStraddleYExtentFromOrthoPath(parsedOrtho);
  if (vStraddleY != null && vStraddleY.yHi - vStraddleY.yLo > 1e-6) {
    yLoL = vStraddleY.yLo;
    yHiL = vStraddleY.yHi;
  }
  const lenL = yHiL - yLoL;
  /** Geometric center of the drawn stroke — keeps every label at the same relative position in the gap. */
  let labelAlong = forLabelStraddle
    ? outerArcFixedLabelY != null
      ? outerArcFixedLabelY
      : (yLoL + yHiL) / 2
    : (y1 + y2) / 2;
  if (verticalMidYFromLongestVSeg != null && forLabelStraddle && lenL > 1e-6) {
    labelAlong = clamp(verticalMidYFromLongestVSeg, yLoL, yHiL);
  }
  if (forLabelStraddle && lenL > 1e-6) {
    const maxPad = Math.min(20, Math.max(12, lenL * 0.2));
    if (lenL > 2 * maxPad) {
      labelAlong = clamp(labelAlong, yLoL + maxPad, yHiL - maxPad);
    }
  }
  const stairOffsetX = Number.isFinite(badgeStairOffsetX) ? badgeStairOffsetX : 0;
  const nudgeX = Number.isFinite(labelNudgeX) ? labelNudgeX : 0;
  const nudgeY = Number.isFinite(labelNudgeY) ? labelNudgeY : 0;
  // For outer-bypass C-shapes, always place the label stack on the *outside* of the bus.
  // This prevents the hop badge+name from collapsing back into the spine’s vertical label column.
  let effectiveVerticalStraddleWest = (() => {
    if (outerArcCShapeApplied && outerArcCShape && Number.isFinite(outerArcCShape.tx) && outerArcCShapeMeta) {
      const tx = outerArcCShape.tx;
      const nearX = Math.min(outerArcCShapeMeta.sx, outerArcCShapeMeta.ex);
      return tx < nearX;
    }
    return !!verticalStraddleWest;
  })();
  let straddleAnchorX =
    (orthoVertical || swimlaneColElbow || orthogonalCornerRoute) && orthoMidX != null
      ? orthoMidX + stairOffsetX + nudgeX
      : midX + stairOffsetX + nudgeX;
  /** Uniform offset past main box so every hop’s label column lines up beside the spine. */
  const tightOuterBypassBadge = outerArcCShapeApplied;
  const straddleExtraX = tightOuterBypassBadge
    ? 0
    : sameColumnVertical || sameColumnOuterCShape
      ? VERT_STRADDLE_PAST_MAIN
      : 0;
  let labelLineX = inlineLongestHorizontal
    ? inlineLongestHorizontal.midX + stairOffsetX + nudgeX
    : forLabelStraddle
      ? straddleAnchorX
      : (() => {
          if (Math.abs(y1 - y2) >= 0.5) {
            return ((x1 + x2) / 2) + stairOffsetX + nudgeX;
          }
          const xEnd = horizontalStrokeEndXForLabel(x1, x2, y1, y2, orthogonal);
          const segLeft = Math.min(x1, xEnd);
          const segRight = Math.max(x1, xEnd);
          const segMid = (segLeft + segRight) / 2;
          const fontSize = 8.5;
          const lines = displayRelLines ?? [];
          const approxTextW =
            lines.length === 0 ? 0 : Math.min(170, Math.max(48, lines.join(" ").length * (fontSize * 0.55)));
          const hasChoices = codesForUserChoice.length > 1;
          const showHop = hopIndex != null && showHopNumbers;
          const hopBadgeR = showHop ? (hasChoices ? 9 : 7) : 0;
          const textStartW = showHop ? 2 * hopBadgeR + VERT_BADGE_NAME_GAP : 0;
          const totalW = textStartW + approxTextW;
          const halfW = totalW / 2;
          const margin = 6;
          const minLX = segLeft + halfW + margin;
          const maxLX = segRight - halfW - margin;
          const unclamped = segMid + stairOffsetX + nudgeX;
          if (minLX <= maxLX) return clamp(unclamped, minLX, maxLX);
          return unclamped;
        })();
  let labelY = (() => {
    if (inlineLongestHorizontal) {
      const sh = horizontalRelLabelStackHalfH(displayRelLines, hopIndex, showHopNumbers, codesForUserChoice);
      return inlineLongestHorizontal.midY - sh - 2 + nudgeY;
    }
    let ly = forLabelStraddle ? labelAlong + (showHopNumbers ? 0 : 4) : (y1 + y2) / 2;
    ly += nudgeY;
    /** Horizontal hops: inline badge+name row; my is row center, placed just above the stroke. */
    if (!forLabelStraddle) {
      const yLine = (y1 + y2) / 2;
      const stackHalfH = horizontalRelLabelStackHalfH(displayRelLines, hopIndex, showHopNumbers, codesForUserChoice);
      const gapAboveStroke = 2;
      ly = yLine - stackHalfH - gapAboveStroke;
    }
    return ly;
  })();
  /** Keep hop labels off the swimlane band divider (often coincides with the gap midpoint). */
  if (crossLaneEdge && forLabelStraddle && lenL > 1e-6) {
    const nudge = Math.min(6, lenL * 0.06);
    labelY -= y2 > y1 ? nudge : -nudge;
  }
  if (forLabelStraddle && lenL > 1e-6) {
    labelY = clampVertStraddleLabelYToSegment(
      labelY,
      yLoL,
      yHiL,
      displayRelLines,
      codesForUserChoice,
      hopIndex,
      showHopNumbers,
    );
  }
  /** Vertical stroke x (path geometry, excludes label nudge) — enforces badge clearance from spine / outer bus. */
  let straddleLineStrokeX = null;
  if (forLabelStraddle) {
    if (outerArcCShapeApplied && outerArcCShape && Number.isFinite(outerArcCShape.tx)) {
      straddleLineStrokeX = outerArcCShape.tx;
    } else if (txArc != null && Number.isFinite(txArc)) {
      straddleLineStrokeX = txArc;
    } else if (orthoMidX != null && Number.isFinite(orthoMidX)) {
      straddleLineStrokeX = orthoMidX;
    } else if (sameColumnVertical || sameColumnOuterCShape) {
      straddleLineStrokeX = x1;
    }
  }
  /**
   * Cross-lane H–V–H: choose label stack east vs west of the vertical bus by whichever side
   * hits fewer node / composite illustration rects (avoids sitting in the column under green-lane subs
   * when the hop runs upward from a lower lane).
   */
  if (
    swimlaneLabelObstacles &&
    swimlaneLabelObstacles.length &&
    crossLaneEdge &&
    forLabelStraddle &&
    !outerArcCShapeApplied
  ) {
    const rectE = estimateSwimlaneVertStraddleLabelRect({
      straddleAnchorX,
      labelY,
      straddleExtraX,
      effectiveVerticalStraddleWest: false,
      straddleLineStrokeX,
      forceBadgeCenterOffsetFromLineEast:
        forLabelStraddle && (sameColumnVertical || sameColumnOuterCShape) ? 15 : null,
      labelLines: displayRelLines,
      codesList: codesForUserChoice,
      hopIndex,
      showHopNumbers,
    });
    const rectW = estimateSwimlaneVertStraddleLabelRect({
      straddleAnchorX,
      labelY,
      straddleExtraX,
      effectiveVerticalStraddleWest: true,
      straddleLineStrokeX,
      forceBadgeCenterOffsetFromLineEast: null,
      labelLines: displayRelLines,
      codesList: codesForUserChoice,
      hopIndex,
      showHopNumbers,
    });
    const hitE = swimlaneCountLabelObstacleHits(rectE, swimlaneLabelObstacles);
    const hitW = swimlaneCountLabelObstacleHits(rectW, swimlaneLabelObstacles);
    if (hitW < hitE) {
      effectiveVerticalStraddleWest = true;
    } else if (hitE < hitW) {
      effectiveVerticalStraddleWest = false;
    } else if (y2 < y1) {
      effectiveVerticalStraddleWest = true;
    }
  }
  const forceBadgeCenterOffsetFromLineEast =
    forLabelStraddle && !effectiveVerticalStraddleWest && (sameColumnVertical || sameColumnOuterCShape) ? 15 : null;
  if (swimlaneLabelObstacles && swimlaneLabelObstacles.length) {
    const nudged = nudgeSwimlaneRelLabelAgainstObstacles({
      labelLineX,
      labelY,
      straddleAnchorX,
      useVertStraddle: forLabelStraddle,
      effectiveVerticalStraddleWest,
      straddleExtraX,
      straddleLineStrokeX,
      forceBadgeCenterOffsetFromLineEast,
      labelLines: displayRelLines,
      codesList: codesForUserChoice,
      hopIndex,
      showHopNumbers,
      obstacles: swimlaneLabelObstacles,
    });
    labelLineX = nudged.labelLineX;
    labelY = nudged.labelY;
    straddleAnchorX = nudged.straddleAnchorX;
  }
  if (forLabelStraddle && lenL > 1e-6) {
    labelY = clampVertStraddleLabelYToSegment(
      labelY,
      yLoL,
      yHiL,
      displayRelLines,
      codesForUserChoice,
      hopIndex,
      showHopNumbers,
    );
  }
  /**
   * Swimlane obstacle nudges can shift inline hop rows vertically; keep them tied to the horizontal stroke.
   */
  if (
    !forLabelStraddle &&
    swimlaneLabelObstacles &&
    swimlaneLabelObstacles.length &&
    Math.abs(y1 - y2) < 0.5
  ) {
    const yLine = (y1 + y2) / 2;
    const sh = horizontalRelLabelStackHalfH(displayRelLines, hopIndex, showHopNumbers, codesForUserChoice);
    const targetY = yLine - sh - 2;
    labelY = clamp(labelY, targetY - 52, targetY + 52);
  }
  /**
   * East/west ports sit at mid-Y; unclamped labels sit partly above the EL_H bbox. After obstacle nudges,
   * re-clamp so the row stays within the shape band (compact + swimlane same-lane horizontal).
   */
  if (!forLabelStraddle && Math.abs(y1 - y2) < 0.5) {
    const yLine = (y1 + y2) / 2;
    const sh = horizontalRelLabelStackHalfH(displayRelLines, hopIndex, showHopNumbers, codesForUserChoice);
    const minCenterY = yLine - EL_H / 2 + 2 + sh;
    if (labelY < minCenterY) labelY = minCenterY;
  }

  if (labelSpaceRegistry) {
    const hasChoices = codesForUserChoice.length > 1;
    const rawRect = forLabelStraddle
      ? estimateSwimlaneVertStraddleLabelRect({
          straddleAnchorX,
          labelY,
          straddleExtraX,
          effectiveVerticalStraddleWest,
          straddleLineStrokeX,
          forceBadgeCenterOffsetFromLineEast,
          labelLines: displayRelLines,
          codesList: codesForUserChoice,
          hopIndex,
          showHopNumbers,
        })
      : estimateSwimlaneHorizontalLabelRect(labelLineX, labelY, displayRelLines, hopIndex, showHopNumbers, hasChoices);
    const worldRect = {
      left: rawRect.left,
      right: rawRect.right,
      top: rawRect.top,
      bottom: rawRect.bottom,
    };
    const { dx, dy } = labelSpaceRegistry.resolvePlacement(worldRect);
    labelLineX += dx;
    labelY += dy;
    if (forLabelStraddle) straddleAnchorX += dx;
  }

  if (forLabelStraddle && straddleLineStrokeX != null && Number.isFinite(straddleLineStrokeX)) {
    const lineBuf = Math.max(
      SPINE_BADGE_CLEAR_FROM_LINE,
      typeof LABEL_TO_LINE_BUFFER_PX === "number" ? LABEL_TO_LINE_BUFFER_PX : 15,
    );
    const lineX = straddleLineStrokeX;
    const estAfter = estimateSwimlaneVertStraddleLabelRect({
      straddleAnchorX,
      labelY,
      straddleExtraX,
      effectiveVerticalStraddleWest,
      straddleLineStrokeX,
      forceBadgeCenterOffsetFromLineEast,
      labelLines: displayRelLines,
      codesList: codesForUserChoice,
      hopIndex,
      showHopNumbers,
    });
    if (!effectiveVerticalStraddleWest && estAfter.left < lineX + lineBuf) {
      const fix = lineX + lineBuf - estAfter.left;
      straddleAnchorX += fix;
      labelLineX += fix;
    } else if (effectiveVerticalStraddleWest && estAfter.right > lineX - lineBuf) {
      const fix = estAfter.right - (lineX - lineBuf);
      straddleAnchorX -= fix;
      labelLineX -= fix;
    }
  }

  /** Registry de-overlap can apply large dy after swimlane clamps; keep labels tied to the hop geometry. */
  if (swimlaneLabelObstacles && swimlaneLabelObstacles.length) {
    if (forLabelStraddle && lenL > 1e-6) {
      labelY = clampVertStraddleLabelYToSegment(
        labelY,
        yLoL,
        yHiL,
        displayRelLines,
        codesForUserChoice,
        hopIndex,
        showHopNumbers,
      );
    } else if (!forLabelStraddle && Math.abs(y1 - y2) < 0.5) {
      const yLine = (y1 + y2) / 2;
      const sh = horizontalRelLabelStackHalfH(displayRelLines, hopIndex, showHopNumbers, codesForUserChoice);
      const targetY = yLine - sh - 2;
      const band = 40;
      labelY = clamp(labelY, targetY - band, targetY + band);
      const minCenterY = yLine - EL_H / 2 + 2 + sh;
      if (labelY < minCenterY) labelY = minCenterY;
    }
  }

  const badgeDisplayNumber = displayHopIndex != null ? displayHopIndex : hopIndex;
  /** With relationship labels hidden (no hop/flip/names-only mode), skip canvas labels (flip is suppressed via flipEligible). */
  const { labelG, flipIconWorld: flipIconWorldFromLabel } = showCanvasLabels
    ? makeRelLabel(labelLineX, labelY, displayRelLines, {
        hopIndex,
        badgeDisplayNumber,
        showHopNumbers,
        showFlipIcons: showFlipControls,
        hasChoices: codesForUserChoice.length > 1,
        verticalStraddle: forLabelStraddle,
        straddleAnchorX: forLabelStraddle ? straddleAnchorX : null,
        straddleExtraX: forLabelStraddle ? straddleExtraX : 0,
        verticalStraddleWest: forLabelStraddle ? effectiveVerticalStraddleWest : false,
        straddleLineStrokeX: forLabelStraddle ? straddleLineStrokeX : null,
        forceBadgeCenterOffsetFromLineEast,
        measureSvg: svg,
      })
    : { labelG: svgEl("g", { class: "rel-label rel-label--empty" }), flipIconWorld: null };

  /** Vertical layouts rely on shared Y alignment between connector and label stack; tethers are omitted. */
  const showStraddleLeader = false;
  const leaderEl = showStraddleLeader
    ? svgEl("line", {
      x1: straddleAnchorX,
      y1: labelY,
      x2: straddleAnchorX + BADGE_LINE_CLEARANCE + straddleExtraX,
      y2: labelY,
      stroke: "rgba(51,65,85,0.4)",
      "stroke-width": "1",
      "pointer-events": "none",
      class: "rel-label-leader",
    })
    : null;

  const wireClick = (g) => {
    g.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest(".path-edge-control")) return;
      e.preventDefault(); e.stopPropagation();
      if (typeof window.clearHopHighlights === "function") window.clearHopHighlights();
      if (typeof window.highlightHop === "function") window.highlightHop(hopIndex);
      // After optional full re-render (multi-rel hops), scroll the explanation panel on the next frame.
      requestAnimationFrame(() => {
        if (typeof window.expandHopDetails === "function") window.expandHopDetails(hopIndex, { scroll: true });
      });
    });
  };

  const resolveControlAnchor = () => {
    let iconX;
    let iconY;
    if (
      flipIconWorldFromLabel &&
      Number.isFinite(flipIconWorldFromLabel.x) &&
      Number.isFinite(flipIconWorldFromLabel.y)
    ) {
      iconX = flipIconWorldFromLabel.x;
      iconY = flipIconWorldFromLabel.y;
    } else {
      /** Fallback when labels omit a badge but flip is still eligible (rare). */
      const horizontalInline = !forLabelStraddle && Math.abs(y1 - y2) < 0.5;
      if (horizontalInline) {
        const linesH = displayRelLines ?? [];
        const fs = 8.5;
        const approxTextW =
          linesH.length === 0 ? 0 : Math.min(170, Math.max(48, linesH.join(" ").length * (fs * 0.55)));
        const hasRelChoices = codesForUserChoice.length > 1;
        const badgeR = hasRelChoices ? 9 : 7;
        const showHop = hopIndex != null && showHopNumbers;
        const textStart = showHop ? 2 * badgeR + VERT_BADGE_NAME_GAP : 0;
        const totalW = textStart + approxTextW;
        const stackOriginX = labelLineX - totalW / 2;
        const FLIP_R_FB = 10;
        const UNDER_GAP = 4;
        if (showHop) {
          iconX = stackOriginX + badgeR;
          iconY = labelY + badgeR + FLIP_R_FB + UNDER_GAP;
        } else {
          iconX = labelLineX;
          iconY = labelY;
        }
      } else {
        iconX = labelLineX + 16;
        iconY = labelY - 14;
      }
    }
    return { iconX, iconY };
  };

  const makeFlipControl = () => {
    if (!showInlineEdgeActionButtons) return null;
    if (!flipEligible) return null;
    const { iconX, iconY } = resolveControlAnchor();
    const btn = svgEl("g", {
      class: "path-edge-flip",
      transform: `translate(${iconX}, ${iconY})`,
      "data-source": String(semanticFrom || ""),
      "data-target": String(semanticTo || ""),
      "aria-hidden": "true",
      style: "pointer-events:none;opacity:0.88;",
    });
    btn.appendChild(svgEl("circle", {
      cx: "0",
      cy: "0",
      r: "10",
      fill: "#f8fafc",
      stroke: "#cbd5e1",
      "stroke-width": "0.55",
    }));
    btn.appendChild(svgEl("text", {
      x: "0",
      y: "1",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": "12",
      "font-weight": "800",
      fill: "#94a3b8",
      "pointer-events": "none",
    }, "⇄"));
    return btn;
  };

  const makeLockControls = () => {
    if (!showInlineEdgeActionButtons) return { lockBadge: null, unpinBtn: null, relTag: null };
    if (!lockEligible) return { lockBadge: null, unpinBtn: null, relTag: null };
    const { iconX, iconY } = resolveControlAnchor();
    const relCode = String(UPPER || "").toUpperCase();
    const relName = RELATIONSHIPS?.[relCode]?.name || relCode || "Relationship";
    const controlX = iconX + (flipEligible ? 24 : 0);
    const relTag = svgEl("g", {
      class: "path-edge-lock-label path-edge-control",
      transform: `translate(${controlX + 12}, ${iconY - 13})`,
      style: "pointer-events:none;opacity:0.95;",
    });
    relTag.appendChild(svgEl("title", {}, `Locked relationship: ${relName}`));
    relTag.appendChild(svgEl("rect", {
      x: "-3",
      y: "-7",
      rx: "4",
      ry: "4",
      width: String(Math.max(28, relName.length * 5.4 + 8)),
      height: "14",
      fill: "#eff6ff",
      stroke: "#93c5fd",
      "stroke-width": "1",
    }));
    relTag.appendChild(svgEl("text", {
      x: "1",
      y: "0",
      "dominant-baseline": "middle",
      "font-size": "9",
      "font-weight": "700",
      fill: "#1e3a8a",
      "pointer-events": "none",
    }, relName));
    const lockBadge = svgEl("g", {
      class: "path-edge-lock path-edge-control",
      transform: `translate(${controlX}, ${iconY})`,
      style: "pointer-events:none;opacity:0.96;",
    });
    lockBadge.appendChild(svgEl("title", {}, `Locked direction (${relName})`));
    lockBadge.appendChild(svgEl("circle", {
      cx: "0",
      cy: "0",
      r: "9",
      fill: "#eff6ff",
      stroke: "#1d4ed8",
      "stroke-width": "1.25",
    }));
    lockBadge.appendChild(svgEl("path", {
      d: "M -2.4 -1.4 V -2.7 A 2.4 2.4 0 0 1 0 -5.1 A 2.4 2.4 0 0 1 2.4 -2.7 V -1.4 M -3.5 -1.4 H 3.5 V 3.9 H -3.5 Z",
      fill: "none",
      stroke: "#1e3a8a",
      "stroke-width": "1.1",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "pointer-events": "none",
    }));

    const unpinBtn = svgEl("g", {
      class: "path-edge-unpin path-edge-control",
      transform: `translate(${controlX + 22}, ${iconY})`,
      role: "button",
      style: "cursor:pointer;pointer-events:all;opacity:0.96;transition:opacity 120ms ease;",
      "aria-label": "Unpin locked direction",
    });
    unpinBtn.appendChild(svgEl("title", {}, `Unpin locked direction (${forcedEnds.from} → ${forcedEnds.to})`));
    unpinBtn.appendChild(svgEl("circle", {
      cx: "0",
      cy: "0",
      r: "8.5",
      fill: "#fff7ed",
      stroke: "#9a3412",
      "stroke-width": "1.25",
    }));
    unpinBtn.appendChild(svgEl("path", {
      d: "M -2.8 -2.8 L 2.8 2.8 M 2.8 -2.8 L -2.8 2.8",
      stroke: "#9a3412",
      "stroke-width": "1.35",
      "stroke-linecap": "round",
      "pointer-events": "none",
    }));
    unpinBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.removeEdgeConstraintPair === "function") {
        window.removeEdgeConstraintPair(forcedEnds.from, forcedEnds.to, { reason: "edge-unpin-diagram" });
      }
    });
    return { lockBadge, unpinBtn, relTag };
  };

  if (interactiveOnly) {
    const g = svgEl("g", {
      class: `archimate-arrow clickable-arrow${choiceUndecided ? " provisional" : ""}${
        isAssocBridge ? " archimate-arrow--association-bridge" : ""
      }`,
      style: "cursor: pointer;",
    });
    if (hopIndex != null) g.setAttribute("data-hop", String(hopIndex));
    g.appendChild(svgEl("path", { d: d, stroke: "transparent", "stroke-width": "15", fill: "none", class: "archimate-arrow-hit" }));
    if (leaderEl) g.appendChild(leaderEl);
    g.appendChild(labelG);
    const flipBtn = makeFlipControl();
    const { lockBadge, unpinBtn, relTag } = makeLockControls();
    if (flipBtn) {
      g.appendChild(flipBtn);
    }
    if (relTag) g.appendChild(relTag);
    if (lockBadge) g.appendChild(lockBadge);
    if (unpinBtn) {
      g.appendChild(unpinBtn);
      g.addEventListener("mouseenter", () => { unpinBtn.style.opacity = "1"; });
      g.addEventListener("mouseleave", () => { unpinBtn.style.opacity = "0.92"; });
    }
    wireClick(g);
    return g;
  }

  const g = svgEl("g", {
    class: `archimate-arrow clickable-arrow${choiceUndecided ? " provisional" : ""}${
      isAssocBridge ? " archimate-arrow--association-bridge" : ""
    }`,
    style: "cursor: pointer;",
  });
  if (hopIndex != null) g.setAttribute("data-hop", String(hopIndex));
  g.appendChild(svgEl("path", { d: d, stroke: "transparent", "stroke-width": "15", fill: "none", class: "archimate-arrow-hit" }));
  g.appendChild(mkStrokePath());
  if (leaderEl) g.appendChild(leaderEl);
  g.appendChild(labelG);
  const flipBtn = makeFlipControl();
  const { lockBadge, unpinBtn, relTag } = makeLockControls();
  if (flipBtn) {
    g.appendChild(flipBtn);
  }
  if (relTag) g.appendChild(relTag);
  if (lockBadge) g.appendChild(lockBadge);
  if (unpinBtn) {
    g.appendChild(unpinBtn);
    g.addEventListener("mouseenter", () => { unpinBtn.style.opacity = "1"; });
    g.addEventListener("mouseleave", () => { unpinBtn.style.opacity = "0.92"; });
  }
  wireClick(g);

  return g;
}

function ensureMarkers(svg) {
  if (svg.dataset.hasMarkers === "true") return;
  svg.dataset.hasMarkers = "true";

  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = svgEl("defs", {});
    svg.insertBefore(defs, svg.firstChild);
  }

  const color = "#333";

  const mkOpen = (id) => {
    const m = svgEl("marker", {
      id,
      viewBox: "0 0 8 8",
      markerWidth: "8",
      markerHeight: "8",
      refX: "8",
      refY: "4",
      orient: "auto",
      markerUnits: "strokeWidth",
      overflow: "visible",
    });
    m.appendChild(svgEl("polyline", {
      points:"0 0, 8 4, 0 8",
      fill:"none",
      stroke: color,
      "stroke-width":"1.2",
      "stroke-linejoin":"miter",
    }));
    return m;
  };
  const mkFilled = (id) => {
    const m = svgEl("marker", {
      id,
      viewBox: "0 0 8 8",
      markerWidth: "8",
      markerHeight: "8",
      refX: "8",
      refY: "4",
      orient: "auto",
      markerUnits: "strokeWidth",
      overflow: "visible",
    });
    m.appendChild(svgEl("polygon", { points:"0 0, 8 4, 0 8", fill: color }));
    return m;
  };
  const mkTriangle = (id) => {
    const m = svgEl("marker", {
      id,
      viewBox: "0 0 8 8",
      markerWidth: "8",
      markerHeight: "8",
      refX: "8",
      refY: "4",
      orient: "auto",
      markerUnits: "strokeWidth",
      overflow: "visible",
    });
    m.appendChild(svgEl("polygon", {
      points:"0 0, 8 4, 0 8",
      fill:"#ffffff",
      stroke: color,
      "stroke-width":"1.2",
      "stroke-linejoin":"miter",
    }));
    return m;
  };
  const mkDiamondFilled = (id) => {
    const m = svgEl("marker", {
      id,
      viewBox: "0 0 8 8",
      markerWidth: "8",
      markerHeight: "8",
      /** Tip at (8,4): anchor on aggregate face; body extends back along the connector (same as arrow markers). */
      refX: "8",
      refY: "4",
      orient: "auto",
      markerUnits: "strokeWidth",
      overflow: "visible",
    });
    m.appendChild(svgEl("polygon", { points:"0 4, 4 0, 8 4, 4 8", fill: color }));
    return m;
  };
  const mkDiamondOpen = (id) => {
    const m = svgEl("marker", {
      id,
      viewBox: "0 0 8 8",
      markerWidth: "8",
      markerHeight: "8",
      refX: "8",
      refY: "4",
      orient: "auto",
      markerUnits: "strokeWidth",
      overflow: "visible",
    });
    m.appendChild(svgEl("polygon", {
      points:"0 4, 4 0, 8 4, 4 8",
      fill:"white",
      stroke: color,
      "stroke-width":"1.2",
      "stroke-linejoin":"miter",
    }));
    return m;
  };
  const mkCircle = (id) => {
    const m = svgEl("marker", {
      id,
      viewBox: "0 0 8 8",
      markerWidth: "8",
      markerHeight: "8",
      refX: "4",
      refY: "4",
      orient: "auto",
      markerUnits: "strokeWidth",
    });
    m.appendChild(svgEl("circle", { cx:"4", cy:"4", r:"3.5", fill: color }));
    return m;
  };

  for (const [code, style] of Object.entries(ARROW_STYLES)) {
    if (style.endMarker === "arrow-open")    defs.appendChild(mkOpen(`end-${code}-d`));
    if (style.endMarker === "arrow-open")    defs.appendChild(mkOpen(`end-${code}-r`));
    if (style.endMarker === "arrow-filled")  defs.appendChild(mkFilled(`end-${code}-d`));
    if (style.endMarker === "arrow-filled")  defs.appendChild(mkFilled(`end-${code}-r`));
    if (style.endMarker === "triangle-open") defs.appendChild(mkTriangle(`end-${code}-d`));
    if (style.endMarker === "triangle-open") defs.appendChild(mkTriangle(`end-${code}-r`));
    if (style.startMarker === "diamond-filled") defs.appendChild(mkDiamondFilled(`start-${code}`));
    if (style.startMarker === "diamond-open")   defs.appendChild(mkDiamondOpen(`start-${code}`));
    if (style.startMarker === "circle-filled")  defs.appendChild(mkCircle(`start-${code}`));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT LAYOUT — linear left-to-right
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vertical compact: hops **into** a flanked-composite step (Communication Network, Path, collaborations)
 * place relationship notes west of the spine so they do not cover the right-hand illustration box;
 * hops **out** use the default east straddle. Two wide steps in a row alternate by hop index.
 */
// (moved to ui/rendererCore.js)


/** True if otherCy is strictly between source/target row centers (excludes adjacent path rows). */
// (moved to ui/rendererCore.js)

/**
 * Horizontal span of a vertical-compact row (main box + optional T-bone flanks). Must match drawElement(alignVertical).
 */
// (moved to ui/rendererLayout.js)

/** Union of horizontal extents (spine + flanks) for all steps at main-box origin x = 0. */
// (moved to ui/rendererLayout.js)

/**
 * Lane column width: content span + pad, capped by MAX; never below intrinsic span (composites may exceed MAX).
 */
// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

/**
 * Per-hop outer C-shape: side ports at main-box faces, bus at tx. Stagger parallel east/west bypasses.
 * @returns {Map<number, { tx: number, sx: number, sy: number, ex: number, ey: number }>}
 */
// (moved to ui/rendererLayout.js)

/** Rough outer-bus X for layout scoring (no stagger). */
// (moved to ui/rendererLayout.js)


// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

/**
 * Vertical swimlanes (rotated lanes): layer lanes as vertical columns.
 * Path still flows top-to-bottom; cross-layer hops move between columns.
 */
// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

// (moved to ui/rendererLayout.js)

/** `sortedIndices[visualIdx]` is the original path index of the node at that visual row. */
function renderVerticalCompactDiagram(
  svg,
  steps,
  positions,
  showHopNumbers,
  showFlipControls,
  showLockControls,
  pathFlatSteps,
  sortedIndices,
  illustrationPathKey = "0",
  renderContext = {}
) {
  const relationshipLabelsOnly = !!renderContext.relationshipLabelsOnly;
  const origToVisual = new Map();
  sortedIndices.forEach((origIdx, visualIdx) => origToVisual.set(origIdx, visualIdx));
  const badgeOffsetByHop = computeVerticalBadgeStairOffsetsByHop(pathFlatSteps, positions, sortedIndices);
  const outerArcByHop = computeVerticalCompactOuterArcByHop(steps, positions, pathFlatSteps, sortedIndices, badgeOffsetByHop);
  const verticalLabelNudgesByHop = computeVerticalLabelNudges(
    pathFlatSteps,
    steps,
    positions,
    sortedIndices,
    badgeOffsetByHop,
    outerArcByHop
  );

  // Expand the drawable area so outer-bypass lanes and their label stacks never get clipped.
  // (Outer tx may be < 0 on West routes; viewBox starting at 0 would cut off labels.)
  // Also extend upward: vertical straddle labels (badge + stroked text) sit on the connector and
  // can extend above y=0 when the hop is short or nudged — compact + swimlanes share this path.
  {
    const vb = String(svg.getAttribute("viewBox") || "0 0 0 0").trim().split(/\s+/).map(Number);
    const vbX = Number.isFinite(vb[0]) ? vb[0] : 0;
    const vbY = Number.isFinite(vb[1]) ? vb[1] : 0;
    const vbW = Number.isFinite(vb[2]) ? vb[2] : 0;
    const vbH = Number.isFinite(vb[3]) ? vb[3] : 0;

    let minX = vbX;
    let maxX = vbX + vbW;
    let minY = vbY;
    const pad = 18;
    /** Extra above estimateVerticalHopLabelRect top (text stroke, badge vs heuristic). */
    const padTop = 8;

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
      const outer = outerArcByHop.get(hop) ?? null;

      if (outer && typeof outer === "object" && Number.isFinite(outer.tx)) {
        minX = Math.min(minX, outer.tx - pad);
        maxX = Math.max(maxX, outer.tx + pad);
      }

      const lab = estimateVerticalHopLabelRect(a, b, fromEl, toEl, hop, outer, step.codes);
      lab.x += (badgeOffsetByHop.get(hop) || 0) + (verticalLabelNudgesByHop.get(hop)?.x || 0);
      lab.y += (verticalLabelNudgesByHop.get(hop)?.y || 0);
      const left = lab.x - lab.w / 2;
      const right = lab.x + lab.w / 2;
      minX = Math.min(minX, left - pad);
      maxX = Math.max(maxX, right + pad);
      const labTop = lab.y - lab.h / 2 - padTop;
      minY = Math.min(minY, labTop - pad);
    }

    if (Number.isFinite(minX) && Number.isFinite(maxX) && maxX > minX && vbW > 0 && vbH > 0) {
      const newW = maxX - minX;
      const newY = Math.min(vbY, minY);
      const newH = vbH + (vbY - newY);
      svg.setAttribute("viewBox", `${minX} ${newY} ${newW} ${newH}`);
    }
  }

  const verticalEdgeLabelRegistry = createEdgeLabelSpaceRegistry();
  for (let pi = 0; pi < positions.length; pi++) {
    const bb = layoutElementBBox(positions[pi]);
    verticalEdgeLabelRegistry.addObstacle({
      left: bb.left,
      right: bb.right,
      top: bb.top,
      bottom: bb.bottom,
    });
  }

  const appendHopArrows = (strokeOnly, interactiveOnly) => {
    for (let hop = 1; hop < pathFlatSteps.length; hop++) {
      const step = pathFlatSteps[hop];
      if (!step.codes) continue;
      const vFrom = origToVisual.get(hop - 1);
      const vTo = origToVisual.get(hop);
      if (vFrom == null || vTo == null || vFrom === vTo) continue;
      const prevEl = steps[vFrom].element;
      const curEl = steps[vTo].element;
      const prevBand = positions[vFrom].bandId;
      const curBand = positions[vTo].bandId;
      const crossLane = prevBand !== curBand;
      const westByDirection = !crossLane && positions[vTo].x < positions[vFrom].x;
      const { x1, y1, x2, y2 } = layerGravityHopPorts(positions[vFrom], positions[vTo], prevEl, curEl);
      svg.appendChild(drawArrow(x1, y1, x2, y2, step.codes, step.isDirect, svg, {
        hopIndex: hop,
        displayHopIndex: hop,
        showHopNumbers,
        showFlipControls,
        showLockControls,
        relationshipLabelsOnly,
        strokeOnly: !!strokeOnly,
        interactiveOnly: !!interactiveOnly,
        crossLaneEdge: crossLane,
        orthogonal: true,
        smoothCrossLane: crossLane,
        orthogonalPin: "source",
        verticalSwimlanePorts: crossLane,
        sameLaneSideJog: false,
        verticalStraddleWest: westByDirection || verticalStraddleWestForCompactHop(prevEl, curEl, hop),
        badgeStairOffsetX: badgeOffsetByHop.get(hop) || 0,
        labelNudgeX: verticalLabelNudgesByHop.get(hop)?.x || 0,
        labelNudgeY: verticalLabelNudgesByHop.get(hop)?.y || 0,
        outerArcCShape: outerArcByHop.get(hop) ?? null,
        outerArcTrackX: null,
        matrixDirectCodes: step.matrixDirectCodes,
        matrixDerivedCodes: step.matrixDerivedCodes,
        labelSpaceRegistry: !strokeOnly && interactiveOnly ? verticalEdgeLabelRegistry : null,
        isAssociationBridge: !!step.isAssociation,
        semanticFrom: prevEl,
        semanticTo: curEl,
        waypointElementSet: renderContext.waypointElementSet ?? null,
        edgeConstraints: renderContext.edgeConstraints ?? null,
      }));
    }
  };

  const nodeLayers = [];
  for (let i = 0; i < steps.length; i++) {
    const origIdx = sortedIndices[i];
    const illustrationSeed = `${illustrationPathKey}:${origIdx}:${steps[i].element}`;
    const incomingPreferWest = (() => {
      if (origIdx <= 0) return false;
      const prevEl = pathFlatSteps[origIdx - 1]?.element;
      const curEl = pathFlatSteps[origIdx]?.element;
      if (!prevEl || !curEl) return false;
      return verticalStraddleWestForCompactHop(prevEl, curEl, origIdx);
    })();
    const elG = drawElement(steps[i].element, positions[i].x, positions[i].y, EL_W, EL_H, {
      measureSvg: svg,
      alignVertical: true,
      illustrationSeed,
      hideCompositeIllustrations: shouldHideCompositeIllustrations(),
      // Place the upper composite sub on the opposite side of the incoming hop label/bypass.
      diagUpperOnWest: !incomingPreferWest,
    });
    elG.setAttribute("data-layout-bbox", `${positions[i].x},${positions[i].y},${EL_W},${EL_H}`);
    nodeLayers.push(elG);
  }
  appendHopArrows(true, false);
  // Match horizontal swimlanes: draw aggregation illustration (subs + dashed connectors) above relationship strokes
  // so orthogonal hops do not paint over the example part boxes. (Search detached node trees — they are not on svg yet.)
  const compositeLayers = [];
  for (const elG of nodeLayers) {
    elG.querySelectorAll(".composite-illustration").forEach((g) => compositeLayers.push(g));
  }
  for (const g of compositeLayers) svg.appendChild(g);
  // Paint main element cards (incl. corner glyphs) above connector strokes but under hop labels / flip controls.
  for (const elG of nodeLayers) svg.appendChild(elG);
  appendHopArrows(false, true);
}

/** Compact horizontal left-to-right layout only (vertical uses renderSwimlane with showLaneBands: false). */
function renderCompact(svg, flatSteps, {
  showHopNumbers = true,
  showFlipControls = true,
  showLockControls = true,
  relationshipLabelsOnly = false,
  illustrationPathKey = "0",
  waypointElementSet = null,
  edgeConstraints = null,
} = {}) {
  const plan = typeof computeCompactPlan === "function"
    ? computeCompactPlan(flatSteps, {
        elementWidth: EL_W,
        elementHeight: EL_H,
        elementGap: EL_GAP,
        hasCompositePattern: (name) => !!COMPOSITE_PATTERNS[name],
      })
    : null;
  const totalW = plan?.totalW ?? (flatSteps.length * EL_W + (flatSteps.length - 1) * EL_GAP + 100);
  const totalH = plan?.totalH ?? (flatSteps.some((s) => COMPOSITE_PATTERNS[s.element]) ? 320 : 150);
  svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
  svg.setAttribute("width", "100%"); svg.setAttribute("height", String(totalH));
  const positions = plan?.positions || (() => {
    let x = 50;
    const y = totalH / 2 - EL_H / 2;
    const out = [];
    for (let i = 0; i < flatSteps.length; i++) {
      out.push({ x, y, cy: y + EL_H / 2, cx: x + EL_W / 2 });
      x += EL_W + EL_GAP;
    }
    return out;
  })();
  const nodeLayers = [];
  for (let i = 0; i < flatSteps.length; i++) {
    const illustrationSeed = `${illustrationPathKey}:${i}:${flatSteps[i].element}`;
    const elGroup = drawElement(flatSteps[i].element, positions[i].x, positions[i].y, EL_W, EL_H, {
      measureSvg: svg,
      illustrationSeed,
      hideCompositeIllustrations: shouldHideCompositeIllustrations(),
    });
    elGroup.setAttribute("data-layout-bbox", `${positions[i].x},${positions[i].y},${EL_W},${EL_H}`);
    nodeLayers.push(elGroup);
  }
  for (let i = 1; i < flatSteps.length; i++) {
    const step = flatSteps[i];
    if (!step.codes) continue;
    const prev = positions[i - 1];
    const cur = positions[i];
    svg.appendChild(drawArrow(prev.x + EL_W, prev.cy, cur.x, cur.y + EL_H / 2, step.codes, step.isDirect, svg, {
      hopIndex: i,
      showHopNumbers,
      showFlipControls,
      showLockControls,
      relationshipLabelsOnly,
      strokeOnly: true,
      matrixDirectCodes: step.matrixDirectCodes,
      matrixDerivedCodes: step.matrixDerivedCodes,
      isAssociationBridge: !!step.isAssociation,
      semanticFrom: flatSteps[i - 1].element,
      semanticTo: flatSteps[i].element,
      waypointElementSet,
      edgeConstraints,
    }));
  }
  for (const elGroup of nodeLayers) svg.appendChild(elGroup);
  for (let i = 1; i < flatSteps.length; i++) {
    const step = flatSteps[i];
    if (!step.codes) continue;
    const prev = positions[i - 1];
    const cur = positions[i];
    svg.appendChild(drawArrow(prev.x + EL_W, prev.cy, cur.x, cur.y + EL_H / 2, step.codes, step.isDirect, svg, {
      hopIndex: i,
      showHopNumbers,
      showFlipControls,
      showLockControls,
      relationshipLabelsOnly,
      interactiveOnly: true,
      matrixDirectCodes: step.matrixDirectCodes,
      matrixDerivedCodes: step.matrixDerivedCodes,
      isAssociationBridge: !!step.isAssociation,
      semanticFrom: flatSteps[i - 1].element,
      semanticTo: flatSteps[i].element,
      waypointElementSet,
      edgeConstraints,
    }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SWIMLANE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Swimlane band placement: there is no separate “composition layer” in the ArchiMate layer stack.
 * Location and Grouping are registered with layer "Composite" for filtering, but in swimlanes they
 * should sit in the lane of an adjacent non-Composite step (or Business as a last resort).
 */
// (moved to ui/rendererCore.js)

/**
 * Connector endpoints for horizontal swimlanes. With compact packing only, same-column hops use
 * top/bottom centers (straight vertical); spread layout always uses right-center → left-center for curves.
 */
// (moved to ui/rendererCore.js)

/** Vertical layer-gravity hops: same-lane use side ports; cross-lane use top/bottom centers. */
// (moved to ui/rendererCore.js)

function renderSwimlane(svg, flatSteps, {
  showHopNumbers = true,
  showFlipControls = true,
  showLockControls = true,
  relationshipLabelsOnly = false,
  alignVertical = false,
  showLaneBands = true,
  /** Horizontal lanes only: spread = curved cross-lane hops + EL_GAP; compact = L-shaped 90° hops + tighter columns. */
  horizontalLaneLayout = "spread",
  illustrationPathKey = "0",
  waypointElementSet = null,
  edgeConstraints = null,
} = {}) {
  /**
   * Vertical: one code path for Compact+Vertical and Swimlanes+Vertical (showLaneBands false vs true).
   * Lane tints and left labels are optional; diagram geometry and edges are identical.
   */
  if (alignVertical) {
    const layout = (() => {
      if (!showLaneBands) return computeVerticalCompactLayout(flatSteps);
      const rowLayout = computeVerticalCompactLayout(flatSteps);
      const colLayout = computeVerticalRotatedLaneLayout(flatSteps);
      if (!rowLayout) return colLayout;
      if (!colLayout) return rowLayout;
      const rowScore = scoreVerticalLayoutReadability(rowLayout, flatSteps);
      const colScore = scoreVerticalLayoutReadability(colLayout, flatSteps);
      return colScore < rowScore ? colLayout : rowLayout;
    })();
    if (!layout) return;
    const { steps, positions, totalW, totalH, sortedIndices, pathFlatSteps, usedBands, laneMetrics, laneOrientation } = layout;

    if (showLaneBands) {
      if (usedBands.length === 0) return;
      if (laneOrientation === "columns") {
        svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", String(totalH));
        svg.setAttribute("preserveAspectRatio", "xMidYMin meet");

        const bgG = svgEl("g", { class: "swimlane-bands-layer", style: "pointer-events: none;" });
        let colIx = 0;
        for (const band of usedBands) {
          const m = laneMetrics[band.id];
          if (!m) continue;
          const w = Math.max(1, m.w || EL_W);
          const h = Math.max(1, m.h || LANE_H_MIN);
          bgG.appendChild(svgEl("rect", {
            x: m.x,
            y: m.y,
            width: w,
            height: h,
            fill: band.color,
            stroke: "none",
            opacity: "0.5",
          }));
          bgG.appendChild(drawSwimlaneColumnLabel(svg, {
            layer: band,
            laneX: m.x,
            laneY: m.y,
            laneW: w,
            clipIdSuffix: `vc${colIx++}`,
          }));
        }
        svg.appendChild(bgG);
      } else {
        const xShift = VERTICAL_ROW_SWIMLANE_LABEL_W + LANE_CONTENT_GAP;
        for (const p of positions) {
          p.x += xShift;
          p.cx += xShift;
        }
        const swimlaneW = totalW + xShift;

        svg.setAttribute("viewBox", `0 0 ${swimlaneW} ${totalH}`);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", String(totalH));
        svg.setAttribute("preserveAspectRatio", "xMidYMin meet");

        const bgG = svgEl("g", { class: "swimlane-bands-layer", style: "pointer-events: none;" });
        let bandIx = 0;
        for (const band of usedBands) {
          const m = laneMetrics[band.id];
          if (!m) continue;
          const h = Math.max(1, m.h);
          bgG.appendChild(svgEl("rect", {
            x: 0,
            y: m.y,
            width: swimlaneW,
            height: h,
            fill: band.color,
            stroke: "none",
            opacity: "0.5",
          }));
          bgG.appendChild(drawSwimlaneLabel(svg, {
            layer: band,
            laneY: m.y,
            actualH: h,
            clipIdSuffix: `v${bandIx++}`,
            stripWidth: VERTICAL_ROW_SWIMLANE_LABEL_W,
          }));
        }
        svg.appendChild(bgG);
      }
    } else {
      svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", String(totalH));
      svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
    }

    renderVerticalCompactDiagram(
      svg,
      steps,
      positions,
      showHopNumbers,
      showFlipControls,
      showLockControls,
      pathFlatSteps,
      sortedIndices,
      illustrationPathKey,
      { waypointElementSet, edgeConstraints, relationshipLabelsOnly }
    );
    return;
  }

  /** Horizontal swimlanes: full element drawing (including composites); orthogonal connectors between lanes. */
  const usedLayerIds = [...new Set(flatSteps.map((s, i) => getSwimlaneLayer(s.element, i, flatSteps)))];
  const usedLayers = typeof LAYERS !== 'undefined' ? LAYERS.filter(l => usedLayerIds.includes(l.id)) : [];
  if (usedLayers.length === 0) return;

  /** Spread swimlanes: composite illustration subs sit below the main box on diagonals (stay in-layer). */
  const swimlaneCompositeSubsBelowDiagonal =
    horizontalLaneLayout !== "compact" &&
    !shouldHideCompositeIllustrations();

  const swimlaneDiagHorizSpan = (() => {
    const gapX = typeof COMPOSITE_H_GAP_VERTICAL === "number" ? COMPOSITE_H_GAP_VERTICAL : COMPOSITE_H_GAP;
    return EL_W + gapX;
  })();

  const laneHeightsById = {};
  for (const lid of usedLayerIds) {
    let maxH = LANE_H_MIN;
    flatSteps.forEach((step, i) => {
      if (getSwimlaneLayer(step.element, i, flatSteps) !== lid) return;
      // Use the same composite bbox math as rendering so lane bands always contain illustrated subs.
      const top = compositeTopY(0, step.element, { alignVertical: false, swimlaneCompositeSubsBelowDiagonal });
      const bottom = compositeBottomY(0, step.element, { alignVertical: false, swimlaneCompositeSubsBelowDiagonal });
      const outerH = Math.max(EL_H, bottom - top);
      maxH = Math.max(maxH, outerH);
      const hOuter = horizontalLayoutStepOuterHeight(step.element, { swimlaneCompositeSubsBelowDiagonal });
      // Main boxes share one row Y (see positions below). Lane must be tall enough: bottom = center - EL_H/2 + hOuter.
      maxH = Math.max(maxH, 2 * hOuter - EL_H);
    });
    laneHeightsById[lid] = maxH;
  }

  const isCompactHorizontal = horizontalLaneLayout === "compact";
  let compactColGapMin = SWIMLANE_COMPACT_COL_GAP;
  if (isCompactHorizontal) {
    let maxW = 0;
    for (let hi = 1; hi < flatSteps.length; hi++) {
      const step = flatSteps[hi];
      if (!step?.codes) continue;
      maxW = Math.max(maxW, estimateSwimlaneHopLabelWidthPx(step, hi, flatSteps, edgeConstraints));
    }
    const gapPad = 28;
    compactColGapMin = Math.max(SWIMLANE_COMPACT_COL_GAP, maxW + gapPad);
  }
  // Spread swimlanes: composite subs sit on a row below the main box and can extend EL_W+gapX to either side.
  // Column step EL_W+colGap must clear the neighbor's illustrated sub (2*EL_W+gapX from this main's left edge),
  // otherwise subs collide with the next column's main box (same-layer horizontal overlap).
  const colGap = isCompactHorizontal
    ? compactColGapMin
    : swimlaneCompositeSubsBelowDiagonal
      ? Math.max(
          EL_GAP,
          EL_W +
            (typeof COMPOSITE_H_GAP_VERTICAL === "number" ? COMPOSITE_H_GAP_VERTICAL : COMPOSITE_H_GAP) +
            8
        )
      : EL_GAP;
  const topPad = 20;
  const bottomPad = 40;

  let laneMetrics = {};
  let currentY = topPad;

  usedLayers.forEach((layer) => {
    const laneH = laneHeightsById[layer.id] ?? LANE_H_MIN;
    laneMetrics[layer.id] = { y: currentY, h: laneH, center: currentY + (laneH / 2) };
    currentY += laneH;
  });

  const totalH = currentY + bottomPad;
  let maxXCol = 0;
  /**
   * Column assignment (horizontal swimlanes):
   * - Spread: one column per path step (strict left-to-right); cross-layer hops always have horizontal
   *   separation so connectors use H–V–H / “staircase” routing instead of stacking in one vertical column.
   * - Compact: advance column within the same layer; on layer change, reuse the previous column only
   *   while that column has fewer than two nodes — caps “towers” at two elements and otherwise increments.
   */
  const occupied = new Set();
  const colByIndex = [];
  /** Number of nodes already placed at each column index (compact stacking cap). */
  const columnNodeCount = [];
  const positions = flatSteps.map((step, i) => {
    const layerId = getSwimlaneLayer(step.element, i, flatSteps);
    const m = laneMetrics[layerId];
    let col;
    if (i === 0) {
      col = 0;
    } else if (!isCompactHorizontal) {
      col = i;
    } else {
      const prevLayer = getSwimlaneLayer(flatSteps[i - 1].element, i - 1, flatSteps);
      if (layerId === prevLayer) {
        col = colByIndex[i - 1] + 1;
      } else {
        const prevCol = colByIndex[i - 1];
        const usedInPrevCol = columnNodeCount[prevCol] || 0;
        col = usedInPrevCol < 2 ? prevCol : prevCol + 1;
      }
      while (occupied.has(`${col},${layerId}`)) {
        col += 1;
      }
    }
    occupied.add(`${col},${layerId}`);
    colByIndex[i] = col;
    columnNodeCount[col] = (columnNodeCount[col] || 0) + 1;
    if (col > maxXCol) maxXCol = col;
    const y =
      m.center - (EL_H / 2) + compositeMainTopDelta(step.element, { swimlaneCompositeSubsBelowDiagonal });
    return { x: LANE_LABEL_W + 40 + col * (EL_W + colGap), y, cy: m.center };
  });

  /** One shared connector Y per swimlane row so same-layer hops stay horizontal (composites otherwise shift per-node midY). */
  const laneHorizY = new Map();
  for (const layer of usedLayers) {
    const lid = layer.id;
    const mids = [];
    for (let si = 0; si < flatSteps.length; si++) {
      if (getSwimlaneLayer(flatSteps[si].element, si, flatSteps) !== lid) continue;
      mids.push(layoutElementBBox(positions[si]).midY);
    }
    if (mids.length) {
      laneHorizY.set(lid, mids.reduce((s, x) => s + x, 0) / mids.length);
    }
  }

  // Compact path layout never draws composite corner subs (see shouldHideCompositeIllustrations); no flank reserve.
  const compactCornerComposite = false;
  const flankW = compactCornerComposite ? (COMPOSITE_H_GAP + EL_W) : 0;

  // Compact lanes + composite subs: choose left vs right per composite so subs don't overlap other node boxes.
  const compactCornerSideByIndex = new Map();
  if (isCompactHorizontal && flankW > 0) {
    const nodeRects = positions.map((p) => ({ x: p.x, y: p.y, w: EL_W, h: EL_H }));
    const overlaps = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    for (let i = 0; i < positions.length; i++) {
      const el = flatSteps[i]?.element;
      if (!COMPOSITE_PATTERNS[el]) continue;
      const p = positions[i];
      const leftRect = { x: p.x - flankW, y: p.y, w: EL_W, h: EL_H };
      const rightRect = { x: p.x + EL_W + COMPOSITE_H_GAP, y: p.y, w: EL_W, h: EL_H };
      const okLeft = !nodeRects.some((r, j) => j !== i && overlaps(leftRect, r));
      const okRight = !nodeRects.some((r, j) => j !== i && overlaps(rightRect, r));
      compactCornerSideByIndex.set(i, okLeft ? "left" : okRight ? "right" : "left");
    }
  }

  // Ensure compact swimlanes are wide enough to contain composite illustration sub-boxes (which can extend left/right).
  const compositeRightFlankW = flankW;
  const compositeLeftFlankForBoundsW = flankW;
  let furthestRight = 0;
  let furthestLeft = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const el = flatSteps[i]?.element;
    const isComposite = !!COMPOSITE_PATTERNS[el];
    if (swimlaneCompositeSubsBelowDiagonal && isComposite) {
      furthestRight = Math.max(furthestRight, positions[i].x + EL_W + swimlaneDiagHorizSpan);
      furthestLeft = Math.min(furthestLeft, positions[i].x - swimlaneDiagHorizSpan);
      continue;
    }
    const side = compactCornerSideByIndex.get(i) || "left";
    furthestRight = Math.max(
      furthestRight,
      positions[i].x + EL_W + (isComposite && side === "right" ? compositeRightFlankW : 0)
    );
    furthestLeft = Math.min(
      furthestLeft,
      positions[i].x - (isComposite && side === "left" ? compositeLeftFlankForBoundsW : 0)
    );
  }

  const swimlaneWBase = (maxXCol + 1) * (EL_W + colGap) + LANE_LABEL_W + 80;
  const pad = 40;
  const minX = Number.isFinite(furthestLeft) ? Math.min(0, furthestLeft - pad) : 0;
  const maxX = Math.max(swimlaneWBase, furthestRight + pad);
  const swimlaneW = maxX - minX;
  svg.setAttribute("viewBox", `${minX} 0 ${swimlaneW} ${totalH}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(totalH));

  if (showLaneBands) {
    usedLayers.forEach((layer) => {
      const m = laneMetrics[layer.id];
      svg.appendChild(svgEl("rect", { x: 0, y: m.y, width: "100%", height: m.h, fill: layer.color, stroke: "none", opacity: "0.5" }));
      svg.appendChild(drawSwimlaneLabel(svg, { layer, laneY: m.y, actualH: m.h }));
    });
  }

  const hopArrowOpts = (crossLane) => ({
    orthogonal: true,
    crossLaneEdge: crossLane,
    // Smooth Béziers cut through intermediate nodes; H–V–H + bus-X nudging avoids that.
    smoothCrossLane: false,
    orthogonalPin: isCompactHorizontal ? "source" : "mid",
  });

  const swimlaneBusXByHop = new Map();
  for (let hi = 1; hi < flatSteps.length; hi++) {
    if (!flatSteps[hi]?.codes) continue;
    const crossLane =
      getSwimlaneLayer(flatSteps[hi - 1].element, hi - 1, flatSteps) !==
      getSwimlaneLayer(flatSteps[hi].element, hi, flatSteps);
    const a = positions[hi - 1];
    const b = positions[hi];
    const fromL = getSwimlaneLayer(flatSteps[hi - 1].element, hi - 1, flatSteps);
    const toL = getSwimlaneLayer(flatSteps[hi].element, hi, flatSteps);
    const alignedY = fromL === toL ? laneHorizY.get(fromL) : undefined;
    const { x1, y1, x2, y2 } = horizontalSwimlaneHopPorts(
      a,
      b,
      isCompactHorizontal,
      flatSteps[hi - 1].element,
      flatSteps[hi].element,
      alignedY
    );
    if (crossLane && Math.abs(y1 - y2) >= 0.5 && Math.abs(x1 - x2) >= 0.5) {
      swimlaneBusXByHop.set(
        hi,
        swimlaneOrthogonalBusXForHop(positions, flatSteps, hi, x1, y1, x2, y2, swimlaneCompositeSubsBelowDiagonal)
      );
    }
  }

  const swimlaneCompositePlacementByIndex = new Map();
  if (swimlaneCompositeSubsBelowDiagonal) {
    for (let pi = 0; pi < flatSteps.length; pi++) {
      if (!COMPOSITE_PATTERNS[flatSteps[pi]?.element]) continue;
      swimlaneCompositePlacementByIndex.set(
        pi,
        pickSwimlaneCompositeSubLayout(
          pi,
          positions,
          flatSteps,
          swimlaneBusXByHop,
          swimlaneCompositeSubsBelowDiagonal
        )
      );
    }
  }

  const swimlaneLabelObstacles = buildSwimlaneLabelObstacles(
    positions,
    flatSteps,
    swimlaneCompositeSubsBelowDiagonal
  );

  const nodeLayers = [];
  positions.forEach((pos, i) => {
    const illustrationSeed = `${illustrationPathKey}:${i}:${flatSteps[i].element}`;
    const swimlaneExcludeAdjacentIllustrationSubs = (() => {
      const ex = new Set();
      if (i > 0) ex.add(flatSteps[i - 1].element);
      if (i < flatSteps.length - 1) ex.add(flatSteps[i + 1].element);
      return ex;
    })();
    const elG = drawElement(flatSteps[i].element, pos.x, pos.y, EL_W, EL_H, {
      measureSvg: svg,
      illustrationSeed,
      hideCompositeIllustrations: shouldHideCompositeIllustrations(),
      compactCornerSide: compactCornerSideByIndex.get(i) || "left",
      swimlaneCompositeSubsBelowDiagonal: swimlaneCompositeSubsBelowDiagonal && !shouldHideCompositeIllustrations(),
      swimlaneCompositePlacement: swimlaneCompositePlacementByIndex.get(i) ?? null,
      swimlaneExcludeAdjacentIllustrationSubs,
    });
    elG.setAttribute("data-layout-bbox", `${pos.x},${pos.y},${EL_W},${EL_H}`);
    nodeLayers.push(elG);
  });

  const swimlaneEdgeLabelRegistry = createEdgeLabelSpaceRegistry();
  for (const o of swimlaneLabelObstacles) {
    swimlaneEdgeLabelRegistry.addObstacle(o);
  }

  for (let i = 1; i < flatSteps.length; i++) {
    const step = flatSteps[i];
    if (!step.codes) continue;
    const a = positions[i - 1];
    const b = positions[i];
    const crossLane =
      getSwimlaneLayer(flatSteps[i - 1].element, i - 1, flatSteps) !==
      getSwimlaneLayer(flatSteps[i].element, i, flatSteps);
    const fromL = getSwimlaneLayer(flatSteps[i - 1].element, i - 1, flatSteps);
    const toL = getSwimlaneLayer(flatSteps[i].element, i, flatSteps);
    const alignedY = fromL === toL ? laneHorizY.get(fromL) : undefined;
    const { x1, y1, x2, y2 } = horizontalSwimlaneHopPorts(a, b, isCompactHorizontal, flatSteps[i - 1].element, flatSteps[i].element, alignedY);
    const swimlaneOrthoBusMaxX = layoutElementBBox(b).right;
    svg.appendChild(drawArrow(x1, y1, x2, y2, step.codes, step.isDirect, svg, {
      hopIndex: i,
      showHopNumbers,
      showFlipControls,
      showLockControls,
      relationshipLabelsOnly,
      strokeOnly: true,
      labelNudgeX: 0,
      labelNudgeY: 0,
      disableStraddleLeader: isCompactHorizontal,
      matrixDirectCodes: step.matrixDirectCodes,
      matrixDerivedCodes: step.matrixDerivedCodes,
      swimlaneOrthogonalBusX: swimlaneBusXByHop.get(i) ?? null,
      swimlaneOrthoBusMaxX,
      swimlaneLabelObstacles,
      ...hopArrowOpts(crossLane),
      isAssociationBridge: !!step.isAssociation,
      semanticFrom: flatSteps[i - 1].element,
      semanticTo: flatSteps[i].element,
      waypointElementSet,
      edgeConstraints,
    }));
  }

  // After visible strokes, before hop labels: raise aggregation illustration groups so dashes sit above
  // relationship lines but below badges/labels (interactive pass follows).
  const compositeLayers = [];
  for (const elG of nodeLayers) {
    elG.querySelectorAll(".composite-illustration").forEach((g) => compositeLayers.push(g));
  }
  for (const g of compositeLayers) svg.appendChild(g);

  for (const elG of nodeLayers) svg.appendChild(elG);

  for (let i = 1; i < flatSteps.length; i++) {
    const step = flatSteps[i];
    if (!step.codes) continue;
    const a = positions[i - 1];
    const b = positions[i];
    const crossLane =
      getSwimlaneLayer(flatSteps[i - 1].element, i - 1, flatSteps) !==
      getSwimlaneLayer(flatSteps[i].element, i, flatSteps);
    const fromL2 = getSwimlaneLayer(flatSteps[i - 1].element, i - 1, flatSteps);
    const toL2 = getSwimlaneLayer(flatSteps[i].element, i, flatSteps);
    const alignedY2 = fromL2 === toL2 ? laneHorizY.get(fromL2) : undefined;
    const { x1, y1, x2, y2 } = horizontalSwimlaneHopPorts(a, b, isCompactHorizontal, flatSteps[i - 1].element, flatSteps[i].element, alignedY2);
    const swimlaneOrthoBusMaxX2 = layoutElementBBox(b).right;
    svg.appendChild(drawArrow(x1, y1, x2, y2, step.codes, step.isDirect, svg, {
      hopIndex: i,
      showHopNumbers,
      showFlipControls,
      showLockControls,
      relationshipLabelsOnly,
      interactiveOnly: true,
      labelNudgeX: 0,
      labelNudgeY: 0,
      disableStraddleLeader: isCompactHorizontal,
      matrixDirectCodes: step.matrixDirectCodes,
      matrixDerivedCodes: step.matrixDerivedCodes,
      swimlaneOrthogonalBusX: swimlaneBusXByHop.get(i) ?? null,
      swimlaneOrthoBusMaxX: swimlaneOrthoBusMaxX2,
      swimlaneLabelObstacles,
      labelSpaceRegistry: swimlaneEdgeLabelRegistry,
      ...hopArrowOpts(crossLane),
      isAssociationBridge: !!step.isAssociation,
      semanticFrom: flatSteps[i - 1].element,
      semanticTo: flatSteps[i].element,
      waypointElementSet,
      edgeConstraints,
    }));
  }
}

function drawSwimlaneLabel(svg, { layer, laneY, actualH, clipIdSuffix = "", stripWidth = LANE_LABEL_W } = {}) {
  const clipId = clipIdSuffix ? `lane-label-clip-${layer.id}-${clipIdSuffix}` : `lane-label-clip-${layer.id}`;
  const defs = svg.querySelector("defs") || svg.appendChild(svgEl("defs", {}));
  const clipPath = svgEl("clipPath", { id: clipId });
  clipPath.appendChild(svgEl("rect", { x: 0, y: laneY, width: stripWidth, height: actualH }));
  defs.appendChild(clipPath);

  const labelG = svgEl("g", { "clip-path": `url(#${clipId})` });
  const lines = wrapSvgTextLines(svg, layer.label, stripWidth - 20, { fontSize: 12, fontWeight: "850" });
  const lineH = 14;
  const startY = laneY + actualH / 2 - (lines.length * lineH) / 2 + lineH / 2;

  lines.forEach((ln, i) => {
    labelG.appendChild(svgEl("text", { x: 10, y: startY + i * lineH, fill: layer.borderColor, "font-size": "12", "font-weight": "850", "dominant-baseline": "middle" }, ln));
  });
  return labelG;
}

function drawSwimlaneColumnLabel(svg, { layer, laneX, laneY, laneW, clipIdSuffix = "" } = {}) {
  const clipId = clipIdSuffix ? `lane-column-label-clip-${layer.id}-${clipIdSuffix}` : `lane-column-label-clip-${layer.id}`;
  const defs = svg.querySelector("defs") || svg.appendChild(svgEl("defs", {}));
  const clipPath = svgEl("clipPath", { id: clipId });
  clipPath.appendChild(svgEl("rect", { x: laneX, y: laneY, width: laneW, height: 34 }));
  defs.appendChild(clipPath);

  const labelG = svgEl("g", { "clip-path": `url(#${clipId})` });
  const textMaxW = Math.min(laneW - 16, MAX_VERTICAL_LANE_WIDTH - 16);
  const lines = wrapSvgTextLines(svg, layer.label, textMaxW, { fontSize: 11, fontWeight: "850", maxLines: 2 });
  const lineH = 13;
  const startY = laneY + 8 + lineH / 2;
  lines.slice(0, 2).forEach((ln, i) => {
    labelG.appendChild(svgEl("text", {
      x: laneX + laneW / 2,
      y: startY + i * lineH,
      fill: layer.borderColor,
      "font-size": "11",
      "font-weight": "850",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    }, ln));
  });
  return labelG;
}


// ─────────────────────────────────────────────────────────────────────────────
// RENDER PATH (PUBLIC ENTRY)
// ─────────────────────────────────────────────────────────────────────────────


function renderPath(container, segments, {
  mode = "compact",
  segmentPathIndex = 0,
  showHopNumbers = true,
  showFlipControls = true,
  showLockControls = true,
  relationshipLabelsOnly = false,
  /** @deprecated use pathFlow */
  alignVertical = false,
  /** horizontal | vertical | compact — compact = layer-aligned tight orthogonal layout */
  pathFlow = "horizontal",
  viewpointName = "All elements",
  waypointNames = [],
  waypointElementSet = null,
  edgeConstraints = null,
} = {}) {
  container.innerHTML = "";
  if (!segments || segments.length === 0) return;
  const flatSteps = flattenSegments(segments, segmentPathIndex);
  if (!flatSteps.length) return;
  const svg = svgEl("svg", { xmlns: SVG_NS });
  const titleId = `architrek-diagram-title-${Date.now()}`;
  const descId = `architrek-diagram-desc-${Date.now()}`;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", `${titleId} ${descId}`);
  const titleText = `ArchiTrek path diagram (${viewpointName || "All elements"})`;
  const waypointsText = Array.isArray(waypointNames) && waypointNames.length
    ? waypointNames.join(" to ")
    : "No waypoint chain";
  svg.appendChild(svgEl("title", { id: titleId }, titleText));
  svg.appendChild(svgEl("desc", { id: descId }, `Path view ${segmentPathIndex + 1}. Waypoints: ${waypointsText}.`));
  container.appendChild(svg);
  const illustrationPathKey = String(segmentPathIndex);
  const flow = alignVertical ? "vertical" : pathFlow;
  const useCompactLanes = flow === "compact";
  const useVertical = flow === "vertical";
  if (useVertical) {
    renderSwimlane(svg, flatSteps, {
      showHopNumbers,
      showFlipControls,
      showLockControls,
      relationshipLabelsOnly,
      alignVertical: true,
      showLaneBands: mode === "swimlane",
      illustrationPathKey,
      waypointElementSet,
      edgeConstraints,
    });
  } else if (mode === "swimlane" || useCompactLanes) {
    renderSwimlane(svg, flatSteps, {
      showHopNumbers,
      showFlipControls,
      showLockControls,
      relationshipLabelsOnly,
      alignVertical: false,
      showLaneBands: mode === "swimlane",
      horizontalLaneLayout: useCompactLanes ? "compact" : "spread",
      illustrationPathKey,
      waypointElementSet,
      edgeConstraints,
    });
  } else {
    renderCompact(svg, flatSteps, {
      showHopNumbers,
      showFlipControls,
      showLockControls,
      relationshipLabelsOnly,
      illustrationPathKey,
      waypointElementSet,
      edgeConstraints,
    });
  }
}

function renderWithAnimation(diagramEl, newSegments, renderOptions = {}) {
  const { onAfterAnimation, ...pathOptions } = renderOptions || {};
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion) {
    renderPath(diagramEl, newSegments, pathOptions);
    if (typeof onAfterAnimation === "function") onAfterAnimation();
    return;
  }

  const oldPositions = new Map();
  const priorNodes = diagramEl.querySelectorAll("[data-node-id]");
  for (const node of priorNodes) {
    const id = node.getAttribute("data-node-id");
    if (!id || oldPositions.has(id)) continue;
    const rect = node.getBoundingClientRect();
    oldPositions.set(id, { x: rect.left, y: rect.top });
  }

  /** Viewport center per hop index — drives FLIP for edge direction changes (labels + stroke move together). */
  const oldArrowCenterByHop = new Map();
  for (const g of diagramEl.querySelectorAll(".clickable-arrow[data-hop]")) {
    const h = g.getAttribute("data-hop");
    if (!h || oldArrowCenterByHop.has(h)) continue;
    const rect = g.getBoundingClientRect();
    oldArrowCenterByHop.set(h, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }

  if (!oldPositions.size && !oldArrowCenterByHop.size) {
    renderPath(diagramEl, newSegments, pathOptions);
    if (typeof onAfterAnimation === "function") onAfterAnimation();
    return;
  }

  renderPath(diagramEl, newSegments, pathOptions);

  const nextNodes = Array.from(diagramEl.querySelectorAll("[data-node-id]"));
  const newNodeEls = [];
  for (const node of nextNodes) {
    const id = node.getAttribute("data-node-id");
    if (!id) continue;
    const oldPos = oldPositions.get(id);
    if (oldPos) {
      const rect = node.getBoundingClientRect();
      const deltaX = oldPos.x - rect.left;
      const deltaY = oldPos.y - rect.top;
      node.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    } else {
      node.style.opacity = "0";
      newNodeEls.push(node);
    }
  }

  const nextArrows = Array.from(diagramEl.querySelectorAll(".clickable-arrow[data-hop]"));
  const newArrowEls = [];
  /** @type {Set<Element>} */
  const arrowsToSlide = new Set();
  /** If the hop cluster barely moved on screen, keep the new layout as-is (no slide — reads as “same place”). */
  const HOP_ARROW_DEAD_PX = 12;
  let maxArrowAnimMs = 0;
  for (const g of nextArrows) {
    const hop = g.getAttribute("data-hop");
    if (!hop) continue;
    const oldC = oldArrowCenterByHop.get(hop);
    if (oldC) {
      const rect = g.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = oldC.x - cx;
      const dy = oldC.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist <= HOP_ARROW_DEAD_PX) {
        continue;
      }
      const durationMs = Math.round(Math.min(480, Math.max(220, 160 + dist * 2.6)));
      maxArrowAnimMs = Math.max(maxArrowAnimMs, durationMs);
      g.style.setProperty("--hop-slide-ms", `${durationMs}ms`);
      g.style.transform = `translate(${dx}px, ${dy}px)`;
      arrowsToSlide.add(g);
    } else {
      g.style.opacity = "0";
      newArrowEls.push(g);
    }
  }

  const edgeEls = [];
  for (const edge of diagramEl.querySelectorAll("path.graph-edge")) {
    /** Stroke-only layers use `data-hop` on {@code archimate-arrow-stroke-layer}, not `.clickable-arrow`. */
    const hopG = edge.closest("[data-hop]");
    const hop = hopG?.getAttribute?.("data-hop");
    if (hop != null && oldArrowCenterByHop.has(hop)) {
      continue;
    }
    edge.style.opacity = "0";
    edgeEls.push(edge);
  }

  void diagramEl.getBoundingClientRect();

  for (const node of nextNodes) {
    node.classList.add("is-animating");
    node.style.transform = "";
  }
  for (const node of newNodeEls) {
    node.style.opacity = "1";
  }

  for (const g of arrowsToSlide) {
    g.classList.add("is-animating");
    g.style.transform = "";
  }
  for (const g of newArrowEls) {
    g.classList.add("is-animating");
    g.style.opacity = "1";
  }

  for (const edge of edgeEls) {
    edge.style.opacity = "1";
  }

  window.setTimeout(() => {
    for (const node of nextNodes) {
      node.classList.remove("is-animating");
      node.style.transform = "";
      node.style.opacity = "";
    }
    for (const g of nextArrows) {
      g.classList.remove("is-animating");
      g.style.removeProperty("--hop-slide-ms");
      g.style.transform = "";
      g.style.opacity = "";
    }
    for (const edge of edgeEls) {
      edge.style.opacity = "";
    }
    if (typeof onAfterAnimation === "function") onAfterAnimation();
  }, Math.max(400, maxArrowAnimMs + 70));
}
window.renderWithAnimation = renderWithAnimation;

function clearDiagram(container) {
  container.innerHTML = "";
}


function getAspect(elementName) { return typeof ELEMENTS !== 'undefined' && ELEMENTS[elementName] ? ELEMENTS[elementName].aspect : "Composite"; }

function getLayer(elementName) {
  if (typeof getElementLayer === "function") return getElementLayer(elementName);
  if (typeof ELEMENTS !== "undefined" && ELEMENTS[elementName]) {
    const L = ELEMENTS[elementName].layer;
    return L === "Physical" ? "Technology" : L;
  }
  return "Unknown";
}

/**
 * Human-readable segment title from waypoint ArchiMate layers (ELEMENTS registry).
 * @param {{ from: string, to: string }} segment — segment endpoints (ArchiMate element names)
 * @param {number} index — zero-based segment index
 * @param {Record<string, { layer?: string }>|undefined} definitions — element registry; defaults to ELEMENTS
 */
function segmentEndpointLayerForLabel(elementName, peerName, definitions) {
  const def = definitions?.[elementName];
  const peerDef = definitions?.[peerName];
  const layer = def?.layer ?? "Unknown";
  const peerLayer = peerDef?.layer ?? "Unknown";
  // Gap is registered as Implementation, but motivation-facing gap analysis segments read as Motivation-internal.
  if (elementName === "Gap" && peerLayer === "Motivation") return "Motivation";
  return layer;
}

function getSegmentSemanticLabel(segment, index, definitions) {
  const defs = definitions ?? (typeof ELEMENTS !== "undefined" ? ELEMENTS : {});
  const fromDef = defs[segment.from];
  const toDef = defs[segment.to];
  if (!fromDef || !toDef) {
    return `Phase ${index + 1}: Path Segment`;
  }
  const fromLayer = segmentEndpointLayerForLabel(segment.from, segment.to, defs);
  const toLayer = segmentEndpointLayerForLabel(segment.to, segment.from, defs);
  if (fromLayer === toLayer) {
    return `Phase ${index + 1}: Internal ${fromLayer} Leg`;
  }
  return `Phase ${index + 1}: ${fromLayer} to ${toLayer} Transition`;
}

function getAspectId(elementName) {
  const aspect = getAspect(elementName);
  return typeof ASPECTS !== 'undefined' && ASPECTS[aspect] ? ASPECTS[aspect].id : "composite";
}

function getRelCategory(code) {
  const UPPER = code.toUpperCase();
  for (const [cat, codes] of Object.entries(RELATIONSHIP_CATEGORIES)) {
    if (codes.includes(UPPER)) return cat;
  }
  return "Other";
}

function relationshipVerb(relName) {
  const n = String(relName || "").toLowerCase();
  if (n.includes("trigger")) return "triggers"; if (n.includes("flow")) return "flows to";
  if (n.includes("serve")) return "serves"; if (n.includes("realiz")) return "realizes";
  if (n.includes("assign")) return "is assigned to"; if (n.includes("access")) return "accesses";
  if (n.includes("aggregat")) return "aggregates"; if (n.includes("compos")) return "is composed of";
  return "relates to";
}

/**
 * Layer-gradient sign for the student's overall search (first waypoint → last on this path).
 * Compared to each hop to decide whether active (forward roleNames) or passive/inverse (backward)
 * wording reads more naturally along the route while keeping graph traversal strictly directed.
 */
function layerGradientSignForElementPair(aEl, bEl) {
  if (typeof getLayerRank !== "function") return 0;
  return getLayerRank(bEl) - getLayerRank(aEl);
}

/**
 * True when this hop's layer movement opposes the route's layer movement (both non-zero),
 * so inverse role wording (target … backward … source) fits the query narrative better.
 * Association (O) stays forward — inverse phrasing is often awkward for generic links.
 */
function hopNarrativeUsesBackwardRoles(fromEl, toEl, routeStartEl, routeEndEl, relCodeUpper) {
  if (String(relCodeUpper || "O").toUpperCase() === "O") return false;
  if (!routeStartEl || !routeEndEl) return false;
  const route = layerGradientSignForElementPair(routeStartEl, routeEndEl);
  const hop = layerGradientSignForElementPair(fromEl, toEl);
  if (route === 0 || hop === 0) return false;
  return Math.sign(route) !== Math.sign(hop);
}

/**
 * Natural sentence for backward role text (relationships.js backward strings are fragments like "realized by").
 */
function hopJustificationSentenceForward(fromClause, forwardRole, toClause) {
  const v = String(forwardRole || "").trim() || "relates to";
  return `${fromClause} ${v} ${toClause}`;
}

function hopJustificationSentenceBackward(toClause, backwardRole, fromClause) {
  const b = String(backwardRole || "").trim();
  if (!b) return hopJustificationSentenceForward(fromClause, backwardRole, toClause);
  if (/^(has\s|flows\s)/i.test(b)) {
    return `${toClause} ${b} ${fromClause}`;
  }
  return `${toClause} is ${b} ${fromClause}`;
}
function metamodelRoleLabelForElement(elementName) {
  const role = ELEMENTS?.[elementName]?.metamodelRole ?? null;
  const key = getMetamodelBoxKey(role);
  const labels = {
    "external-active": "External Active Structure Element (Interface)",
    "internal-active": "Internal Active Structure Element",
    "external-behavior": "External Behavior Element (Service)",
    "internal-behavior": "Internal Behavior Element",
    "event": "Event",
    "passive": "Passive Structure Element",
  };
  if (!key) return { role, key, label: null };
  return { role, key, label: labels[key] ?? key };
}

function getAspectRuleKey(fromEl, toEl) { return `${getAspectId(fromEl)}→${getAspectId(toEl)}`; }

function getLayerRuleKey(fromEl, toEl) { return `${getLayer(fromEl)}→${getLayer(toEl)}`; }

function elementSummary(name) {
  const safeName = String(name || "");
  const def  = ELEMENT_DEFINITIONS[safeName];
  const meta = ELEMENTS[safeName];
  if (!def || !meta) return "";

  let iconSvg = "";
  if (typeof window !== "undefined" && typeof window.getElementMiniSvg === "function") {
    try {
      iconSvg = window.getElementMiniSvg(safeName, 32);
    } catch (e) {
      console.warn("Could not generate icon for", safeName, e);
    }
  }

  return `
    <div class="explain-element-card" data-explain-element="${encodeURIComponent(safeName)}">
      <div class="explain-element-icon explain-element-icon--card">
        ${iconSvg}
      </div>
      <div class="explain-element-content explain-element-content--card">
        <div class="explain-element-card-header">
          <strong class="explain-element-name explain-element-name--card">${safeName}</strong>
          <span class="explain-element-meta">${meta.layer || 'Unknown'} · ${meta.aspect || 'Unknown'}</span>
        </div>
        <div class="explain-element-def explain-element-def--card">
          ${def.definition || ''}
          <cite class="explain-element-section-cite">${def.section || ''}</cite>
        </div>
      </div>
    </div>`;
}

/**
 * Inline marker defs for the explanation hop strip only. Uses currentColor so heads match
 * the line and respond to .explain-edge-connector hover (global path-diagram markers are fixed #333/#fff).
 */
function snippetMarkerDefsHtml(UPPER, isDirect, suffix) {
  const style = ARROW_STYLES[UPPER] ?? ARROW_STYLES["O"];
  const d = isDirect ? "d" : "r";
  const idEnd = `end-${UPPER}-${d}-snippet-${suffix}`;
  const idStart = `start-${UPPER}-snippet-${suffix}`;
  const parts = [];

  if (style.endMarker === "arrow-open") {
    parts.push(
      `<marker id="${idEnd}" markerWidth="8" markerHeight="8" markerUnits="strokeWidth" refX="8" refY="4" orient="auto">` +
        `<polyline points="0 0, 8 4, 0 8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="miter"/>` +
      `</marker>`
    );
  } else if (style.endMarker === "arrow-filled") {
    parts.push(
      `<marker id="${idEnd}" markerWidth="8" markerHeight="8" markerUnits="strokeWidth" refX="8" refY="4" orient="auto">` +
        `<polygon points="0 0, 8 4, 0 8" fill="currentColor"/>` +
      `</marker>`
    );
  } else if (style.endMarker === "triangle-open") {
    parts.push(
      `<marker id="${idEnd}" markerWidth="8" markerHeight="8" markerUnits="strokeWidth" refX="8" refY="4" orient="auto">` +
        `<polygon points="0 0, 8 4, 0 8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="miter"/>` +
      `</marker>`
    );
  }

  if (style.startMarker === "diamond-filled") {
    parts.push(
      `<marker id="${idStart}" markerWidth="8" markerHeight="8" markerUnits="strokeWidth" refX="8" refY="4" orient="auto">` +
        `<polygon points="0 4, 4 0, 8 4, 4 8" fill="currentColor"/>` +
      `</marker>`
    );
  } else if (style.startMarker === "diamond-open") {
    parts.push(
      `<marker id="${idStart}" markerWidth="8" markerHeight="8" markerUnits="strokeWidth" refX="8" refY="4" orient="auto">` +
        `<polygon points="0 4, 4 0, 8 4, 4 8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="miter"/>` +
      `</marker>`
    );
  } else if (style.startMarker === "circle-filled") {
    parts.push(
      `<marker id="${idStart}" markerWidth="8" markerHeight="8" markerUnits="strokeWidth" refX="4" refY="4" orient="auto">` +
        `<circle cx="4" cy="4" r="3.5" fill="currentColor"/>` +
      `</marker>`
    );
  }

  if (parts.length === 0) return "";
  return `<defs>${parts.join("")}</defs>`;
}

function getRelationVisualSnippet(code, isDirect, hopIndexForIds, opts = {}) {
  const compact = !!opts.compact;
  const UPPER = String(code || "O").toUpperCase();
  const style = ARROW_STYLES[UPPER] ?? ARROW_STYLES["O"];
  const isDash = style.line === "dashed";
  const d = isDirect ? "d" : "r";
  const suffix = String(hopIndexForIds ?? "0");
  const defs = snippetMarkerDefsHtml(UPPER, isDirect, suffix);
  const endMarker = style.endMarker !== "none" ? `url(#end-${UPPER}-${d}-snippet-${suffix})` : "";
  const startMarker = style.startMarker !== "none" ? `url(#start-${UPPER}-snippet-${suffix})` : "";
  const margin = compact ? "0 4px" : "0 15px";
  const cls =
    "explain-edge-connector-svg" +
    (compact ? " explain-edge-connector-svg--compact" : "");
  /** ArchiMate §5.3 notation: solid/dashed line, filled arrowhead, relationship name centered below (same for Triggering and Flow). */
  const dynamicNotationBelow =
    (UPPER === "T" || UPPER === "F") &&
    style.endMarker === "arrow-filled" &&
    style.startMarker === "none";
  if (dynamicNotationBelow) {
    const relName =
      typeof RELATIONSHIPS !== "undefined" && RELATIONSHIPS[UPPER]?.name
        ? RELATIONSHIPS[UPPER].name
        : UPPER;
    const label = typeof escPathDiag === "function" ? escPathDiag(relName) : String(relName ?? "");
    const lineY = 12;
    const vb = 'viewBox="0 0 80 34" preserveAspectRatio="xMidYMid meet"';
    const w = compact ? 52 : 80;
    const h = compact ? 28 : 36;
    return (
      `<svg class="${cls} explain-edge-connector-svg--dynamic" width="${w}" height="${h}" ${vb} style="overflow:visible; margin: ${margin}; color: inherit; flex-shrink:0;" aria-hidden="true">` +
      `${defs}` +
      `<line x1="5" y1="${lineY}" x2="65" y2="${lineY}" stroke="currentColor" stroke-width="2.5" stroke-dasharray="${isDash ? "5,3" : "none"}" marker-end="${endMarker}" marker-start="${startMarker}" />` +
      `<text x="35" y="28" text-anchor="middle" font-size="10" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-weight="500" fill="currentColor">${label}</text>` +
      `</svg>`
    );
  }
  const w = compact ? 52 : 80;
  const h = compact ? 20 : 30;
  const vb = compact ? 'viewBox="0 0 80 30" preserveAspectRatio="xMidYMid meet"' : "";
  return `<svg class="${cls}" width="${w}" height="${h}" ${vb} style="overflow:visible; margin: ${margin}; color: inherit; flex-shrink:0;" aria-hidden="true">${defs}<line x1="5" y1="15" x2="65" y2="15" stroke="currentColor" stroke-width="2.5" stroke-dasharray="${isDash ? "5,3" : "none"}" marker-end="${endMarker}" marker-start="${startMarker}" /></svg>`;
}

/** Neutral connector for hops where no relationship has been chosen yet. */
function getUndecidedRelationSnippet(opts = {}) {
  const compact = !!opts.compact;
  /** In hop summary, a dashed line reads like a prefix on the second chip; use a solid neutral stroke instead. */
  const solidInSummary = !!opts.solidInSummary;
  const w = compact ? 52 : 80;
  const h = compact ? 20 : 30;
  const margin = compact ? "0 4px" : "0 15px";
  const vb = compact ? 'viewBox="0 0 80 30" preserveAspectRatio="xMidYMid meet"' : "";
  const cls =
    "explain-edge-connector-svg explain-edge-connector-svg--undecided" +
    (compact ? " explain-edge-connector-svg--compact" : "") +
    (solidInSummary ? " explain-edge-connector-svg--undecided-solid" : "");
  const dash = solidInSummary ? "none" : "3 5";
  return (
    `<svg class="${cls}" width="${w}" height="${h}" ${vb} style="overflow:visible; margin: ${margin}; color: #8b99af; flex-shrink:0;" aria-hidden="true">` +
    `<line x1="5" y1="15" x2="65" y2="15" stroke="currentColor" stroke-width="2" stroke-dasharray="${dash}" stroke-linecap="butt" /></svg>`
  );
}

function normalizeExplainRigorPreset(v) {
  const key = String(v || "academic").toLowerCase();
  if (key === "academic" || key === "pragmatic" || key === "discovery" || key === "custom") return key;
  return "academic";
}

function explainRigorPresetLabel(preset) {
  const p = normalizeExplainRigorPreset(preset);
  if (p === "academic") return "Academic";
  if (p === "pragmatic") return "Pragmatic";
  if (p === "discovery") return "Discovery";
  return "Custom";
}

function resolvePrimaryCodeForTierUi(step, semanticHop, opts) {
  const raw = opts?.resolvedPrimaryCode;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).toUpperCase();
  }
  if (semanticHop?.primaryCode != null && String(semanticHop.primaryCode).trim() !== "") {
    return String(semanticHop.primaryCode).toUpperCase();
  }
  const list = Array.isArray(step?.codes) ? step.codes : [];
  let fallback = "O";
  for (const c of list) {
    const u = String(c || "").toUpperCase();
    if (!u) continue;
    if (fallback === "O") fallback = u;
    if (u !== "O") return u;
  }
  return fallback;
}

/** Viewpoint relationship whitelist for Association pedagogy (matches pathfinder options). */
function getAssociationViewpointOpts() {
  const out = { allowedRelationshipCodes: null };
  try {
    if (typeof getViewpointRelationshipAllowance !== "function") return out;
    const key = window.state?.viewpoint != null ? String(window.state.viewpoint) : "";
    if (!key || typeof VIEWPOINTS === "undefined" || !VIEWPOINTS[key]) return out;
    const vp = VIEWPOINTS[key];
    if (vp.allElements) return out;
    const allowed = getViewpointRelationshipAllowance(key);
    out.allowedRelationshipCodes = allowed instanceof Set ? allowed : null;
  } catch (_) {}
  return out;
}

function mergeSemanticTierOpts(opts) {
  return { ...getAssociationViewpointOpts(), ...opts };
}

function classifyHopSemanticTierUi(step, semanticHop, opts) {
  const merged = mergeSemanticTierOpts(opts);
  if (typeof classifyHopSemanticTier === "function") {
    return classifyHopSemanticTier(step, semanticHop, merged);
  }
  const hasViolation = !!(semanticHop?.violation && semanticHop.violation !== "None");
  const primaryUpper = resolvePrimaryCodeForTierUi(step, semanticHop, merged);
  const isAssociationHop = step?.isAssociation === true || primaryUpper === "O";

  if (hasViolation) {
    return {
      strength: "Informal",
      title: "Semantic violation detected.",
      reason: semanticHop?.violationLabel || semanticHop?.ruleLabel || "semantic rule exception",
    };
  }
  if (isAssociationHop) {
    if (typeof isAssociationHopPedagogySanctioned === "function" && isAssociationHopPedagogySanctioned(step, semanticHop, merged)) {
      const reason =
        typeof associationPedagogySanctionReason === "function"
          ? associationPedagogySanctionReason(step, semanticHop, merged)
          : "Association (§5.2.4) is permitted in this modeling context.";
      return {
        strength: "Valid",
        title: "Association (§5.2.4) — permitted in this context.",
        reason,
        badgeMapping: "Permitted",
        skipRouteChainDowngrade: true,
      };
    }
    return {
      strength: "Informal",
      title: "Generic Association (§5.2.4).",
      reason: semanticHop?.ruleLabel || "a generic Association bridge (§5.2.4)",
    };
  }
  if (!isActiveCodeDirectInMatrix(step, primaryUpper)) {
    return {
      strength: "Valid",
      title: "Strictly derived per §5.7.",
      reason: semanticHop?.ruleLabel || "§5.7 derivation rules",
    };
  }
  if (typeof viewpointPaletteCapsDirectStrengthTier === "function") {
    const cap = viewpointPaletteCapsDirectStrengthTier(semanticHop, step, merged);
    if (cap) return cap;
  }
  return {
    strength: "Strong",
    title: "Direct or Structural connection.",
    reason: semanticHop?.ruleLabel || "a direct Appendix B relationship",
  };
}

/**
 * Mapping-type suffix for the consolidated badge (pairs with Strong / Valid / Informal).
 */
function semanticBadgeMappingParenthetical(tier, hopStep, semanticHop, rigorPreset, resolvedPrimaryCode) {
  if (tier.badgeMapping) return tier.badgeMapping;
  if (tier.strength === "Strong") return "Direct";
  if (tier.cappedByRouteAssociation) return "Chain";
  const code = String(resolvedPrimaryCode || "").toUpperCase();
  const associationLike =
    hopStep?.isAssociation || semanticHop?.rule === "Association" || code === "O";
  if (tier.strength === "Valid") {
    if (associationLike) return "Permitted";
    return "Derived";
  }
  if (associationLike) {
    return "Generic";
  }
  const p = normalizeExplainRigorPreset(rigorPreset);
  if (p === "discovery") return "Discovery";
  return "Caution";
}

function semanticStrengthBadgeHtml(
  step,
  semanticHop,
  rigorPreset = "academic",
  resolvedPrimaryCode,
  badgeOpts = null
) {
  const tierOpts = mergeSemanticTierOpts(
    resolvedPrimaryCode != null && String(resolvedPrimaryCode).trim() !== ""
      ? { resolvedPrimaryCode }
      : undefined
  );
  let tier = classifyHopSemanticTierUi(step, semanticHop, tierOpts);
  if (
    badgeOpts?.routeContainsAssociationBridge &&
    (tier.strength === "Strong" || tier.strength === "Valid") &&
    !tier.skipRouteChainDowngrade
  ) {
    tier = {
      ...tier,
      strength: "Informal",
      title: "Route includes an Association bridge (§5.2.4).",
      reason:
        "At least one hop on this path uses a generic Association bridge, so the whole chain is capped at Informal strength.",
      cappedByRouteAssociation: true,
    };
  }
  const slug = String(tier.strength || "").toLowerCase();
  const mapping = semanticBadgeMappingParenthetical(
    tier,
    step,
    semanticHop,
    rigorPreset,
    resolvedPrimaryCode
  );
  const label = `${tier.strength} (${mapping})`;
  const rule = tier.reason || "the active modeling rule";
  const summary = `This hop is considered ${label} because it follows ${rule}.`;
  const discoveryEmphasis =
    tier.strength === "Informal" &&
    normalizeExplainRigorPreset(rigorPreset) === "discovery" &&
    mapping !== "Generic"
      ? " semantic-strength-badge--discovery-emphasis"
      : "";
  const genericAssoc =
    tier.strength === "Informal" && mapping === "Generic"
      ? " semantic-strength-badge--generic-association"
      : "";
  const chainCapped =
    tier.strength === "Informal" && mapping === "Chain" && tier.cappedByRouteAssociation
      ? " semantic-strength-badge--route-chain-capped"
      : "";
  return `<span class="semantic-strength-badge semantic-strength-badge--${slug}${discoveryEmphasis}${genericAssoc}${chainCapped} explain-badge-tip" data-explain-tip="semantic-strength" data-semantic-strength="${escPathDiag(tier.strength)}" data-semantic-mapping="${escPathDiag(mapping)}" data-semantic-rule="${escPathDiag(rule)}" tabindex="0" role="note" aria-label="${escPathDiag(summary)}">${escPathDiag(label)}</span>`;
}

/**
 * Inner HTML for “View Formal Metamodel Logic”: semantic intro, mentor note, bullets, derivation, aspect grid.
 * Shared by the traversed hop and the Appendix B opposite directed pair (reverse of the hop on screen).
 */
function formalMetamodelInnerHtmlForPair(fromEl, toEl, activeCode, rigorPreset, narrativeOpts, semanticHop, hopStep) {
  const activeCodeUpper = String(activeCode || "O").toUpperCase();
  const rel = RELATIONSHIPS[activeCodeUpper];
  const primaryRelName = rel?.name ?? activeCodeUpper;
  const fromAspect = getAspect(fromEl);
  const toAspect = getAspect(toEl);
  const fromLayer = getLayer(fromEl);
  const toLayer = getLayer(toEl);
  const mmFrom = metamodelRoleLabelForElement(fromEl);
  const mmTo = metamodelRoleLabelForElement(toEl);
  const dirRules = RELATIONSHIP_DIRECTIONALITY[activeCodeUpper];
  const layerRuleKey = getLayerRuleKey(fromEl, toEl);
  const layerRule = LAYER_RULES[layerRuleKey];

  let matrixDirectForUi = hopStep?.matrixDirectCodes ?? [];
  let matrixDerivedForUi = hopStep?.matrixDerivedCodes ?? [];
  if (typeof mergeMatrixRowForPair === "function") {
    const row = mergeMatrixRowForPair(fromEl, toEl, true);
    const md = (row.direct || []).map((c) => String(c).toUpperCase());
    const mder = (row.derived || []).map((c) => String(c).toUpperCase());
    if (md.length + mder.length > 0) {
      matrixDirectForUi = md;
      matrixDerivedForUi = mder;
    }
  }
  const hopTier = pathStepWithCanonicalMatrixRow(hopStep, fromEl, toEl);

  const mentorText = mentorInsightText(semanticHop, activeCodeUpper, rigorPreset, hopStep);
  const mentorInsightInner = mentorText
    ? `<div class="mentor-insight mentor-insight--formal" role="note">⚠️ ${escPathDiag(mentorText)}</div>`
    : "";

  const derivationInfo =
    typeof DERIVATION_LOGIC_BY_CODE !== "undefined"
      ? DERIVATION_LOGIC_BY_CODE[activeCodeUpper]
      : null;
  const choiceIsMatrixDerived =
    activeCodeUpper !== "O" &&
    !hopStep?.isAssociation &&
    !!hopTier &&
    !isActiveCodeDirectInMatrix(hopTier, activeCodeUpper);
  const semanticLogicSentence = (() => {
    if (semanticHop?.rule === "Derived" || choiceIsMatrixDerived) {
      return derivationInfo?.studentText || "This is an Inferred relationship allowed by §5.7 derivation rules.";
    }
    if (semanticHop?.rule === "Association" || activeCodeUpper === "O" || hopStep?.isAssociation) {
      const pedagogyOpts = mergeSemanticTierOpts({ resolvedPrimaryCode: activeCodeUpper });
      if (
        typeof isAssociationHopPedagogySanctioned === "function" &&
        isAssociationHopPedagogySanctioned(hopStep, semanticHop, pedagogyOpts)
      ) {
        const shFrom = semanticHop?.from ?? "";
        const shTo = hopStep?.element ?? semanticHop?.to ?? "";
        const vk = typeof window !== "undefined" && window.state?.viewpoint != null ? String(window.state.viewpoint) : "";
        if (
          typeof associationPedagogySanctionedForViewpointPalette === "function" &&
          associationPedagogySanctionedForViewpointPalette(vk, shFrom, shTo)
        ) {
          return "This hop uses Association (§5.2.4). It is still a generic metamodel link, but the Information Structure viewpoint includes both elements, so the tool treats it as permitted for this scope—not as an informal modeling mistake.";
        }
        if (shFrom === "Value" || shFrom === "Meaning" || shTo === "Value" || shTo === "Meaning") {
          return "This hop uses Association (§5.2.4). Generic links to or from Value or Meaning are normal in motivation modeling, so this is not flagged as an informal fallback.";
        }
        return "This hop uses Association (§5.2.4). Your viewpoint explicitly allows Association among its permitted relationship codes, so this is not treated as an informal shortcut.";
      }
      return "This uses a generic Association bridge under §5.2.4, which is semantically informal.";
    }
    if (typeof viewpointPaletteCapsDirectStrengthTier === "function") {
      const cap = viewpointPaletteCapsDirectStrengthTier(
        semanticHop,
        hopStep,
        mergeSemanticTierOpts({ resolvedPrimaryCode: activeCodeUpper })
      );
      if (cap) {
        return "This is a direct Appendix B relationship. For the Information Structure viewpoint, both elements are in the palette, so the strength label reflects in-viewpoint fit—not maximal cross-layer rigor.";
      }
    }
    return "This is an Explicit relationship listed in Appendix B.";
  })();
  const violationSentence =
    semanticHop?.violation && semanticHop.violation !== "None"
      ? ` Mentor flag: ${semanticHop.violationExplain || semanticHop.violationLabel || "semantic rule exception detected."}`
      : "";
  const directCodesText = (matrixDirectForUi || []).map((c) => String(c).toUpperCase()).join(", ") || "—";
  const derivedCodesText = (matrixDerivedForUi || []).map((c) => String(c).toUpperCase()).join(", ") || "—";
  const derivationFormula =
    derivationInfo?.formula
    || (semanticHop?.rule === "Derived" || choiceIsMatrixDerived
      ? "§5.7 derivation chain inferred from this pair."
      : "No derivation needed for a direct Appendix B hop.");
  const derivationStudentText =
    derivationInfo?.studentText
    || (semanticHop?.rule === "Derived" || choiceIsMatrixDerived
      ? "This hop is accepted as an inferred relation per §5.7."
      : "This hop is explicit (Appendix B), so derivation chain math is not required.");
  const derivationLogicSection = `<details class="explain-derivation-logic">
      <summary>Derivation Logic</summary>
      <div class="explain-derivation-logic-body">
        <div><strong>Rule math:</strong> ${escPathDiag(derivationFormula)}</div>
        <div style="margin-top:6px">${escPathDiag(derivationStudentText)}</div>
        <div style="margin-top:8px;color:var(--text-3)">Matrix row snapshot · explicit: [${escPathDiag(directCodesText)}] · inferred: [${escPathDiag(derivedCodesText)}]</div>
      </div>
    </details>`;

  return `
      <p class="explain-formal-intro">${escPathDiag(semanticLogicSentence)}${violationSentence}</p>
      ${mentorInsightInner}
      <ul class="edge-bullets edge-bullets--formal">
        <li><strong>Metamodel check</strong>: <em>${fromAspect}</em> → <em>${toAspect}</em> <button class="mm-jump" type="button" data-mm-from="${encodeURIComponent(fromEl)}" data-mm-to="${encodeURIComponent(toEl)}" data-mm-rel="${encodeURIComponent(primaryRelName)}">Show on metamodel</button></li>
        ${mmFrom.label || mmTo.label ? `<li><strong>Metamodel roles</strong>: ${fromEl} = <em>${mmFrom.label ?? "—"}</em> → ${toEl} = <em>${mmTo.label ?? "—"}</em></li>` : ""}
        ${dirRules ? `<li><strong>Direction rule</strong>: ${dirRules.rule} <cite>${dirRules.section}</cite></li>` : ""}
        ${fromLayer !== toLayer && layerRule ? `<li><strong>Layer pattern</strong>: ${layerRule.explanation} <cite>${layerRule.section}</cite></li>` : ""}
      </ul>
      ${derivationLogicSection}
      <div class="explain-formal-defs">${renderAspectGrid(fromAspect, toAspect, fromEl, toEl)}</div>`;
}

function mentorInsightText(semanticHop, activeCode, rigorPreset, step) {
  const violation = semanticHop?.violation || "None";
  if (violation === "V-Shape") {
    return "Mentor Note: You are chaining an 'Upward' Serving link into a 'Downward' Serving link. While allowed in Discovery mode, this creates a weak logical connection between unrelated elements.";
  }
  if (violation === "MotivationDetour") {
    return "Mentor Note: You are bridging a connection between two Core elements through a Motivation element. This is semantically loose.";
  }
  const p = normalizeExplainRigorPreset(rigorPreset);
  const code = String(activeCode || "").toUpperCase();
  const tierOpts = mergeSemanticTierOpts({ resolvedPrimaryCode: code });
  if (
    typeof isAssociationHopPedagogySanctioned === "function" &&
    isAssociationHopPedagogySanctioned(step, semanticHop, tierOpts)
  ) {
    return "";
  }
  if (p === "discovery" && (step?.isAssociation || code === "O")) {
    return "Mentor Note: This hop uses a generic Association bridge. It can be useful for exploration, but it is semantically weaker than a specific Appendix B or §5.7 relationship.";
  }
  return "";
}

function explainEdge(
  fromEl,
  toEl,
  activeCode,
  isDirect,
  hasChoices,
  isProvisional,
  hopIndex,
  safeCodes,
  architectNotesHtml = "",
  matrixDirectCodes = null,
  matrixDerivedCodes = null,
  semanticHop = null,
  hopStep = null,
  rigorPreset = "academic",
  narrativeOpts = null
) {
  const fromScenario = getScenarioDisplayName(fromEl);
  const toScenario = getScenarioDisplayName(toEl);
  const fromDisplay = fromScenario.display;
  const toDisplay = toScenario.display;
  const fromClause = fromScenario.isThematic ? sentenceCaseStart(withArticle(fromDisplay)) : fromDisplay;
  const toClause = toScenario.isThematic ? withArticle(toDisplay) : toDisplay;
  const rel = RELATIONSHIPS[activeCode];
  const primaryRelName = rel?.name ?? activeCode;
  const activeCodeUpper = String(activeCode || "O").toUpperCase();
  const forwardRoleText = rel?.roleNames?.forward || relationshipVerb(primaryRelName);
  const backwardRoleText = rel?.roleNames?.backward || forwardRoleText;
  const useBackwardRoles =
    !!narrativeOpts &&
    !isProvisional &&
    hopNarrativeUsesBackwardRoles(
      fromEl,
      toEl,
      narrativeOpts.routeStartEl,
      narrativeOpts.routeEndEl,
      activeCodeUpper
    );
  const justificationMain = useBackwardRoles
    ? hopJustificationSentenceBackward(toClause, backwardRoleText, fromClause)
    : hopJustificationSentenceForward(fromClause, forwardRoleText, toClause);

  // Relationship picker: when multiple options exist for a hop, always include Association (O).
  // Association is universal (§5.2.4) and can be a pragmatic fallback even when it's not "ideal".
  const codesForButtons = (() => {
    const raw = Array.isArray(safeCodes) ? safeCodes : [];
    const out = [];
    const seen = new Set();
    for (const c of raw) {
      const u = String(c || "").toUpperCase();
      if (!u) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    if (!seen.has("O")) out.push("O");
    return out;
  })();
  let matrixDirectForUi = matrixDirectCodes ?? [];
  let matrixDerivedForUi = matrixDerivedCodes ?? [];
  if (typeof mergeMatrixRowForPair === "function") {
    const row = mergeMatrixRowForPair(fromEl, toEl, true);
    const md = (row.direct || []).map((c) => String(c).toUpperCase());
    const mder = (row.derived || []).map((c) => String(c).toUpperCase());
    if (md.length + mder.length > 0) {
      matrixDirectForUi = md;
      matrixDerivedForUi = mder;
    }
  }
  const hopTier = pathStepWithCanonicalMatrixRow(hopStep, fromEl, toEl);
  const chosenForUi =
    hopIndex != null && typeof window !== "undefined" ? window.state?.userChoices?.[hopIndex] : undefined;
  const choiceCommitted =
    hopIndex != null &&
    chosenForUi != null &&
    chosenForUi !== "" &&
    codesForButtons.some((c) => String(c).toUpperCase() === String(chosenForUi).toUpperCase());
  const choiceButtons =
    hasChoices && hopIndex != null && codesForButtons.length > 1
      ? `<div class="edge-rel-choice-row" role="group" aria-label="Relationship options">
          ${codesForButtons
            .map((c) => {
              const cStr = String(c || "O").toUpperCase();
              const isAssoc = cStr === "O";
              const name = RELATIONSHIPS[cStr]?.name || cStr;
              const isSelected =
                choiceCommitted && cStr.toUpperCase() === String(chosenForUi).toUpperCase();
              const title = isAssoc
                ? "Association (§5.2.4) is the most permissive (generic) relationship. Prefer a specific relationship type when it fits; use Association when it better matches the context."
                : "";
              const kindLabel = relChoiceMatrixKindLabel(cStr, matrixDirectForUi, matrixDerivedForUi);
              const kindHtml = kindLabel
                ? `<span class="edge-rel-choice-btn__kind">${escPathDiag(kindLabel)}</span>`
                : "";
              return `<button type="button" class="edge-rel-choice-btn${isAssoc ? " edge-rel-choice-btn--association" : ""}${isSelected ? " edge-rel-choice-btn--selected" : ""}" title="${escPathDiag(title)}" aria-pressed="${isSelected ? "true" : "false"}" onclick="event.stopPropagation(); window.setEdgeChoice(${hopIndex}, '${cStr}');"><span class="edge-rel-choice-btn__stack"><span class="edge-rel-choice-btn__label">${escPathDiag(name)}</span>${kindHtml}</span></button>`;
            })
            .join("")}
        </div>`
      : "";

  const choicePrompt = hasChoices
    ? `<div class="explain-edge-choice-prompt" role="region" aria-label="Relationship choice">
        <p class="explain-edge-choice-prompt-text">Choose the relationship that best matches your modeling intent for this hop.</p>
        ${choiceButtons}
      </div>`
    : "";

  const mentorText = mentorInsightText(semanticHop, activeCodeUpper, rigorPreset, hopStep);
  const mentorInsightInner = mentorText
    ? `<div class="mentor-insight mentor-insight--formal" role="note">⚠️ ${escPathDiag(mentorText)}</div>`
    : "";

  const formalMetamodelBody = formalMetamodelInnerHtmlForPair(
    fromEl,
    toEl,
    activeCodeUpper,
    rigorPreset,
    narrativeOpts,
    semanticHop,
    hopStep
  );

  const formalMetamodelAccordion = `<details class="explain-details explain-formal-metamodel">
      <summary class="explain-formal-metamodel-summary"><span class="explain-formal-metamodel-summary-glyph" aria-hidden="true"></span>View Formal Metamodel Logic</summary>
      <div class="explain-formal-metamodel-inner">${formalMetamodelBody}</div>
    </details>`;

  const revFrom = toEl;
  const revTo = fromEl;
  const reverseRow =
    typeof mergeMatrixRowForPair === "function"
      ? mergeMatrixRowForPair(revFrom, revTo, true)
      : { merged: [], direct: [], derived: [] };
  const revMerged = reverseRow.merged || [];
  const revHasMatrix = revMerged.length > 0;
  const revMd = (reverseRow.direct || []).map((c) => String(c).toUpperCase());
  const revMder = (reverseRow.derived || []).map((c) => String(c).toUpperCase());
  const revPrimary = revHasMatrix
    ? String(revMd[0] || revMder[0] || "O").toUpperCase()
    : "O";
  const revHopStepBase = revHasMatrix
    ? {
        element: revTo,
        codes: revMerged,
        isDirect: revMd.includes(revPrimary),
        matrixDirectCodes: revMd,
        matrixDerivedCodes: revMder,
      }
    : {
        element: revTo,
        codes: ["O"],
        isDirect: true,
        isAssociation: true,
        matrixDirectCodes: [],
        matrixDerivedCodes: [],
      };
  const revHopStep = pathStepWithCanonicalMatrixRow(revHopStepBase, revFrom, revTo);
  const revSemanticHop = revHasMatrix
    ? {
        from: revFrom,
        to: revTo,
        rule: revMd.includes(revPrimary) ? "Direct" : "Derived",
        primaryCode: revPrimary,
        violation: "None",
      }
    : {
        from: revFrom,
        to: revTo,
        rule: "Association",
        primaryCode: "O",
        violation: "None",
      };

  const reverseHopNoteHtml = !isProvisional
    ? revHasMatrix
      ? `<p class="explain-hop-reverse-note" role="note"><strong>Opposite direction</strong> (<em>${escPathDiag(revFrom)} → ${escPathDiag(revTo)}</em>) is listed in Appendix B / §5.7 with relationship code${
          revMerged.length !== 1 ? "s" : ""
        } <span class="edge-codes edge-codes--primary explain-hop-reverse-note-codes" title="Matrix codes for the opposite directed hop">[${escPathDiag(
          revMerged.map((c) => String(c).toUpperCase()).join(", ")
        )}]</span>.</p>`
      : `<p class="explain-hop-reverse-note explain-hop-reverse-note--none" role="note"><strong>Opposite direction</strong> (<em>${escPathDiag(revFrom)} → ${escPathDiag(
          revTo
        )}</em>) has <strong>no</strong> Appendix B or §5.7 matrix row. The pathfinder can still add a directed <strong>Association</strong> bridge (§5.2.4) for that ordered pair when Association fallback is enabled — it is generic and not encoded as a matrix cell.</p>`
    : "";

  const reverseFormalAccordion = !isProvisional
    ? `<details class="explain-details explain-formal-metamodel explain-formal-metamodel--reverse">
      <summary class="explain-formal-metamodel-summary"><span class="explain-formal-metamodel-summary-glyph" aria-hidden="true"></span>Formal metamodel logic · opposite hop (${escPathDiag(revFrom)} → ${escPathDiag(revTo)})</summary>
      <div class="explain-formal-metamodel-inner">${formalMetamodelInnerHtmlForPair(
        revFrom,
        revTo,
        revPrimary,
        rigorPreset,
        narrativeOpts,
        revSemanticHop,
        revHopStep
      )}</div>
    </details>`
    : "";

  const keyFacts = isProvisional
    ? `<div class="edge-kicker edge-kicker--undecided">
      <p class="edge-kicker-undecided-text">Pick a relationship above. The justification, direction notes, and diagram will update to match your choice — none of the options is implied as the default.</p>
      ${architectNotesHtml ? `<div class="edge-architect-notes edge-architect-notes--primary">${architectNotesHtml}</div>` : ""}
    </div>`
    : `
    <div class="edge-kicker">
      <div class="edge-kicker-row edge-kicker-row--rel-header">
        <div class="edge-rel">
          <strong>${primaryRelName}</strong>
          <span class="edge-codes edge-codes--primary" title="Appendix B / matrix relationship code">[${activeCode}]</span>
          ${semanticStrengthBadgeHtml(hopTier, semanticHop, rigorPreset, activeCode, {
            routeContainsAssociationBridge: !!narrativeOpts?.routeHasAssociationBridge,
          })}
          <cite>${rel?.section ?? ""}</cite>
        </div>
      </div>
      <p class="edge-justification-primary"><strong>Justification:</strong> ${justificationMain}.</p>
      ${architectNotesHtml ? `<div class="edge-architect-notes edge-architect-notes--primary">${architectNotesHtml}</div>` : ""}
      ${reverseHopNoteHtml}
      ${formalMetamodelAccordion}
      ${reverseFormalAccordion}
    </div>`;

  return choicePrompt + (isProvisional ? mentorInsightInner : "") + keyFacts;
}



function getRelationSnippet(code, isDirect) {
  const UPPER = String(code || "O").toUpperCase();
  const style = ARROW_STYLES[UPPER] ?? ARROW_STYLES["O"];
  const isDash = style.line === "dashed";
  const endMarker = `url(#end-${UPPER}-${isDirect ? 'd' : 'r'})`;
  const startMarker = style.startMarker !== "none" ? `url(#start-${UPPER})` : "";

  return `
    <svg width="80" height="30" style="overflow:visible; margin: 0 15px;">
      <line x1="5" y1="15" x2="65" y2="15" stroke="#334155" stroke-width="2.5" 
            stroke-dasharray="${isDash ? '5,3' : 'none'}" 
            marker-end="${endMarker}" marker-start="${startMarker}" />
    </svg>`;
}



// ─────────────────────────────────────────────────────────────────────────────
// PATH ANALYSIS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flattens segments and their nested paths into a single array of steps.
 */
function flattenSegments(segments, pathIndex = 0) {
  const flatSteps = [];
  for (let s = 0; s < segments.length; s++) {
    const path = segments[s].paths[pathIndex] ?? segments[s].paths[0];
    if (!path || path.length === 0) continue;
    flatSteps.push(...(s === 0 ? path : path.slice(1)));
  }
  return flatSteps;
}

/**
 * Reorder steps for the route overview strip so adjacent pills match {@code FORCED_DIRECTION}
 * (same rule as {@link drawArrow} {@code reverseLayout}).
 */
function displayStepsForExplanationStrip(flatSteps, edgeConstraints) {
  const n = flatSteps.length;
  if (n < 2 || !Array.isArray(edgeConstraints)) return flatSteps.slice();
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = 1; i < n; i++) {
    const prev = flatSteps[i - 1];
    const curr = flatSteps[i];
    const forcedReverse =
      hasDirectedEdgeConstraint(edgeConstraints, curr.element, prev.element, "FORCED_DIRECTION") &&
      !hasDirectedEdgeConstraint(edgeConstraints, prev.element, curr.element, "FORCED_DIRECTION");
    if (forcedReverse) {
      const t = order[i - 1];
      order[i - 1] = order[i];
      order[i] = t;
    }
  }
  return order.map((j) => flatSteps[j]);
}
/**
 * Extracts the user-defined waypoints (From, To, and any Mid-points).
 */
function extractWaypoints(segments) {
  if (!segments || segments.length === 0) return [];
  const wps = segments.map(s => s.from);
  wps.push(segments[segments.length - 1].to);
  return wps;
}

/**
 * For multi-segment (waypoint) paths, the flat hop index where each segment’s chain begins.
 * Used to insert section headings between “roads” (ordered segments).
 */
function segmentFirstHopIndices(segments, pathIndex = 0) {
  const out = [];
  let flatLen = 0;
  for (let s = 0; s < segments.length; s++) {
    const path = segments[s].paths[pathIndex] ?? segments[s].paths[0];
    if (!path || path.length === 0) continue;
    const added = s === 0 ? path.length : path.length - 1;
    const firstHop = s === 0 ? 1 : flatLen;
    out.push({ segmentIndex: s, firstHop, from: segments[s].from, to: segments[s].to });
    flatLen += added;
  }
  return out;
}

/**
 * Determines the dominant relationship type in a path for the summary text.
 */
function characterisePath(flatSteps, edgeConstraints = null) {
  const ec =
    edgeConstraints ?? (typeof window !== "undefined" ? window.state?.edgeConstraints : null);
  const counts = {};
  for (let i = 1; i < flatSteps.length; i++) {
    const step = flatSteps[i];
    const prev = flatSteps[i - 1];
    const codes = appendixMatrixCodesForPathHopIndex(flatSteps, i, ec);
    if (!codes.length) continue;
    if (codes.length > 1 && !edgeChoiceCommittedForHop(i, codes, ec)) continue;
    const chosen = resolvedRelationshipCodeForHop(step, i, prev.element, ec);
    const u = String(chosen).toUpperCase();
    counts[u] = (counts[u] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) return "a mixed set of relationships";
  const rel = RELATIONSHIPS[top[0]];
  return rel ? `primarily ${rel.name} relationships (${rel.section})` : "a mixed set of relationships";
}

/**
 * Detects when a path crosses from one ArchiMate layer to another.
 * Uses the same layer resolution as swimlanes: Location/Grouping are not a separate stack layer.
 */
function detectLayerTransitions(flatSteps) {
  const transitions = [];
  for (let i = 1; i < flatSteps.length; i++) {
    const prev = getSwimlaneLayer(flatSteps[i - 1].element, i - 1, flatSteps);
    const curr = getSwimlaneLayer(flatSteps[i].element, i, flatSteps);
    if (prev !== curr) transitions.push({ fromLayer: prev, toLayer: curr, atStep: i });
  }
  return transitions;
}

/**
 * Provides the pattern name and spec citation for crossing layers.
 */
function layerCrossingSentence(fromLayer, toLayer) {
  const rule = LAYER_RULES[`${fromLayer}→${toLayer}`];
  if (rule) {
    return `The path now crosses from the <strong>${fromLayer}</strong> layer to
            <strong>${toLayer}</strong> via the <em>${rule.pattern}</em> pattern.
            ${rule.explanation} <cite>${rule.section}</cite>`;
  }
  return `The path crosses from the <strong>${fromLayer}</strong> layer to <strong>${toLayer}</strong>.`;
}

/** One-line layer hop for collapsed path narrative (no long prose). */
function layerCrossingShort(fromLayer, toLayer) {
  const rule = LAYER_RULES[`${fromLayer}→${toLayer}`];
  if (rule) {
    return `<strong>${fromLayer}</strong> → <strong>${toLayer}</strong> · <em>${rule.pattern}</em>`;
  }
  return `<strong>${fromLayer}</strong> → <strong>${toLayer}</strong>`;
}

function layerBadgeClassForExplain(layerLabel) {
  switch (layerLabel) {
    case "Business-Heavy":
      return "path-badge--layer-business";
    case "Application-Heavy":
    case "Technology-Heavy":
      return "path-badge--layer-tech";
    case "Implementation-Heavy":
      return "path-badge--layer-implementation";
    default:
      return "path-badge--layer-fullstack";
  }
}

function precisionBadgeClassForExplain(precisionLabel) {
  switch (precisionLabel) {
    case "Simplified":
      return "path-badge--precision-executive";
    case "Ground-Truth":
      return "path-badge--precision-ground";
    case "Executive Summary":
      return "path-badge--precision-executive";
    case "Abstracted Topology":
      return "path-badge--precision-abstracted";
    case "Informal Bridge":
      return "path-badge--precision-informal";
    default:
      return "path-badge--precision-ground";
  }
}

function precisionBadgeShortLabelForExplain(precisionLabel) {
  switch (precisionLabel) {
    case "Simplified":
      return "Simplified";
    case "Ground-Truth":
      return "Ground-Truth";
    case "Executive Summary":
      return "Simplified";
    case "Abstracted Topology":
      return "Abstracted";
    case "Informal Bridge":
      return "Informal";
    case "Engineering Ground-Truth":
      return "Ground-Truth";
    default:
      return "Ground-Truth";
  }
}

/**
 * Maps resolved ArchiMate layer to a CSS class suffix (see `.step-el--layer-*` in styles).
 */
function layerSlugForStepPill(layerName) {
  switch (String(layerName || "")) {
    case "Motivation": return "motivation";
    case "Strategy": return "strategy";
    case "Business": return "business";
    case "Application": return "application";
    case "Technology": return "technology";
    case "Physical": return "technology";
    case "Implementation & Migration": return "implementation";
    case "Composite": return "composite";
    default: return "unknown";
  }
}

function explainPath(
  segments,
  selectedPathIndex = 0,
  { constrained = true, perspectiveMeta = null, perspectiveTitles = null, rigorPreset = "academic", staleAfterDirectionFlips = false } = {}
) {
  try {
    if (!segments || segments.length === 0) return { routeColumn: "", detailColumn: "" };
    const flatSteps = flattenSegments(segments, selectedPathIndex);
    if (flatSteps.length === 0) return { routeColumn: "", detailColumn: "" };

    const edgeConstraintsExplain = Array.isArray(window.state?.edgeConstraints)
      ? window.state.edgeConstraints
      : [];

    const routeHasAssociationBridge = flatSteps.slice(1).some((s) => s?.isAssociation);

    const waypoints    = extractWaypoints(segments);
    const midpoints    = waypoints.slice(1, -1);
    const fromEl       = flatSteps[0].element;
    const toEl         = flatSteps[flatSteps.length - 1].element;
    const fromScenario = getScenarioDisplayName(fromEl);
    const toScenario = getScenarioDisplayName(toEl);
    const fromDisplay = fromScenario.display;
    const toDisplay = toScenario.display;
    const hopCount     = flatSteps.length - 1;
    const pathCount = Math.max(
      0,
      ...segments.map((s) => (Array.isArray(s?.paths) ? s.paths.length : 0))
    );
    const rigorLabel = explainRigorPresetLabel(rigorPreset);
    const rigorHint =
      rigorLabel === "Academic"
        ? "Switch to Discovery to see informal shortcuts."
        : rigorLabel === "Discovery"
          ? "Switch to Academic to hide informal shortcuts."
          : "";
    const derivedCount = flatSteps.filter(s => s.isDirect === false).length;
    const transitions  = detectLayerTransitions(flatSteps);
    const pattern      = characterisePath(flatSteps, edgeConstraintsExplain);
    const routeParts   = [];
    const detailParts  = [];

    if (constrained && midpoints.length > 0) {
      const midList = midpoints.map(m => `<strong>${m}</strong>`).join(", ");
      routeParts.push(`<div class="explain-waypoint-note">
        Path constrained to pass through ${midList}. ArchiTrek found a valid route satisfying this constraint.
      </div>`);
    }

    // One meta line: hop count + dominant pattern + direct/derived — layer journey is visible in the strip and detailed per step below.
    let metaLine = `<strong>${hopCount}</strong> hop${hopCount !== 1 ? "s" : ""} · ${pattern}`;
    metaLine += derivedCount > 0
      ? ` · <span class="tag tag-derived">${derivedCount} inferred (§5.7)</span>`
      : ` · <span class="tag tag-direct">All explicit (Appendix B)</span>`;
    if (staleAfterDirectionFlips) {
      metaLine += ` · <span class="tag tag-recompute-stale">Needs recompute after direction flips</span>`;
    }
    const educationalContrast = (() => {
      if (hopCount < 2 || derivedCount > 0) return "";
      if (typeof mergeMatrixRowForPair !== "function") return "";
      const row = mergeMatrixRowForPair(fromEl, toEl, true);
      if (!row?.derived?.length) return "";
      const wcfg =
        typeof normalizePathWeights === "function" && typeof window !== "undefined" && window.state
          ? normalizePathWeights({
              pathWeightDirect: window.state.searchPathWeightDirect,
              pathWeightDerived: window.state.searchPathWeightDerived,
              pathWeightAssociation: window.state.searchPathWeightAssociation,
              pathWeightLayerSkip: window.state.searchPathWeightLayerSkip,
            })
          : null;
      const totalWeight =
        typeof pathTotalWeight === "function"
          ? pathTotalWeight(flatSteps, wcfg || undefined)
          : hopCount;
      const derW = wcfg?.derived ?? 5;
      if (!(totalWeight < derW)) return "";
      return `Found a <strong>${hopCount}-hop explicit</strong> path (Total Weight: <strong>${totalWeight}</strong>). Preferred over a <strong>1-hop inferred</strong> shortcut (Weight: <strong>${derW}</strong>).`;
    })();

    const stepElementHtml = (elementName, flatStepIndex, { preferCanonicalChip = false, swimlaneSteps = flatSteps } = {}) => {
      const safeName = String(elementName ?? "");
      const scenario = getScenarioDisplayName(safeName);
      const displayName = scenario.display;
      const chipLabel = preferCanonicalChip ? safeName : displayName;
      const resolvedLayer = getSwimlaneLayer(safeName, flatStepIndex, swimlaneSteps);
      const layerSlug = layerSlugForStepPill(resolvedLayer);

      let iconSvg = "";
      try {
        if (typeof window !== "undefined" && typeof window.getElementGlyphSvg === "function") {
          iconSvg = `<span class="step-el-icon step-el-icon--glyph" aria-hidden="true">${window.getElementGlyphSvg(safeName, 20)}</span>`;
        }
      } catch (_) {
        /* ignore */
      }

      const aspect = getAspect(safeName);
      const ariaExtra = scenario.isThematic
        ? ` aria-label="${escPathDiag(`${displayName}, ArchiMate ${safeName}, ${aspect}, ${resolvedLayer}`)}"`
        : ` aria-label="${escPathDiag(`ArchiMate ${safeName}, ${aspect}, ${resolvedLayer}`)}"`;
      const scenarioTipRow = scenario.isThematic
        ? `<span class="step-el-tip-row step-el-tip-row--scenario"><span class="step-el-tip-muted">Scenario label</span> <span class="step-el-tip-strong">${escPathDiag(displayName)}</span></span>`
        : "";

      return `
        <span class="step-el-tip-wrap">
          <button type="button" class="step-el path-node-chip step-el--crumb el-info-trigger step-el--layer-${layerSlug}" data-element="${encodeURIComponent(safeName)}"${ariaExtra}>
            ${iconSvg}
            <span class="step-el-name">${escPathDiag(chipLabel)}</span>
          </button>
          <span class="step-el-tip" aria-hidden="true">
            <span class="step-el-tip-inner">
              <span class="step-el-tip-kicker">ArchiMate element</span>
              <span class="step-el-tip-title">${escPathDiag(safeName)}</span>
              <span class="step-el-tip-meta">${escPathDiag(aspect)} · ${escPathDiag(resolvedLayer)} layer</span>
              ${scenarioTipRow}
              <span class="step-el-tip-foot">Click for definition</span>
            </span>
          </span>
        </span>`;
    };

    /** Hop summary row: same interactive chips + tooltips as the path strip; stacked subline when the chip uses a scenario name.
     *  When `plainCanonicalEndpoint`, render the ArchiMate name only (plain text span, no stacked chip). */
    const hopSummaryEndpointHtml = (elementName, flatStepIndex, useThematicChipLabel, plainCanonicalEndpoint = false) => {
      const safeName = String(elementName ?? "");
      if (plainCanonicalEndpoint) {
        return `<span class="explain-hop-summary-endpoint explain-hop-summary-endpoint--plain panel-segment-route-end-name" aria-label="${escPathDiag(`ArchiMate element: ${safeName}`)}">${escPathDiag(safeName)}</span>`;
      }
      const scenario = getScenarioDisplayName(safeName);
      const displayName = scenario.display;
      const chipLabel = useThematicChipLabel ? displayName : safeName;
      const resolvedLayer = getSwimlaneLayer(safeName, flatStepIndex, flatSteps);
      const layerSlug = layerSlugForStepPill(resolvedLayer);

      let iconSvg = "";
      try {
        if (typeof window !== "undefined" && typeof window.getElementGlyphSvg === "function") {
          iconSvg = `<span class="step-el-icon step-el-icon--glyph" aria-hidden="true">${window.getElementGlyphSvg(safeName, 20)}</span>`;
        }
      } catch (_) {
        /* ignore */
      }

      const aspect = getAspect(safeName);
      const ariaExtra = scenario.isThematic
        ? ` aria-label="${escPathDiag(`${displayName}, ArchiMate ${safeName}, ${aspect}, ${resolvedLayer}`)}"`
        : ` aria-label="${escPathDiag(`ArchiMate ${safeName}, ${aspect}, ${resolvedLayer}`)}"`;
      const scenarioTipRow = scenario.isThematic
        ? `<span class="step-el-tip-row step-el-tip-row--scenario"><span class="step-el-tip-muted">Scenario label</span> <span class="step-el-tip-strong">${escPathDiag(displayName)}</span></span>`
        : "";
      const subline = explainHopSummaryAbstractSubline(scenario);

      return `<span class="step-el-tip-wrap explain-hop-summary-endpoint">
        <button type="button" class="step-el path-node-chip path-node-chip--stacked step-el--crumb el-info-trigger step-el--layer-${layerSlug}" data-element="${encodeURIComponent(safeName)}"${ariaExtra}>
          <span class="path-node-chip-line path-node-chip-line--head">
            ${iconSvg}
            <span class="step-el-name">${escPathDiag(chipLabel)}</span>
          </span>
          ${subline}
        </button>
        <span class="step-el-tip" aria-hidden="true">
          <span class="step-el-tip-inner">
            <span class="step-el-tip-kicker">ArchiMate element</span>
            <span class="step-el-tip-title">${escPathDiag(safeName)}</span>
            <span class="step-el-tip-meta">${escPathDiag(aspect)} · ${escPathDiag(resolvedLayer)} layer</span>
            ${scenarioTipRow}
            <span class="step-el-tip-foot">Click for definition</span>
          </span>
        </span>
      </span>`;
    };

    const stripSteps = displayStepsForExplanationStrip(flatSteps, edgeConstraintsExplain);
    const strip = stripSteps
      .map((s, idx) => stepElementHtml(s.element, idx, { swimlaneSteps: stripSteps }))
      .join(`<span class="explain-strip-arrow path-node-arrow" aria-hidden="true">→</span>`);

    const hasLayerTransitions = transitions.length > 0;
    /** Keep this disclosure focused on layer/spec notes (route pills are shown in the header block). */
    const pathNarrativeHtml = (() => {
      if (!hasLayerTransitions) return "";

      const summaryBits = ["How this path reads"];
      if (hasLayerTransitions) {
        summaryBits.push(
          `${transitions.length} layer crossing${transitions.length !== 1 ? "s" : ""}`
        );
      }
      const summaryLine = escPathDiag(summaryBits.filter(Boolean).join(" · "));

      if (hasLayerTransitions) {
        const shortItems = transitions.map(
          (t) => `<li class="explain-path-reads-item">${layerCrossingShort(t.fromLayer, t.toLayer)}</li>`
        );
        const longItems = transitions.map(
          (t) =>
            `<li class="explain-path-reads-item explain-path-reads-item--long">${layerCrossingSentence(
              t.fromLayer,
              t.toLayer
            )}</li>`
        );

        return `<details class="explain-path-reads">
          <summary class="explain-path-reads-summary">${summaryLine}</summary>
          <div class="explain-path-reads-body">
            <ul class="explain-path-reads-list">${shortItems.join("")}</ul>
            <details class="explain-path-reads-nested">
              <summary>Full layer notes (spec-style)</summary>
              <ul class="explain-path-reads-list explain-path-reads-list--long">${longItems.join("")}</ul>
            </details>
          </div>
        </details>`;
      }
      return "";
    })();

    const routeHeaderPills = (() => {
      if (!perspectiveMeta) return "";
      const out = [];
      if (perspectiveMeta.layerLabel) {
        out.push(
          `<span class="path-badge ${layerBadgeClassForExplain(perspectiveMeta.layerLabel)}">${escPathDiag(
            perspectiveMeta.layerLabel
          )}</span>`
        );
      }
      if (perspectiveMeta.precisionLabel) {
        out.push(
          `<span class="path-badge ${precisionBadgeClassForExplain(perspectiveMeta.precisionLabel)}">${escPathDiag(
            precisionBadgeShortLabelForExplain(perspectiveMeta.precisionLabel)
          )}</span>`
        );
      }
      return out.length ? `<div class="explain-route-meta-pills">${out.join("")}</div>` : "";
    })();

    routeParts.push(`<div class="explain-element-rail" aria-label="Elements on this path">
        <div class="explain-element-strip explain-element-strip--in-overview">
          ${strip}
        </div>
      </div>`);

    detailParts.push(`<div class="explain-path-overview explain-path-overview--lead">
      <div class="explain-summary">
        <span class="panel-section-heading explain-route-eyebrow">Route ${selectedPathIndex + 1}</span>
        <h2 class="explain-route-title">${fromDisplay} → ${toDisplay}</h2>
        ${routeHeaderPills}
        ${pathNarrativeHtml}
        <p class="explain-path-meta">${metaLine}</p>
        ${educationalContrast ? `<p class="explain-path-purpose">${educationalContrast}</p>` : ""}
      </div>
    </div>`);

    detailParts.push(`<details class="explain-element-defs">
      <summary>Spec excerpts for elements on this path (${flatSteps.length})</summary>
      <div class="explain-element-defs-body">`);
    for (const step of flatSteps) {
      detailParts.push(elementSummary(step.element));
    }
    detailParts.push(`</div></details>`);

    const segmentInfos = segmentFirstHopIndices(segments, selectedPathIndex);
    const segmentHeadingByFirstHop = new Map();
    for (const si of segmentInfos) {
      segmentHeadingByFirstHop.set(si.firstHop, si);
    }
    /** Segment band + phase heading for every waypoint leg (one band per segment, including a single A→B leg). */
    const showSegmentPhaseChrome = Array.isArray(segments) && segments.length >= 1;

    const hasSelectedViewpoint =
      typeof window !== "undefined" &&
      window.state?.viewpoint != null &&
      String(window.state.viewpoint).trim() !== "";
    const associationRouteMentorHtml = routeHasAssociationBridge && !hasSelectedViewpoint
      ? `<blockquote class="explain-association-route-warning" role="note">
      ⚠️ <strong>Association Bridge Used:</strong> No explicit structural path exists here. Because your Semantic Rigor is set to allow fallbacks, we bridged the gap using a generic Association (§5.2.4). To find a stronger structural path, try enabling <strong>+ Inferred</strong> (Search Depth).
    </blockquote>`
      : "";

    detailParts.push(
      `<div class="explain-steps-section"><h4 class="panel-section-heading">Step-by-step justification</h4>${associationRouteMentorHtml}`
    );

    let segmentBandOpen = false;

    for (let i = 1; i < flatSteps.length; i++) {
      const prev = flatSteps[i - 1];
      const curr = flatSteps[i];
      /** Matches diagram / store: FORCED_DIRECTION opposite to traversal prev→curr (see drawArrow reverseLayout). */
      const forcedReverse =
        hasDirectedEdgeConstraint(edgeConstraintsExplain, curr.element, prev.element, "FORCED_DIRECTION") &&
        !hasDirectedEdgeConstraint(edgeConstraintsExplain, prev.element, curr.element, "FORCED_DIRECTION");
      const narrFrom = forcedReverse ? curr.element : prev.element;
      const narrTo = forcedReverse ? prev.element : curr.element;
      const narrIdxFrom = forcedReverse ? i : i - 1;
      const narrIdxTo = forcedReverse ? i - 1 : i;
      const hopStepForExplain = forcedReverse
        ? pathStepWithCanonicalMatrixRow({ ...curr }, narrFrom, narrTo)
        : curr;

      const segHead = segmentHeadingByFirstHop.get(i);
      if (segHead && showSegmentPhaseChrome) {
        if (segmentBandOpen) {
          detailParts.push(`</div></div>`);
        }
        segmentBandOpen = true;
        const fromSegScenario = getScenarioDisplayName(segHead.from);
        const sf = fromSegScenario.display;
        const toSegScenario = getScenarioDisplayName(segHead.to);
        const st = toSegScenario.display;
        const segOrd = segHead.segmentIndex + 1;
        const defsForSeg = typeof ELEMENTS !== "undefined" ? ELEMENTS : {};
        const semanticTitle = escPathDiag(
          getSegmentSemanticLabel(segHead, segHead.segmentIndex, defsForSeg)
        );
        const segmentEndCanonical = escPathDiag(segHead.to);
        detailParts.push(
          `<div class="explain-segment-band" role="group" aria-label="Segment ${segOrd}: hops on this part of the route">
            <div class="panel-segment-header">
              <div class="panel-segment-header-eyebrow">
                <h4 class="panel-section-heading panel-section-heading--segment panel-segment-semantic-title">${semanticTitle}</h4>
              </div>
              <div class="panel-segment-route" aria-label="Segment endpoints">
                <span class="panel-segment-route-chunk path-node-chip path-node-chip--stacked" aria-label="Segment start waypoint: ${escPathDiag(sf)}">
                  <span class="path-node-chip-primary">${escPathDiag(sf)}</span>
                  ${explainAbstractSublineFromScenario(fromSegScenario)}
                </span>
                <span class="panel-segment-route-arrow path-node-arrow" aria-hidden="true">→</span>
                <span class="panel-segment-route-chunk path-node-chip path-node-chip--stacked" aria-label="Segment end waypoint: ${escPathDiag(st)} (${segmentEndCanonical})">
                  <span class="path-node-chip-primary">${escPathDiag(st)}</span>
                  ${explainAbstractSublineFromScenario(toSegScenario)}
                </span>
              </div>
            </div>
            <p class="explain-segment-hops-lead">Hops</p>
            <div class="explain-segment-hops" role="group" aria-label="Hops in segment ${segOrd}">`
        );
      }

      const isJunction = midpoints.includes(curr.element);
      const waypointBadge = isJunction
        ? `<span class="tag tag-waypoint explain-badge-tip" data-explain-tip="waypoint" tabindex="0" role="note" aria-label="Waypoint marker at step ${i}">Waypoint</span>`
        : "";
      const choiceState = hopRelationshipChoiceState(flatSteps, i, edgeConstraintsExplain);
      const safeCodes = choiceState.choiceBasisCodes;
      const hasChoices = choiceState.hasChoices;
      const activeCode = resolvedRelationshipCodeForHop(curr, i, prev.element, edgeConstraintsExplain);
      const hopMetaForPedagogy = curr.semanticHop
        ? { ...curr.semanticHop, from: narrFrom, to: narrTo }
        : { from: narrFrom, to: narrTo };
      const weakAssoc =
        !!curr.isAssociation &&
        !(
          typeof isAssociationHopPedagogySanctioned === "function" &&
          isAssociationHopPedagogySanctioned(
            curr,
            hopMetaForPedagogy,
            mergeSemanticTierOpts({ resolvedPrimaryCode: String(activeCode || "O").toUpperCase() })
          )
        );
      const weakBadge = weakAssoc
        ? `<span class="tag tag-weak-link explain-badge-tip" data-explain-tip="association" tabindex="0" role="note">Generic link</span>`
        : "";
      const hasPinnedDirectionForHop =
        hasDirectedEdgeConstraint(edgeConstraintsExplain, prev.element, curr.element, "FORCED_DIRECTION") ||
        hasDirectedEdgeConstraint(edgeConstraintsExplain, curr.element, prev.element, "FORCED_DIRECTION");
      const isProvisional = choiceState.needsPick;

      const illustrationPathKey = String(selectedPathIndex);
      const architectNoteParts = [];
      if (COMPOSITE_PATTERNS[prev.element]) {
        architectNoteParts.push(
          formatCompositeArchitectNote(prev.element, `${illustrationPathKey}:${i - 1}:${prev.element}`)
        );
      }
      if (COMPOSITE_PATTERNS[curr.element]) {
        architectNoteParts.push(
          formatCompositeArchitectNote(curr.element, `${illustrationPathKey}:${i}:${curr.element}`)
        );
      }
      const architectNotesHtml = architectNoteParts.filter(Boolean).join(" ");

      const relHeaderName = isProvisional
        ? (hasPinnedDirectionForHop ? "Relationship Choice Pending" : "Relationship Pending")
        : RELATIONSHIPS[String(activeCode || "O").toUpperCase()]?.name ?? String(activeCode);
      const narrFromScenario = getScenarioDisplayName(narrFrom);
      const narrToScenario = getScenarioDisplayName(narrTo);
      const narrFromDisp = narrFromScenario.display;
      const narrToDisp = narrToScenario.display;
      const domainKey = activeDomainContextKey();
      const showThematicRoute =
        domainKey !== "abstract" && (narrFromDisp !== narrFrom || narrToDisp !== narrTo);
      const actionRequiredTag = isProvisional
        ? hasPinnedDirectionForHop
          ? `<span class="tag tag-action-required" title="Direction is pinned for this hop; choose the relationship type." aria-label="Relationship choice required while direction is pinned">Choose relationship</span>`
          : `<span class="tag tag-action-required">Action Required</span>`
        : "";
      const pinnedDirBadge = hasPinnedDirectionForHop
        ? `<span class="tag tag-forced-direction explain-badge-tip" data-explain-tip="forced-direction" tabindex="0" role="note" aria-label="Direction for this hop is pinned">${forcedReverse ? "Pinned direction (reversed)" : "Pinned direction"}</span>`
        : "";
      const summaryCodeHtml = isProvisional
        ? ""
        : ` <span class="edge-codes edge-codes--primary explain-hop-summary-code" title="Matrix relationship code">[${escPathDiag(String(activeCode || "O").toUpperCase())}]</span>`;
      const headerSnippet = isProvisional
        ? getUndecidedRelationSnippet({ compact: true, solidInSummary: true })
        : getRelationVisualSnippet(
            activeCode,
            isActiveCodeDirectInMatrix(hopStepForExplain, activeCode),
            i,
            { compact: true }
          );
      const routeCaptionHtml = `<span class="explain-hop-summary-route explain-hop-summary-route--single">${hopSummaryEndpointHtml(narrFrom, narrIdxFrom, showThematicRoute)}<span class="explain-hop-summary-connector explain-edge-connector explain-edge-connector--inline-arrow" aria-hidden="true">${headerSnippet}</span>${hopSummaryEndpointHtml(narrTo, narrIdxTo, showThematicRoute)}</span>`;
      const revCodesForSummary = reverseRelationshipCodesForDirectedPair(narrFrom, narrTo);
      const reverseSummaryLine = isProvisional
        ? ""
        : revCodesForSummary.length
          ? `<div class="explain-hop-summary-reverse" role="note"><span class="explain-hop-reverse-chip" title="Appendix B / §5.7 matrix row for the opposite hop (${escPathDiag(narrTo)} → ${escPathDiag(narrFrom)})">↺ opposite: [${escPathDiag(revCodesForSummary.join(", "))}]</span></div>`
          : `<div class="explain-hop-summary-reverse" role="note"><span class="explain-hop-reverse-chip explain-hop-reverse-chip--none" title="No Appendix B / §5.7 matrix row for ${escPathDiag(narrTo)} → ${escPathDiag(narrFrom)}">↺ opposite: none</span></div>`;

      detailParts.push(`<div class="explain-edge-block explain-hop-shell">
        <details class="explain-hop-justification">
          <summary class="explain-hop-summary">
            <span class="explain-hop-summary-main">
              <span class="step-badge${isProvisional ? " step-badge--provisional" : ""}" aria-label="Hop ${i} (same number as on the diagram)" title="Hop ${i}">${i}</span>
              <span class="explain-hop-summary-body">
                <div class="explain-hop-summary-top">
                  <h3 class="explain-hop-summary-rel">${escPathDiag(relHeaderName)}${summaryCodeHtml}</h3>
                  <div class="explain-hop-summary-badges">${actionRequiredTag}${waypointBadge}${weakBadge}${pinnedDirBadge}</div>
                </div>
                ${routeCaptionHtml}
                ${reverseSummaryLine}
              </span>
            </span>
          </summary>
          <div class="explain-hop-expanded">
            <div data-hop="${i}" data-from="${narrFrom}" data-to="${narrTo}">
              ${explainEdge(
                narrFrom,
                narrTo,
                activeCode,
                isActiveCodeDirectInMatrix(hopStepForExplain, activeCode),
                hasChoices,
                isProvisional,
                hasChoices ? i : undefined,
                hasChoices ? safeCodes : undefined,
                architectNotesHtml,
                hopStepForExplain.matrixDirectCodes,
                hopStepForExplain.matrixDerivedCodes,
                curr.semanticHop || null,
                hopStepForExplain,
                rigorPreset,
                { routeStartEl: fromEl, routeEndEl: toEl, routeHasAssociationBridge }
              )}
            </div>
          </div>
        </details>
      </div>`);
    }

    if (segmentBandOpen) {
      detailParts.push(`</div></div>`);
    }

    detailParts.push(`</div>`);

    const uniqueCodes = [
      ...new Set(
        flatSteps.slice(1).flatMap((s, idx) => {
          const hopIdx = idx + 1;
          const hopCodes = appendixMatrixCodesForPathHopIndex(flatSteps, hopIdx, edgeConstraintsExplain);
          if (hopCodes.length > 1 && !edgeChoiceCommittedForHop(hopIdx, hopCodes, edgeConstraintsExplain)) return [];
          return [
            String(
              resolvedRelationshipCodeForHop(
                s,
                hopIdx,
                flatSteps[hopIdx - 1]?.element,
                edgeConstraintsExplain
              )
            ).toUpperCase(),
          ];
        })
      ),
    ];
    
    const citations = uniqueCodes
      .map(c => RELATIONSHIPS[c])
      .filter(Boolean)
      .map(r => `${r.name} (${r.section})`)
      .join(" · ");

    detailParts.push(`<div class="explain-closing">
      <strong>Spec references:</strong> Appendix B (Normative) · ${citations}
      ${derivedCount > 0 ? "· §5.7 Derivation Rules" : ""}
      <div class="explain-rigor-summary">Found ${pathCount} path${pathCount === 1 ? "" : "s"} using ${escPathDiag(rigorLabel)} Rigor.${rigorHint ? ` (${escPathDiag(rigorHint)})` : ""}</div>
    </div>`);

    return {
      routeColumn: routeParts.join("\n"),
      detailColumn: detailParts.join("\n"),
    };
    
  } catch (err) {
    console.error("Fatal error inside explainPath:", err);
    return {
      routeColumn: "",
      detailColumn: `<div style="padding: 20px; color: red; background: #fee2e2; border-radius: 8px;">
      <strong>Error generating explanation:</strong> ${err.message}. Check console for details.
    </div>`,
    };
  }
}

function renderViewpointBlockedPanel({ viewpointName = "current", viewpointKey = null } = {}) {
  const vp = escPathDiag(viewpointName || "current");
  const hint =
    viewpointKey && viewpointKey !== "layered"
      ? `Selected viewpoint key: <strong>${escPathDiag(String(viewpointKey))}</strong>.`
      : "";
  return `<div class="path-dead-end" role="status" aria-live="polite">
    <div class="path-dead-end__icon-wrap" aria-hidden="true">
      <svg class="path-dead-end__svg" width="64" height="64" viewBox="0 0 64 64" focusable="false">
        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="1.75" opacity="0.5"/>
        <path d="M18 20h28v24H18z" fill="none" stroke="currentColor" stroke-width="1.75" opacity="0.55"/>
        <path d="M24 28h16M24 34h10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" opacity="0.6"/>
      </svg>
    </div>
    <h2 class="path-dead-end__title">No path inside this viewpoint — but the full metamodel can connect</h2>
    <div class="path-dead-end__lesson">
      <p class="path-dead-end__body">With <strong>${vp}</strong> selected, the search only uses that viewpoint’s allowed element types and the matrix links between them. The tool checked the full Appendix B graph separately: a route exists there, so the failure is due to this viewpoint’s scope — for example an endpoint outside the palette, intermediates you are not allowed to use here, or relationship types this viewpoint excludes.</p>
      ${hint ? `<p class="path-dead-end__context">${hint}</p>` : ""}
    </div>
    <div class="path-dead-end__actions path-dead-end__actions--buttons" role="group" aria-label="Expand search scope">
      <div class="path-dead-end__action-block path-dead-end__action-block--permissive">
        <div class="path-dead-end__btn-row">
          <button type="button" class="path-dead-end__btn path-dead-end__btn--choice" onclick="window.expandPathfindingToFullMetamodel?.()">Expand search to full metamodel</button>
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * Educational empty state for the diagram when UCS finds no path under current constraints.
 * @param {string} sourceName
 * @param {string} targetName
 * @param {{ includeDerived?: boolean, allowAssociationFallback?: boolean, selectionMode?: string, pickedCount?: number, waypointChainLabel?: string, failingSegmentOrdinal?: number, segmentTotal?: number, viewpointStrict?: boolean, viewpointName?: string, viewpointFromInGraph?: boolean, viewpointToInGraph?: boolean, academicDirectBlocked?: boolean }} [opts]
 */
function renderNoPathEducationalPanel(sourceName, targetName, opts = {}) {
  const e = escPathDiag;
  const src = sourceName ? String(sourceName).trim() : "";
  const tgt = targetName ? String(targetName).trim() : "";
  const srcE = e(src || "—");
  const tgtE = e(tgt || "—");
  const includeDerived = !!opts.includeDerived;
  const allowAssoc = !!opts.allowAssociationFallback;
  const modeSet = opts.selectionMode === "set";
  const nPick = typeof opts.pickedCount === "number" ? opts.pickedCount : 0;
  const vpStrict = !!opts.viewpointStrict && opts.viewpointName;
  const vName = vpStrict ? e(String(opts.viewpointName)) : "";
  const vFromOk = opts.viewpointFromInGraph !== false;
  const vToOk = opts.viewpointToInGraph !== false;
  let viewpointNote = "";
  if (vpStrict) {
    if (!vFromOk && !vToOk) {
      viewpointNote = `<p class="path-dead-end__context path-dead-end__context--viewpoint">Viewpoint <strong>${vName}</strong> is active. Neither <strong>${srcE}</strong> nor <strong>${tgtE}</strong> is in this viewpoint’s element palette, so they are not part of the pathfinding graph under this filter.</p>`;
    } else if (!vFromOk) {
      viewpointNote = `<p class="path-dead-end__context path-dead-end__context--viewpoint">Viewpoint <strong>${vName}</strong> is active. <strong>${srcE}</strong> is not in this viewpoint’s element palette.</p>`;
    } else if (!vToOk) {
      viewpointNote = `<p class="path-dead-end__context path-dead-end__context--viewpoint">Viewpoint <strong>${vName}</strong> is active. <strong>${tgtE}</strong> is not in this viewpoint’s element palette.</p>`;
    } else {
      viewpointNote = `<p class="path-dead-end__context path-dead-end__context--viewpoint">Viewpoint <strong>${vName}</strong> is active: the search only follows element types and Appendix B links allowed for that scope. There is no route between these points under that restriction — either no permitted chain exists in this subgraph, or the metamodel would need intermediates or relationship types this viewpoint does not include.</p>`;
    }
  }
  const multiNote =
    modeSet && nPick > 2
      ? `<p class="path-dead-end__context">Your connect set includes several elements; this message uses the <strong>first</strong> and <strong>last</strong> points in the list as endpoints for the narrative.</p>`
      : "";

  const academicBlock = opts.academicDirectBlocked
    ? `<div class="path-dead-end__academic-block" role="alert"><strong>🛑 Path Blocked.</strong> There is no direct structural relationship between these elements, and your &quot;Academic&quot; Rigor setting forbids Association fallbacks. Try switching Search Depth to <strong>+ Inferred</strong> for §5.7 links, or lower your Rigor to &quot;Pragmatic&quot; to allow Association bridges.</div>`
    : "";

  const compassSvg = `<svg class="path-dead-end__svg" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="1.75" opacity="0.5"/>
    <circle cx="32" cy="32" r="4" fill="currentColor" opacity="0.35"/>
    <path d="M32 8 L36 28 L32 32 L28 28 Z" fill="currentColor" opacity="0.55"/>
    <path d="M56 32 L36 36 L32 32 L36 28 Z" fill="currentColor" opacity="0.38"/>
    <path d="M32 56 L28 36 L32 32 L36 36 Z" fill="currentColor" opacity="0.38"/>
    <path d="M8 32 L28 28 L32 32 L28 36 Z" fill="currentColor" opacity="0.38"/>
  </svg>`;

  const derivedDisabled = includeDerived ? " disabled" : "";
  const assocDisabled = allowAssoc ? " disabled" : "";

  const bothOn = includeDerived && allowAssoc;
  const exhaustedNote = bothOn
    ? `<p class="path-dead-end__exhausted">Inferred relations (§5.7) and Association fallback are already enabled. If there is still no route, use <strong>Options</strong> to raise hop limits or search effort, widen the viewpoint, or change endpoints.</p>`
    : "";

  const derivedHint =
    "Inferred (§5.7) relations collapse multiple technical layers into a single line, operating at a higher level of abstraction for business stakeholders.";
  const assocHint =
    "Associations are the weakest form of relationship, useful for early-stage planning or capturing undocumented “tribal knowledge”.";
  const rationaleText =
    "Explicit (Appendix B uppercase) relationships form the “ground truth” of your architecture. Prefer them when you need rigor and verifiability; inferred links can be helpful to simplify the story, but they intentionally abstract away detail.";

  const titleText = includeDerived
    ? "No Architectural Path Found"
    : "No Strict Architectural Path Found";
  const whySummaryText = includeDerived
    ? "Why prefer explicit (ground-truth) routing?"
    : "Why prefer strict (ground-truth) routing?";
  const bodyText = includeDerived
    ? `Under your current rules, there is no verifiable path between <strong>${srcE}</strong> and <strong>${tgtE}</strong>.`
    : `Under strict ArchiMate rules, there is no verifiable explicit structural or behavioral link between <strong>${srcE}</strong> and <strong>${tgtE}</strong>.`;

  const orderedCtx =
    opts.selectionMode === "ordered" && opts.waypointChainLabel
      ? `<p class="path-dead-end__context">Ordered path <strong>${e(opts.waypointChainLabel)}</strong>: the first hop that cannot be bridged with your current options is <strong>${srcE} → ${tgtE}</strong>${typeof opts.failingSegmentOrdinal === "number" && typeof opts.segmentTotal === "number" ? ` (segment ${opts.failingSegmentOrdinal} of ${opts.segmentTotal})` : ""}.</p>`
      : "";

  return `<div class="path-dead-end" role="status" aria-live="polite">
    <div class="path-dead-end__icon-wrap">${compassSvg}</div>
    <h2 class="path-dead-end__title">${e(titleText)}</h2>
    <div class="path-dead-end__lesson">
      ${academicBlock}
      ${viewpointNote}
      <p class="path-dead-end__body">${bodyText}</p>
      ${orderedCtx}
      ${multiNote}
      <details class="path-dead-end__disclosure path-dead-end__disclosure--why">
        <summary class="path-dead-end__disclosure-sum">${e(whySummaryText)}</summary>
        <p class="path-dead-end__disclosure-body">${e(rationaleText)}</p>
      </details>
    </div>
    <p class="path-dead-end__scale" role="note">Nothing here is pre-selected. If you widen the search, <strong>inferred (§5.7) relations</strong> stay closer to the spec (specific relationship types). <strong>Association</strong> is the most permissive: generic §5.2.4 links when no specific chain wins.</p>
    <p class="path-dead-end__temp-note">The buttons below run <strong>one relaxed Find Path</strong>. Your saved <strong>Options</strong> (<strong>Explicit vs +Inferred</strong>; <strong>Semantic rigor</strong> and Association fallback) are <strong>not</strong> changed—open Options only if you want that permanently.</p>
    <div class="path-dead-end__actions path-dead-end__actions--buttons" role="group" aria-label="Widen path search">
      <div class="path-dead-end__action-block">
        <div class="path-dead-end__tier">
          <span class="path-dead-end__tier-badge">Stricter widening</span>
          <span class="path-dead-end__tier-text">Still normative—Appendix B types plus §5.7 derivation</span>
        </div>
        <div class="path-dead-end__btn-row">
          <button type="button" class="path-dead-end__btn path-dead-end__btn--choice"${derivedDisabled} onclick="if(!this.disabled)window.tryRelaxPathDerived()">🔍 Search with + Inferred (§5.7)</button>
          ${includeDerived ? `<span class="path-dead-end__pill" aria-hidden="true">On</span>` : ""}
        </div>
        <details class="path-dead-end__disclosure path-dead-end__disclosure--cta">
          <summary class="path-dead-end__disclosure-sum path-dead-end__disclosure-sum--help">What does this do?</summary>
          <p class="path-dead-end__disclosure-body">${e(derivedHint)}</p>
        </details>
      </div>
      <div class="path-dead-end__action-block path-dead-end__action-block--permissive">
        <div class="path-dead-end__tier">
          <span class="path-dead-end__tier-badge path-dead-end__tier-badge--wide">Most permissive</span>
          <span class="path-dead-end__tier-text">Generic Association when needed (penalized in scoring)</span>
        </div>
        <div class="path-dead-end__btn-row">
          <button type="button" class="path-dead-end__btn path-dead-end__btn--choice"${assocDisabled} onclick="if(!this.disabled)window.tryRelaxPathAssociation()">🤝 Search with Informal Associations</button>
          ${allowAssoc ? `<span class="path-dead-end__pill" aria-hidden="true">On</span>` : ""}
        </div>
        <details class="path-dead-end__disclosure path-dead-end__disclosure--cta">
          <summary class="path-dead-end__disclosure-sum path-dead-end__disclosure-sum--help">What does this do?</summary>
          <p class="path-dead-end__disclosure-body">${e(assocHint)}</p>
        </details>
      </div>
    </div>
    ${exhaustedNote}
  </div>`;
}

function algorithmDetailsPanelInitiallyOpen() {
  try {
    return sessionStorage.getItem("archimateAlgorithmDetailsOpen") === "1";
  } catch {
    return false;
  }
}

/**
 * Numbered actions when probes show derived / association would fix the query.
 * @param {{ derivedWouldHelp: boolean, associationWouldHelp: boolean, includeDerived: boolean, allowAssociationFallback: boolean }|null|undefined} hints
 * @returns {string}
 */
function renderPathRelaxationActionSteps(hints) {
  if (!hints || (!hints.derivedWouldHelp && !hints.associationWouldHelp)) return "";

  const parts = [];
  parts.push(`<ol class="path-failure-suggestions__steps path-search-next__actions">`);

  if (hints.derivedWouldHelp) {
    parts.push(`<li class="path-failure-suggestions__step">
      <div class="path-failure-suggestions__step-body">
        <strong>1. Indirect (derived) relationships</strong>
        <span class="path-failure-suggestions__step-desc">Include §5.7 derived links from Appendix B (shown in lowercase in the tables). This is still “specific” relationships, not generic Association.</span>
        <button type="button" class="path-relax-btn" onclick="tryRelaxPathDerived()">Enable + Inferred and search again</button>
      </div>
    </li>`);
  }

  if (hints.associationWouldHelp) {
    const stepNum = hints.derivedWouldHelp ? "2" : "1";
    const extra =
      hints.derivedWouldHelp && !hints.includeDerived
        ? " (You can also use step 1 first — it may find a stricter chain.)"
        : "";
    parts.push(`<li class="path-failure-suggestions__step">
      <div class="path-failure-suggestions__step-body">
        <strong>${stepNum}. Association fallback</strong>
        <span class="path-failure-suggestions__step-desc">Allow §5.2.4 Association as a last resort when no Appendix B chain exists under your settings. Penalized hops are highlighted in the explanation.${extra}</span>
        <button type="button" class="path-relax-btn path-relax-btn--secondary" onclick="tryRelaxPathAssociation()">Allow Association fallback and search again</button>
      </div>
    </li>`);
  }

  parts.push(`</ol>`);
  return parts.join("\n");
}

/**
 * Full no-path diagnostics: what search ran + next options (probed + general).
 * @param {{
 *   mode: string,
 *   includeDerived: boolean,
 *   allowAssociationFallback: boolean,
 *   maxDepth: number,
 *   maxPaths: number,
 *   maxStates: number,
 *   searchEffort: string,
 *   viewpointShortLabel: string,
 *   viewpointStrict?: boolean,
 *   waypointChainDescription: string,
 * }} payload
 * @param {{ derivedWouldHelp?: boolean, associationWouldHelp?: boolean, includeDerived?: boolean }|null|undefined} hints
 */
function renderPathSearchDiagnostics(payload, hints) {
  const e = escPathDiag;
  const effortLabel =
    payload.searchEffort === "fast"
      ? "Fast"
      : payload.searchEffort === "thorough"
        ? "Thorough"
        : "Balanced";
  const modeLabel =
    payload.mode === "set"
      ? "Connect set (unordered points — tool picks a chain)"
      : "Ordered (your Start → Via → End order)";
  const relLine = payload.includeDerived
    ? "+ Inferred — graph includes Appendix B explicit (uppercase) and §5.7 inferred (lowercase) edges."
    : "Explicit only — graph includes only explicit Appendix B uppercase relationships.";
  const assocLine = payload.allowAssociationFallback
    ? "Fallback ON — penalized §5.2.4 Association hops are allowed when they win on total weight; they are flagged in the explanation."
    : `Fallback OFF — cheapest routes that rely only on penalized Association (weight ${payload.pathWeightAssociation} per hop, except into Value/Meaning) are rejected.`;

  const panelOpen = algorithmDetailsPanelInitiallyOpen();
  const btnTitle = panelOpen ? "Hide Routing Math" : "Show Routing Math";
  const toggleSvg = `<svg class="algorithm-details-toggle__icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  const parts = [];
  parts.push(`<div class="connect-set-note-tech path-search-report" role="note">`);
  parts.push(`<div class="path-search-report__head-row">`);
  parts.push(`<div class="path-search-report__head"><strong>Strongest Legal Chain search</strong></div>`);
  const btnAria =
    panelOpen ? "Hide routing math details" : "Show routing math details";
  parts.push(
    `<button type="button" class="algorithm-details-toggle" title="${e(btnTitle)}" aria-label="${e(btnAria)}" aria-expanded="${panelOpen ? "true" : "false"}" onclick="window.toggleAlgorithmDetailsPanel(event)">${toggleSvg}</button>`
  );
  parts.push(`</div>`);
  const strictVp = !!payload.viewpointStrict && !!payload.viewpointKey;
  parts.push(
    strictVp
      ? `<div class="path-search-report__outcome"><strong>Outcome</strong> No complete route under <strong>${e(payload.viewpointShortLabel)}</strong>: the search graph is limited to this viewpoint’s element palette and the matrix links between those types. That can fail because an endpoint is outside the palette, or because no allowed chain exists (including when intermediates or links fall outside this viewpoint), within hop and exploration limits.</div>`
      : `<div class="path-search-report__outcome"><strong>Outcome</strong> No complete route: at least one segment had no path under these rules within the hop and exploration limits.</div>`
  );
  parts.push(`<div class="algorithm-debug-panel${panelOpen ? " show" : ""}">`);
  parts.push(
    `<div class="path-search-report__line"><strong>Algorithm</strong> Weighted uniform-cost search (UCS) ranks valid syntactic chains on the directed adjacency graph built from Appendix B${payload.includeDerived ? ", §5.7 inferred edges," : ""} and universal §5.2.4 Association arcs (hop costs: explicit=<strong>${payload.pathWeightDirect}</strong>, inferred=<strong>${payload.pathWeightDerived}</strong>, association=<strong>${payload.pathWeightAssociation}</strong>, layer-skip=<strong>${payload.pathWeightLayerSkip}</strong>).</div>`
  );
  parts.push(`<div class="path-search-report__line"><strong>Path mode</strong> ${e(modeLabel)}</div>`);
  parts.push(`<div class="path-search-report__line"><strong>Relationships</strong> ${relLine}</div>`);
  parts.push(`<div class="path-search-report__line"><strong>Association</strong> ${assocLine}</div>`);
  parts.push(
    `<div class="path-search-report__line"><strong>Limits</strong> Max <strong>${payload.maxDepth}</strong> hops per segment · up to <strong>${payload.maxPaths}</strong> route alternatives per segment · <strong>${effortLabel}</strong> effort (~<strong>${Number(payload.maxStates).toLocaleString()}</strong> edge relaxations budget per segment).</div>`
  );
  parts.push(`<div class="path-search-report__line"><strong>Viewpoint</strong> ${e(payload.viewpointShortLabel)}</div>`);
  parts.push(`<div class="path-search-report__line"><strong>Query</strong> ${e(payload.waypointChainDescription)}</div>`);
  parts.push(
    `<span class="connect-set-note-tech-hint">Strongest Legal Chain ranking uses your option weights: <strong>${payload.pathWeightDirect}</strong> per explicit Appendix B hop, <strong>${payload.pathWeightDerived}</strong> per inferred hop, <strong>${payload.pathWeightAssociation}</strong> per Association hop, <strong>${payload.pathWeightLayerSkip}</strong> per layer-skipping hop.</span>`
  );
  parts.push(`</div>`);
  parts.push(`</div>`);

  const probeHelped = !!(hints && (hints.derivedWouldHelp || hints.associationWouldHelp));

  parts.push(`<div class="path-search-next path-failure-suggestions" role="region" aria-label="Expand path search">`);
  parts.push(`<h4 class="path-search-next__title path-failure-suggestions__title">Next options to expand the search</h4>`);
  if (strictVp) {
    parts.push(
      `<p class="path-search-next__viewpoint-lead">A strict viewpoint is not “wrong” — it intentionally hides types and links. If the connection you need is outside <strong>${e(payload.viewpointShortLabel)}</strong>, switch to <strong>All elements</strong> (Layered) or use <strong>Expand search to full metamodel</strong> when offered.</p>`
    );
  }

  const already = [];
  if (payload.includeDerived) already.push("+ Inferred");
  if (payload.allowAssociationFallback) already.push("Association fallback");
  if (already.length) {
    parts.push(`<p class="path-search-next__already"><strong>Already enabled:</strong> ${already.join(" · ")}.</p>`);
  }

  parts.push(
    `<p class="path-failure-suggestions__note path-search-next__note">Many pairs connect without Association — Appendix B often links layers through intermediate element types. If a path appears with fallback off, it uses those normative relationships.</p>`
  );

  if (probeHelped) {
    parts.push(
      `<p class="path-search-next__probe"><strong>Automatic check:</strong> With the same hop limits and effort, widening the rules below would connect this query.</p>`
    );
    parts.push(renderPathRelaxationActionSteps(hints));
  } else {
    parts.push(
      `<p class="path-search-next__probe"><strong>Automatic check:</strong> With current hop limits and effort, enabling only + Inferred or Association fallback did not reveal a route — try the general levers below or change endpoints.</p>`
    );
  }

  parts.push(`<p class="path-search-next__generic-title"><strong>General levers</strong> (in Options unless noted)</p>`);
  parts.push(`<ul class="path-search-next__generic">`);
  if (!payload.includeDerived) {
    parts.push(
      `<li>Turn on <strong>+ Inferred</strong> for §5.7 indirect links${probeHelped ? " (see button above if the tool detected this would help)." : "."}</li>`
    );
  }
  if (!payload.allowAssociationFallback) {
    parts.push(
      `<li>Turn on <strong>Allow Association fallback</strong> for generic §5.2.4 bridges when no specific chain exists${probeHelped ? " (see button above if applicable)." : "."}</li>`
    );
  }
  if (payload.maxDepth < 12) {
    parts.push(
      `<li>Raise <strong>max hops per segment</strong> (currently ${payload.maxDepth}) if a longer chain might exist.</li>`
    );
  }
  if (payload.searchEffort !== "thorough") {
    parts.push(
      `<li>Set search effort to <strong>Thorough</strong> for a larger exploration budget on dense graphs.</li>`
    );
  }
  if (payload.viewpointKey) {
    parts.push(
      `<li>Switch viewpoint to <strong>All elements</strong> if intermediates might be outside the current palette.</li>`
    );
  }
  if (payload.mode === "ordered" && payload.waypointCount === 2) {
    parts.push(`<li>Add an <strong>intermediate waypoint</strong> to split one long segment into two shorter searches.</li>`);
  }
  if (payload.mode === "set" && payload.connectSetDistinctCount >= 2) {
    parts.push(
      `<li>In <strong>Connect set</strong>, fewer points or a different combination can change whether a Hamiltonian-style chain exists within depth limits.</li>`
    );
  }
  parts.push(`</ul>`);
  parts.push(`</div>`);

  return parts.join("\n");
}

/**
 * @deprecated Prefer renderPathSearchDiagnostics; kept for any direct callers.
 */
function renderPathFailureSuggestions(hints) {
  if (!hints || (!hints.derivedWouldHelp && !hints.associationWouldHelp)) return "";
  const parts = [];
  parts.push(`<div class="path-failure-suggestions" role="region" aria-label="Widen path search">`);
  parts.push(`<h4 class="path-failure-suggestions__title">Widen the search</h4>`);
  parts.push(
    `<p class="path-failure-suggestions__lead">No route matched your <strong>current</strong> rules.</p>`
  );
  parts.push(renderPathRelaxationActionSteps(hints));
  parts.push(`</div>`);
  return parts.join("\n");
}

function explainNoPath(fromEl, toEl, reason = "unknown", opts = {}) {
  const {
    failingSegmentIndex = null,
    waypointChain = null,
    totalSegments = null,
    selectionMode = "set",
    academicDirectBlocked = false,
  } = opts;

  const fromAspect = getAspect(fromEl);
  const toAspect   = getAspect(toEl);
  const fromLayer  = getLayer(fromEl);
  const toLayer    = getLayer(toEl);
  const ruleKey    = getAspectRuleKey(fromEl, toEl);
  const aspectRule = ASPECT_RULES[ruleKey];

  const parts = [];

  const academicExplainBlock = academicDirectBlocked
    ? `<div class="path-dead-end__academic-block explain-no-path__academic" role="alert"><strong>🛑 Path Blocked.</strong> There is no direct structural relationship between these elements, and your &quot;Academic&quot; Rigor setting forbids Association fallbacks. Try switching Search Depth to <strong>+ Inferred</strong> for §5.7 links, or lower your Rigor to &quot;Pragmatic&quot; to allow Association bridges.</div>`
    : "";

  parts.push(`
    <div class="explain-no-path">
      <h3>No valid path found</h3>
      ${academicExplainBlock}
      <p><strong>${escPathDiag(fromEl)}</strong> → <strong>${escPathDiag(toEl)}</strong></p>
    </div>`);

  if (
    selectionMode === "ordered" &&
    Array.isArray(waypointChain) &&
    waypointChain.length >= 2
  ) {
    const chain = waypointChain.map((n) => escPathDiag(n)).join(" → ");
    const segTxt =
      failingSegmentIndex != null && typeof totalSegments === "number" && totalSegments > 0
        ? ` <em>(segment ${failingSegmentIndex + 1} of ${totalSegments})</em>`
        : "";
    parts.push(
      `<p class="explain-no-path-ordered">In <strong>Ordered</strong> mode the tool walks your chain in sequence: <strong>${chain}</strong>. Appendix B relationships are <strong>directed</strong> (tail → head). The first hop that cannot be completed under your current search rules is <strong>${escPathDiag(fromEl)} → ${escPathDiag(toEl)}</strong>${segTxt}.</p>`
    );
  }

  parts.push(elementSummary(fromEl));
  parts.push(elementSummary(toEl));

  if (reason === "viewpoint") {
    parts.push(`
      <div class="explain-reason">
        <strong>Reason: Limited by the active viewpoint</strong><br/>
        The tool found a route in the full Appendix B graph, but not when restricted to the selected viewpoint’s element types and allowed matrix links. That usually means an endpoint is outside the viewpoint palette, or every chain would need intermediates or relationship types this viewpoint does not include. Switch to <strong>All elements</strong> (Layered) or expand the search to the full metamodel to see a path without that filter.
      </div>`);
    return parts.join("\n");
  }

  if (reason === "depth") {
    parts.push(`
      <div class="explain-reason">
        <strong>Reason: No path within ${4} hops</strong><br/>
        These elements may be connected via a longer path, but ArchiTrek
        limits each segment to 4 hops for clarity. Consider adding
        an intermediate waypoint to break the path into shorter segments.
      </div>`);
    return parts.join("\n");
  }

  if (aspectRule?.invalid) {
    parts.push(`
      <div class="explain-reason explain-reason-invalid">
        <strong>Metamodel incompatibility</strong>
        <cite>${aspectRule.section}</cite><br/>
        <em>${fromAspect}</em> → <em>${toAspect}</em>: ${aspectRule.explanation}
        <p>
          In the ArchiMate metamodel, <strong>${fromAspect}</strong> elements
          (like ${fromEl}) are not permitted to connect directly to
          <strong>${toAspect}</strong> elements (like ${toEl}) in this direction.
          This is not a limitation of the tool — it reflects a normative rule
          in the ArchiMate specification.
        </p>
      </div>`);
  } else {
    parts.push(`
      <div class="explain-reason">
        <strong>No route in Appendix B</strong><br/>
        <em>${fromAspect}</em> (${fromLayer}) → <em>${toAspect}</em> (${toLayer}):
        While these aspects are not inherently incompatible, Appendix B does not
        define a direct or derived relationship between <strong>${fromEl}</strong>
        and <strong>${toEl}</strong> under the current hop limit and filters.
        <br/><br/>
        Try:
        <ul>
          <li>Adding a waypoint to break the path into two segments</li>
          <li>Setting <strong>Explicit vs +Inferred</strong> to <strong>+ Inferred</strong> (§5.7 edges in the graph)</li>
          <li>Using a looser <strong>Semantic rigor</strong> preset (e.g. Discovery) or enabling Association in <strong>Advanced options → Advanced Logic Overrides</strong> (§5.2.4 — flagged as a weak link in results)</li>
          <li>Disabling the viewpoint filter</li>
        </ul>
      </div>`);
  }

  parts.push(renderAspectGrid(fromAspect, toAspect, fromEl, toEl));

  return parts.join("\n");
}

/** Two-line direct / derived for the highlighted aspect cell (exact element pair in MATRIX). */
function formatMatrixCodesForHopCell(fromEl, toEl) {
  if (!fromEl || !toEl || typeof MATRIX === "undefined") return null;
  for (let i = 0; i < MATRIX.length; i++) {
    const row = MATRIX[i];
    if (row.from === fromEl && row.to === toEl) {
      const d = (row.direct || []).length ? (row.direct || []).join(", ") : "—";
      const der = (row.derived || []).length ? (row.derived || []).join(", ") : "—";
      return `<span class="aspect-cell-hop-matrix">
        <span class="aspect-cell-hop-matrix__row"><span class="aspect-cell-hop-matrix__lab">direct</span> ${d}</span>
        <span class="aspect-cell-hop-matrix__row"><span class="aspect-cell-hop-matrix__lab">derived</span> ${der}</span>
      </span>`;
    }
  }
  return null;
}

function renderAspectGrid(highlightFrom, highlightTo, fromElName = "", toElName = "") {
  const aspects = ["Active Structure", "Behavior", "Passive Structure", "Motivation"];
  const ids     = ["active", "behavior", "passive", "motivation"];

  const LEGEND = [
    { code: "I", name: "Assignment" },
    { code: "R", name: "Realization" },
    { code: "V", name: "Serving" },
    { code: "A", name: "Access" },
    { code: "N", name: "Influence" },
    { code: "O", name: "Association" },
    { code: "T", name: "Triggering" },
    { code: "F", name: "Flow" },
    { code: "C", name: "Composition" },
    { code: "G", name: "Aggregation" },
    { code: "S", name: "Specialization" },
  ];

  const legendHtml = LEGEND.map(l =>
    `<span style="white-space:nowrap"><strong>${l.code}</strong> = ${l.name}</span>`
  ).join(" &nbsp;·&nbsp; ");

  let html = `
    <div class="explain-aspect-grid">
      <div class="aspect-grid-header">
        <h4>ArchiMate Metamodel — Aspect Compatibility</h4>
        <div class="aspect-grid-sub">
          Typical aspect-level patterns (§4.2). Exact letters for a hop follow the normative matrix for that element pair and may differ.
          <span class="aspect-grid-source">Source: §4.2</span>
        </div>
        ${(fromElName || toElName) ? `
          <div style="margin-top:6px;font-size:12px;color:var(--text-2)">
            <strong>Current hop:</strong>
            FROM <strong>${fromElName || "—"}</strong> <span style="color:var(--text-3)">(${highlightFrom})</span>
            → TO <strong>${toElName || "—"}</strong> <span style="color:var(--text-3)">(${highlightTo})</span>
          </div>
        ` : ``}
      </div>
      <div class="aspect-grid-wrap" role="region" aria-label="Aspect compatibility grid">
        <table class="aspect-grid-table">
          <thead>
            <tr>
              <th class="aspect-grid-corner">
                <div class="aspect-grid-corner-top">TO →</div>
                <div class="aspect-grid-corner-bottom">FROM ↓</div>
              </th>
              ${aspects.map(a => {
                const tag = (a === highlightTo && toElName)
                  ? `<div style="margin-top:2px;font-size:10px;color:var(--text-3);font-weight:500">TO: ${toElName}</div>`
                  : "";
                return `<th scope="col"><div>${a}${tag}</div></th>`;
              }).join("")}
            </tr>
          </thead>
          <tbody>`;

  for (let r = 0; r < aspects.length; r++) {
    const rowTag = (aspects[r] === highlightFrom && fromElName)
      ? `<div style="margin-top:2px;font-size:10px;color:var(--text-3);font-weight:500">FROM: ${fromElName}</div>`
      : "";
    html += `<tr><th scope="row"><div>${aspects[r]}${rowTag}</div></th>`;
    for (let c = 0; c < aspects.length; c++) {
      const key  = `${ids[r]}→${ids[c]}`;
      const rule = ASPECT_RULES[key];
      const isHighlight = aspects[r] === highlightFrom && aspects[c] === highlightTo;
      const isValid = rule && !rule.invalid && rule.permitted.length > 0;
      const cellClass = [
        isHighlight ? "cell-highlight" : "",
        isValid     ? "cell-valid"     : "cell-invalid",
      ].filter(Boolean).join(" ");
      const hopMatrix =
        isHighlight && fromElName && toElName ? formatMatrixCodesForHopCell(fromElName, toElName) : null;
      const cellContent = hopMatrix
        ? hopMatrix
        : isValid
          ? `<span class="aspect-cell-codes">${(rule.naturalCodes.join(", ") || "✓")}</span>`
          : `<span class="aspect-cell-x" aria-label="Not permitted">✗</span>`;
      const title = rule?.explanation ?? "";
      html += `<td class="${cellClass}" title="${title}">${cellContent}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table>
      </div>
      <div class="aspect-grid-legend">
        <strong>Relationship codes:</strong>
        <div class="aspect-grid-legend-items">${legendHtml}</div>
      </div>
    </div>`;
  return html;
}


function el(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function makeArrowMarker(id, color) {
  const marker = el("marker", {
    id,
    markerWidth: "8",
    markerHeight: "8",
    markerUnits: "strokeWidth",
    refX: "8",
    refY: "4",
    orient: "auto",
    viewBox: "0 0 8 8",
  });
  const poly = el("polygon", { points: "0 0, 8 4, 0 8", fill: color });
  marker.appendChild(poly);
  return marker;
}

function makeDiamondMarker(id, color) {
  const marker = el("marker", {
    id,
    markerWidth: "8",
    markerHeight: "8",
    markerUnits: "strokeWidth",
    refX: "8",
    refY: "4",
    orient: "auto",
    viewBox: "0 0 8 8",
  });
  const poly = el("polygon", {
    points: "0 4, 4 0, 8 4, 4 8",
    fill: "none", stroke: color, "stroke-width": "1.2",
  });
  marker.appendChild(poly);
  return marker;
}

let _svg = null;
const _boxEls  = {};
const _arrowEls = {};

function renderMetamodelDiagram(container) {
  container.innerHTML = "";

  const svg = el("svg", {
    xmlns: SVG_NS,
    viewBox: `0 0 ${W} ${H}`,
    width: "100%",
    style: "max-width:680px; font-family: Georgia, serif;",
  });
  _svg = svg;

  const defs = el("defs", {});
  defs.appendChild(makeArrowMarker("mm-arrow-default", COLORS.arrowStroke));
  defs.appendChild(makeDiamondMarker("mm-diamond-default", COLORS.arrowStroke));
  defs.appendChild(makeArrowMarker("mm-arrow-valid", COLORS.validArrow));
  defs.appendChild(makeDiamondMarker("mm-diamond-valid", COLORS.validArrow));
  defs.appendChild(makeArrowMarker("mm-arrow-invalid", COLORS.invalidArrow));
  defs.appendChild(makeDiamondMarker("mm-diamond-invalid", COLORS.invalidArrow));
  defs.appendChild(makeArrowMarker("mm-arrow-neutral", COLORS.neutralArrow));
  svg.appendChild(defs);

  // Layers: boxes first, then arrows/labels on top so arrow heads are not hidden
  // behind filled rectangles (common when an arrow points “into” a box).
  const boxLayer = el("g", { id: "mm-layer-boxes" });
  const arrowLayer = el("g", { id: "mm-layer-arrows" });

  for (const [role, box] of Object.entries(BOXES)) {
    const g = el("g", { id: box.id, class: "mm-box", "data-role": role });
    const rect = el("rect", {
      x: box.x, y: box.y, width: box.w, height: box.h,
      fill: COLORS.boxFill,
      stroke: COLORS.boxStroke,
      "stroke-width": COLORS.boxStrokeW,
      rx: 2, ry: 2,
    });
    g.appendChild(rect);

    const lineH = 16;
    const totalH = box.label.length * lineH;
    const startY = box.y + box.h / 2 - totalH / 2 + lineH / 2;

    box.label.forEach((line, i) => {
      const t = el("text", {
        x: box.x + box.w / 2,
        y: startY + i * lineH,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": "11",
        "font-family": "Georgia, serif",
        "font-weight": "bold",
        "font-style": "italic",
        fill: "#111",
      });
      t.textContent = line;
      g.appendChild(t);
    });

    boxLayer.appendChild(g);
    _boxEls[role] = g;
  }

  for (const arrow of ARROWS) {
    const g = el("g", { id: arrow.id, class: "mm-arrow" });
    const pathEl = el("path", {
      d: arrow.path,
      stroke: COLORS.arrowStroke,
      "stroke-width": COLORS.arrowStrokeW,
      fill: "none",
      "marker-end": arrow.markerEnd === "arrow"   ? "url(#mm-arrow-default)"   :
                    arrow.markerEnd === "diamond"  ? "url(#mm-diamond-default)" : "",
    });
    g.appendChild(pathEl);

    const lines = arrow.label.split("\n");
    lines.forEach((line, i) => {
      const t = el("text", {
        x: arrow.labelX,
        y: arrow.labelY + i * 13,
        "text-anchor": "middle",
        "font-size": "9.5",
        "font-family": "Georgia, serif",
        fill: COLORS.labelFill,
        "paint-order": "stroke",
        stroke: "#ffffff",
        "stroke-width": "3",
        "stroke-linejoin": "round",
      });
      t.textContent = line;
      g.appendChild(t);
    });

    arrowLayer.appendChild(g);
    _arrowEls[arrow.id] = g;
  }

  svg.appendChild(boxLayer);
  svg.appendChild(arrowLayer);

  container.appendChild(svg);
}

function resetHighlights() {
  if (!_svg) return;

  _svg.querySelector("#mm-invalid-overlay")?.remove();
  _svg.querySelector("#mm-invalid-cross")?.remove();
  _svg.querySelector("#mm-annotations")?.remove();
  _svg.querySelectorAll(".mm-arrow .mm-label-bg").forEach(n => n.remove());

  for (const g of Object.values(_boxEls)) {
    const rect = g.querySelector("rect");
    if (rect) {
      rect.setAttribute("fill", COLORS.boxFill);
      rect.setAttribute("stroke", COLORS.boxStroke);
      rect.setAttribute("stroke-width", COLORS.boxStrokeW);
    }
  }

  for (const g of Object.values(_arrowEls)) {
    const path = g.querySelector("path");
    if (path) {
      path.setAttribute("stroke", COLORS.arrowStroke);
      path.setAttribute("stroke-width", COLORS.arrowStrokeW);
      path.setAttribute("opacity", "1");
      const arrowDef = ARROWS.find(a => a.id === g.id);
      if (arrowDef) {
        path.setAttribute("marker-end",
          arrowDef.markerEnd === "arrow"   ? "url(#mm-arrow-default)"   :
          arrowDef.markerEnd === "diamond" ? "url(#mm-diamond-default)" : ""
        );
      }
    }
  }
}

function annotateMetamodel(fromRole, toRole, fromElName, toElName) {
  if (!_svg) return;
  _svg.querySelector("#mm-annotations")?.remove();
  if (!fromRole && !toRole) return;

  const g = el("g", { id: "mm-annotations" });

  const truncate = (s, max) => {
    if (!s || s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  };

  /** Labels sit *below* each box so they are not covered by the generic §4.2 box titles. */
  const addBelowBox = (role, elName, kind) => {
    if (!role || !elName) return;
    const box = BOXES[role];
    if (!box) return;
    const cx = box.x + box.w / 2;
    const display = truncate(String(elName), 44);
    const yKind = box.y + box.h + 12;
    const yName = box.y + box.h + 28;

    const tKind = el("text", {
      x: cx,
      y: yKind,
      "text-anchor": "middle",
      "font-size": "9",
      "font-family": "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fill: "#0f172a",
      opacity: "0.88",
    });
    tKind.textContent = kind;

    const tName = el("text", {
      x: cx,
      y: yName,
      "text-anchor": "middle",
      "font-size": "11.5",
      "font-weight": "700",
      "font-family": "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fill: "#022c22",
    });
    tName.textContent = display;

    g.appendChild(tKind);
    g.appendChild(tName);

    _svg.appendChild(g);
    const pad = 6;
    const bb1 = tKind.getBBox();
    const bb2 = tName.getBBox();
    const bx = Math.min(bb1.x, bb2.x) - pad;
    const by = Math.min(bb1.y, bb2.y) - pad;
    const bw = Math.max(bb1.x + bb1.width, bb2.x + bb2.width) - bx + pad;
    const bh = Math.max(bb1.y + bb1.height, bb2.y + bb2.height) - by + pad;
    const r = el("rect", {
      class: "mm-anno-bg",
      x: bx,
      y: by,
      width: bw,
      height: bh,
      rx: 8,
      ry: 8,
      fill: "#ffffff",
      opacity: "0.97",
      stroke: "#047857",
      "stroke-width": "1.5",
    });
    g.insertBefore(r, tKind);
  };

  const sameBox =
    fromRole &&
    toRole &&
    fromRole === toRole &&
    fromElName &&
    toElName &&
    fromElName !== toElName;

  if (sameBox) {
    const box = BOXES[fromRole];
    if (box) {
      const cx = box.x + box.w / 2;
      const a = truncate(String(fromElName), 40);
      const b = truncate(String(toElName), 40);
      const t1 = el("text", {
        x: cx,
        y: box.y + box.h + 12,
        "text-anchor": "middle",
        "font-size": "9",
        "font-family": "ui-sans-serif, system-ui, sans-serif",
        fill: "#0f172a",
      });
      t1.textContent = `From: ${a}`;
      const t2 = el("text", {
        x: cx,
        y: box.y + box.h + 28,
        "text-anchor": "middle",
        "font-size": "11",
        "font-weight": "700",
        "font-family": "ui-sans-serif, system-ui, sans-serif",
        fill: "#022c22",
      });
      t2.textContent = `To: ${b}`;
      g.appendChild(t1);
      g.appendChild(t2);
      _svg.appendChild(g);
      const pad = 6;
      const bb1 = t1.getBBox();
      const bb2 = t2.getBBox();
      const bx = Math.min(bb1.x, bb2.x) - pad;
      const by = Math.min(bb1.y, bb2.y) - pad;
      const bw = Math.max(bb1.x + bb1.width, bb2.x + bb2.width) - bx + pad;
      const bh = Math.max(bb1.y + bb1.height, bb2.y + bb2.height) - by + pad;
      const r = el("rect", {
        class: "mm-anno-bg",
        x: bx,
        y: by,
        width: bw,
        height: bh,
        rx: 8,
        ry: 8,
        fill: "#ffffff",
        opacity: "0.97",
        stroke: "#047857",
        "stroke-width": "1.5",
      });
      g.insertBefore(r, t1);
    }
  } else {
    if (fromRole && fromElName) addBelowBox(fromRole, fromElName, "From");
    if (toRole && toElName && (toRole !== fromRole || toElName !== fromElName)) {
      addBelowBox(toRole, toElName, "To");
    }
  }

  if (!g.parentNode) _svg.appendChild(g);
}

function emphasizeArrowLabels(arrowIds = []) {
  if (!_svg) return;
  _svg.querySelectorAll(".mm-arrow .mm-label-bg").forEach(n => n.remove());
  for (const id of arrowIds) {
    const g = _arrowEls[id];
    if (!g) continue;
    const texts = Array.from(g.querySelectorAll("text"));
    for (const t of texts) {
      const bb = t.getBBox();
      const r = el("rect", {
        class: "mm-label-bg",
        x: bb.x - 6,
        y: bb.y - 4,
        width: bb.width + 12,
        height: bb.height + 8,
        rx: 10, ry: 10,
        fill: "#111",
        opacity: "0.90",
      });
      g.insertBefore(r, t);
      t.setAttribute("fill", "#fff");
      t.setAttribute("stroke", "none");
    }
  }
}

function highlightMetamodel(fromRole = null, toRole = null, isValid = true) {
  resetHighlights();

  if (!fromRole && !toRole) return;

  const color = isValid ? COLORS.validStroke  : COLORS.invalidStroke;
  const fill  = isValid ? COLORS.validFill    : COLORS.invalidFill;
  const arrowColor = isValid ? COLORS.validArrow  : COLORS.invalidArrow;
  const markerId   = isValid ? "mm-arrow-valid"   : "mm-arrow-invalid";
  const diamondId  = isValid ? "mm-diamond-valid" : "mm-diamond-invalid";

  if (fromRole && _boxEls[fromRole]) {
    const rect = _boxEls[fromRole].querySelector("rect");
    if (rect) {
      rect.setAttribute("fill", fill);
      rect.setAttribute("stroke", color);
      rect.setAttribute("stroke-width", "5");
    }
  }

  if (toRole && toRole !== fromRole && _boxEls[toRole]) {
    const rect = _boxEls[toRole].querySelector("rect");
    if (rect) {
      rect.setAttribute("fill", fill);
      rect.setAttribute("stroke", color);
      rect.setAttribute("stroke-width", "5");
    }
  }

  for (const g of Object.values(_arrowEls)) {
    const path = g.querySelector("path");
    if (path) {
      path.setAttribute("stroke", COLORS.neutralArrow);
      path.setAttribute("opacity", "0.35");
      path.setAttribute("marker-end", "url(#mm-arrow-neutral)");
    }
  }

  // Match hop direction only. The §4.2 figure often has two arrows between the same two
  // boxes (e.g. “assigned to” vs “serves”); picking both directions mis-labels the hop.
  const relevantArrows = ARROWS.filter(a => {
    if (fromRole === toRole) {
      return a.roles[0] === fromRole && a.roles[1] === fromRole;
    }
    return a.roles[0] === fromRole && a.roles[1] === toRole;
  });

  for (const arrowDef of relevantArrows) {
    const g = _arrowEls[arrowDef.id];
    if (!g) continue;
    const path = g.querySelector("path");
    if (path) {
      path.setAttribute("stroke", arrowColor);
      path.setAttribute("stroke-width", "3.5");
      path.setAttribute("opacity", "1");
      path.setAttribute("marker-end",
        arrowDef.markerEnd === "arrow"   ? `url(#${markerId})`   :
        arrowDef.markerEnd === "diamond" ? `url(#${diamondId})` : ""
      );
    }
  }

  emphasizeArrowLabels(relevantArrows.map(a => a.id));

  if (!isValid && relevantArrows.length === 0) {
    drawInvalidOverlay(fromRole, toRole);
  }
}

function drawInvalidOverlay(fromRole, toRole) {
  if (!_svg) return;

  const fromBox = BOXES[fromRole];
  const toBox   = BOXES[toRole];
  if (!fromBox || !toBox) return;

  const x1 = fromBox.x + fromBox.w / 2;
  const y1 = fromBox.y + fromBox.h / 2;
  const x2 = toBox.x   + toBox.w   / 2;
  const y2 = toBox.y   + toBox.h   / 2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  const line = el("path", {
    id: "mm-invalid-overlay",
    d: `M${x1},${y1} L${x2},${y2}`,
    stroke: COLORS.invalidArrow,
    "stroke-width": "2",
    "stroke-dasharray": "6,4",
    fill: "none",
    opacity: "0.7",
  });
  _svg.appendChild(line);

  const cross = el("text", {
    id: "mm-invalid-cross",
    x: mx, y: my + 5,
    "text-anchor": "middle",
    "font-size": "20",
    "font-weight": "bold",
    fill: COLORS.invalidArrow,
    opacity: "0.85",
  });
  cross.textContent = "✗";
  _svg.appendChild(cross);
}

const _originalReset = resetHighlights;
function resetHighlightsWithOverlay() {
  _originalReset();
  if (_svg) {
    _svg.querySelector("#mm-invalid-overlay")?.remove();
    _svg.querySelector("#mm-invalid-cross")?.remove();
  }
}

function getMetamodelBoxKey(role) {
  const MAP = {
    "external-active":   "external-active",
    "internal-active":   "internal-active",
    "external-behavior": "external-behavior",
    "internal-behavior": "internal-behavior",
    "event":             "event",
    "passive":           "passive",
    "motivation":        null,
    "strategy":          null,
    "composite":         null,
    "implementation":    null,
  };
  return MAP[role] ?? null;
}

window.resolvedRelationshipCodeForHop = resolvedRelationshipCodeForHop;
window.edgeChoiceCommittedForHop = edgeChoiceCommittedForHop;
window.appendixMatrixCodesForPathHopIndex = appendixMatrixCodesForPathHopIndex;
window.edgeChoiceCommittedForPathHop = edgeChoiceCommittedForPathHop;
window.relationshipPickerCodesFromMatrixCodes = relationshipPickerCodesFromMatrixCodes;
window.reverseRelationshipCodesForDirectedPair = reverseRelationshipCodesForDirectedPair;