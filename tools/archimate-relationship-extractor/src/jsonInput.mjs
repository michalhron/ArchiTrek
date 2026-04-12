import fs from "fs";

/**
 * Expected shape:
 * {
 *   elements: [{ id, name, type, layer?, aspect? }],
 *   relationships: [{ id?, source_id, target_id, relation_type, relation_class?, metadata? }]
 * }
 * @param {string} filePath
 */
export function parseJsonInput(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const elements = (raw.elements || []).map((e) => ({
    id: e.id,
    name: e.name ?? e.id,
    type: e.type ?? "Unknown",
    layer: e.layer ?? "Other",
    aspect: e.aspect ?? "Other",
  }));

  const direct = (raw.relationships || []).map((r) => ({
    id: r.id ?? `json-${r.source_id}-${r.relation_type}-${r.target_id}`,
    source_id: r.source_id,
    source_name: r.source_name ?? r.source_id,
    source_type: r.source_type ?? "Unknown",
    target_id: r.target_id,
    target_name: r.target_name ?? r.target_id,
    target_type: r.target_type ?? "Unknown",
    relation_type: r.relation_type,
    relation_class: r.relation_class ?? "Dependency",
    is_direct: true,
    metadata: r.metadata ?? {},
  }));

  return { elements, direct };
}
