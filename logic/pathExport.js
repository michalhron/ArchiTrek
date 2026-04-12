// === logic/pathExport.js ===
/**
 * Path export helpers for CSV and ArchiMate Model Exchange XML.
 * Open Group XSD 3.1 still uses namespace http://www.opengroup.org/xsd/archimate/3.0/
 * (see archimate3_Model.xsd targetNamespace, not /3.1/).
 * Export model uses one element instance per path node occurrence (no type dedup).
 */

/** Normative exchange namespace (archimate3_Model.xsd targetNamespace). */
const ARCHIMATE_EXCHANGE_NS = "http://www.opengroup.org/xsd/archimate/3.0/";
/** Same entry as OpenGroupXMLExchange test models (Diagram.xsd pulls in Model + View). */
const ARCHIMATE_SCHEMA_LOCATION =
  ARCHIMATE_EXCHANGE_NS + " http://www.opengroup.org/xsd/archimate/3.0/archimate3_Diagram.xsd";

export const DERIVED_NOTE =
  "Note: This relationship is derived. Consider modeling intermediate bridging elements.";

function flattenSegmentsForExport(segments, pathIndex) {
  const out = [];
  const idx = Number.isInteger(pathIndex) ? pathIndex : 0;
  for (let s = 0; s < (segments || []).length; s++) {
    const seg = segments[s];
    const p = seg?.paths?.[idx] ?? seg?.paths?.[0];
    if (!Array.isArray(p) || p.length === 0) continue;
    out.push(...(s === 0 ? p : p.slice(1)));
  }
  return out;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function xmlEscapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function xmlEscapeAttr(value) {
  return xmlEscapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function sanitizeFilenameToken(value, fallback) {
  const raw = String(value || "").trim();
  const compact = raw.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!compact) return fallback;
  return compact
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

function toPascalType(displayName) {
  const raw = String(displayName || "");
  const words = raw.match(/[A-Za-z0-9]+/g) || [];
  if (!words.length) return "UnknownElement";
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

function nextPrefixedId(prefix) {
  const p = String(prefix || "id").replace(/[^a-zA-Z]/g, "") || "id";
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const body = uuid.replace(/-/g, "").toLowerCase();
  return `${p}-${body}`;
}

function resolveRelationshipCodeFallback(step) {
  const first = Array.isArray(step?.codes) && step.codes.length ? step.codes[0] : "O";
  return String(first || "O").toUpperCase();
}

function classifyHopDerivation(step, codeUpper) {
  const code = String(codeUpper || "").toUpperCase();
  if (step?.isAssociation === true || code === "O") return "Fallback";

  const derived = (step?.matrixDerivedCodes || []).map((c) => String(c).toUpperCase());
  const direct = (step?.matrixDirectCodes || []).map((c) => String(c).toUpperCase());
  if (derived.includes(code)) return "Derived";
  if (direct.includes(code)) return "Explicit";
  if (step?.isDirect === false) return "Derived";
  return "Explicit";
}

export function buildPathExportData({
  segments,
  pathIndex = 0,
  relationships = {},
  resolveRelationshipCode,
} = {}) {
  const flatSteps = flattenSegmentsForExport(segments, pathIndex);
  if (!flatSteps.length) return null;

  const resolveCode =
    typeof resolveRelationshipCode === "function"
      ? resolveRelationshipCode
      : (step) => resolveRelationshipCodeFallback(step);

  const elements = [];
  const typeSeenCount = Object.create(null);
  for (let i = 0; i < flatSteps.length; i++) {
    const step = flatSteps[i] || {};
    const typeLabel = String(step.element || "Unknown Element");
    typeSeenCount[typeLabel] = (typeSeenCount[typeLabel] || 0) + 1;
    const ordinal = typeSeenCount[typeLabel];
    elements.push({
      index: i,
      displayType: typeLabel,
      xsiType: toPascalType(typeLabel),
      identifier: nextPrefixedId("id"),
      placeholderName: `[Placeholder ${typeLabel} ${ordinal}]`,
    });
  }

  const hops = [];
  let hasDerived = false;
  for (let i = 1; i < flatSteps.length; i++) {
    const from = elements[i - 1];
    const to = elements[i];
    const step = flatSteps[i] || {};
    const code = String(resolveCode(step, i) || "O").toUpperCase();
    const relMeta = relationships?.[code] ?? null;
    const relationshipType = relMeta?.name || (code === "O" ? "Association" : code);
    const derivation = classifyHopDerivation(step, code);
    if (derivation === "Derived") hasDerived = true;
    hops.push({
      hopNumber: i,
      sourceElementType: from.displayType,
      targetElementType: to.displayType,
      relationshipCode: code,
      relationshipType,
      relationshipDerivation: derivation,
      pedagogicalNote: derivation === "Derived" ? DERIVED_NOTE : "",
      sourceId: from.identifier,
      targetId: to.identifier,
      relationshipId: nextPrefixedId("rel"),
    });
  }

  return {
    elements,
    hops,
    hasDerived,
    derivedNote: DERIVED_NOTE,
    startType: elements[0]?.displayType || "Start",
    endType: elements[elements.length - 1]?.displayType || "End",
    hopCount: Math.max(0, elements.length - 1),
  };
}

export function buildPathExportCsv(exportData) {
  if (!exportData || !Array.isArray(exportData.hops) || !exportData.hops.length) return "";
  const header = [
    "Hop_Number",
    "Source_Element_Type",
    "Relationship_Type",
    "Target_Element_Type",
    "Relationship_Derivation",
    "Pedagogical_Note",
  ];
  const lines = [header.join(",")];
  for (const hop of exportData.hops) {
    lines.push(
      [
        hop.hopNumber,
        hop.sourceElementType,
        hop.relationshipType,
        hop.targetElementType,
        hop.relationshipDerivation,
        hop.pedagogicalNote,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\r\n");
}

export function buildPathExportXml(exportData) {
  if (!exportData || !Array.isArray(exportData.hops) || !exportData.hops.length) return "";
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<model xmlns="' +
      ARCHIMATE_EXCHANGE_NS +
      '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="' +
      xmlEscapeAttr(ARCHIMATE_SCHEMA_LOCATION) +
      '" identifier="' +
      xmlEscapeAttr(nextPrefixedId("model")) +
      '" version="3.1.0">'
  );
  lines.push('  <name xml:lang="en">ArchiTrek Path Export</name>');
  if (exportData.hasDerived) {
    lines.push(`  <!-- ${xmlEscapeText(DERIVED_NOTE)} -->`);
  }
  lines.push("  <elements>");
  for (const el of exportData.elements) {
    lines.push(
      `    <element identifier="${xmlEscapeAttr(el.identifier)}" xsi:type="${xmlEscapeAttr(el.xsiType)}">`
    );
    lines.push(`      <name xml:lang="en">${xmlEscapeText(el.placeholderName)}</name>`);
    lines.push("    </element>");
  }
  lines.push("  </elements>");
  lines.push("  <relationships>");
  for (const hop of exportData.hops) {
    lines.push(
      `    <relationship identifier="${xmlEscapeAttr(hop.relationshipId)}" source="${xmlEscapeAttr(hop.sourceId)}" target="${xmlEscapeAttr(hop.targetId)}" xsi:type="${xmlEscapeAttr(hop.relationshipType)}"/>`
    );
  }
  lines.push("  </relationships>");
  lines.push("</model>");
  return lines.join("\n");
}

export function buildPathExportFilename(exportData, extension) {
  const ext = String(extension || "txt").replace(/[^a-z0-9]/gi, "").toLowerCase() || "txt";
  const start = sanitizeFilenameToken(exportData?.startType, "Start");
  const end = sanitizeFilenameToken(exportData?.endType, "End");
  const hops = Number.isFinite(exportData?.hopCount) ? exportData.hopCount : 0;
  return `ArchiTrek-Path-${start}-to-${end}-${hops}Hops.${ext}`;
}

function getExportPayload(exportData, format) {
  const kind = String(format || "").toLowerCase();
  if (kind === "csv") {
    return {
      text: buildPathExportCsv(exportData),
      mimeType: "text/csv;charset=utf-8",
      extension: "csv",
    };
  }
  if (kind === "xml") {
    return {
      text: buildPathExportXml(exportData),
      mimeType: "application/xml;charset=utf-8",
      extension: "xml",
    };
  }
  return null;
}

export function createPathExportBlob(descriptor, format) {
  const exportData = buildPathExportData(descriptor);
  if (!exportData || !Array.isArray(exportData.hops) || !exportData.hops.length) return null;
  const payload = getExportPayload(exportData, format);
  if (!payload) return null;
  return {
    blob: new Blob([String(payload.text || "")], { type: payload.mimeType }),
    filename: buildPathExportFilename(exportData, payload.extension),
    mimeType: payload.mimeType,
    data: exportData,
  };
}
