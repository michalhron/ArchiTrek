import fs from "fs";
import { ARCHI_FOLDER_TYPE_TO_LAYER, ARCHI_RELATIONSHIP_TYPE } from "./constants.mjs";
import { relId } from "./util.mjs";

/** PascalCase Archi element type → spaced label (matches ArchiMate names). */
export function archiTypeToLabel(typeName) {
  const base = typeName.replace(/^archimate:/, "");
  let s = base.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  s = s.replace(/ Of /g, " of ");
  return s;
}

function parseAttrs(block) {
  const out = {};
  for (const m of block.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/**
 * Parse Archi `.archimate` model (elements + relationships).
 * @param {string} filePath
 */
export function parseArchimateXml(filePath) {
  const xml = fs.readFileSync(filePath, "utf8");

  const elementsById = new Map();
  let folderType = "other";

  const folderOpen = /<folder\s+([^>]+)>/g;
  const folderClose = /<\/folder>/g;
  const elementTag = /<element\s+xsi:type="archimate:([^"]+)"([^>]*?)(\/\s*>|>)/g;

  const events = [];
  let m;
  while ((m = folderOpen.exec(xml))) {
    events.push({ pos: m.index, kind: "fo", attrs: m[1] });
  }
  while ((m = folderClose.exec(xml))) {
    events.push({ pos: m.index, kind: "fc" });
  }
  while ((m = elementTag.exec(xml))) {
    events.push({ pos: m.index, kind: "el", xsi: m[1], rest: m[2], selfClose: m[3].startsWith("/") });
  }
  events.sort((a, b) => a.pos - b.pos);

  const folderStack = [];
  for (const ev of events) {
    if (ev.kind === "fo") {
      const a = parseAttrs(ev.attrs);
      folderStack.push((a.type || "other").toLowerCase());
      folderType = folderStack[folderStack.length - 1];
    } else if (ev.kind === "fc") {
      folderStack.pop();
      folderType = folderStack.length ? folderStack[folderStack.length - 1] : "other";
    } else if (ev.kind === "el") {
      const xsi = ev.xsi;
      const a = parseAttrs(ev.rest);
      if (!a.id) continue;

      if (xsi.endsWith("Relationship")) continue;

      const name = (a.name || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      const label = archiTypeToLabel(xsi);
      const layer = ARCHI_FOLDER_TYPE_TO_LAYER[folderType] ?? "Other";

      elementsById.set(a.id, {
        id: a.id,
        name: name || label,
        type: label,
        layer,
        aspect: "Other",
      });
    }
  }

  const direct = [];
  const relRe = /<element\s+xsi:type="archimate:([^"]+Relationship)"([^>]*?)\/>/g;
  let rm;
  while ((rm = relRe.exec(xml))) {
    const xsi = rm[1];
    const a = parseAttrs(rm[2]);
    const relType = ARCHI_RELATIONSHIP_TYPE[xsi];
    if (!relType || !a.source || !a.target) continue;

    const src = elementsById.get(a.source);
    const tgt = elementsById.get(a.target);
    const relClassGuess =
      relType === "assignment" ||
      relType === "aggregation" ||
      relType === "composition" ||
      relType === "realization"
        ? "Structural"
        : relType === "triggering" || relType === "flow"
          ? "Dynamic"
          : relType === "specialization"
            ? "Other"
            : "Dependency";

    direct.push({
      id: a.id || relId(),
      source_id: a.source,
      source_name: src?.name ?? a.source,
      source_type: src?.type ?? "Unknown",
      target_id: a.target,
      target_name: tgt?.name ?? a.target,
      target_type: tgt?.type ?? "Unknown",
      relation_type: relType,
      relation_class: relClassGuess,
      is_direct: true,
      metadata: {
        accessType: a.accessType || undefined,
        influenceSign: a.influenceSign || undefined,
        influenceStrength: a.influenceStrength || undefined,
      },
    });
  }

  return {
    elements: [...elementsById.values()],
    direct,
  };
}
