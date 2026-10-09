#!/usr/bin/env python3
"""Generate the SVG illustrations used by README.md and docs/.

Dev-only, never deployed. The colours, fonts and shapes copy the app itself
(ui/styles.css tokens, the diagram's layer fills, the route badges), so the
documentation looks like ArchiTrek.

    python3 scripts/build-docs-assets.py      # writes docs/assets/*.svg
"""

from __future__ import annotations

import math
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent.parent / "docs" / "assets"

# Tokens from ui/styles.css and data/rendererVisuals.js
FONT = "'IBM Plex Sans','Helvetica Neue',Helvetica,Arial,sans-serif"
NAVY = "#1a2432"
NAVY_2 = "#2c3848"
BG = "#f7f7f7"
SURFACE = "#ffffff"
CANVAS = "#eceef1"
BORDER = "#e5e7eb"
TEXT_2 = "#4a5568"
TEXT_3 = "#6b7280"
HOP_GREY = "#94a3b8"
WINK = "#ff4500"
WAYPOINT = "#4a2d8a"
WAYPOINT_BG = "#f4f0ff"

TECH = "#c1ffb1"
APP = "#bfffff"
BUS = "#fffbe6"
BUS_SWATCH = "#f5e87a"
MOTIV = "#e4d9f3"
IMPL = "#fce4e4"

# Route and evidence badges (fg, bg, border), as the results panel draws them
BADGE = {
    "ground": ("#1a7a3a", "#f0faf4", "#86efac"),
    "simplified": ("#c2410c", "#fff7ed", "#fdba74"),
    "tech": ("#166534", "#dcfce7", "#86efac"),
    "fullstack": ("#3730a3", "#eef2ff", "#a5b4fc"),
    "business": ("#92400e", "#fef3c7", "#fde68a"),
    "strong": ("#166534", "#ecfdf3", "#86efac"),
    "valid": ("#1a2432", "#eff6ff", "#93c5fd"),
    "informal": ("#92400e", "#fffbeb", "#fcd34d"),
    "derived": ("#7a4f00", "#fff8ec", "#f5c86a"),
    "assoc": ("#9a3412", "#fff7ed", "#fb923c"),
    "invalid": ("#b81c1c", "#fdf0f0", "#f5a3a3"),
}


# ── primitives ────────────────────────────────────────────────────────────


def svg(w: int, h: int, label: str, body: list[str], bg: str = BG) -> str:
    head = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'role="img" aria-label="{escape(label)}"><title>{escape(label)}</title>'
        f'<rect width="{w}" height="{h}" fill="{bg}"/>'
    )
    return head + "".join(body) + "</svg>\n"


def text(x, y, s, size=16, weight=400, fill=NAVY, anchor="start", spacing=0, italic=False) -> str:
    style = ' font-style="italic"' if italic else ""
    return (
        f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
        f'fill="{fill}" text-anchor="{anchor}" letter-spacing="{spacing}"{style}>{escape(s)}</text>'
    )


def rect(x, y, w, h, fill=SURFACE, stroke=None, sw=1, rx=0, dash=None) -> str:
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{s}{d}/>'


def line(x1, y1, x2, y2, stroke=NAVY, sw=2, dash=None, cap="butt") -> str:
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"'
        f' stroke-linecap="{cap}"{d}/>'
    )


def kicker(x, y, s, size=13, fill=TEXT_2) -> str:
    """Uppercase, letter-spaced label, like ROUTE 1 or STEP-BY-STEP JUSTIFICATION."""
    return text(x, y, s.upper(), size=size, weight=600, fill=fill, spacing=2.2)


def badge(x, y, s, kind, size=14, pad=10, h=26) -> tuple[str, float]:
    fg, bg, border = BADGE[kind]
    w = len(s) * size * 0.56 + pad * 2
    out = rect(x, y, w, h, fill=bg, stroke=border) + text(
        x + w / 2, y + h / 2 + size * 0.36, s, size=size, weight=500, fill=fg, anchor="middle"
    )
    return out, w


def logo_mark(x, y, scale=1.0, color="#ffffff", fill_alpha="0.14") -> str:
    """The cliff mark from assets/logo.svg."""
    rgba = "255,255,255" if color == "#ffffff" else "26,36,50"
    return (
        f'<g transform="translate({x},{y}) scale({scale})" fill="none">'
        f'<path d="M 0 29 L 0 9 L 5 5 L 16 3 L 23 11 L 26 20 L 23 29 Z" fill="rgba({rgba},{fill_alpha})" '
        f'stroke="{color}" stroke-width="1.5" stroke-linejoin="round"/>'
        f'<path d="M 1 16 L 10 14.5 L 20 17" stroke="rgba({rgba},0.55)" stroke-width="1.15" stroke-linecap="round"/>'
        f'<path d="M 2 22 L 12 20.5 L 22 23.5" stroke="rgba({rgba},0.4)" stroke-width="1" stroke-linecap="round"/>'
        f'<path d="M 11 6 L 12.5 24" stroke="{color}" stroke-width="2" stroke-dasharray="2.5 2.5" stroke-linecap="round"/>'
        f'<polygon points="9.5,21.5 15.5,21.5 12.5,27.5" fill="{color}"/></g>'
    )


def app_header(w, h=56, right_label=True) -> str:
    """The navy bar across the top of the app, with the logo."""
    out = [rect(0, 0, w, h, fill=NAVY), logo_mark(24, 10, 1.15)]
    out.append(text(64, 33, "ArchiTrek", size=24, weight=700, fill="#ffffff"))
    out.append(text(65, 47, "ARCHIMATE STUDY ENGINE", size=9, weight=500, fill="rgba(255,255,255,0.68)", spacing=0.6))
    if right_label:
        out.append(text(w - 330, 34, "VIEWPOINT", size=12, weight=600, fill="#ffffff", spacing=1.2))
        out.append(rect(w - 240, 14, 140, 28, fill="#ffffff"))
        out.append(text(w - 228, 33, "All elements", size=14, weight=600, fill=NAVY))
        out.append(text(w - 110, 33, "▾", size=12, fill=TEXT_3))
        out.append(text(w - 70, 33, "Feedback", size=14, fill="#ffffff"))
    return "".join(out)


def element(x, y, w, h, name, layer, shape="rect", size=15, bold=True, stroke=NAVY, sw=2) -> str:
    """An ArchiMate element box as the diagram draws it."""
    fill = {"tech": TECH, "app": APP, "bus": BUS, "motiv": MOTIV, "impl": IMPL}[layer]
    rx = {"rect": 3, "round": 10, "pill": h / 2}[shape]
    out = [rect(x, y, w, h, fill=fill, stroke=stroke, sw=sw, rx=rx)]
    words = name.split(" ")
    lines = [name] if len(words) == 1 or len(name) <= 12 else [" ".join(words[:-1]), words[-1]]
    lh = size * 1.18
    y0 = y + h / 2 - (len(lines) - 1) * lh / 2 + size * 0.36
    for i, ln in enumerate(lines):
        out.append(text(x + w / 2, y0 + i * lh, ln, size=size, weight=600 if bold else 400, fill=NAVY, anchor="middle"))
    return "".join(out)


def arrow_head(x, y, angle, kind, color=NAVY, size=12) -> str:
    """Relationship end markers: open (serving), filled (assignment/triggering), hollow (realization)."""
    a = math.radians(angle)
    bx, by = x - size * math.cos(a), y - size * math.sin(a)
    px, py = -math.sin(a) * size * 0.55, math.cos(a) * size * 0.55
    pts = f"{x},{y} {bx + px},{by + py} {bx - px},{by - py}"
    if kind == "open":
        return f'<polyline points="{bx + px},{by + py} {x},{y} {bx - px},{by - py}" fill="none" stroke="{color}" stroke-width="2"/>'
    if kind == "hollow":
        return f'<polygon points="{pts}" fill="{SURFACE}" stroke="{color}" stroke-width="2"/>'
    return f'<polygon points="{pts}" fill="{color}"/>'


def relationship(x1, y1, x2, y2, kind, color=NAVY, head=12, sw=2) -> str:
    """Draw an ArchiMate relationship between two points (straight)."""
    ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
    a = math.radians(ang)
    out = []
    if kind == "composition":
        s = 11
        d = [(x1, y1), (x1 + s * math.cos(a) - s * 0.5 * math.sin(a), y1 + s * math.sin(a) + s * 0.5 * math.cos(a)),
             (x1 + 2 * s * math.cos(a), y1 + 2 * s * math.sin(a)),
             (x1 + s * math.cos(a) + s * 0.5 * math.sin(a), y1 + s * math.sin(a) - s * 0.5 * math.cos(a))]
        out.append(f'<polygon points="{" ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in d)}" fill="{color}"/>')
        out.append(line(x1 + 2 * s * math.cos(a), y1 + 2 * s * math.sin(a), x2, y2, stroke=color, sw=sw))
    elif kind == "assignment":
        out.append(f'<circle cx="{x1 + 4 * math.cos(a):.1f}" cy="{y1 + 4 * math.sin(a):.1f}" r="5" fill="{color}"/>')
        out.append(line(x1, y1, x2 - 8 * math.cos(a), y2 - 8 * math.sin(a), stroke=color, sw=sw))
        out.append(arrow_head(x2, y2, ang, "filled", color, head))
    elif kind == "realization":
        out.append(line(x1, y1, x2 - head * math.cos(a), y2 - head * math.sin(a), stroke=color, sw=sw, dash="6 4"))
        out.append(arrow_head(x2, y2, ang, "hollow", color, head))
    elif kind == "serving":
        out.append(line(x1, y1, x2, y2, stroke=color, sw=sw))
        out.append(arrow_head(x2, y2, ang, "open", color, head))
    elif kind == "association":
        out.append(line(x1, y1, x2, y2, stroke=color))
    elif kind == "undecided":
        out.append(line(x1, y1, x2, y2, stroke=HOP_GREY, dash="3 4"))
    return "".join(out)


def hop_badge(cx, cy, n, decided=True) -> str:
    fill = NAVY if decided else HOP_GREY
    return f'<circle cx="{cx}" cy="{cy}" r="11" fill="{fill}"/>' + text(
        cx - 1, cy + 4.5, f"{n}▾", size=11, weight=700, fill="#ffffff", anchor="middle"
    )


def card(x, y, w, h) -> str:
    return rect(x, y, w, h, fill=SURFACE, stroke=BORDER)


def title_block(x, y, kick, title, sub=None) -> list[str]:
    out = [rect(x, y - 13, 12, 12, fill=WINK), kicker(x + 22, y - 2, kick)]
    out.append(text(x - 1, y + 40, title, size=30, weight=700, fill=NAVY))
    if sub:
        out.append(text(x, y + 70, sub, size=17, fill=TEXT_2))
    return out


# ── banner ────────────────────────────────────────────────────────────────


def banner() -> str:
    W, H = 1200, 400
    b = [app_header(W)]
    b.append(rect(48, 108, 12, 12, fill=WINK))
    b.append(kicker(70, 119, "ArchiMate 3.2  ·  study tool"))
    b.append(text(46, 180, "How can I connect", size=46, weight=700, fill=NAVY))
    b.append(text(46, 232, "these boxes?", size=46, weight=700, fill=NAVY))
    b.append(text(48, 278, "Pick two element types. ArchiTrek finds the legal", size=19, fill=TEXT_2))
    b.append(text(48, 304, "routes in the Appendix B tables and explains every hop.", size=19, fill=TEXT_2))
    b.append(text(48, 356, "Free  ·  runs in the browser  ·  nothing to install", size=15, fill=TEXT_3))

    # Mini diagram panel, as the app draws a route
    px, py, pw, ph = 600, 92, 560, 272
    b.append(rect(px, py, pw, ph, fill=CANVAS))
    b.append(kicker(px + 20, py + 28, "Route 1", size=12))
    b.append(text(px + 20, py + 56, "Node → Business Function", size=19, weight=700, fill=NAVY))
    bx = px + 20
    for label, kind in (("Technology-Heavy", "tech"), ("Ground-Truth", "ground")):
        s, w = badge(bx, py + 70, label, kind, size=12, h=22, pad=8)
        b.append(s)
        bx += w + 8
    # A route drawn left to right, as the diagram shows it
    bw, bh, gap = 112, 58, 40
    bx0 = px + (pw - (4 * bw + 3 * gap)) / 2
    by = py + 170
    boxes = [
        ("Node", "tech", "rect"),
        ("Application Component", "app", "rect"),
        ("Application Function", "app", "round"),
        ("Business Function", "bus", "round"),
    ]
    for i, (n, layer, shape) in enumerate(boxes):
        b.append(element(bx0 + i * (bw + gap), by, bw, bh, n, layer, shape, size=13))
    for i, kind in enumerate(["realization", "assignment", "serving"]):
        x1 = bx0 + i * (bw + gap) + bw
        x2 = x1 + gap
        b.append(relationship(x1 + 1, by + bh / 2, x2 - 1, by + bh / 2, kind, head=10))
        b.append(hop_badge(x1 + gap / 2, by - 16, i + 1))
    for i, name in enumerate(["realizes", "assigned to", "serves"]):
        x1 = bx0 + i * (bw + gap) + bw
        b.append(text(x1 + gap / 2, by + bh + 22, name, size=11, fill=TEXT_3, anchor="middle"))
    b.append(logo_mark(px + pw - 40, py + 14, 0.9, color=NAVY, fill_alpha="0.08"))
    return svg(W, H, "ArchiTrek: how can I connect these boxes? An ArchiMate 3.2 study tool.", b, bg=BG)


# ── how it works ──────────────────────────────────────────────────────────


def flow() -> str:
    W, H = 1200, 430
    b = title_block(48, 52, "How it works", "From two element types to a route you can defend.")
    steps = [
        ("1", "Pick", "two or more", "element types"),
        ("2", "Search", "the ArchiMate 3.2", "Appendix B tables"),
        ("3", "Rank", "routes by evidence:", "direct before derived"),
        ("4", "Explain", "every hop, with", "its rule and section"),
        ("5", "Export", "to PNG, PDF, CSV", "or Archi (XML)"),
    ]
    cw, gap, top = 196, 30, 170
    for i, (n, head, l1, l2) in enumerate(steps):
        x = 48 + i * (cw + gap)
        b.append(card(x, top, cw, 200))
        b.append(rect(x, top, cw, 4, fill=NAVY if i != 1 else WINK))
        b.append(f'<circle cx="{x + 34}" cy="{top + 44}" r="16" fill="{NAVY}"/>')
        b.append(text(x + 34, top + 50, n, size=16, weight=700, fill="#ffffff", anchor="middle"))
        b.append(text(x + 20, top + 104, head, size=24, weight=700, fill=NAVY))
        b.append(text(x + 20, top + 138, l1, size=15, fill=TEXT_2))
        b.append(text(x + 20, top + 160, l2, size=15, fill=TEXT_2))
        if i < len(steps) - 1:
            ax = x + cw + 4
            b.append(line(ax, top + 100, ax + gap - 10, top + 100, stroke=NAVY, sw=2))
            b.append(arrow_head(ax + gap - 6, top + 100, 0, "filled", size=9))
    b.append(text(48, 408, "Everything runs in your browser. Your routes and settings stay on your device.", size=15, fill=TEXT_3))
    return svg(W, H, "How ArchiTrek works: pick element types, search Appendix B, rank routes, explain hops, export.", b)


# ── evidence ladder ──────────────────────────────────────────────────────


def evidence() -> str:
    W, H = 1200, 580
    b = title_block(48, 52, "Four kinds of link", "How sure is the language that two things connect?")
    rows = [
        ("Direct", "In the Appendix B table for that exact pair, in capitals.", "Draw it.", 1, "strong", "serving"),
        ("Derived", "A chain of direct relationships licenses it (B.2, DR1–DR8).", "True if the chain is.", 5, "valid", "serving"),
        ("Potential", "A weaker chain suggests it (B.3, PDR1–PDR12).", "Check it first.", 20, "informal", "serving"),
        ("Association", "Allowed between any two elements (§5.2.4).", "Related, not how.", 100, "assoc", "association"),
    ]
    top, rh = 150, 82
    b.append(kicker(48, top - 14, "Kind", size=12))
    b.append(kicker(250, top - 14, "What it means", size=12))
    b.append(kicker(W - 196, top - 14, "Hop cost", size=12))
    for i, (name, desc, verdict, cost, kind, rel) in enumerate(rows):
        y = top + i * (rh + 10)
        b.append(card(48, y, W - 96, rh))
        fg, bg, border = BADGE[kind]
        b.append(rect(48, y, 6, rh, fill=border))
        b.append(text(76, y + 48, name, size=22, weight=700, fill=NAVY))
        b.append(text(250, y + 38, desc, size=16, fill=TEXT_2))
        b.append(text(250, y + 62, verdict, size=16, weight=600, fill=fg))
        # notation sample
        b.append(relationship(W - 400, y + rh / 2, W - 270, y + rh / 2, rel))
        if i in (1, 2):
            b.append(text(W - 335, y + rh / 2 - 10, "derived" if i == 1 else "potential", size=12, fill=fg, anchor="middle"))
        # cost pill
        b.append(rect(W - 196, y + 24, 100, 34, fill=bg, stroke=border))
        b.append(text(W - 146, y + 47, str(cost), size=18, weight=700, fill=fg, anchor="middle"))
    b.append(text(48, H - 22, "The search adds up hop costs, so it takes three direct hops before one derived hop. You can change the costs in Advanced options.", size=15, fill=TEXT_3))
    return svg(W, H, "Direct, derived, potential and association links, with hop costs 1, 5, 20 and 100.", b)


# ── semantic rigor ───────────────────────────────────────────────────────


def rigor() -> str:
    W, H = 1200, 520
    b = title_block(48, 52, "Semantic rigor", "How strict do you want the search to be?")
    modes = [
        ("Academic", "Strict", ["blocked", "blocked", "off"], "Exam-level accuracy.", "Your assignments."),
        ("Pragmatic", "Balanced", ["blocked", "flagged", "high"], "Real analysis when", "the data is fuzzy."),
        ("Discovery", "Loose", ["flagged", "flagged", "low"], "Exploring what", "might be connected."),
    ]
    gates = [("Layer detours", "core to core"), ("Shared-parent links", "the V shape"), ("Association bridges", "§5.2.4")]
    cw, gap, top = 352, 24, 140
    for i, (name, tag, states, p1, p2) in enumerate(modes):
        x = 48 + i * (cw + gap)
        b.append(card(x, top, cw, 310))
        b.append(rect(x, top, cw, 54, fill=NAVY if i == 0 else (NAVY_2 if i == 1 else "#64748b")))
        b.append(text(x + 20, top + 35, name, size=21, weight=700, fill="#ffffff"))
        b.append(text(x + cw - 20, top + 35, tag.upper(), size=12, weight=600, fill="rgba(255,255,255,0.75)", anchor="end", spacing=1.8))
        for j, ((g, sub), st) in enumerate(zip(gates, states)):
            y = top + 76 + j * 62
            b.append(text(x + 20, y + 18, g, size=16, weight=600, fill=NAVY))
            b.append(text(x + 20, y + 38, sub, size=13, fill=TEXT_3, italic=True))
            label, kind = {
                "blocked": ("Blocked", "invalid"),
                "flagged": ("Allowed, flagged", "informal"),
                "off": ("Off", "invalid"),
                "high": ("High penalty", "informal"),
                "low": ("Low penalty", "assoc"),
            }[st]
            fg, bg, border = BADGE[kind]
            w = len(label) * 7.6 + 20
            b.append(rect(x + cw - 20 - w, y + 6, w, 26, fill=bg, stroke=border))
            b.append(text(x + cw - 20 - w / 2, y + 24, label, size=13, weight=600, fill=fg, anchor="middle"))
            if j < 2:
                b.append(line(x + 20, y + 52, x + cw - 20, y + 52, stroke=BORDER, sw=1))
        b.append(rect(x, top + 262, cw, 48, fill=BG))
        b.append(text(x + 20, top + 283, p1, size=14, fill=TEXT_2))
        b.append(text(x + 20, top + 301, p2, size=14, fill=TEXT_2))
    b.append(text(48, H - 30, "STRICTER", size=12, weight=600, fill=TEXT_3, spacing=2))
    b.append(line(140, H - 34, W - 150, H - 34, stroke=TEXT_3, sw=1.5))
    b.append(arrow_head(W - 146, H - 34, 0, "filled", color=TEXT_3, size=9))
    b.append(text(W - 48, H - 30, "LOOSER", size=12, weight=600, fill=TEXT_3, anchor="end", spacing=2))
    return svg(W, H, "Semantic rigor modes: Academic, Pragmatic and Discovery, and what each lets through.", b)


# ── derivation shortcut (DR2) ────────────────────────────────────────────


def shortcut() -> str:
    W, H = 1200, 470
    b = title_block(48, 52, "Derivation rule DR2", "A derived relationship is a shortcut over a chain.")
    # Left: the chain on the case
    px, py, pw, ph = 48, 140, 640, 290
    b.append(rect(px, py, pw, ph, fill=CANVAS))
    ew, eh = 170, 60
    a = (px + 40, py + 200)
    m = (px + pw / 2 - ew / 2, py + 40)
    c = (px + pw - 40 - ew, py + 200)
    b.append(element(*a, ew, eh, "Mainframe", "tech", size=15))
    b.append(text(a[0] + ew / 2, a[1] + eh + 20, "Node", size=12, fill=TEXT_3, anchor="middle"))
    b.append(element(*m, ew, eh, "Operating System", "tech", size=15))
    b.append(text(m[0] + ew / 2, m[1] - 10, "System Software", size=12, fill=TEXT_3, anchor="middle"))
    b.append(element(*c, ew, eh, "SAP ERP software", "tech", size=15))
    b.append(text(c[0] + ew / 2, c[1] + eh + 20, "System Software", size=12, fill=TEXT_3, anchor="middle"))
    # a composed of b, b assigned to c
    b.append(relationship(a[0] + 60, a[1], m[0] + 30, m[1] + eh, "composition"))
    b.append(text(a[0] + 20, py + 150, "composition", size=13, fill=TEXT_2))
    b.append(relationship(m[0] + ew - 30, m[1] + eh, c[0] + ew - 60, c[1], "assignment"))
    b.append(text(c[0] + 60, py + 150, "assignment", size=13, fill=TEXT_2))
    # derived shortcut
    fg, bg, border = BADGE["derived"]
    b.append(relationship(a[0] + ew + 4, a[1] + eh / 2, c[0] - 6, c[1] + eh / 2, "assignment", color="#b7791f"))
    s, w = badge(px + pw / 2 - 72, a[1] + eh / 2 + 12, "assignment, derived", "derived", size=12, h=22, pad=8)
    b.append(s)
    for (x, y), letter in ((a, "a"), (m, "b"), (c, "c")):
        b.append(f'<circle cx="{x}" cy="{y}" r="12" fill="{NAVY}"/>')
        b.append(text(x, y + 5, letter, size=14, weight=700, fill="#ffffff", anchor="middle"))

    # Right: the rule
    rx = 730
    b.append(kicker(rx, py + 12, "The model says", size=12))
    b.append(text(rx, py + 44, "a  —structural→  b  —structural→  c", size=18, weight=600, fill=NAVY))
    b.append(kicker(rx, py + 96, "So you may draw", size=12))
    b.append(text(rx, py + 128, "a  —the weaker of the two→  c", size=18, weight=600, fill="#b7791f"))
    b.append(kicker(rx, py + 180, "On the case", size=12))
    for i, ln in enumerate([
        "The mainframe is composed of its operating",
        "system, which is assigned to the SAP software.",
        "Assignment is weaker than composition, so the",
        "shortcut is an assignment.",
    ]):
        b.append(text(rx, py + 208 + i * 22, ln, size=15, fill=TEXT_2))
    b.append(text(48, H - 14, "ArchiMate 3.2, Appendix B. Rule as encoded in archimate_ontology (A. D. Mendoza). Wording simplified.", size=13, fill=TEXT_3))
    return svg(W, H, "Rule DR2: two structural relationships in a row give the weaker of the two as a derived relationship.", b)


# ── layers ────────────────────────────────────────────────────────────────


def layers() -> str:
    W, H = 1200, 380
    b = title_block(48, 52, "Layers", "Each layer serves the one above it.")
    rows = [
        ("Business", "The organisation: processes, functions, roles, services.", BUS_SWATCH, "Business Function", "bus", "round"),
        ("Application", "The software: components, application services, data.", APP, "Application Component", "app", "rect"),
        ("Technology", "The machines: nodes, devices, system software, artifacts.", TECH, "Node", "tech", "rect"),
    ]
    top, rh = 120, 72
    for i, (name, desc, sw, el, layer, shape) in enumerate(rows):
        y = top + i * (rh + 14)
        b.append(card(48, y, W - 96, rh))
        b.append(rect(48, y, 10, rh, fill=sw))
        b.append(text(80, y + 44, name, size=22, weight=700, fill=NAVY))
        b.append(text(260, y + 44, desc, size=16, fill=TEXT_2))
        b.append(element(W - 300, y + 10, 200, rh - 20, el, layer, shape, size=14))
        if i < 2:
            b.append(relationship(W - 200, y + rh + 14 + 10, W - 200, y + rh - 10, "serving"))
    return svg(W, H, "The business, application and technology layers, each serving the one above.", b)


# ── feature icons ────────────────────────────────────────────────────────


def icon(name: str, label: str, body: str) -> tuple[str, str]:
    head = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img" '
        f'aria-label="{escape(label)}"><title>{escape(label)}</title>'
        f'<rect x="0.5" y="0.5" width="95" height="95" fill="{SURFACE}" stroke="{BORDER}"/>'
    )
    return name, head + body + "</svg>\n"


def icons() -> list[tuple[str, str]]:
    I = []
    # Pathfinding: three element boxes climbing the layers
    I.append(icon("icon-route", "Pathfinding",
        rect(10, 60, 26, 20, TECH, NAVY, 2, 2) + rect(35, 38, 26, 20, APP, NAVY, 2, 2) + rect(60, 16, 26, 20, BUS, NAVY, 2, 7)
        + relationship(23, 60, 35, 50, "serving", head=7) + relationship(48, 38, 60, 28, "serving", head=7)))
    # Hop by hop: numbered hop badges with text lines
    hb = ""
    for i in range(3):
        y = 24 + i * 24
        hb += f'<circle cx="24" cy="{y}" r="9" fill="{NAVY if i < 2 else HOP_GREY}"/>'
        hb += text(24, y + 4.5, str(i + 1), size=12, weight=700, fill="#ffffff", anchor="middle")
        hb += line(42, y - 3, 78, y - 3, NAVY, 3) + line(42, y + 5, 66, y + 5, HOP_GREY, 3)
    I.append(icon("icon-explain", "Hop-by-hop explanation", hb))
    # Relationship type and flip
    I.append(icon("icon-flip", "Relationship type and flip",
        relationship(20, 36, 76, 36, "assignment") + relationship(76, 62, 20, 62, "realization")))
    # Waypoints: a pinned middle element
    I.append(icon("icon-waypoint", "Waypoints",
        rect(8, 54, 20, 16, TECH, NAVY, 2, 2) + rect(38, 54, 20, 16, APP, WAYPOINT, 3, 2) + rect(68, 54, 20, 16, BUS, NAVY, 2, 5)
        + line(28, 62, 38, 62, NAVY, 2) + line(58, 62, 68, 62, NAVY, 2)
        + f'<path d="M48 16 C40 16 35 22 35 29 C35 38 48 48 48 48 C48 48 61 38 61 29 C61 22 56 16 48 16 Z" fill="{WAYPOINT}"/>'
        + f'<circle cx="48" cy="29" r="5" fill="{WAYPOINT_BG}"/>'))
    # Viewpoints: keep some layers, drop the rest
    vp = ""
    for i, (c, keep) in enumerate(((MOTIV, False), (BUS_SWATCH, True), (APP, True), (TECH, True), (IMPL, False))):
        y = 14 + i * 14
        vp += rect(14, y, 68, 11, c if keep else "#f1f5f9", None if keep else BORDER)
        if not keep:
            vp += line(42, y + 2, 50, y + 9, NAVY, 2) + line(50, y + 2, 42, y + 9, NAVY, 2)
    I.append(icon("icon-viewpoint", "Viewpoints", vp))
    # Evidence: four bars from direct to association
    ev = ""
    for i, k in enumerate(("strong", "valid", "informal", "assoc")):
        fg, bg, border = BADGE[k]
        ev += rect(16, 18 + i * 16, 64 - i * 14, 10, border)
    I.append(icon("icon-evidence", "Evidence labels", ev))
    # Semantic rigor: three switches
    rg = ""
    for i, on in enumerate((True, True, False)):
        y = 24 + i * 24
        rg += rect(20, y - 8, 56, 16, NAVY if on else BORDER, rx=8)
        cx = 68 if on else 28
        rg += f'<circle cx="{cx}" cy="{y}" r="6" fill="#ffffff"/>'
    I.append(icon("icon-rigor", "Semantic rigor", rg))
    # Share link
    I.append(icon("icon-share", "Share link",
        f'<rect x="14" y="38" width="38" height="20" rx="10" fill="none" stroke="{NAVY}" stroke-width="5"/>'
        f'<rect x="44" y="38" width="38" height="20" rx="10" fill="none" stroke="{NAVY}" stroke-width="5"/>'
        + line(36, 48, 60, 48, WINK, 5, cap="round")))
    # Export: document with arrow out, Archi
    I.append(icon("icon-export", "Export",
        f'<path d="M22 14 L56 14 L70 28 L70 82 L22 82 Z" fill="{SURFACE}" stroke="{NAVY}" stroke-width="3" stroke-linejoin="round"/>'
        f'<path d="M56 14 L56 28 L70 28" fill="none" stroke="{NAVY}" stroke-width="3"/>'
        + text(46, 62, "XML", size=13, weight=700, fill=NAVY, anchor="middle")
        + line(58, 70, 82, 70, WINK, 3) + arrow_head(86, 70, 0, "filled", WINK, 9)))
    # Themes: the same route retold in two stories
    I.append(icon("icon-theme", "Story themes",
        rect(12, 18, 52, 40, "#f1f5f9", NAVY, 2) + rect(32, 38, 52, 40, SURFACE, NAVY, 2)
        + rect(40, 48, 14, 10, BUS, NAVY, 1.5, 3) + rect(62, 60, 14, 10, APP, NAVY, 1.5, 2) + line(54, 53, 62, 65, NAVY, 1.5)))
    # Report feedback: flag
    I.append(icon("icon-report", "Report feedback",
        line(28, 14, 28, 84, NAVY, 4, cap="round")
        + f'<path d="M30 16 L72 16 L62 32 L72 48 L30 48 Z" fill="{WINK}"/>'))
    # Spec excerpts: page with section sign
    I.append(icon("icon-spec", "Spec excerpts",
        f'<path d="M14 22 C26 16 38 16 48 22 C58 16 70 16 82 22 L82 78 C70 72 58 72 48 78 C38 72 26 72 14 78 Z" fill="{SURFACE}" stroke="{NAVY}" stroke-width="3" stroke-linejoin="round"/>'
        + line(48, 22, 48, 78, NAVY, 2) + text(31, 56, "§", size=24, weight=700, fill=NAVY, anchor="middle")
        + line(56, 38, 74, 38, HOP_GREY, 3) + line(56, 48, 74, 48, HOP_GREY, 3) + line(56, 58, 68, 58, HOP_GREY, 3)))
    # Show on metamodel: generic node graph with one lit edge
    mm = line(24, 28, 70, 26, HOP_GREY, 2) + line(24, 28, 30, 70, HOP_GREY, 2) + line(70, 26, 72, 68, HOP_GREY, 2)
    mm += line(30, 70, 72, 68, WINK, 4) + line(24, 28, 48, 48, HOP_GREY, 2) + line(48, 48, 72, 68, WINK, 4)
    for x, y, c in ((24, 28, NAVY), (70, 26, NAVY), (30, 70, NAVY), (72, 68, NAVY), (48, 48, NAVY)):
        mm += f'<circle cx="{x}" cy="{y}" r="7" fill="{c}"/>'
    I.append(icon("icon-metamodel", "Show on metamodel", mm))
    # Advanced settings: sliders
    st = ""
    for i, k in enumerate((30, 62, 44)):
        y = 26 + i * 22
        st += line(16, y, 80, y, HOP_GREY, 3, cap="round") + line(16, y, k, y, NAVY, 3, cap="round")
        st += f'<circle cx="{k}" cy="{y}" r="7" fill="{SURFACE}" stroke="{NAVY}" stroke-width="3"/>'
    I.append(icon("icon-settings", "Advanced settings", st))
    # Swimlanes / layout
    sl = ""
    for i, c in enumerate((BUS_SWATCH, APP, TECH)):
        sl += rect(10, 14 + i * 24, 76, 22, c)
        sl += rect(10, 14 + i * 24, 76, 22, "none", "rgba(26,36,50,0.25)", 1)
    sl += rect(56, 18, 22, 14, SURFACE, NAVY, 2, 4) + rect(36, 42, 22, 14, SURFACE, NAVY, 2, 2) + rect(18, 66, 22, 14, SURFACE, NAVY, 2, 2)
    I.append(icon("icon-swimlanes", "Swimlanes", sl))
    return I


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        "banner.svg": banner(),
        "flow.svg": flow(),
        "evidence.svg": evidence(),
        "rigor.svg": rigor(),
        "dr2.svg": shortcut(),
        "layers.svg": layers(),
    }
    for name, body in icons():
        files[f"{name}.svg"] = body
    for name, body in files.items():
        (OUT / name).write_text(body, encoding="utf-8")
    print(f"wrote {len(files)} files to {OUT}")


if __name__ == "__main__":
    main()
