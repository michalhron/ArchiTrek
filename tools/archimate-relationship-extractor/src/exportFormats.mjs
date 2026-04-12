import fs from "fs";
import path from "path";
import { csvEscape } from "./util.mjs";

export function buildDocument(elements, direct, derived, conflicts, meta) {
  const directByType = {};
  const derivedByType = {};
  for (const e of direct) {
    directByType[e.relation_type] = (directByType[e.relation_type] || 0) + 1;
  }
  for (const e of derived) {
    derivedByType[e.relation_type] = (derivedByType[e.relation_type] || 0) + 1;
  }

  let layerCrossD = 0;
  let layerCrossDer = 0;
  const elayer = new Map(elements.map((x) => [x.id, x.layer]));
  for (const e of direct) {
    if (elayer.get(e.source_id) && elayer.get(e.target_id) && elayer.get(e.source_id) !== elayer.get(e.target_id))
      layerCrossD++;
  }
  for (const e of derived) {
    if (elayer.get(e.source_id) && elayer.get(e.target_id) && elayer.get(e.source_id) !== elayer.get(e.target_id))
      layerCrossDer++;
  }

  return {
    metadata: {
      ontology: meta.ontology ?? "ArchiMate 3.2",
      generatedAt: new Date().toISOString(),
      elementCount: elements.length,
      directRelationshipCount: direct.length,
      derivedRelationshipCount: derived.length,
      sources: meta.sources ?? [],
    },
    elements,
    relations: { direct, derived },
    statistics: {
      directByType,
      derivedByType,
      layerCrossings: { direct: layerCrossD, derived: layerCrossDer },
    },
    conflicts,
  };
}

export function writeJson(outDir, doc) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "matrix.json"), JSON.stringify(doc, null, 2), "utf8");
}

export function writeCsv(outDir, doc) {
  fs.mkdirSync(outDir, { recursive: true });
  const dHeader = [
    "id",
    "source_id",
    "source_name",
    "source_type",
    "target_id",
    "target_name",
    "target_type",
    "relation_type",
    "relation_class",
    "is_direct",
    "accessType",
    "influenceSign",
    "influenceStrength",
  ];
  const linesD = [dHeader.join(",")];
  for (const r of doc.relations.direct) {
    const m = r.metadata || {};
    linesD.push(
      [
        csvEscape(r.id),
        csvEscape(r.source_id),
        csvEscape(r.source_name),
        csvEscape(r.source_type),
        csvEscape(r.target_id),
        csvEscape(r.target_name),
        csvEscape(r.target_type),
        csvEscape(r.relation_type),
        csvEscape(r.relation_class),
        "true",
        csvEscape(m.accessType),
        csvEscape(m.influenceSign),
        csvEscape(m.influenceStrength),
      ].join(",")
    );
  }
  fs.writeFileSync(path.join(outDir, "relations-direct.csv"), linesD.join("\n"), "utf8");

  const derHeader = [
    ...dHeader.slice(0, -3),
    "is_direct",
    "derivation_rule",
    "confidence",
    "derived_from_relation_ids",
    "derivation_path_json",
  ];
  const linesDer = [derHeader.join(",")];
  for (const r of doc.relations.derived) {
    linesDer.push(
      [
        csvEscape(r.id),
        csvEscape(r.source_id),
        csvEscape(r.source_name),
        csvEscape(r.source_type),
        csvEscape(r.target_id),
        csvEscape(r.target_name),
        csvEscape(r.target_type),
        csvEscape(r.relation_type),
        csvEscape(r.relation_class),
        "false",
        csvEscape(r.derivation_rule),
        csvEscape(r.confidence),
        csvEscape((r.derived_from_relation_ids || []).join(";")),
        csvEscape(JSON.stringify(r.derivation_path || [])),
      ].join(",")
    );
  }
  fs.writeFileSync(path.join(outDir, "relations-derived.csv"), linesDer.join("\n"), "utf8");
}

const PREFIX = "@prefix arch: <https://archimate.navigator/local#> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n\n";

export function writeTurtle(outDir, doc) {
  fs.mkdirSync(outDir, { recursive: true });
  const lines = [PREFIX];
  for (const r of doc.relations.direct) {
    const s = turtleIri(r.source_id);
    const o = turtleIri(r.target_id);
    const p = `arch:${r.relation_type}Direct`;
    lines.push(`### direct ${r.id}\n${s} ${p} ${o} .\n`);
  }
  for (const r of doc.relations.derived) {
    const s = turtleIri(r.source_id);
    const o = turtleIri(r.target_id);
    const p = `arch:${r.relation_type}Derived`;
    lines.push(
      `### derived ${r.id} ; rule=${r.derivation_rule} ; conf=${r.confidence}\n${s} ${p} ${o} .\n`
    );
  }
  fs.writeFileSync(path.join(outDir, "matrix-derived.ttl"), lines.join("\n"), "utf8");
}

function turtleIri(id) {
  if (id.startsWith("http") || id.startsWith("file:")) return `<${id}>`;
  const safe = String(id).replace(/[^\w\-:.]/g, "_");
  return `arch:inst_${safe}`;
}
