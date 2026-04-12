import fs from "fs";
import { pathToFileURL } from "url";
import { Parser, Store, DataFactory } from "n3";

const { namedNode } = DataFactory;
const nn = (iri) => namedNode(iri);
import {
  RDF_TYPE,
  RDFS_LABEL,
  RDFS_SUBCLASS_OF,
  RDFS_SUBPROPERTY_OF,
  OWL_CLASS,
  OWL_OBJECT_PROPERTY,
  OWL_TRANSITIVE_PROPERTY,
  RELATION_PROPERTY_NAMES,
  EXCLUDE_ELEMENT_CLASSES,
  PROPERTY_TO_RELATION_CLASS,
} from "./constants.mjs";
import { localName, termId } from "./util.mjs";

/** @param {import('n3').Store} store @param {import('n3').Term} start @param {string} targetIri */
function reachesSuperclass(store, start, targetIri) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    const cid = termId(cur);
    if (cid === targetIri) return true;
    if (seen.has(cid)) continue;
    seen.add(cid);
    for (const q of store.getQuads(cur, RDFS_SUBCLASS_OF, null, null)) {
      if (q.object.termType === "NamedNode") stack.push(q.object);
    }
  }
  return false;
}

/** @param {import('n3').Store} store */
function findElementRootIri(store) {
  for (const q of store.getQuads(null, RDF_TYPE, nn(OWL_CLASS))) {
    const labs = store.getQuads(q.subject, RDFS_LABEL, null, null);
    for (const l of labs) {
      if (l.object.value === "Element") return termId(q.subject);
    }
  }
  for (const q of store.getQuads(null, RDF_TYPE, nn(OWL_CLASS))) {
    if (localName(termId(q.subject)) === "Element") return termId(q.subject);
  }
  return null;
}

function layerAndAspectFromSupers(store, classTerm) {
  const supers = new Set();
  const stack = [classTerm];
  while (stack.length) {
    const c = stack.pop();
    const id = termId(c);
    if (supers.has(id)) continue;
    supers.add(id);
    for (const q of store.getQuads(c, RDFS_SUBCLASS_OF, null, null)) {
      if (q.object.termType === "NamedNode") stack.push(q.object);
    }
  }

  let layer = "Other";
  const frag = (iri) => localName(iri);
  if ([...supers].some((u) => frag(u) === "MotivationAspect")) layer = "Motivation";
  else {
    for (const iri of supers) {
      const f = frag(iri);
      if (f === "StrategyLayer") layer = "Strategy";
      else if (f === "BusinessLayer") layer = "Business";
      else if (f === "ApplicationLayer") layer = "Application";
      else if (f === "TechnologyLayer") layer = "Technology";
      else if (f === "PhysicalLayer") layer = "Physical";
      else if (f === "ImplementationAndMigrationLayer") layer = "Implementation & Migration";
    }
  }

  let aspect = "Other";
  for (const iri of supers) {
    const f = frag(iri);
    if (
      f === "InternalActiveStructure" ||
      f === "ExternalActiveStructure" ||
      f === "ActiveStructure"
    ) {
      aspect = "ActiveStructure";
      break;
    }
    if (f === "PassiveStructure") {
      aspect = "PassiveStructure";
      break;
    }
    if (
      f === "InternalBehavior" ||
      f === "ExternalBehavior" ||
      f === "CollectiveBehavior" ||
      f === "BehaviorAspect"
    ) {
      aspect = "BehaviorAspect";
      break;
    }
    if (f === "MotivationAspect") {
      aspect = "MotivationAspect";
      break;
    }
    if (f === "CompositeElement" || f === "GenericComposite" || f === "LayerComposite") {
      aspect = "Composite";
      break;
    }
  }

  return { layer, aspect };
}

/**
 * Parse ArchiMate ontology TTL (schema + optional instance triples).
 * @param {string} filePath
 */
export function parseOntologyTtl(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const baseHref = pathToFileURL(filePath).href;
  const parser = new Parser({ baseIRI: baseHref });
  const store = new Store();
  for (const q of parser.parse(text)) store.addQuad(q);

  const elementRoot = findElementRootIri(store);
  const schemaElements = [];
  const schemaPropertyNodes = [];

  if (elementRoot) {
    for (const q of store.getQuads(null, RDF_TYPE, nn(OWL_CLASS))) {
      const subj = q.subject;
      if (subj.termType !== "NamedNode") continue;
      const ln = localName(termId(subj));
      if (EXCLUDE_ELEMENT_CLASSES.has(ln)) continue;
      if (!reachesSuperclass(store, subj, elementRoot)) continue;

      const labels = store.getQuads(subj, RDFS_LABEL, null, null);
      const name = labels[0]?.object.value ?? ln;
      const { layer, aspect } = layerAndAspectFromSupers(store, subj);
      schemaElements.push({
        id: termId(subj),
        name,
        type: name,
        layer,
        aspect,
      });
    }
  }

  const basePropByIri = new Map();
  for (const ln of ["structuralRelationship", "dependencyRelationship", "dynamicRelationship", "otherRelationship"]) {
    basePropByIri.set(new URL(`#${ln}`, baseHref).href, ln);
  }

  for (const q of store.getQuads(null, RDF_TYPE, nn(OWL_OBJECT_PROPERTY))) {
    const p = q.subject;
    if (p.termType !== "NamedNode") continue;
    const ln = localName(termId(p));
    let relClass = "Other";
    let walk = p;
    const seen = new Set();
    while (walk && walk.termType === "NamedNode" && !seen.has(termId(walk))) {
      seen.add(termId(walk));
      const sups = store.getQuads(walk, RDFS_SUBPROPERTY_OF, null, null);
      let next = null;
      for (const s of sups) {
        if (s.object.termType !== "NamedNode") continue;
        const oid = termId(s.object);
        const bln = basePropByIri.get(oid);
        if (bln && PROPERTY_TO_RELATION_CLASS[bln]) {
          relClass = PROPERTY_TO_RELATION_CLASS[bln];
          next = null;
          break;
        }
        next = s.object;
      }
      walk = next;
    }

    const isTransitive = store.getQuads(p, RDF_TYPE, nn(OWL_TRANSITIVE_PROPERTY)).length > 0;
    const labels = store.getQuads(p, RDFS_LABEL, null, null);
    schemaPropertyNodes.push({
      id: termId(p),
      localName: ln,
      label: labels[0]?.object.value ?? ln,
      relation_class: relClass,
      owlTransitive: isTransitive,
    });
  }

  const transitiveFromOwl = new Set(
    schemaPropertyNodes.filter((x) => x.owlTransitive).map((x) => x.localName)
  );

  const propLocalToIri = new Map();
  for (const ln of RELATION_PROPERTY_NAMES) {
    propLocalToIri.set(ln, new URL(`#${ln}`, baseHref).href);
  }

  const direct = [];

  for (const ln of RELATION_PROPERTY_NAMES) {
    const pred = propLocalToIri.get(ln);
    if (!pred) continue;
    for (const q of store.getQuads(null, nn(pred), null, null)) {
      if (q.subject.termType !== "NamedNode" || q.object.termType !== "NamedNode") continue;
      const sid = termId(q.subject);
      const oid = termId(q.object);
      const sIsClass = store.getQuads(q.subject, RDF_TYPE, nn(OWL_CLASS)).length > 0;
      const oIsClass = store.getQuads(q.object, RDF_TYPE, nn(OWL_CLASS)).length > 0;
      if (sIsClass && oIsClass) continue;

      const meta = extractRdfStarMetadata(store, sid, pred, oid);
      const propMeta = schemaPropertyNodes.find((p) => p.localName === ln);
      direct.push({
        id: `ttl-${sid.slice(-12)}-${ln}-${oid.slice(-12)}`,
        source_id: sid,
        source_name: sid,
        source_type: "instance",
        target_id: oid,
        target_name: oid,
        target_type: "instance",
        relation_type: ln,
        relation_class: propMeta?.relation_class ?? "Structural",
        is_direct: true,
        metadata: meta,
      });
    }
  }

  return {
    baseHref,
    store,
    schemaElements,
    schemaPropertyNodes,
    transitiveFromOwl,
    instanceDirectEdges: direct,
  };
}

/**
 * Best-effort: find RDF-star annotations on <<s p o>> if present as separate quads (implementation-dependent).
 * @param {import('n3').Store} store
 */
function extractRdfStarMetadata(_store, _sid, _pred, _oid) {
  return {};
}
