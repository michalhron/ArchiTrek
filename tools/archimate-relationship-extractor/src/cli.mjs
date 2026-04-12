#!/usr/bin/env node
/**
 * ArchiMate 3.2 direct / derived relationship extractor.
 *
 * Usage:
 *   node src/cli.mjs --input model.archimate --mode archimate --out ./output
 *   node src/cli.mjs --input data.json --mode json --out ./output
 *   node src/cli.mjs --input ontology.ttl --mode ttl --out ./output
 *
 * Options:
 *   --ontology <ttl>     Merge OWL transitive flags (and optional schema) from a second TTL.
 *   --extra-transitive <csv>  Additional relation_types for same-type transitive closure (e.g. realization,composition).
 *   --no-cross           Disable cross-layer derivation rules.
 *   --append-schema      When using --ontology, append OWL class catalog to elements[].
 *
 * Outputs: matrix.json, relations-direct.csv, relations-derived.csv, matrix-derived.ttl
 */

import fs from "fs";
import path from "path";
import { parseOntologyTtl } from "./ontologyTtl.mjs";
import { parseArchimateXml } from "./archimateXml.mjs";
import { parseJsonInput } from "./jsonInput.mjs";
import { computeDerivations } from "./derive.mjs";
import { buildDocument, writeJson, writeCsv, writeTurtle } from "./exportFormats.mjs";

function parseArgs(argv) {
  const o = {
    input: null,
    mode: null,
    out: "./extractor-output",
    ontology: null,
    extraTransitive: "",
    cross: true,
    appendSchema: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") o.input = argv[++i];
    else if (a === "--mode") o.mode = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--ontology") o.ontology = argv[++i];
    else if (a === "--extra-transitive") o.extraTransitive = argv[++i];
    else if (a === "--no-cross") o.cross = false;
    else if (a === "--append-schema") o.appendSchema = true;
    else if (a === "-h" || a === "--help") o.help = true;
  }
  return o;
}

function printHelp() {
  console.log(`ArchiMate direct/derived extractor

  node src/cli.mjs --input <file> --mode ttl|archimate|json --out <dir>

  --ontology <ttl>           Optional ArchiMate ontology TTL (adds owl:TransitiveProperty hints).
  --extra-transitive <list>  Comma-separated relation types for same-type transitive closure.
  --no-cross                 Disable cross-layer derivation (serving+realization, access+realization).
  --append-schema            With --ontology, append OWL element classes to elements[].
`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.input || !args.mode) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const absIn = path.resolve(args.input);
  if (!fs.existsSync(absIn)) {
    console.error("Input not found:", absIn);
    process.exit(1);
  }

  let elements = [];
  let direct = [];
  let owlTransitive = new Set();
  const sources = [{ path: absIn, mode: args.mode }];

  if (args.mode === "ttl") {
    const ttl = parseOntologyTtl(absIn);
    elements = ttl.schemaElements;
    direct = ttl.instanceDirectEdges;
    owlTransitive = ttl.transitiveFromOwl;
  } else if (args.mode === "archimate") {
    const m = parseArchimateXml(absIn);
    elements = m.elements;
    direct = m.direct;
  } else if (args.mode === "json") {
    const j = parseJsonInput(absIn);
    elements = j.elements;
    direct = j.direct;
  } else {
    console.error("Unknown --mode:", args.mode);
    process.exit(1);
  }

  if (args.ontology) {
    const onPath = path.resolve(args.ontology);
    const ttl = parseOntologyTtl(onPath);
    owlTransitive = new Set([...(owlTransitive || []), ...ttl.transitiveFromOwl]);
    if (args.appendSchema) {
      const have = new Set(elements.map((e) => e.id));
      for (const se of ttl.schemaElements) {
        if (!have.has(se.id)) {
          have.add(se.id);
          elements.push(se);
        }
      }
    }
    sources.push({ path: onPath, mode: "ontology-ttl" });
  }

  const extra = new Set(
    args.extraTransitive
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const { derived, conflicts } = computeDerivations(direct, {
    owlTransitiveTypes: owlTransitive,
    extraTransitiveTypes: extra,
    crossRules: args.cross,
  });

  const doc = buildDocument(elements, direct, derived, conflicts, {
    ontology: "ArchiMate 3.2",
    sources,
  });

  const outDir = path.resolve(args.out);
  writeJson(outDir, doc);
  writeCsv(outDir, doc);
  writeTurtle(outDir, doc);

  console.log("Wrote:", path.join(outDir, "matrix.json"));
  console.log(
    "Counts — elements:",
    doc.metadata.elementCount,
    "direct:",
    doc.metadata.directRelationshipCount,
    "derived:",
    doc.metadata.derivedRelationshipCount,
    "conflicts:",
    conflicts.length
  );
}

main();
