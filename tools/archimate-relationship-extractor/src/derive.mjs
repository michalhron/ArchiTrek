import { relId } from "./util.mjs";

/**
 * @param {object[]} directEdges
 * @param {object} opts
 * @param {Set<string>} [opts.owlTransitiveTypes] — from ontology owl:TransitiveProperty
 * @param {Set<string>} [opts.extraTransitiveTypes] — heuristic closure (e.g. realization)
 * @param {boolean} [opts.crossRules=true]
 */
export function computeDerivations(directEdges, opts = {}) {
  const owlT = opts.owlTransitiveTypes ?? new Set();
  const extraT = opts.extraTransitiveTypes ?? new Set();
  const transitiveTypes = new Set([...owlT, ...extraT]);
  const useCross = opts.crossRules !== false;

  const derived = [];

  for (const t of transitiveTypes) {
    derived.push(...transitiveClosureOfType(directEdges, t));
  }

  if (useCross) {
    derived.push(...crossServingRealization(directEdges));
    derived.push(...crossAccessRealization(directEdges));
  }

  const directKeys = new Set(
    directEdges.map((e) => key3(e.source_id, e.target_id, e.relation_type))
  );

  const conflicts = [];
  for (const d of derived) {
    const k = key3(d.source_id, d.target_id, d.relation_type);
    if (directKeys.has(k)) {
      conflicts.push({
        kind: "direct_and_derived",
        message: `Same (${d.source_id} → ${d.target_id}) [${d.relation_type}] exists as direct and derived.`,
        relation_key: k,
      });
    }
  }

  const best = new Map();
  for (const d of derived) {
    const k = key3(d.source_id, d.target_id, d.relation_type);
    const prev = best.get(k);
    if (!prev || (d.confidence ?? 0) > (prev.confidence ?? 0)) best.set(k, d);
  }
  const dedup = [...best.values()];

  return { derived: dedup, conflicts };
}

function key3(s, t, r) {
  return `${s}\t${t}\t${r}`;
}

function transitiveClosureOfType(directEdges, relationType) {
  const adj = new Map();
  for (const e of directEdges) {
    if (e.relation_type !== relationType) continue;
    if (!adj.has(e.source_id)) adj.set(e.source_id, []);
    adj.get(e.source_id).push(e);
  }

  const out = [];
  const maxDepth = 24;

  for (const start of adj.keys()) {
    const queue = [{ node: start, path: /** @type {object[]} */ ([]) }];
    while (queue.length) {
      const { node, path } = queue.shift();
      for (const edge of adj.get(node) || []) {
        if (path.length && edge.id === path[path.length - 1].id) continue;
        const nextPath = [...path, edge];
        const dest = edge.target_id;
        if (nextPath.length >= 2) {
          const conf = Math.pow(0.95, nextPath.length - 1);
          out.push({
            id: relId(),
            source_id: start,
            source_name: nextPath[0].source_name,
            source_type: nextPath[0].source_type,
            target_id: dest,
            target_name: edge.target_name,
            target_type: edge.target_type,
            relation_type: relationType,
            relation_class: edge.relation_class,
            is_direct: false,
            derivation_rule: `transitive_${relationType}`,
            derivation_path: pathToDerivationSteps(start, nextPath),
            confidence: Math.max(0.5, conf),
            derived_from_relation_ids: nextPath.map((x) => x.id),
          });
        }
        if (nextPath.length < maxDepth) queue.push({ node: dest, path: nextPath });
      }
    }
  }
  return out;
}

function pathToDerivationSteps(start, edgesAlong) {
  const steps = [];
  let cur = start;
  for (const e of edgesAlong) {
    steps.push({
      element_id: cur,
      element_name: e.source_name,
      via_relation_type: e.relation_type,
    });
    cur = e.target_id;
  }
  steps.push({
    element_id: cur,
    element_name: edgesAlong[edgesAlong.length - 1]?.target_name ?? cur,
    via_relation_type: null,
  });
  return steps;
}

function crossServingRealization(directEdges) {
  const servingInto = new Map();
  const realizationFrom = new Map();
  for (const e of directEdges) {
    if (e.relation_type === "serving") {
      if (!servingInto.has(e.target_id)) servingInto.set(e.target_id, []);
      servingInto.get(e.target_id).push(e);
    }
    if (e.relation_type === "realization") {
      if (!realizationFrom.has(e.source_id)) realizationFrom.set(e.source_id, []);
      realizationFrom.get(e.source_id).push(e);
    }
  }

  const out = [];
  for (const [mid, servs] of servingInto) {
    const reals = realizationFrom.get(mid);
    if (!reals) continue;
    for (const s of servs) {
      for (const r of reals) {
        out.push({
          id: relId(),
          source_id: s.source_id,
          source_name: s.source_name,
          source_type: s.source_type,
          target_id: r.target_id,
          target_name: r.target_name,
          target_type: r.target_type,
          relation_type: "realization",
          relation_class: "Structural",
          is_direct: false,
          derivation_rule: "cross_layer_serving_to_realization",
          derivation_path: [
            { element_id: s.source_id, element_name: s.source_name, via_relation_type: "serving" },
            { element_id: mid, element_name: s.target_name, via_relation_type: "realization" },
            { element_id: r.target_id, element_name: r.target_name, via_relation_type: null },
          ],
          confidence: 0.85,
          derived_from_relation_ids: [s.id, r.id].filter(Boolean),
        });
      }
    }
  }
  return out;
}

function crossAccessRealization(directEdges) {
  const accessInto = new Map();
  const realizationFrom = new Map();
  for (const e of directEdges) {
    if (e.relation_type === "access") {
      if (!accessInto.has(e.target_id)) accessInto.set(e.target_id, []);
      accessInto.get(e.target_id).push(e);
    }
    if (e.relation_type === "realization") {
      if (!realizationFrom.has(e.source_id)) realizationFrom.set(e.source_id, []);
      realizationFrom.get(e.source_id).push(e);
    }
  }

  const out = [];
  for (const [mid, accs] of accessInto) {
    const reals = realizationFrom.get(mid);
    if (!reals) continue;
    for (const a of accs) {
      for (const r of reals) {
        out.push({
          id: relId(),
          source_id: a.source_id,
          source_name: a.source_name,
          source_type: a.source_type,
          target_id: r.target_id,
          target_name: r.target_name,
          target_type: r.target_type,
          relation_type: "access",
          relation_class: "Dependency",
          is_direct: false,
          derivation_rule: "transitive_access_via_realization",
          derivation_path: [
            { element_id: a.source_id, element_name: a.source_name, via_relation_type: "access" },
            { element_id: mid, element_name: a.target_name, via_relation_type: "realization" },
            { element_id: r.target_id, element_name: r.target_name, via_relation_type: null },
          ],
          confidence: 0.9,
          derived_from_relation_ids: [a.id, r.id].filter(Boolean),
        });
      }
    }
  }
  return out;
}
