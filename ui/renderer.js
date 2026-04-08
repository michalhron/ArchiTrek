// === ui/renderer.js ===
/**
 * ui/renderer.js
 * ArchiMate Path Navigator — SVG Renderer
 *
 * Draws path diagrams as SVG, in two modes:
 * compact   — linear left-to-right flow, elements in a single row
 * swimlane  — elements placed in horizontal layer lanes, arrows cross lanes
 *            (with Vertical: same-layer steps stack inside the lane; new column only when re-entering a layer)
 *
 * EXPORTS:
 * renderPath(container, segments, options)
 * clearDiagram(container)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const EL_W   = 120;   
const EL_H   = 52;    
const EL_GAP = 160; 

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_BADGE_SIZE = 14;
const ICON_GLYPH_SIZE = 12;
const ICON_PAD = 3;

const LANE_H_MIN  = 90;   // Swimlane row height (single box per element; no fork stacks)
/** Tight lane when “Vertical” is on: minimize horizontal bands so the diagram reads as a vertical stack. */
const LANE_H_MIN_VERTICAL = Math.max(EL_H + 16, 66);
const SWIM_COL_GAP_VERTICAL = 88; // horizontal step between columns (default EL_GAP is wider)
/** Gap between element boxes stacked inside one swim lane (Vertical mode). */
const SWIM_STACK_GAP = 8;
const LANE_LABEL_W = 160; 
const LANE_LABEL_PAD_X = 10;
const LANE_LABEL_PAD_Y = 8;
const LANE_LABEL_MAX_LINES = 3;

const REL_LABEL_MAX_CHARS = 18;
const REL_LABEL_MAX_LINES = 2;




// ─────────────────────────────────────────────────────────────────────────────
// SHAPE DEFINITIONS
// Each entry describes how to draw the element's base shape.
// type: rect | rounded | parallelogram | ellipse | cloud | chevron | cube | document | dashed
// ─────────────────────────────────────────────────────────────────────────────

const SHAPES = {
  // Motivation
  "Stakeholder": { type: "beveled" },
  "Driver":      { type: "beveled" },
  "Assessment":  { type: "beveled" },
  "Goal":        { type: "beveled" },
  "Outcome":     { type: "beveled" },
  "Principle":   { type: "beveled" },
  "Requirement": { type: "beveled" },
  "Constraint":  { type: "beveled" },
  "Meaning":     { type: "cloud" },
  "Value":       { type: "ellipse" },
  
  // Strategy
  "Resource":       { type: "rounded" },
  "Capability":     { type: "rounded" },
  "Value Stream":   { type: "chevron" },
  "Course of Action": { type: "rounded" },
  // Business
  "Business Actor":         { type: "rounded" },
  "Business Role":          { type: "rounded" },
  "Business Collaboration": { type: "rounded" },
  "Business Interface":     { type: "rounded" },
  "Business Process":       { type: "rounded-arrow" },
  "Business Function":      { type: "rounded" },
  "Business Interaction":   { type: "rounded" },
  "Business Event":         { type: "chevron" },
  "Business Service":       { type: "rounded" },
  "Business Object":        { type: "rect" },
  "Contract":               { type: "rect" },
  "Representation":         { type: "rect" },
  "Product":                { type: "rounded" },
  // Application
  "Application Component":     { type: "rounded" },
  "Application Collaboration": { type: "rounded" },
  "Application Interface":     { type: "rounded" },
  "Application Function":      { type: "rounded" },
  "Application Interaction":   { type: "rounded" },
  "Application Process":       { type: "rounded-arrow" },
  "Application Event":         { type: "chevron" },
  "Application Service":       { type: "rounded" },
  "Data Object":               { type: "rect" },
  // Technology
  "Node":                     { type: "cube" },
  "Device":                   { type: "cube" },
  "System Software":          { type: "rounded" },
  "Technology Collaboration": { type: "rounded" },
  "Technology Interface":     { type: "rounded" },
  "Path":                     { type: "rounded" },
  "Communication Network":    { type: "rounded" },
  "Technology Function":      { type: "rounded" },
  "Technology Process":       { type: "rounded-arrow" },
  "Technology Interaction":   { type: "rounded" },
  "Technology Event":         { type: "chevron" },
  "Technology Service":       { type: "rounded" },
  "Technology Object":        { type: "rect" },
  "Artifact":                 { type: "document" },
  // Physical
  "Equipment":           { type: "cube" },
  "Facility":            { type: "cube" },
  "Distribution Network":{ type: "rounded" },
  "Material":            { type: "rounded" },
  // Implementation
  "Work Package":         { type: "rounded" },
  "Deliverable":          { type: "document" },
  "Implementation Event": { type: "chevron" },
  "Plateau":              { type: "plateau" },
  "Gap":                  { type: "rect" },
  // Composite
  "Location":  { type: "rect" },
  "Grouping":  { type: "dashed" },
};


const COMPOSITE_PATTERNS = {
  "Path": { sub: "Node", rel: "G", label: "aggregates" },
  "Communication Network": { sub: "Node", rel: "G", label: "aggregates" },
  "Business Collaboration": { sub: "Business Role", rel: "G", label: "aggregates" },
  "Application Collaboration": { sub: "Application Component", rel: "G", label: "aggregates" },
  "Technology Collaboration": { sub: "Node", rel: "G", label: "aggregates" }
};

// ─────────────────────────────────────────────────────────────────────────────
// ICON PATHS (SVG path data, scaled to ~12×12, origin top-left of icon area)
// Each function returns an SVG path 'd' string or SVG element string.
// ─────────────────────────────────────────────────────────────────────────────

const ICONS = {
  "Stakeholder": () => `<path d="M5,2 L11,2 L11,10 L5,10 Z" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M5,2 A4,4 0 0,0 5,10" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Driver": () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M6,1 L6,3 M6,9 L6,11 M1,6 L3,6 M9,6 L11,6 M2.5,2.5 L4,4 M8,8 L9.5,9.5 M2.5,9.5 L4,8 M8,4 L9.5,2.5" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Assessment": () => `<circle cx="5" cy="5" r="4.5" stroke="currentColor" fill="none" stroke-width="1.2"/><line x1="8.5" y1="8.5" x2="11.5" y2="11.5" stroke="currentColor" stroke-width="1.5"/>`,
  "Goal": () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="0.8" fill="currentColor" stroke="none"/>`,
  "Outcome": () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="0.8" fill="currentColor" stroke="none"/><path d="M12,6 L6.5,6 L8,4.5 M6.5,6 L8,7.5" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Principle": () => `<rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" fill="none" stroke-width="1.2"/><text x="6" y="9" text-anchor="middle" font-size="8" font-family="sans-serif" font-weight="bold" fill="currentColor" stroke="none">!</text>`,
  "Requirement": () => `<path d="M2,2 L10,2 L11,10 L3,10 Z" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="3.5" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.1"/><line x1="3.5" y1="8" x2="8" y2="8" stroke="currentColor" stroke-width="1.1"/>`,
  "Constraint": () => `<path d="M2,2 L10,2 L11,10 L3,10 L2.5,8 L1,8 L1,4 L2.5,4 L2,2 Z" stroke="currentColor" fill="none" stroke-width="1.1"/><path d="M3.5,4 L9,9.5 M4.5,2 L10.5,8 M6.5,2 L11,6.5 M1.5,6 L4,8.5" stroke="currentColor" fill="none" stroke-width="0.8"/>`,
  "Meaning": () => `<path d="M4,5 C2.5,5 1.5,6.5 2,8 C1,9 2,10.5 3.5,10 C4,11 6,11.5 7.5,10.5 C9,11 11,9.5 10,8 C11,6.5 10,5 8.5,5 C7,3.5 5,3.5 4,5 Z" stroke="currentColor" fill="none" stroke-width="1.1"/><circle cx="3" cy="12" r="0.6" fill="currentColor"/><circle cx="2" cy="14" r="0.4" fill="currentColor"/>`,
  "Value": () => `<ellipse cx="6" cy="6" rx="5" ry="3.5" stroke="currentColor" fill="none" stroke-width="1.2"/>`,

  "Resource":       () => `<rect x="1" y="3" width="10" height="7" rx="1" stroke="currentColor" fill="none" stroke-width="1.2"/><rect x="3" y="1" width="6" height="3" rx="1" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Capability":     () => `<rect x="1" y="1" width="4" height="4" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="7" y="1" width="4" height="4" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="1" y="7" width="4" height="4" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="7" y="7" width="4" height="4" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Value Stream":   () => `<path d="M1,6 L3,3 L9,3 L11,6 L9,9 L3,9 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Course of Action": () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M4,4 C4,4 8,4 8,6 C8,8 4,8 4,8" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="4" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.1"/>`,

  "Business Actor":         () => `<path d="M6,1 a2,2 0 1,1 0,0.01 M2,11 C2,7.5 10,7.5 10,11" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Role":          () => `<path d="M1,11 L1,9 C1,6 11,6 11,9 L11,11" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="4" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Collaboration": () => `<circle cx="4" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="8" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Interface":     () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Process":       () => `<path d="M1,3 L8,3 L11,6 L8,9 L1,9 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Function":      () => `<path d="M2,1 L10,1 L10,11 L2,11 Z M2,4 C4,4 8,4 10,4" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Business Interaction":   () => `<line x1="1" y1="6" x2="5" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="7.5" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><line x1="10" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2"/>`,
  "Business Event":         () => `<path d="M1,4 L7,4 L11,6 L7,8 L1,8 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Service":       () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Object":        () => `<rect x="1" y="3" width="10" height="8" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.1"/>`,
  "Contract":               () => `<path d="M2,1 L10,1 L10,11 L2,11 Z M4,4 L8,4 M4,6 L8,6 M4,8 L7,8" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Representation":         () => `<rect x="1" y="2" width="10" height="8" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="3" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1"/><line x1="3" y1="7" x2="8" y2="7" stroke="currentColor" stroke-width="1"/>`,
  "Product":                () => `<rect x="1" y="1" width="10" height="10" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.2"/>`,

  "Application Component":     () => `<rect x="2" y="2" width="8" height="9" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="0" y="3.5" width="4" height="2.5" stroke="currentColor" fill="white" stroke-width="1"/><rect x="0" y="7" width="4" height="2.5" stroke="currentColor" fill="white" stroke-width="1"/>`,
  "Application Collaboration": () => `<circle cx="4" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="8" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Interface":     () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Function":      () => `<path d="M3,2 L3,10 M3,6 L9,6 M9,2 L9,10" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Interaction":   () => `<line x1="1" y1="6" x2="5" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="7.5" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><line x1="10" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2"/>`,
  "Application Process":       () => `<path d="M1,3 L8,3 L11,6 L8,9 L1,9 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Event":         () => `<path d="M1,4 L7,4 L11,6 L7,8 L1,8 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Service":       () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Data Object":               () => `<rect x="1" y="2" width="10" height="9" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.1"/>`,

  "Node":                     () => `<path d="M2,9 L2,3 L8,1 L10,3 L10,9 L4,11 Z M2,3 L4,5 L10,3 M4,5 L4,11" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Device":                   () => `<path d="M2,9 L2,3 L8,1 L10,3 L10,9 L4,11 Z M2,3 L4,5 L10,3 M4,5 L4,11" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="3" y="6" width="4" height="3" stroke="currentColor" fill="none" stroke-width="0.9"/>`,
  "System Software":          () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1"/>`,
  "Technology Collaboration": () => `<circle cx="4" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="8" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Interface":     () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Path":                     () => `<line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.4"/><path d="M8,3 L11,6 L8,9" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M4,3 L1,6 L4,9" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Communication Network":    () => `<circle cx="6" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="6" y1="1" x2="6" y2="4" stroke="currentColor" stroke-width="1"/><line x1="6" y1="8" x2="6" y2="11" stroke="currentColor" stroke-width="1"/><line x1="1" y1="6" x2="4" y2="6" stroke="currentColor" stroke-width="1"/><line x1="8" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1"/>`,
  "Technology Function":      () => `<path d="M2,1 L2,11 M2,6 L8,6 M8,1 L8,11" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Process":       () => `<path d="M1,3 L8,3 L11,6 L8,9 L1,9 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Interaction":   () => `<line x1="1" y1="6" x2="5" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="7.5" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><line x1="10" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2"/>`,
  "Technology Event":         () => `<path d="M1,4 L7,4 L11,6 L7,8 L1,8 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Service":       () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Object":        () => `<rect x="1" y="2" width="10" height="9" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.1"/>`,
  "Artifact":                 () => `<path d="M2,1 L8,1 L11,4 L11,11 L2,11 Z M8,1 L8,4 L11,4" stroke="currentColor" fill="none" stroke-width="1.1"/>`,

  "Equipment":           () => `<circle cx="6" cy="6" r="4" stroke="currentColor" fill="none" stroke-width="1.1"/><path d="M6,2 L6,4 M6,8 L6,10 M2,6 L4,6 M8,6 L10,6" stroke="currentColor" stroke-width="1.1"/><circle cx="6" cy="6" r="1.5" stroke="currentColor" fill="none" stroke-width="1"/>`,
  "Facility":            () => `<path d="M2,9 L2,3 L8,1 L10,3 L10,9 L4,11 Z M2,3 L4,5 L10,3 M4,5 L4,11 M4,7 L8,7 M4,9 L8,9" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Distribution Network":() => `<line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.4"/><path d="M8,3 L11,6 L8,9" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M4,3 L1,6 L4,9" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Material":            () => `<path d="M3,9 L3,5 L9,3 L9,7 Z M3,9 L9,7 M3,5 L9,3" stroke="currentColor" fill="none" stroke-width="1.1"/>`,

  "Work Package":         () => `<rect x="1" y="3" width="10" height="7" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1"/>`,
  "Deliverable":          () => `<path d="M2,1 L8,1 L11,4 L11,11 L2,11 Z M8,1 L8,4 L11,4" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Implementation Event": () => `<path d="M1,4 L7,4 L11,6 L7,8 L1,8 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Plateau":              () => `<rect x="1" y="2" width="10" height="8" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="2" y1="11" x2="11" y2="11" stroke="currentColor" stroke-width="1"/><line x1="3" y1="12.5" x2="11" y2="12.5" stroke="currentColor" stroke-width="1"/>`,
  "Gap":                  () => `<rect x="1" y="1" width="10" height="10" stroke="currentColor" fill="none" stroke-width="1.1" stroke-dasharray="2,2"/>`,

  "Location":  () => `<path d="M6,1 C3.5,1 1.5,3 1.5,5.5 C1.5,8.5 6,12 6,12 C6,12 10.5,8.5 10.5,5.5 C10.5,3 8.5,1 6,1 Z" stroke="currentColor" fill="none" stroke-width="1.1"/><circle cx="6" cy="5.5" r="1.5" stroke="currentColor" fill="none" stroke-width="1"/>`,
  "Grouping":  () => `<rect x="1" y="1" width="10" height="10" stroke="currentColor" fill="none" stroke-width="1.1" stroke-dasharray="3,2"/>`,
};

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
      case "document": {
        const fold = 12;
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

  const badgeMarkup = iconFn && elementName !== "Value" && elementName !== "Meaning" ? (() => {
    const pad = 3;
    const gx = w - 12 - pad;
    const gy = pad;
    return `<g transform="translate(${gx}, ${gy})" color="${stroke}">${iconFn()}</g>`;
  })() : "";

  return `<svg xmlns="http://www.w3.org/2000/svg"
    width="${size}" height="${Math.max(12, Math.round(size * (h / w)))}"
    viewBox="0 0 ${w} ${h}"
    preserveAspectRatio="xMidYMid meet"
    style="display:block">
      ${shapeMarkup}
      ${badgeMarkup}
    </svg>`;
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

  if (iconFn && elementName !== "Value" && elementName !== "Meaning") {
    const pad = 8;
    const glyphSize = 14;
    const iconX = x + (w - 1.6) - glyphSize - pad;
    const iconY = y + pad;
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
  const nameMax = Math.max(10, Math.floor((w - leftPad - 18) / 9));
  const words = String(elementName).split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = (current ? current + " " : "") + word;
    if (next.length > nameMax && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  const nameLines = lines.slice(0, 2);

  const nameStartY = y + h / 2 - (nameLines.length === 2 ? 6 : 0);
  for (let i = 0; i < nameLines.length; i++) {
    const t = svgEl("text", {
      x: x + leftPad,
      y: nameStartY + i * 18,
      "text-anchor": "start",
      "dominant-baseline": "middle",
      "font-size": "20",
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
// RELATIONSHIP ARROW DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const ARROW_STYLES = {
  C: { line: "solid",  startMarker: "diamond-filled", endMarker: "none" },
  G: { line: "solid",  startMarker: "diamond-open",   endMarker: "none" },
  I: { line: "solid",  startMarker: "circle-filled",  endMarker: "arrow-filled" },
  R: { line: "dashed", startMarker: "none",           endMarker: "triangle-open" }, 
  V: { line: "solid",  startMarker: "none",           endMarker: "arrow-open" },
  A: { line: "dashed", startMarker: "none",           endMarker: "arrow-open" },
  N: { line: "dashed", startMarker: "none",           endMarker: "arrow-open" },
  O: { line: "solid",  startMarker: "none",           endMarker: "none" },
  T: { line: "solid",  startMarker: "none",           endMarker: "arrow-filled" },
  F: { line: "dashed", startMarker: "none",           endMarker: "arrow-filled" },
  S: { line: "solid",  startMarker: "none",           endMarker: "triangle-open" },
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

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function shadeHex(hex, amt) {
  const h = (hex || "").trim(); const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return hex;
  const num = parseInt(m[1], 16); const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const t = amt >= 0 ? 255 : 0, p = Math.abs(amt);
  const rr = Math.round((t - r) * p + r), gg = Math.round((t - g) * p + g), bb = Math.round((t - b) * p + b);
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

function makeRelLabel(mx, my, labelLines, {
  fontSize = 9.5,
  lineH = 11.5,
  hopIndex = null,
  showBadges = true,
  hasChoices = false,
  /** Vertical edges: badge and relation name sit on opposite sides of the arrow (no overlap with the stroke). */
  verticalStraddle = false,
} = {}) {
  const labelG = svgEl("g", { class: "rel-label" });

  const straddle = verticalStraddle && hopIndex != null && showBadges;
  const textX = straddle ? mx + 44 : mx;
  const badgeCx = straddle ? mx - 44 : mx;
  const hitPadX = straddle ? 100 : 45;
  const hitPadY = straddle ? 28 : 25;
  const hitBox = svgEl("rect", {
    x: mx - hitPadX, y: my - hitPadY, width: hitPadX * 2, height: hitPadY * 2,
    fill: "transparent", cursor: "pointer",
  });
  labelG.appendChild(hitBox);

  let badgeG = null;
  if (hopIndex != null && showBadges) {
    badgeG = svgEl("g", { class: "rel-label-badge" });
    const badgeY = straddle ? my : my - 15;
    const badgeCircle = svgEl("circle", {
      cx: badgeCx, cy: badgeY, r: hasChoices ? "11" : "9",
      fill: "var(--accent, #1e3a5f)", stroke: "#ffffff", "stroke-width": "1.5",
      style: "transition: all 0.15s ease;",
    });
    const badgeText = svgEl("text", {
      x: badgeCx, y: badgeY + 1, "text-anchor": "middle", "dominant-baseline": "central",
      "font-size": "10", "font-family": "DM Sans, system-ui, sans-serif", "font-weight": "800",
      fill: "#ffffff", style: "transition: all 0.15s ease;",
    });
    badgeText.textContent = hasChoices ? `${hopIndex} ▾` : String(hopIndex);

    badgeG.appendChild(badgeCircle);
    badgeG.appendChild(badgeText);
  }

  const codeLabel = svgEl("text", {
    x: textX,
    y: my,
    "text-anchor": straddle ? "start" : "middle",
    "font-size": String(fontSize),
    "font-family": "DM Sans, system-ui, sans-serif",
    fill: "var(--lbl-fill, #2f2f2b)",
    "paint-order": "stroke",
    stroke: "var(--lbl-stroke, var(--surface, #ffffff))",
    "stroke-width": "7",
    "stroke-linejoin": "round",
    style: "transition: fill 0.15s ease, stroke 0.15s ease;",
  });

  (labelLines ?? [""]).forEach((ln, i) => {
    const tspan = svgEl("tspan", { x: textX, dy: i === 0 ? "0" : String(lineH) });
    tspan.textContent = ln;
    codeLabel.appendChild(tspan);
  });

  labelG.appendChild(codeLabel);
  if (badgeG) labelG.appendChild(badgeG);

  return { labelG, codeLabel };
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

function drawSwimlaneLabel(svg, { layer, laneY }) {
  const clipId = `lane-label-clip-${layer.id}`;
  const defs = svg.querySelector("defs") ?? (() => {
    const d = svgEl("defs", {});
    svg.insertBefore(d, svg.firstChild);
    return d;
  })();

  const clipPath = svgEl("clipPath", { id: clipId });
  clipPath.appendChild(svgEl("rect", {
    x: 0,
    y: laneY,
    width: LANE_LABEL_W,
    height: LANE_H,
  }));
  defs.appendChild(clipPath);

  const labelG = svgEl("g", { "clip-path": `url(#${clipId})` });

  const maxTextW = Math.max(10, LANE_LABEL_W - LANE_LABEL_PAD_X * 2);
  const maxTextH = Math.max(10, LANE_H - LANE_LABEL_PAD_Y * 2);

  const fontFamily = "DM Sans, system-ui, sans-serif";
  const fontWeight = "850";
  const lineHFactor = 1.15;

  let fontSize = 13;
  let lines = [];
  for (; fontSize >= 9; fontSize--) {
    lines = wrapSvgTextLines(svg, layer.label, maxTextW, {
      fontSize,
      fontFamily,
      fontWeight,
      maxLines: LANE_LABEL_MAX_LINES,
    });
    const lineH = fontSize * lineHFactor;
    const totalH = lines.length * lineH;
    if (totalH <= maxTextH + 0.1) break;
  }

  const lineH = fontSize * lineHFactor;
  const totalH = lines.length * lineH;
  const startY = laneY + LANE_H / 2 - totalH / 2 + lineH / 2;
  const x = LANE_LABEL_PAD_X;

  lines.forEach((ln, i) => {
    const t = svgEl("text", {
      x,
      y: startY + i * lineH,
      "text-anchor": "start",
      "dominant-baseline": "middle",
      "font-size": String(fontSize),
      "font-family": fontFamily,
      "font-weight": fontWeight,
      fill: layer.borderColor,
    });
    t.textContent = ln;
    labelG.appendChild(t);
  });

  return labelG;
}

// ─────────────────────────────────────────────────────────────────────────────
// ELEMENT BOX DRAWING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polished Element Drawer with Multi-line Text Wrapping
 */


function drawStandardElement(name, x, y, w, h, fontSize = 11) {
  const shape = SHAPES[name] ?? { type: "rounded" };
  const color = getColor(name);
  const iconFn = ICONS[name];
  
  const g = document.createElementNS(SVG_NS, "g");
  g.appendChild(drawShape(shape.type, x, y, w, h, color));

  // Spec legend: Value & Meaning (mint) have no corner glyph; chamfered lavender boxes do.
  const showCornerGlyph = iconFn && w > 60 && name !== "Value" && name !== "Meaning";
  if (showCornerGlyph) {
    const badgeX = x + w - ICON_BADGE_SIZE - ICON_PAD;
    const badgeY = y + ICON_PAD;
    // color property passes down to the SVG "currentColor" strokes
    const iconG = svgEl("g", { transform: `translate(${badgeX}, ${badgeY})`, color: "#2f2f2b" });
    const glyph = document.createElementNS(SVG_NS, "svg");
    glyph.setAttribute("viewBox", "0 0 12 12");
    glyph.setAttribute("width", ICON_GLYPH_SIZE);
    glyph.setAttribute("height", ICON_GLYPH_SIZE);
    glyph.innerHTML = iconFn();
    iconG.appendChild(glyph);
    g.appendChild(iconG);
  }

  // FIXED: Split strings longer than 8 chars into 2 lines
  const words = name.split(" ");
  let lines = (words.length > 1 && name.length > 8) ? 
              [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : 
              [name];

  const lineH = fontSize + 2;
  const startY = y + (h / 2) - ((lines.length - 1) * (lineH / 2));

  lines.forEach((line, i) => {
    const txt = svgEl("text", {
      x: x + w / 2, y: startY + (i * lineH),
      "text-anchor": "middle", "dominant-baseline": "central",
      "font-size": fontSize, "font-family": "DM Sans, system-ui, sans-serif",
      "font-weight": "700", fill: "#111", "pointer-events": "none"
    });
    txt.textContent = line;
    g.appendChild(txt);
  });

  return g;
}

function drawElement(name, x, y, w = EL_W, h = EL_H, { swimlaneSimple = false } = {}) {
  const safeName = String(name || "");
  const pattern = COMPOSITE_PATTERNS[safeName];
  const g = svgEl("g", { class: "archimate-element", style: "cursor: pointer;" });

  if (!pattern || swimlaneSimple) {
    const box = drawStandardElement(safeName, x, y, w, h);
    box.onclick = () => window.showElementDetails?.(safeName);
    g.appendChild(box);
    return g;
  }

  // COMPOSITE PATTERN: Vertical Aggregation (e.g., Nodes into Path)
  const vOffset = 85;
  const subTop = drawStandardElement(pattern.sub, x, y - vOffset, w, h, 10);
  subTop.onclick = () => window.showElementDetails?.(pattern.sub);
  g.appendChild(subTop);
  const subBot = drawStandardElement(pattern.sub, x, y + vOffset, w, h, 10);
  subBot.onclick = () => window.showElementDetails?.(pattern.sub);
  g.appendChild(subBot);
  
  const mainBox = drawStandardElement(safeName, x, y, w, h);
  mainBox.onclick = () => window.showElementDetails?.(safeName);
  g.appendChild(mainBox);

  // Aggregation arrows marked with clickable "G" badges
  const drawAggLine = (fromY, isTop) => {
    const arrowG = svgEl("g", { class: "clickable", style: "cursor:pointer;" });
    const xM = x + w/2, yS = isTop ? fromY + h : fromY, yE = isTop ? y : y + h;
    arrowG.appendChild(svgEl("path", { d: `M ${xM} ${yS} L ${xM} ${yE}`, stroke: "#333", "stroke-width": "1.5", fill: "none", "stroke-dasharray": "4,2" }));
    const dSize = 6, dY = isTop ? yE - dSize : yE + dSize;
    arrowG.appendChild(svgEl("path", { d: `M ${xM} ${yE} L ${xM-dSize} ${dY} L ${xM} ${isTop?yE-dSize*2:yE+dSize*2} L ${xM+dSize} ${dY} Z`, stroke: "#333", "stroke-width": "1.5", fill: "#fff" }));
    
    const badgeY = isTop ? yS + 18 : yS - 18;
    arrowG.appendChild(svgEl("circle", { cx: xM, cy: badgeY, r: "8", fill: "#64748b", stroke: "#fff" }));
    arrowG.appendChild(svgEl("text", { x: xM, y: badgeY, "text-anchor": "middle", "dominant-baseline": "central", "font-size": "9", fill: "#fff", "font-weight": "800" }, "G"));
    
    arrowG.onclick = (e) => { e.stopPropagation(); window.expandHopDetails?.(null, { from: pattern.sub, to: safeName, code: "G" }); };
    return arrowG;
  };
  g.appendChild(drawAggLine(y - vOffset, true));
  g.appendChild(drawAggLine(y + vOffset, false));
  return g;
}

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
    case "document": {
      const fold = 12;
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
  const list = (codes ?? []).map(c => c.toUpperCase());
  return list.map(c => RELATIONSHIPS[c]?.name ?? c).join(" / ");
}


// ─────────────────────────────────────────────────────────────────────────────
// ARROW DRAWING (Restored Interaction & Orthogonal Routing)
// ─────────────────────────────────────────────────────────────────────────────


function drawArrow(x1, y1, x2, y2, codes, isDirect, svg, { hopIndex = null, showBadges = true } = {}) {
  const chosenCode = typeof window !== 'undefined' && window.state?.userChoices?.[hopIndex];
  const activeCode = chosenCode ?? (codes?.[0] ?? "O");
  const UPPER = activeCode.toUpperCase();
  const style = ARROW_STYLES[UPPER] ?? ARROW_STYLES["O"];

  ensureMarkers(svg);
  
  // Orthogonal routing; straight vertical when endpoints share x (avoids degenerate Manhattan segments).
  const midX = x1 + (x2 - x1) / 2;
  const sameX = Math.abs(x1 - x2) < 0.5;
  const d = sameX
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : (Math.abs(y1 - y2) < 5)
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;

  const g = svgEl("g", { class: "archimate-arrow clickable-arrow", style: "cursor: pointer;" });
  if (hopIndex != null) g.setAttribute("data-hop", String(hopIndex));

  const isDash = style.line === "dashed" || !isDirect;

  g.appendChild(svgEl("path", { d: d, stroke: "transparent", "stroke-width": "15", fill: "none", class: "archimate-arrow-hit" }));
  g.appendChild(svgEl("path", {
    d: d, stroke: "#333", "stroke-width": "1.6", fill: "none",
    class: "archimate-arrow-stroke",
    "stroke-dasharray": isDash ? "6,3" : "none",
    "marker-end": style.endMarker !== "none" ? `url(#end-${UPPER}-${isDirect ? "d" : "r"})` : "",
    "marker-start": style.startMarker !== "none" ? `url(#start-${UPPER})` : "",
    "pointer-events": "none",
  }));

  const labelLines = wrapLabel(describeRelCodesForDiagramLabel([activeCode]));
  const isVertical = sameX && Math.abs(y1 - y2) > 8;
  // Mid-gap along the segment; vertical uses straddle layout (badge left / label right of the stroke).
  const tAlong = isVertical && hopIndex != null
    ? 0.5 + (hopIndex % 2) * 0.08
    : 0.5;
  const span = y2 - y1;
  const labelAlong = isVertical
    ? y1 + span * tAlong
    : (y1 + y2) / 2;
  const labelX = midX;
  const labelY = isVertical
    ? labelAlong + (showBadges ? 0 : 4)
    : labelAlong - 10;
  const { labelG } = makeRelLabel(labelX, labelY, labelLines, {
    hopIndex,
    showBadges,
    hasChoices: (codes?.length ?? 0) > 1,
    verticalStraddle: isVertical,
  });
  g.appendChild(labelG);

  g.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (typeof window.clearHopHighlights === "function") window.clearHopHighlights();
    if ((codes?.length ?? 0) > 1 && typeof window.cycleEdgeChoice === "function") window.cycleEdgeChoice(hopIndex);
    if (typeof window.highlightHop === "function") window.highlightHop(hopIndex);
    if (typeof window.expandHopDetails === "function") window.expandHopDetails(hopIndex, { scroll: false });
  });

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
    const m = svgEl("marker", { id, markerWidth:"10", markerHeight:"7", refX:"10", refY:"3.5", orient:"auto" });
    m.appendChild(svgEl("polyline", {
      points:"0 0, 10 3.5, 0 7",
      fill:"none",
      stroke: color,
      "stroke-width":"1.2",
      "stroke-linejoin":"miter",
    }));
    return m;
  };
  const mkFilled = (id) => {
    const m = svgEl("marker", { id, markerWidth:"10", markerHeight:"7", refX:"10", refY:"3.5", orient:"auto" });
    m.appendChild(svgEl("polygon", { points:"0 0, 10 3.5, 0 7", fill: color }));
    return m;
  };
  const mkTriangle = (id) => {
    const m = svgEl("marker", { id, markerWidth:"10", markerHeight:"8", refX:"10", refY:"4", orient:"auto" });
    m.appendChild(svgEl("polygon", {
      points:"0 0, 10 4, 0 8",
      fill:"#ffffff",
      stroke: color,
      "stroke-width":"1.2",
      "stroke-linejoin":"miter",
    }));
    return m;
  };
  const mkDiamondFilled = (id) => {
    const m = svgEl("marker", { id, markerWidth:"12", markerHeight:"8", refX:"0", refY:"4", orient:"auto" });
    m.appendChild(svgEl("polygon", { points:"0 4, 6 0, 12 4, 6 8", fill: color }));
    return m;
  };
  const mkDiamondOpen = (id) => {
    const m = svgEl("marker", { id, markerWidth:"12", markerHeight:"8", refX:"0", refY:"4", orient:"auto" });
    m.appendChild(svgEl("polygon", {
      points:"0 4, 6 0, 12 4, 6 8",
      fill:"white",
      stroke: color,
      "stroke-width":"1.2",
      "stroke-linejoin":"miter",
    }));
    return m;
  };
  const mkCircle = (id) => {
    const m = svgEl("marker", { id, markerWidth:"8", markerHeight:"8", refX:"4", refY:"4", orient:"auto" });
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

function renderCompact(svg, flatSteps, { showBadges = true, alignVertical = false } = {}) {
  const hasPattern = flatSteps.some(s => COMPOSITE_PATTERNS[s.element]);
  /** Must match drawElement composite layout (sub-elements above/below main box). */
  const COMPOSITE_V_OFF = 85;

  const verticalGapBetween = (prevEl, nextEl) => {
    const down = COMPOSITE_PATTERNS[prevEl] ? (COMPOSITE_V_OFF + EL_H) : EL_H;
    const up = COMPOSITE_PATTERNS[nextEl] ? COMPOSITE_V_OFF : 0;
    // Extra space between boxes so vertical connectors are long enough for labels beside the line.
    return down + 48 + up;
  };

  if (!alignVertical) {
    const totalW = flatSteps.length * EL_W + (flatSteps.length - 1) * EL_GAP + 100;
    const totalH = hasPattern ? 320 : 150;
    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    svg.setAttribute("width", "100%"); svg.setAttribute("height", String(totalH));
    let x = 50; const y = totalH / 2 - EL_H / 2;
    const positions = [];
    for (let i = 0; i < flatSteps.length; i++) {
      const step = flatSteps[i];
      positions.push({ x, y, cy: y + EL_H / 2, cx: x + EL_W / 2 });
      x += EL_W + EL_GAP;
    }
    for (let i = 0; i < flatSteps.length; i++) {
      svg.appendChild(drawElement(flatSteps[i].element, positions[i].x, positions[i].y));
    }
    for (let i = 1; i < flatSteps.length; i++) {
      const step = flatSteps[i];
      if (!step.codes) continue;
      const prev = positions[i - 1];
      const cur = positions[i];
      svg.appendChild(drawArrow(prev.x + EL_W, prev.cy, cur.x, cur.y + EL_H / 2, step.codes, step.isDirect, svg, { hopIndex: i, showBadges }));
    }
    return;
  }

  // Vertical stack: spacing must account for composite patterns (taller than EL_H).
  if (!flatSteps.length) return; // defensive; renderPath should already guard

  let y = 50;
  if (flatSteps[0] && COMPOSITE_PATTERNS[flatSteps[0].element]) y += COMPOSITE_V_OFF;

  const positions = [];
  for (let i = 0; i < flatSteps.length; i++) {
    const step = flatSteps[i];
    positions.push({ x: 0, y, cy: y + EL_H / 2, cx: 0 });
    if (i < flatSteps.length - 1) y += verticalGapBetween(step.element, flatSteps[i + 1].element);
  }

  // Horizontal padding around the centered column (labels sit on the arrow at midX).
  const totalW = EL_W + 220;
  const xCenter = totalW / 2 - EL_W / 2;
  for (const p of positions) {
    p.x = xCenter;
    p.cx = xCenter + EL_W / 2;
  }

  const lastEl = flatSteps[flatSteps.length - 1]?.element;
  const lastY = positions[positions.length - 1].y;
  const bottomExtent = lastEl && COMPOSITE_PATTERNS[lastEl] ? (COMPOSITE_V_OFF + EL_H) : EL_H;
  const totalH = lastY + bottomExtent + 50;

  svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
  svg.setAttribute("width", "100%"); svg.setAttribute("height", String(totalH));
  svg.setAttribute("preserveAspectRatio", "xMidYMin meet");

  for (let i = 0; i < flatSteps.length; i++) {
    svg.appendChild(drawElement(flatSteps[i].element, positions[i].x, positions[i].y));
  }
  for (let i = 1; i < flatSteps.length; i++) {
    const step = flatSteps[i];
    if (!step.codes) continue;
    const prev = positions[i - 1];
    const cur = positions[i];
    const prevEl = flatSteps[i - 1].element;
    const curEl = flatSteps[i].element;
    const y1 = COMPOSITE_PATTERNS[prevEl] ? prev.y + COMPOSITE_V_OFF + EL_H : prev.y + EL_H;
    const y2 = COMPOSITE_PATTERNS[curEl] ? cur.y - COMPOSITE_V_OFF : cur.y;
    svg.appendChild(drawArrow(prev.cx, y1, cur.cx, y2, step.codes, step.isDirect, svg, { hopIndex: i, showBadges }));
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
function getSwimlaneLayer(elementName, index, flatSteps) {
  const raw = getLayer(elementName);
  if (raw !== "Composite") return raw;
  for (let j = index - 1; j >= 0; j--) {
    const L = getLayer(flatSteps[j].element);
    if (L !== "Composite") return L;
  }
  for (let j = index + 1; j < flatSteps.length; j++) {
    const L = getLayer(flatSteps[j].element);
    if (L !== "Composite") return L;
  }
  return "Business";
}

/**
 * Consecutive path steps with the same swimlane layer and column form one vertical stack in that lane.
 */
function buildSwimlaneStackGroups(flatSteps, cols) {
  const groups = [];
  let gStart = 0;
  for (let i = 1; i <= flatSteps.length; i++) {
    if (i < flatSteps.length) {
      const L = getSwimlaneLayer(flatSteps[i].element, i, flatSteps);
      const prevL = getSwimlaneLayer(flatSteps[i - 1].element, i - 1, flatSteps);
      if (L === prevL && cols[i] === cols[i - 1]) continue;
    }
    groups.push({ start: gStart, end: i - 1 });
    gStart = i;
  }
  return groups;
}

function renderSwimlane(svg, flatSteps, { showBadges = true, alignVertical = false } = {}) {
  /** Swimlanes use a single box per element (no aggregation fork); arrows attach to box edges. */
  const usedLayerIds = [...new Set(flatSteps.map((s, i) => getSwimlaneLayer(s.element, i, flatSteps)))];
  const usedLayers = typeof LAYERS !== 'undefined' ? LAYERS.filter(l => usedLayerIds.includes(l.id)) : [];
  if (usedLayers.length === 0) return;

  const laneH = alignVertical ? LANE_H_MIN_VERTICAL : LANE_H_MIN;
  const colGap = alignVertical ? SWIM_COL_GAP_VERTICAL : EL_GAP;
  const topPad = alignVertical ? 6 : 20;
  const bottomPad = alignVertical ? 12 : 40;

  let positions;
  let maxXCol = 0;
  let totalH;
  let laneMetrics = {};
  let currentY = topPad;

  if (alignVertical) {
    // Columns: stay in one column when the layer changes (vertical flow); only advance when
    // re-entering a layer that already has a node in this column (e.g. App → Business → App).
    // Same layer as previous → same column; elements are stacked inside the lane (handled below).
    const cols = [];
    let currentXCol = 0;
    const occupied = new Set();
    for (let i = 0; i < flatSteps.length; i++) {
      const layerId = getSwimlaneLayer(flatSteps[i].element, i, flatSteps);
      if (i > 0) {
        const prevLayerId = getSwimlaneLayer(flatSteps[i - 1].element, i - 1, flatSteps);
        if (layerId !== prevLayerId && occupied.has(`${currentXCol},${layerId}`)) currentXCol++;
      }
      cols.push(currentXCol);
      if (currentXCol > maxXCol) maxXCol = currentXCol;
      occupied.add(`${currentXCol},${layerId}`);
    }

    const groups = buildSwimlaneStackGroups(flatSteps, cols);
    const layerMaxStackPx = {};
    usedLayers.forEach((layer) => { layerMaxStackPx[layer.id] = EL_H; });
    for (const g of groups) {
      const n = g.end - g.start + 1;
      const lid = getSwimlaneLayer(flatSteps[g.start].element, g.start, flatSteps);
      const stackPx = n * EL_H + (n - 1) * SWIM_STACK_GAP;
      layerMaxStackPx[lid] = Math.max(layerMaxStackPx[lid], stackPx);
    }

    currentY = topPad;
    usedLayers.forEach((layer) => {
      const h = Math.max(LANE_H_MIN_VERTICAL, layerMaxStackPx[layer.id] + 12);
      laneMetrics[layer.id] = { y: currentY, h, center: currentY + h / 2 };
      currentY += h;
    });
    totalH = currentY + bottomPad;

    positions = [];
    for (const g of groups) {
      const lid = getSwimlaneLayer(flatSteps[g.start].element, g.start, flatSteps);
      const m = laneMetrics[lid];
      const n = g.end - g.start + 1;
      const stackH = n * EL_H + (n - 1) * SWIM_STACK_GAP;
      const startY = m.y + (m.h - stackH) / 2;
      for (let k = 0, i = g.start; i <= g.end; i++, k++) {
        const y = startY + k * (EL_H + SWIM_STACK_GAP);
        const col = cols[i];
        const x = LANE_LABEL_W + 40 + col * (EL_W + colGap);
        positions[i] = { x, y, cy: y + EL_H / 2 };
      }
    }
  } else {
    usedLayers.forEach((layer) => {
      laneMetrics[layer.id] = { y: currentY, h: laneH, center: currentY + (laneH / 2) };
      currentY += laneH;
    });

    totalH = currentY + bottomPad;
    let currentXCol = 0;
    const occupied = new Set();
    positions = flatSteps.map((step, i) => {
      const layerId = getSwimlaneLayer(step.element, i, flatSteps);
      const m = laneMetrics[layerId];
      if (i > 0) currentXCol++;
      if (currentXCol > maxXCol) maxXCol = currentXCol;
      occupied.add(`${currentXCol},${layerId}`);
      return { x: LANE_LABEL_W + 40 + currentXCol * (EL_W + colGap), y: m.center - EL_H / 2, cy: m.center };
    });
  }

  const swimlaneW = (maxXCol + 1) * (EL_W + colGap) + LANE_LABEL_W + 80 + (alignVertical ? 32 : 0);
  svg.setAttribute("viewBox", `0 0 ${swimlaneW} ${totalH}`);
  svg.setAttribute("width", "100%"); svg.setAttribute("height", String(totalH));
  if (alignVertical) svg.setAttribute("preserveAspectRatio", "xMidYMin meet");

  usedLayers.forEach((layer) => {
    const m = laneMetrics[layer.id];
    svg.appendChild(svgEl("rect", { x: 0, y: m.y, width: "100%", height: m.h, fill: layer.color, stroke: layer.borderColor, opacity: "0.5" }));
    svg.appendChild(drawSwimlaneLabel(svg, { layer, laneY: m.y, actualH: m.h }));
  });

  positions.forEach((pos, i) => svg.appendChild(drawElement(flatSteps[i].element, pos.x, pos.y, EL_W, EL_H, { swimlaneSimple: true })));
  for (let i = 1; i < flatSteps.length; i++) {
    const step = flatSteps[i];
    if (!step.codes) continue;
    const a = positions[i - 1];
    const b = positions[i];
    const aCx = a.x + EL_W / 2;
    const bCx = b.x + EL_W / 2;
    const sameColumn = Math.abs(a.x - b.x) < 0.5;
    if (alignVertical && sameColumn) {
      // Path order can run bottom→top; attach the nearest edges between lanes (not bottom→top through boxes).
      const prevEl = flatSteps[i - 1].element;
      const curEl = flatSteps[i].element;
      const pComp = false;
      const cComp = false;
      const upward = a.y > b.y;
      const x1 = aCx, x2 = bCx;
      let y1; let y2;
      if (upward) {
        y1 = pComp ? a.y - COMPOSITE_V_OFF : a.y;
        y2 = cComp ? b.y + COMPOSITE_V_OFF + EL_H : b.y + EL_H;
      } else {
        y1 = pComp ? a.y + COMPOSITE_V_OFF + EL_H : a.y + EL_H;
        y2 = cComp ? b.y - COMPOSITE_V_OFF : b.y;
      }
      svg.appendChild(drawArrow(x1, y1, x2, y2, step.codes, step.isDirect, svg, { hopIndex: i, showBadges }));
    } else {
      svg.appendChild(drawArrow(a.x + EL_W, a.cy, b.x, b.cy, step.codes, step.isDirect, svg, { hopIndex: i, showBadges }));
    }
  }
}

function drawSwimlaneLabel(svg, { layer, laneY, actualH }) {
  const clipId = `lane-label-clip-${layer.id}`;
  const defs = svg.querySelector("defs") || svg.appendChild(svgEl("defs", {}));
  const clipPath = svgEl("clipPath", { id: clipId });
  clipPath.appendChild(svgEl("rect", { x: 0, y: laneY, width: LANE_LABEL_W, height: actualH }));
  defs.appendChild(clipPath);

  const labelG = svgEl("g", { "clip-path": `url(#${clipId})` });
  const lines = wrapSvgTextLines(svg, layer.label, LANE_LABEL_W - 20, { fontSize: 12, fontWeight: "850" });
  const lineH = 14;
  const startY = laneY + actualH / 2 - (lines.length * lineH) / 2 + lineH / 2;

  lines.forEach((ln, i) => {
    labelG.appendChild(svgEl("text", { x: 10, y: startY + i * lineH, fill: layer.borderColor, "font-size": "12", "font-weight": "850", "dominant-baseline": "middle" }, ln));
  });
  return labelG;
}


// ─────────────────────────────────────────────────────────────────────────────
// RENDER PATH (PUBLIC ENTRY)
// ─────────────────────────────────────────────────────────────────────────────


function renderPath(container, segments, { mode = "compact", segmentPathIndex = 0, showBadges = true, alignVertical = false } = {}) {
  container.innerHTML = "";
  if (!segments || segments.length === 0) return;
  const flatSteps = flattenSegments(segments, segmentPathIndex);
  if (!flatSteps.length) return;
  const svg = svgEl("svg", { xmlns: SVG_NS });
  container.appendChild(svg);
  if (mode === "swimlane") {
    renderSwimlane(svg, flatSteps, { showBadges, alignVertical });
  } else {
    renderCompact(svg, flatSteps, { showBadges, alignVertical });
  }
}

function clearDiagram(container) {
  container.innerHTML = "";
}


function getAspect(elementName) { return typeof ELEMENTS !== 'undefined' && ELEMENTS[elementName] ? ELEMENTS[elementName].aspect : "Composite"; }

function getLayer(elementName) { return typeof ELEMENTS !== 'undefined' && ELEMENTS[elementName] ? ELEMENTS[elementName].layer : "Unknown"; }
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

function getRelationVisualSnippet(code, isDirect) {
  const UPPER = String(code || "O").toUpperCase();
  const style = ARROW_STYLES[UPPER] ?? ARROW_STYLES["O"];
  const isDash = style.line === "dashed";
  const endMarker = style.endMarker !== "none" ? `url(#end-${UPPER}-${isDirect ? 'd' : 'r'})` : "";
  const startMarker = style.startMarker !== "none" ? `url(#start-${UPPER})` : "";
  return `<svg width="80" height="30" style="overflow:visible; margin: 0 15px;"><line x1="5" y1="15" x2="65" y2="15" stroke="#334155" stroke-width="2.5" stroke-dasharray="${isDash ? '5,3' : 'none'}" marker-end="${endMarker}" marker-start="${startMarker}" /></svg>`;
}

function explainEdge(fromEl, toEl, activeCode, isDirect, hasChoices, isProvisional) {
  const fromAspect = getAspect(fromEl); const toAspect = getAspect(toEl);
  const rel = typeof window.RELATIONSHIPS !== 'undefined' ? window.RELATIONSHIPS[activeCode] : null;
  const primaryRelName = rel?.name ?? activeCode;

  const pill = (name) => {
    const icon = typeof window.getElementMiniSvg === "function" ? window.getElementMiniSvg(name, 18) : "";
    return `<div style="display: flex; align-items: center; gap: 8px; background: white; padding: 6px 12px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1); font-weight: 700; color: #334155; font-size: 13px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">${icon} ${name}</div>`;
  };

  const visualHeader = `<div style="display: flex; align-items: center; justify-content: center; background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px dashed #cbd5e1;">${pill(fromEl)}${getRelationVisualSnippet(activeCode, isDirect)}${pill(toEl)}</div>`;

  const keyFacts = `<div class="edge-kicker"><div class="edge-kicker-row" style="display:flex; justify-content:space-between; align-items:center;"><div class="edge-rel"><strong>${primaryRelName}</strong></div><div class="edge-tags"><span class="tag ${isDirect?'tag-direct':'tag-derived'}">${isDirect?'Direct':'Derived'}</span></div></div><div style="margin-top:12px; color:#475569; font-size:13.5px; line-height:1.5;"><strong>Justification:</strong> ${fromEl} ${relationshipVerb(primaryRelName)} ${toEl}.</div><ul class="edge-bullets" style="margin-top: 15px; color: #475569; font-size: 13px;"><li><strong>Metamodel check</strong>: <em>${fromAspect}</em> → <em>${toAspect}</em> <button class="mm-jump" type="button" data-mm-from="${encodeURIComponent(fromEl)}" data-mm-to="${encodeURIComponent(toEl)}" data-mm-rel="${encodeURIComponent(primaryRelName)}">Show on metamodel</button></li></ul></div>`;

  return visualHeader + keyFacts + `<details class="explain-details" style="margin-top: 20px;"><summary>Spec Tables & Definitions</summary><div>${typeof renderAspectGrid === 'function' ? renderAspectGrid(fromAspect, toAspect, fromEl, toEl) : ''}${typeof renderElementConnections === 'function' ? renderElementConnections(fromEl, toEl) : ''}</div></details>`;
}


function explainEdge(fromEl, toEl, activeCode, isDirect, hasChoices, isProvisional) {
  const fromAspect = getAspect(fromEl); const toAspect = getAspect(toEl);
  const fromLayer = getLayer(fromEl); const toLayer = getLayer(toEl);
  const ruleKey = getAspectRuleKey(fromEl, toEl); const layerRuleKey = getLayerRuleKey(fromEl, toEl);
  
  const aspectRule = typeof ASPECT_RULES !== 'undefined' ? ASPECT_RULES[ruleKey] : null;
  const layerRule  = typeof LAYER_RULES !== 'undefined' ? LAYER_RULES[layerRuleKey] : null;
  const rel = typeof RELATIONSHIPS !== 'undefined' ? RELATIONSHIPS[activeCode] : null;
  const primaryRelName = rel?.name ?? activeCode;

  const mmFrom = typeof metamodelRoleLabelForElement === 'function' ? metamodelRoleLabelForElement(fromEl) : {label: ""};
  const mmTo = typeof metamodelRoleLabelForElement === 'function' ? metamodelRoleLabelForElement(toEl) : {label: ""};

  const pill = (name) => {
    let icon = typeof window.getElementMiniSvg === "function" ? window.getElementMiniSvg(name, 18).replace(/currentColor/g, "#334155").replace('<svg ', '<svg style="color: #334155; fill: none; opacity: 0.8;" ') : "";
    return `<span style="display: inline-flex; align-items: center; gap: 6px; background: #ffffff; padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(51, 65, 85, 0.2); font-size: 12px; font-weight: 600; color: #334155;">${icon} ${name}</span>`;
  };

  const visualHeader = `<div style="display: flex; align-items: center; justify-content: center; background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px dashed #cbd5e1;">${pill(fromEl)}${getRelationVisualSnippet(activeCode, isDirect)}${pill(toEl)}</div>`;

  const keyFacts = `
    <div class="edge-kicker">
      <div class="edge-kicker-row" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="edge-rel"><strong>${primaryRelName}</strong> <cite>${rel?.section ?? ""}</cite></div>
        <div class="edge-tags"><span class="tag ${isDirect?'tag-direct':'tag-derived'}">${isDirect?'Direct':'Derived'}</span><span class="edge-codes">[${activeCode}]</span></div>
      </div>
      <div style="margin-top:8px; color:var(--text-2); font-size:13px;"><strong>Justification:</strong> ${fromEl} ${relationshipVerb(primaryRelName)} ${toEl}.</div>
      <ul class="edge-bullets" style="margin-top: 12px;">
        <li><strong>Metamodel check</strong>: <em>${fromAspect}</em> → <em>${toAspect}</em> <button class="mm-jump" type="button" data-mm-from="${encodeURIComponent(fromEl)}" data-mm-to="${encodeURIComponent(toEl)}" data-mm-rel="${encodeURIComponent(primaryRelName)}">Show on metamodel</button></li>
        ${mmFrom.label || mmTo.label ? `<li><strong>Metamodel roles</strong>: ${fromEl} = <em>${mmFrom.label ?? "—"}</em> → ${toEl} = <em>${mmTo.label ?? "—"}</em></li>` : ""}
        ${layerRule ? `<li><strong>Layer pattern</strong>: ${layerRule.explanation} <cite>${layerRule.section}</cite></li>` : ""}
      </ul>
    </div>`;

  const details = `<details class="explain-details" style="margin-top: 16px;"><summary>Spec Tables & Definitions</summary><div>${typeof renderAspectGrid === 'function' ? renderAspectGrid(fromAspect, toAspect, fromEl, toEl) : ''}${typeof renderElementConnections === 'function' ? renderElementConnections(fromEl, toEl) : ''}</div></details>`;

  return visualHeader + keyFacts + details;
}

function explainEdge(fromEl, toEl, activeCode, isDirect, hasChoices, isProvisional) {
  const fromAspect = getAspect(fromEl);
  const toAspect   = getAspect(toEl);
  const fromLayer  = getLayer(fromEl);
  const toLayer    = getLayer(toEl);
  const ruleKey    = getAspectRuleKey(fromEl, toEl);
  const aspectRule = ASPECT_RULES[ruleKey];
  const layerRuleKey = getLayerRuleKey(fromEl, toEl);
  const layerRule  = LAYER_RULES[layerRuleKey];
  const mmFrom = metamodelRoleLabelForElement(fromEl);
  const mmTo   = metamodelRoleLabelForElement(toEl);
  const rel = RELATIONSHIPS[activeCode];
  const primaryRelName = rel?.name ?? activeCode;
  const dirRules = RELATIONSHIP_DIRECTIONALITY[activeCode];

  const pill = (name) => {
    const textColor = "#334155";
    const icon = typeof window.getElementMiniSvg === "function" ? window.getElementMiniSvg(name, 18) : "";
    return `<div style="display: flex; align-items: center; gap: 8px; background: white; padding: 6px 12px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1); font-weight: 700; color: ${textColor}; font-size: 13px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">${icon} ${name}</div>`;
  };

  const visualHeader = `<div style="display: flex; align-items: center; justify-content: center; background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px dashed #cbd5e1;">${pill(fromEl)}${getRelationVisualSnippet(activeCode, isDirect)}${pill(toEl)}</div>`;

  const keyFacts = `
    <div class="edge-kicker">
      <div class="edge-kicker-row" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="edge-rel"><strong>${primaryRelName}</strong> <cite>${rel?.section ?? ""}</cite></div>
        <div class="edge-tags"><span class="tag ${isDirect ? 'tag-direct' : 'tag-derived'}">${isDirect ? 'Direct' : 'Derived'}</span><span class="edge-codes">[${activeCode}]</span></div>
      </div>
      <div style="margin-top:12px; color:var(--text-2); font-size:13.5px; line-height:1.5;"><strong>Justification:</strong> ${fromEl} ${relationshipVerb(primaryRelName)} ${toEl}.</div>
      <ul class="edge-bullets" style="margin-top: 15px;">
        <li><strong>Metamodel check</strong>: <em>${fromAspect}</em> → <em>${toAspect}</em> <button class="mm-jump" type="button" data-mm-from="${encodeURIComponent(fromEl)}" data-mm-to="${encodeURIComponent(toEl)}" data-mm-rel="${encodeURIComponent(primaryRelName)}">Show on metamodel</button></li>
        ${mmFrom.label || mmTo.label ? `<li><strong>Metamodel roles</strong>: ${fromEl} = <em>${mmFrom.label ?? "—"}</em> → ${toEl} = <em>${mmTo.label ?? "—"}</em></li>` : ""}
        ${dirRules ? `<li><strong>Direction</strong>: ${dirRules.rule} <cite>${dirRules.section}</cite></li>` : ""}
        ${fromLayer !== toLayer && layerRule ? `<li><strong>Layer pattern</strong>: ${layerRule.explanation} <cite>${layerRule.section}</cite></li>` : ""}
      </ul>
    </div>`;

  const details = `<details class="explain-details" style="margin-top: 20px;"><summary>Spec Tables & Definitions</summary><div>${renderAspectGrid(fromAspect, toAspect, fromEl, toEl)}${renderElementConnections(fromEl, toEl)}</div></details>`;

  return visualHeader + keyFacts + details;
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
 * Extracts the user-defined waypoints (From, To, and any Mid-points).
 */
function extractWaypoints(segments) {
  if (!segments || segments.length === 0) return [];
  const wps = segments.map(s => s.from);
  wps.push(segments[segments.length - 1].to);
  return wps;
}

/**
 * Determines the dominant relationship type in a path for the summary text.
 */
function characterisePath(flatSteps) {
  const counts = {};
  for (const step of flatSteps) {
    if (!step.codes) continue;
    for (const c of step.codes) {
      const u = c.toUpperCase();
      counts[u] = (counts[u] ?? 0) + 1;
    }
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

function explainPath(segments, selectedPathIndex = 0, { constrained = true } = {}) {
  try {
    if (!segments || segments.length === 0) return "";
    const flatSteps = flattenSegments(segments, selectedPathIndex);
    if (flatSteps.length === 0) return "";

    const waypoints    = extractWaypoints(segments);
    const midpoints    = waypoints.slice(1, -1);
    const fromEl       = flatSteps[0].element;
    const toEl         = flatSteps[flatSteps.length - 1].element;
    const hopCount     = flatSteps.length - 1;
    const derivedCount = flatSteps.filter(s => s.isDirect === false).length;
    const transitions  = detectLayerTransitions(flatSteps);
    const pattern      = characterisePath(flatSteps);
    const parts        = [];

    if (constrained && midpoints.length > 0) {
      const midList = midpoints.map(m => `<strong>${m}</strong>`).join(", ");
      parts.push(`<div class="explain-waypoint-note">
        Path constrained to pass through ${midList}. The navigator found a valid route satisfying this constraint.
      </div>`);
    }

    // One meta line: hop count + dominant pattern + direct/derived — layer journey is visible in the strip and detailed per step below.
    let metaLine = `<strong>${hopCount}</strong> hop${hopCount !== 1 ? "s" : ""} · ${pattern}`;
    metaLine += derivedCount > 0
      ? ` · <span class="tag tag-derived">${derivedCount} derived (§5.7)</span>`
      : ` · <span class="tag tag-direct">All direct (Appendix B)</span>`;

    const stepElementHtml = (elementName) => {
      const safeName = String(elementName ?? "");
      const textColor = "#334155"; // Softer slate gray
      const borderColor = "rgba(51, 65, 85, 0.2)"; // Light, transparent border
      let icon = "";
      if (typeof window !== "undefined" && typeof window.getElementMiniSvg === "function") {
        try { 
          // Match icon color to text color
          icon = window.getElementMiniSvg(safeName, 20)
                  .replace(/currentColor/g, textColor)
                  .replace('<svg ', `<svg style="color: ${textColor}; fill: none; opacity: 0.8;" `); 
        } catch(e) {}
      }
      return `
        <button type="button" class="step-el el-info-trigger" data-element="${encodeURIComponent(safeName)}"
          title="Learn more (spec definition)"
          style="display: inline-flex; align-items: center; gap: 8px; background: #ffffff !important; padding: 5px 12px; border-radius: 10px; border: 1px solid ${borderColor} !important; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); margin: 0 4px; cursor: pointer; font: inherit; color: inherit;">
          <span style="flex-shrink: 0; display: flex; align-items: center;">${icon}</span>
          <span class="step-el-name" style="color: ${textColor} !important; font-weight: 600 !important; font-size: 13px !important; letter-spacing: -0.01em; text-shadow: none !important;">
            ${safeName}
          </span>
        </button>`;
    };

    const strip = flatSteps
      .map(s => stepElementHtml(s.element))
      .join(`<span class="explain-strip-arrow" style="margin: 0 6px; color: var(--text-3, #94a3b8); font-weight: bold;">→</span>`);

    parts.push(`<div class="explain-path-overview">
      <div class="explain-summary">
        <h3>${fromEl} → ${toEl}</h3>
        <div class="explain-element-strip explain-element-strip--in-overview">
          ${strip}
        </div>
        <p class="explain-path-meta">${metaLine}</p>
      </div>
    </div>`);

    parts.push(`<details class="explain-element-defs" style="margin-bottom: 24px; background: var(--surface-2, #f8fafc); padding: 12px; border-radius: 8px; border: 1px solid var(--border-light, #e2e8f0);">
      <summary style="outline: none;">Spec excerpts for elements on this path (${flatSteps.length})</summary>
      <div style="margin-top: 12px;">`);
    
    for (const step of flatSteps) {
      parts.push(elementSummary(step.element));
    }
    
    parts.push(`</div></details>`);

    parts.push(`<div class="explain-steps-section"><h4>Step-by-step justification</h4>`);

    for (let i = 1; i < flatSteps.length; i++) {
      const prev = flatSteps[i - 1];
      const curr = flatSteps[i];

      const transition = transitions.find(t => t.atStep === i);
      if (transition) {
        parts.push(`<div class="explain-layer-crossing">
          ${layerCrossingSentence(transition.fromLayer, transition.toLayer)}
        </div>`);
      }

      const isJunction = midpoints.includes(curr.element);
      const waypointBadge = isJunction ? `<span class="tag tag-waypoint">Waypoint</span>` : "";

      const safeCodes = curr.codes || [];
      const hasChoices = safeCodes.length > 1;
      const chosenCode = typeof window !== 'undefined' && window.state?.userChoices?.[i];
      const isProvisional = hasChoices && !chosenCode;
      const activeCode = chosenCode ?? (safeCodes[0] ?? "O");

      let headerConnector = `<span class="explain-arrow" aria-hidden="true">→</span>`;
      
      if (hasChoices) {
          const options = safeCodes.map(c => {
             const cStr = String(c || "O");
             const name = RELATIONSHIPS[cStr.toUpperCase()]?.name || cStr;
             const sel = cStr === activeCode ? "selected" : "";
             return `<option value="${cStr}" ${sel}>${name}</option>`;
          }).join("");
          
          headerConnector = `
            <span class="explain-arrow" aria-hidden="true">→</span>
            <select class="edge-choice-select" onchange="setEdgeChoice(${i}, this.value)" onclick="event.stopPropagation()">
              ${options}
            </select>
            <span class="explain-arrow" aria-hidden="true">→</span>
          `;
      }

      parts.push(`<div class="explain-edge-block">
        <div class="explain-edge-title">
          <span class="step-badge" style="${isProvisional ? 'background:#8b99af;border-color:#8b99af' : ''}" aria-label="Step ${i}">${i}</span>
          ${waypointBadge}
          ${stepElementHtml(prev.element)}
          ${headerConnector}
          ${stepElementHtml(curr.element)}
        </div>
        <div data-hop="${i}" data-from="${prev.element}" data-to="${curr.element}">
          ${explainEdge(prev.element, curr.element, activeCode, curr.isDirect ?? true, hasChoices, isProvisional)}
        </div>
      </div>`);
    }

    parts.push(`</div>`);

    const uniqueCodes = [...new Set(
      flatSteps.slice(1).map((s, idx) => {
        const hopIdx = idx + 1;
        const chosen = typeof window !== 'undefined' && window.state?.userChoices?.[hopIdx] 
                       ? window.state.userChoices[hopIdx] 
                       : (s.codes && s.codes[0]) ?? "O";
        return String(chosen).toUpperCase();
      })
    )];
    
    const citations = uniqueCodes
      .map(c => RELATIONSHIPS[c])
      .filter(Boolean)
      .map(r => `${r.name} (${r.section})`)
      .join(" · ");

    parts.push(`<div class="explain-closing">
      <strong>Spec references:</strong> Appendix B (Normative) · ${citations}
      ${derivedCount > 0 ? "· §5.7 Derivation Rules" : ""}
    </div>`);

    return parts.join("\n");
    
  } catch (err) {
    console.error("Fatal error inside explainPath:", err);
    return `<div style="padding: 20px; color: red; background: #fee2e2; border-radius: 8px;">
      <strong>Error generating explanation:</strong> ${err.message}. Check console for details.
    </div>`;
  }
}

function explainNoPath(fromEl, toEl, reason = "unknown") {
  const fromAspect = getAspect(fromEl);
  const toAspect   = getAspect(toEl);
  const fromLayer  = getLayer(fromEl);
  const toLayer    = getLayer(toEl);
  const ruleKey    = getAspectRuleKey(fromEl, toEl);
  const aspectRule = ASPECT_RULES[ruleKey];

  const parts = [];

  parts.push(`
    <div class="explain-no-path">
      <h3>No valid path found</h3>
      <p><strong>${fromEl}</strong> → <strong>${toEl}</strong></p>
    </div>`);

  parts.push(elementSummary(fromEl));
  parts.push(elementSummary(toEl));

  if (reason === "viewpoint") {
    parts.push(`
      <div class="explain-reason">
        <strong>Reason: Viewpoint filter active</strong><br/>
        One or both of these elements is outside the currently selected viewpoint's
        element palette. Disable the viewpoint filter to search across all elements.
      </div>`);
    return parts.join("\n");
  }

  if (reason === "depth") {
    parts.push(`
      <div class="explain-reason">
        <strong>Reason: No path within ${4} hops</strong><br/>
        These elements may be connected via a longer path, but the navigator
        limits search depth to 4 hops per segment for clarity. Consider adding
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
        and <strong>${toEl}</strong> within the current search depth and filters.
        <br/><br/>
        Try:
        <ul>
          <li>Adding a waypoint to break the path into two segments</li>
          <li>Enabling + Derived in the control panel (Appendix B)</li>
          <li>Disabling the viewpoint filter</li>
        </ul>
      </div>`);
  }

  parts.push(renderAspectGrid(fromAspect, toAspect, fromEl, toEl));
  parts.push(renderElementConnections(fromEl, toEl));

  return parts.join("\n");
}

function renderElementConnections(fromEl, toEl) {
  if (typeof MATRIX === 'undefined') return '';

  const codeLabel = (codes) => codes
    .map(c => `<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:10px">${c}</code>`)
    .join(' ');

  const fromEdges = MATRIX.filter(e => e.from === fromEl && e.direct.length > 0);
  const fromByLayer = {};
  fromEdges.forEach(e => {
    const layer = ELEMENTS[e.to]?.layer || 'Other';
    if (!fromByLayer[layer]) fromByLayer[layer] = [];
    fromByLayer[layer].push(e);
  });

  const toEdges = MATRIX.filter(e => e.to === toEl && e.direct.length > 0);
  const toByLayer = {};
  toEdges.forEach(e => {
    const layer = ELEMENTS[e.from]?.layer || 'Other';
    if (!toByLayer[layer]) toByLayer[layer] = [];
    toByLayer[layer].push(e);
  });

  const LAYER_COLORS = {
    Motivation:'#dcdcff', Strategy:'#e8d4b8', Business:'#f5e87a',
    Application:'#a8d4a8', Technology:'#a0c4e8', Physical:'#d4c8a0',
    Implementation:'#e8b8b8', Composite:'#e0e0e0',
  };

  const renderLayerGroup = (label, byLayer, directionLabel) => {
    if (Object.keys(byLayer).length === 0) {
      return `<p style="font-size:12px;color:var(--text-3);font-style:italic;margin:4px 0">
        No direct relationships from ${label} (Appendix B).
        Only Association (O) may be permitted — excluded from pathfinding.
      </p>`;
    }
    return Object.entries(byLayer).map(([layer, edges]) => {
      const bg = LAYER_COLORS[layer] || '#f0f0f0';
      return `<div style="margin:4px 0">
        <span style="display:inline-block;background:${bg};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;margin-right:6px">${layer}</span>
        ${edges.map(e => {
          const target = directionLabel === 'from' ? e.to : e.from;
          return `<span style="font-size:11px">${target} ${codeLabel(e.direct)}</span>`;
        }).join(' &nbsp; ')}
      </div>`;
    }).join('');
  };

  return `
    <div style="margin-top:16px;border:1px solid var(--border);border-radius:6px;overflow:hidden">
      <div style="padding:8px 12px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text-2)">
        Appendix B — Direct relationships (from the scanned tables)
      </div>

      <div style="padding:10px 12px;border-bottom:1px solid var(--border-light)">
        <div style="font-size:11px;font-weight:600;color:var(--text-2);margin-bottom:6px">
          FROM <strong>${fromEl}</strong>
          <span style="font-weight:400;color:var(--text-3)"> · ${ELEMENTS[fromEl]?.layer} · ${ELEMENTS[fromEl]?.aspect}</span>
          — outgoing direct relationships:
        </div>
        ${renderLayerGroup(fromEl, fromByLayer, 'from')}
      </div>

      <div style="padding:10px 12px">
        <div style="font-size:11px;font-weight:600;color:var(--text-2);margin-bottom:6px">
          TO <strong>${toEl}</strong>
          <span style="font-weight:400;color:var(--text-3)"> · ${ELEMENTS[toEl]?.layer} · ${ELEMENTS[toEl]?.aspect}</span>
          — elements with a direct path in:
        </div>
        ${renderLayerGroup(toEl, toByLayer, 'to')}
      </div>
    </div>`;
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
          Shows which aspect-to-aspect connections the metamodel permits.
          <span class="aspect-grid-source">Source: §4.2, Appendix B.</span>
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
      const cellContent = isValid
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

// === ui/metamodelDiagram.js ===
/**
 * ui/metamodelDiagram.js
 * ArchiMate Path Navigator — Metamodel Diagram
 */

const W = 680;   // total SVG width
const H = 520;   // total SVG height (extra space for element names below boxes)

const BOXES = {
  "external-behavior": {
    id: "box-ext-behavior",
    x: 220, y: 40, w: 180, h: 80,
    label: ["External Behavior Element", "(Service)"],
    italic: true,
  },
  "external-active": {
    id: "box-ext-active",
    x: 460, y: 40, w: 180, h: 80,
    label: ["External Active Structure", "Element (Interface)"],
    italic: true,
  },
  "passive": {
    id: "box-passive",
    x: 20, y: 160, w: 160, h: 80,
    label: ["Passive Structure", "Element"],
    italic: true,
  },
  "internal-behavior": {
    id: "box-int-behavior",
    x: 220, y: 200, w: 180, h: 80,
    label: ["Internal Behavior", "Element"],
    italic: true,
  },
  "internal-active": {
    id: "box-int-active",
    x: 460, y: 200, w: 180, h: 80,
    label: ["Internal Active Structure", "Element"],
    italic: true,
  },
  "event": {
    id: "box-event",
    x: 220, y: 360, w: 180, h: 80,
    label: ["Event"],
    italic: true,
  },
};

const ARROWS = [
  {
    id: "arr-extbeh-extact",
    roles: ["external-behavior", "external-active"],
    label: "assigned to",
    path: `M460,80 L400,80`,
    labelX: 428, labelY: 70,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-extact-extbeh",
    roles: ["external-active", "external-behavior"],
    label: "serves",
    path: `M460,100 L400,100`,
    labelX: 424, labelY: 115,
    markerEnd: "none", markerStart: "none",
    bidirectional: false,
    customPath: `M460,95 L400,95`,
    belowLabel: true,
  },
  {
    id: "arr-extact-intact",
    roles: ["external-active", "internal-active"],
    label: "composed of",
    path: `M550,120 L550,200`,
    labelX: 558, labelY: 165,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intact-extact",
    roles: ["internal-active", "external-active"],
    label: "serves",
    path: `M530,200 L530,120`,
    labelX: 486, labelY: 165,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intact-intbeh",
    roles: ["internal-active", "internal-behavior"],
    label: "assigned to",
    path: `M460,240 L400,240`,
    labelX: 408, labelY: 258,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-extbeh",
    roles: ["internal-behavior", "external-behavior"],
    label: "realizes",
    path: `M310,200 L310,120`,
    labelX: 284, labelY: 160,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-extbeh-intact",
    roles: ["external-behavior", "internal-active"],
    label: "serves",
    path: `M400,90 Q440,90 440,200`,
    labelX: 448, labelY: 140,
    markerEnd: "arrow", markerStart: "none",
  },
  // Forward counterpart to “serves” above (e.g. Business Role → Business Service = Assignment in §4.2).
  {
    id: "arr-intact-extbeh",
    roles: ["internal-active", "external-behavior"],
    label: "assigned to",
    path: `M550,200 Q380,150 310,120`,
    labelX: 412, labelY: 168,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-passive",
    roles: ["internal-behavior", "passive"],
    label: "accesses",
    path: `M220,240 L180,240 L180,200`,
    labelX: 130, labelY: 228,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-extbeh-passive",
    roles: ["external-behavior", "passive"],
    label: "accesses",
    path: `M220,80 L100,80 L100,160`,
    labelX: 50, labelY: 115,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-self",
    roles: ["internal-behavior", "internal-behavior"],
    label: "triggers / flows to",
    path: `M260,200 C220,180 200,220 240,230 L260,230`,
    labelX: 148, labelY: 230,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-extbeh-self",
    roles: ["external-behavior", "external-behavior"],
    label: "triggers / flows to",
    path: `M300,40 C260,20 240,60 270,70 L290,70`,
    labelX: 330, labelY: 34,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-extbeh-agg",
    roles: ["internal-behavior", "external-behavior"],
    label: "aggregates /\ncomposed of",
    path: `M330,200 L330,120`,
    labelX: 356, labelY: 168,
    markerEnd: "diamond", markerStart: "none",
  },
  {
    id: "arr-extbeh-passive-tf",
    roles: ["external-behavior", "passive"],
    label: "triggers /\nflows to",
    path: `M220,70 L100,70 L100,160`,
    labelX: 42, labelY: 108,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-event-intbeh",
    roles: ["event", "internal-behavior"],
    label: "triggers / flows to",
    path: `M310,360 L310,280`,
    labelX: 318, labelY: 325,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-event",
    roles: ["internal-behavior", "event"],
    label: "triggers / flows to",
    path: `M290,280 L290,360`,
    labelX: 220, labelY: 325,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-event-self",
    roles: ["event", "event"],
    label: "triggers / flows to",
    path: `M300,440 C260,460 240,420 270,410 L290,410`,
    labelX: 290, labelY: 470,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intact-event",
    roles: ["internal-active", "event"],
    label: "assigned to",
    path: `M460,280 L460,340 L400,400`,
    labelX: 448, labelY: 320,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-passive-event",
    roles: ["passive", "event"],
    label: "triggers / flows to",
    path: `M100,240 L100,400 L220,400`,
    labelX: 42, labelY: 330,
    markerEnd: "arrow", markerStart: "none",
  },
];

const COLORS = {
  boxFill:        "#ffffff",
  boxStroke:      "#111111",
  boxStrokeW:     2,
  arrowStroke:    "#333333",
  arrowStrokeW:   1.5,
  labelFill:      "#333333",
  labelFont:      "11px 'Georgia', serif",
  validFill:      "#6ee7b7",
  validStroke:    "#047857",
  invalidFill:    "#ffd4d4",
  invalidStroke:  "#cc1111",
  validArrow:     "#1a8a1a",
  invalidArrow:   "#cc1111",
  neutralArrow:   "#cccccc",
};

function el(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function makeArrowMarker(id, color) {
  const marker = el("marker", {
    id, markerWidth: "10", markerHeight: "7",
    refX: "10", refY: "3.5", orient: "auto",
  });
  const poly = el("polygon", { points: "0 0, 10 3.5, 0 7", fill: color });
  marker.appendChild(poly);
  return marker;
}

function makeDiamondMarker(id, color) {
  const marker = el("marker", {
    id, markerWidth: "12", markerHeight: "8",
    refX: "12", refY: "4", orient: "auto",
  });
  const poly = el("polygon", {
    points: "0 4, 6 0, 12 4, 6 8",
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

    svg.appendChild(g);
    _arrowEls[arrow.id] = g;
  }

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

    svg.appendChild(g);
    _boxEls[role] = g;
  }

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