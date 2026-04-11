// === ui/rendererUtils.js ===
/**
 * Shared pure-ish helper functions used by ui/renderer.js.
 * This transitional module keeps globals while reducing renderer.js size.
 */
(function rendererUtilsBootstrap() {
  "use strict";

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function horizontalStrokeEndXForLabel(x1, x2, y1, y2, orthogonal) {
    const clr = ARROW_MARKER_TARGET_CLEARANCE;
    if (Math.abs(y1 - y2) >= 0.5) return x2;
    if (orthogonal) {
      if (Math.abs(x2 - x1) > clr) return x2 + Math.sign(x1 - x2) * clr;
      return x2;
    }
    if (Math.abs(x2 - x1) > clr) return x2 + Math.sign(x1 - x2) * clr;
    return x2;
  }

  function horizontalRelLabelStackHalfH(labelLines, hopIndex, showHopNumbers, codesList) {
    const hasHopBadge = showHopNumbers && hopIndex != null;
    const hopBadgeR = hasHopBadge ? (codesList.length > 1 ? 9 : 7) : 0;
    const rawLen = (labelLines ?? []).length;
    const nLinesH = rawLen === 0 ? 0 : Math.max(1, rawLen);
    const lineHH = 10.0;
    const textHalfH =
      nLinesH === 0 ? 0 : Math.max(lineHH * 0.56, (nLinesH * lineHH) / 2);
    const multilineExtra = nLinesH > 1 ? 2 : 0;
    return Math.max(hasHopBadge ? hopBadgeR + 1 : 0, textHalfH) + multilineExtra;
  }

  function shadeHex(hex, amt) {
    const h = (hex || "").trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if (!m) return hex;
    const num = parseInt(m[1], 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    const t = amt >= 0 ? 255 : 0;
    const p = Math.abs(amt);
    const rr = Math.round((t - r) * p + r);
    const gg = Math.round((t - g) * p + g);
    const bb = Math.round((t - b) * p + b);
    return `#${((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1)}`;
  }

  function wrapLabel(text, maxChars = REL_LABEL_MAX_CHARS, maxLines = REL_LABEL_MAX_LINES) {
    const raw = String(text ?? "").trim();
    if (!raw) return [""];

    const tokens = raw
      .replace(/\s*\/\s*/g, " / ")
      .split(/\s+/)
      .filter(Boolean);

    const lines = [];
    let current = "";
    const push = () => {
      if (current.trim()) lines.push(current.trim());
      current = "";
    };

    for (const tok of tokens) {
      const next = current ? `${current} ${tok}` : tok;
      if (next.length > maxChars && current) {
        push();
        current = tok;
      } else {
        current = next;
      }
      if (lines.length >= maxLines) break;
    }
    push();

    const consumed = lines.join(" ").length;
    if (consumed < raw.length && lines.length) {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\s+$/, "") + "…";
    }
    return lines.slice(0, Math.max(1, maxLines));
  }

  function swimlaneLabelRectHitsObstacles(rect, obstacles) {
    for (const r of obstacles) {
      if (!(rect.right <= r.left || rect.left >= r.right || rect.bottom <= r.top || rect.top >= r.bottom)) {
        return true;
      }
    }
    return false;
  }

  function swimlaneCountLabelObstacleHits(rawRect, obstacles) {
    const pad = 10;
    const rect = {
      left: rawRect.left - pad,
      right: rawRect.right + pad,
      top: rawRect.top - pad,
      bottom: rawRect.bottom + pad,
    };
    let n = 0;
    for (const o of obstacles) {
      if (!(rect.right <= o.left || rect.left >= o.right || rect.bottom <= o.top || rect.top >= o.bottom)) n++;
    }
    return n;
  }

  function clampVertStraddleLabelYToSegment(labelY, yLoL, yHiL, labelLines, codesList, hopIndex, showHopNumbers) {
    const relLineH = 11.5;
    const rawLen = (labelLines ?? []).length;
    const nLines = rawLen === 0 ? 0 : Math.max(1, rawLen);
    const showHop = hopIndex != null && showHopNumbers;
    const badgeR = showHop ? (codesList.length > 1 ? 11 : 9) : 0;
    const textHalfH =
      nLines === 0 ? 0 : Math.max(relLineH * 0.56, (nLines * relLineH) / 2);
    const stackHalfH = Math.max(showHop ? badgeR + 2 : 0, textHalfH);
    const edgePad = 3;
    const lenL = yHiL - yLoL;
    if (lenL <= 1e-6) return labelY;
    const safeTop = yLoL + stackHalfH + edgePad;
    const safeBottom = yHiL - stackHalfH - edgePad;
    if (safeTop <= safeBottom) {
      return clamp(labelY, safeTop, safeBottom);
    }
    return (yLoL + yHiL) / 2;
  }

  function estimateSwimlaneVertStraddleLabelRect({
    straddleAnchorX,
    labelY,
    straddleExtraX,
    effectiveVerticalStraddleWest,
    straddleLineStrokeX,
    forceBadgeCenterOffsetFromLineEast,
    labelLines,
    codesList,
    hopIndex,
    showHopNumbers,
  }) {
    const hasChoices = codesList.length > 1;
    const fontSize = 8.5;
    const relLineH = 11.5;
    const badgeR = hasChoices ? 9 : 7;
    const showHop = hopIndex != null && showHopNumbers;
    const textGap =
      straddleLineStrokeX != null && Number.isFinite(straddleLineStrokeX)
        ? Math.max(VERT_BADGE_NAME_GAP, SPINE_TEXT_GAP_AFTER_BADGE)
        : VERT_BADGE_NAME_GAP;
    const lines = labelLines ?? [];
    const nLines = lines.length === 0 ? 0 : Math.max(1, lines.length);
    const approxTextW =
      nLines === 0 ? 0 : Math.min(170, Math.max(48, lines.join(" ").length * (fontSize * 0.55)));
    const textStartXEast = showHop ? 2 * badgeR + textGap : 0;
    const approxW = textStartXEast + approxTextW + 18;
    const textHalfH =
      nLines === 0 ? 0 : Math.max(relLineH * 0.56, (nLines * relLineH) / 2);
    const stackHalfH = Math.max((showHop ? badgeR : 0) + 2, textHalfH);

    let stackX;
    let circleCx = showHop ? badgeR : 0;
    if (effectiveVerticalStraddleWest) {
      stackX = straddleAnchorX - straddleExtraX - BADGE_LINE_CLEARANCE - approxW;
      circleCx = approxTextW + textGap + badgeR;
    } else {
      stackX = straddleAnchorX + straddleExtraX + BADGE_LINE_CLEARANCE;
      circleCx = badgeR;
    }

    if (straddleLineStrokeX != null && Number.isFinite(straddleLineStrokeX)) {
      const lineX = straddleLineStrokeX;
      const lineBuf = Math.max(
        SPINE_BADGE_CLEAR_FROM_LINE,
        typeof LABEL_TO_LINE_BUFFER_PX === "number" ? LABEL_TO_LINE_BUFFER_PX : 15,
      );
      if (effectiveVerticalStraddleWest) {
        const circleRight = stackX + circleCx + badgeR;
        const maxRight = lineX - lineBuf;
        if (circleRight > maxRight) {
          stackX -= circleRight - maxRight;
        }
      } else {
        if (forceBadgeCenterOffsetFromLineEast != null && Number.isFinite(forceBadgeCenterOffsetFromLineEast)) {
          stackX = lineX + forceBadgeCenterOffsetFromLineEast - circleCx + (straddleAnchorX - lineX);
        }
        const leftEdge = stackX;
        const minLeft = lineX + lineBuf;
        if (leftEdge < minLeft) {
          stackX += minLeft - leftEdge;
        }
      }
    }

    return {
      left: stackX,
      right: stackX + approxW,
      top: labelY - stackHalfH,
      bottom: labelY + stackHalfH,
    };
  }

  function estimateSwimlaneHorizontalLabelRect(labelLineX, labelY, labelLines, hopIndex, showHopNumbers, hasChoices) {
    const fontSize = 8.5;
    const lineH = 10.0;
    const showHop = hopIndex != null && showHopNumbers;
    const lines = labelLines ?? [];
    const nLines = lines.length === 0 ? 0 : Math.max(1, lines.length);
    const approxTextW =
      nLines === 0 ? 0 : Math.min(170, Math.max(48, lines.join(" ").length * (fontSize * 0.55)));
    const badgeR = hasChoices ? 9 : 7;
    const textStartX = showHop ? 2 * badgeR + VERT_BADGE_NAME_GAP : 0;
    const totalW = textStartX + approxTextW;
    const textHalfH =
      nLines === 0 ? 0 : Math.max(lineH * 0.56, (nLines * lineH) / 2);
    const multilineExtra = nLines > 1 ? 2 : 0;
    const stackHalfH = Math.max(showHop ? badgeR + 1 : 0, textHalfH) + multilineExtra;
    const pad = 8;
    return {
      left: labelLineX - totalW / 2 - pad,
      right: labelLineX + totalW / 2 + pad,
      top: labelY - stackHalfH - pad,
      bottom: labelY + stackHalfH + pad,
    };
  }

  function segmentsFromOrthogonalD(d) {
    if (!d || typeof d !== "string") return null;
    const u = d.trim();
    if (/\b[QC]/i.test(u)) return null;
    const pts = [];
    const re = /[ML]\s*([\d.-]+)\s*([\d.-]+)/gi;
    let m;
    while ((m = re.exec(u)) !== null) {
      pts.push({ x: +m[1], y: +m[2] });
    }
    if (pts.length < 2) return null;
    const segs = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const kind = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      segs.push({
        a,
        b,
        len,
        kind,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      });
    }
    return segs.length ? { segs } : null;
  }

  function verticalStraddleYExtentFromOrthoPath(parsedOrtho) {
    if (!parsedOrtho?.segs?.length) return null;
    const ys = [];
    for (const s of parsedOrtho.segs) {
      if (s.kind !== "v" || s.len < 1e-6) continue;
      ys.push(s.a.y, s.b.y);
    }
    if (!ys.length) return null;
    return { yLo: Math.min(...ys), yHi: Math.max(...ys) };
  }

  function rectEdgeLabelInflate(r, pad) {
    return {
      left: r.left - pad,
      right: r.right + pad,
      top: r.top - pad,
      bottom: r.bottom + pad,
    };
  }

  function rectsOverlapLabelSpace(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function createEdgeLabelSpaceRegistry() {
    const rects = [];
    return {
      addObstacle(r) {
        rects.push({ ...r, _kind: "obs" });
      },
      reserveLabel(r) {
        rects.push({ ...r, _kind: "lab" });
      },
      conflicts(r) {
        for (const x of rects) {
          if (rectsOverlapLabelSpace(r, x)) return true;
        }
        return false;
      },
      resolvePlacement(baseRect) {
        const pad = 2;
        const test = rectEdgeLabelInflate(baseRect, pad);
        const offsets = buildEdgeLabelCollisionOffsets();
        for (const [dx, dy] of offsets) {
          const shifted = {
            left: test.left + dx,
            right: test.right + dx,
            top: test.top + dy,
            bottom: test.bottom + dy,
          };
          if (!this.conflicts(shifted)) {
            this.reserveLabel(shifted);
            return { dx, dy };
          }
        }
        this.reserveLabel(test);
        return { dx: 0, dy: 0 };
      },
    };
  }

  function buildEdgeLabelCollisionOffsets() {
    const out = [[0, 0]];
    const steps = [11, 18, 26, 34, 44, 54, 66, 78];
    for (const s of steps) {
      out.push([0, s], [0, -s], [s, 0], [-s, 0], [s, s], [s, -s], [-s, s], [-s, -s]);
    }
    return out;
  }

  function nudgeSwimlaneRelLabelAgainstObstacles({
    labelLineX,
    labelY,
    straddleAnchorX,
    useVertStraddle,
    effectiveVerticalStraddleWest,
    straddleExtraX,
    straddleLineStrokeX,
    forceBadgeCenterOffsetFromLineEast,
    labelLines,
    codesList,
    hopIndex,
    showHopNumbers,
    obstacles,
  }) {
    if (!obstacles || obstacles.length === 0) {
      return { labelLineX, labelY, straddleAnchorX };
    }
    const hasChoices = codesList.length > 1;
    const tryOffset = (dx, dy) => {
      const sax = straddleAnchorX + (useVertStraddle ? dx : 0);
      const lx = labelLineX + dx;
      const ly = labelY + dy;
      const rawRect = useVertStraddle
        ? estimateSwimlaneVertStraddleLabelRect({
            straddleAnchorX: sax,
            labelY: ly,
            straddleExtraX,
            effectiveVerticalStraddleWest,
            straddleLineStrokeX,
            forceBadgeCenterOffsetFromLineEast,
            labelLines,
            codesList,
            hopIndex,
            showHopNumbers,
          })
        : estimateSwimlaneHorizontalLabelRect(lx, ly, labelLines, hopIndex, showHopNumbers, hasChoices);
      const pad = 10;
      const rect = {
        left: rawRect.left - pad,
        right: rawRect.right + pad,
        top: rawRect.top - pad,
        bottom: rawRect.bottom + pad,
      };
      return !swimlaneLabelRectHitsObstacles(rect, obstacles);
    };

    const lockStraddleToStrokeX =
      useVertStraddle &&
      straddleLineStrokeX != null &&
      Number.isFinite(straddleLineStrokeX);

    const OFFSETS = useVertStraddle
      ? lockStraddleToStrokeX
        ? [[0, 0], [0, -22], [0, 22], [0, -44], [0, 44], [0, -66], [0, 66]]
        : [
            [0, 0],
            [0, -22], [0, 22], [0, -44], [0, 44], [0, -66], [0, 66],
            [36, 0], [-36, 0], [52, 0], [-52, 0], [68, 0], [-68, 0], [84, 0], [-84, 0],
            [100, 0], [-100, 0], [120, 0], [-120, 0],
            [36, -22], [36, 22], [-36, -22], [-36, 22],
            [68, -28], [-68, -28], [68, 28], [-68, 28],
            [0, -88], [0, 88], [0, -110], [0, 110],
          ]
      : [
          [0, 0],
          [0, -11], [0, 11], [0, -18], [0, 18], [0, -22], [0, 22], [0, -30], [0, 30],
          [0, -36], [0, 36], [0, -44], [0, 44],
          [24, 0], [-24, 0], [40, 0], [-40, 0], [56, 0], [-56, 0], [72, 0], [-72, 0],
          [24, -18], [-24, -18], [24, 18], [-24, 18], [40, -22], [-40, -22], [40, 22], [-40, 22],
        ];

    for (const [dx, dy] of OFFSETS) {
      if (tryOffset(dx, dy)) {
        return {
          labelLineX: labelLineX + dx,
          labelY: labelY + dy,
          straddleAnchorX: straddleAnchorX + (useVertStraddle ? dx : 0),
        };
      }
    }
    return { labelLineX, labelY, straddleAnchorX };
  }

  function startsWithArticle(term) {
    return /^(?:the|a|an)\b/i.test(String(term || "").trim());
  }

  function looksLikeProperNoun(term) {
    const t = String(term || "").trim();
    if (!t) return false;
    const forcedProper = new Set(["Emperor Palpatine", "Darth Vader"]);
    if (forcedProper.has(t)) return true;
    return /^(?:Emperor|Darth|General|Admiral|Doctor|Dr\.|Mr\.|Ms\.|Mrs\.)\b/.test(t);
  }

  function withArticle(term) {
    const t = String(term || "").trim();
    if (!t) return "";
    if (startsWithArticle(t) || looksLikeProperNoun(t)) return t;
    return `the ${t}`;
  }

  function sentenceCaseStart(text) {
    const t = String(text || "");
    if (!t) return "";
    return t[0].toUpperCase() + t.slice(1);
  }

  function compositeIllustrationAggPath(sx, sy, ex, ey, diamondOn) {
    const clr = typeof ARROW_MARKER_TARGET_CLEARANCE === "number" ? ARROW_MARKER_TARGET_CLEARANCE : 6;
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy);
    let x0 = sx;
    let y0 = sy;
    let x1 = ex;
    let y1 = ey;
    if (len > 1e-6) {
      const ux = dx / len;
      const uy = dy / len;
      if (diamondOn === "end") {
        x1 = ex - ux * clr;
        y1 = ey - uy * clr;
      } else {
        x0 = sx + ux * clr;
        y0 = sy + uy * clr;
      }
    }
    const markerUrl = "url(#start-G)";
    const out = { d: `M ${x0} ${y0} L ${x1} ${y1}` };
    if (diamondOn === "start") out["marker-start"] = markerUrl;
    if (diamondOn === "end") out["marker-end"] = markerUrl;
    return out;
  }

  function escPathDiag(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.rendererUtils = {
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
  };
})();
