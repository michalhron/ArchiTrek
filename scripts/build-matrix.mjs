#!/usr/bin/env node
/**
 * Regenerates data/matrix.js from:
 *   - data/source/relationships.xml (allowed set, AlbertoDMendoza/archimate_ontology)
 *   - data/source/matrix-code-buckets.json (direct / DR / PDR buckets, keyed "from|to" → code → "d"|"der"|"pdr",
 *     built by scripts/build-buckets.py from data/source/relationships-cased.xml and upstream's rules)
 *   - data/source/UPSTREAM.md (upstream commit and dates for the header)
 *
 * Run from repo root: node scripts/build-matrix.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadAppElementNames() {
  const g = fs.readFileSync(path.join(root, "logic", "graph.js"), "utf8");
  const keys = [];
  const re = /^\s{2}"([^"]+)":\s+\{\s+layer:/gm;
  let m;
  while ((m = re.exec(g))) keys.push(m[1]);
  return keys;
}

/** ArchiMate exchange-style id (e.g. BusinessActor) from UI element name (e.g. Business Actor). */
function appNameToExchangeId(name) {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function buildExchangeToAppMap(names) {
  const map = Object.create(null);
  for (const n of names) {
    map[appNameToExchangeId(n)] = n;
  }
  map.Grouping = "Grouping";
  return map;
}

function parseRelationshipsXml(xml) {
  const rows = [];
  const blockRe = /<source concept="([^"]+)">([\s\S]*?)<\/source>/g;
  let bm;
  while ((bm = blockRe.exec(xml))) {
    const fromEx = bm[1];
    const inner = bm[2];
    const targetRe = /<target concept="([^"]+)" relations="([^"]*)" \/>/g;
    let tm;
    while ((tm = targetRe.exec(inner))) {
      rows.push({ fromEx, toEx: tm[1], rel: tm[2] || "" });
    }
  }
  return rows;
}

function relationLetters(rel) {
  const out = new Set();
  const s = String(rel).toLowerCase();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch >= "a" && ch <= "z") out.add(ch.toUpperCase());
  }
  out.delete("O");
  return [...out].sort();
}

/** Commit / dates recorded in data/source/UPSTREAM.md. */
function readUpstreamInfo() {
  const md = fs.readFileSync(path.join(root, "data", "source", "UPSTREAM.md"), "utf8");
  const pick = (re) => (md.match(re) || [])[1] || "unknown";
  return {
    commit: pick(/Commit vendored: `([0-9a-f]{40})`/),
    vendored: pick(/Vendored on: (\d{4}-\d{2}-\d{2})/),
    bucketsBuilt: pick(/Buckets built on: (\d{4}-\d{2}-\d{2})/),
  };
}

function main() {
  const upstream = readUpstreamInfo();
  const xml = fs.readFileSync(path.join(root, "data", "source", "relationships.xml"), "utf8");
  const buckets = JSON.parse(
    fs.readFileSync(path.join(root, "data", "source", "matrix-code-buckets.json"), "utf8")
  );

  const appNames = loadAppElementNames();
  const elementSet = new Set(appNames);
  const exToApp = buildExchangeToAppMap(appNames);

  function resolveApp(ex) {
    return exToApp[ex] ?? null;
  }

  function allowedEndpoint(name) {
    return elementSet.has(name) || name === "Grouping";
  }

  const pairMap = new Map();

  for (const { fromEx, toEx, rel } of parseRelationshipsXml(xml)) {
    const from = resolveApp(fromEx);
    const to = resolveApp(toEx);
    if (!from || !to) continue;
    if (!allowedEndpoint(from) || !allowedEndpoint(to)) continue;

    const letters = relationLetters(rel);
    if (letters.length === 0) continue;

    const key = `${from}|${to}`;
    const bucket = buckets[key] || {};
    const direct = [];
    const derived = [];
    const derivedPotential = [];

    for (const code of letters) {
      const b = bucket[code];
      if (b === "der") derived.push(code);
      else if (b === "pdr") derivedPotential.push(code);
      else direct.push(code);
    }

    direct.sort();
    derived.sort();
    derivedPotential.sort();

    pairMap.set(key, { from, to, direct, derived, derivedPotential });
  }

  const matrix = [...pairMap.values()].sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    return a.to.localeCompare(b.to);
  });

  const lines = [];
  lines.push(`// === data/matrix.js ===`);
  lines.push(`/**`);
  lines.push(` * ArchiMate 3.2 — Relationship Validity Matrix`);
  lines.push(` *`);
  lines.push(` * Sources (vendored in data/source/, see data/source/UPSTREAM.md):`);
  lines.push(` *   relationships.xml        allowed set (Appendix B, case-folded), from`);
  lines.push(` *                            AlbertoDMendoza/archimate_ontology`);
  lines.push(` *   relationships-cased.xml  upstream derivation/relationships.xml at commit`);
  lines.push(` *                            ${upstream.commit} (vendored ${upstream.vendored})`);
  lines.push(` *   matrix-code-buckets.json per-code bucket, built by scripts/build-buckets.py on ${upstream.bucketsBuilt}`);
  lines.push(` *`);
  lines.push(` * Buckets:`);
  lines.push(` *   direct            UPPERCASE in relationships-cased.xml (explicit in the chapter 3-12`);
  lines.push(` *                     metamodel figures)`);
  lines.push(` *   derived           lowercase, and produced by upstream's DR1-DR8 rules (Appendix B.2,`);
  lines.push(` *                     valid derivation) run to a fixed point over conformance/fixture-direct.ttl`);
  lines.push(` *   derivedPotential  lowercase, and produced only once PDR1-PDR12 (Appendix B.3) also run`);
  lines.push(` *`);
  lines.push(` * ArchiMate(R) 3.2 Appendix B content (C) 2012-2023 The Open Group. ArchiMate is a registered`);
  lines.push(` * trademark of The Open Group. Upstream encoding: Apache-2.0, (C) Alberto D. Mendoza.`);
  lines.push(` *`);
  lines.push(` * Regenerate: python3 scripts/build-buckets.py --upstream <archimate_ontology checkout> --write`);
  lines.push(` *             node scripts/build-matrix.mjs`);
  lines.push(` *`);
  lines.push(` * Normative human-readable tables:`);
  lines.push(` * https://pubs.opengroup.org/architecture/archimate32-doc/ch-relationships-Normative.html`);
  lines.push(` *`);
  lines.push(` * ── DIRECTION (pathfinding) ─────────────────────────────────────────────────`);
  lines.push(` * Each record is one directed arc: **from** → **to** is the ArchiMate relationship`);
  lines.push(` * direction (source element → target element). logic/graph.js adds exactly one`);
  lines.push(` * outgoing edge from → to per matrix row — never the reverse of the same cell.`);
  lines.push(` *`);
  lines.push(` * Letter codes:`);
  lines.push(` * S C G I R V A N T F as in the spec; O is universally permitted and omitted here.`);
  lines.push(` *`);
  lines.push(` * ── STRUCTURE ────────────────────────────────────────────────────────────────`);
  lines.push(` * Each entry: { from, to, direct:[codes], derived:[codes], derivedPotential:[codes] }`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`const MATRIX = [`);
  lines.push(``);

  const fmtArr = (arr) =>
    arr.length ? arr.map((c) => `"${c}"`).join(",") : "";

  for (const { from, to, direct, derived, derivedPotential } of matrix) {
    lines.push(
      `  { from:"${from}", to:"${to}",  direct:[${fmtArr(direct)}],         derived:[${fmtArr(derived)}],         derivedPotential:[${fmtArr(derivedPotential)}] },`
    );
  }

  lines.push(``);
  lines.push(`];`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Lookup map for efficient querying.`);
  lines.push(` * Key: "FromElement→ToElement"`);
  lines.push(` * Value: { direct:[codes], derived:[codes], derivedPotential:[codes] }`);
  lines.push(` */`);
  lines.push(`const MATRIX_MAP = Object.fromEntries(`);
  lines.push(
    "  MATRIX.map(e => [`${e.from}→${e.to}`, { direct: e.direct, derived: e.derived, derivedPotential: e.derivedPotential }])"
  );
  lines.push(`);`);

  const outPath = path.join(root, "data", "matrix.js");
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${matrix.length} rows to ${path.relative(root, outPath)}`);
}

main();
