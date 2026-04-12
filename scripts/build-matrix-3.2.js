#!/usr/bin/env node
/**
 * Regenerate data/matrix.js from data/relationships-3.2.xml (ArchiMate 3.2 normative grid).
 *
 * Usage (from repo root):
 *   node scripts/build-matrix-3.2.js
 *
 * Direct vs derived: for each relation letter, reuse classification from the *previous*
 * data/matrix.js row for the same (from, to) when that letter existed there; any letter
 * new to 3.2 for that pair is placed in `direct` (Explicit) — adjust manually if you
 * obtain a split table from the spec.
 *
 * Rows where only Association (o) applies after stripping O are omitted (same policy as before).
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const XML_PATH = path.join(ROOT, "data", "relationships-3.2.xml");
const MATRIX_OUT = path.join(ROOT, "data", "matrix.js");
const MATRIX_PREV = path.join(ROOT, "data", "matrix.js");

const CHAR_TO_CODE = {
  a: "A",
  c: "C",
  f: "F",
  g: "G",
  i: "I",
  n: "N",
  o: "O",
  r: "R",
  s: "S",
  t: "T",
  v: "V",
};

function pascalToMatrixName(pascal) {
  let s = pascal.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  s = s.replace(/ Of /g, " of ");
  return s;
}

function relationsToLetterSet(relStr) {
  const out = new Set();
  for (const ch of String(relStr).toLowerCase()) {
    const code = CHAR_TO_CODE[ch];
    if (code && code !== "O") out.add(code);
  }
  return out;
}

function loadPreviousMatrixSplits() {
  const prev = new Map();
  if (!fs.existsSync(MATRIX_PREV)) return prev;
  const ctx = vm.createContext({ console });
  try {
    vm.runInContext(
      fs.readFileSync(MATRIX_PREV, "utf8") + "; globalThis.__M = MATRIX;",
      ctx
    );
  } catch (e) {
    console.warn("[build-matrix-3.2] Could not parse previous matrix.js:", e.message);
    return prev;
  }
  const MATRIX = ctx.__M;
  if (!Array.isArray(MATRIX)) return prev;
  for (const row of MATRIX) {
    const key = `${row.from}\t${row.to}`;
    prev.set(key, {
      direct: new Set((row.direct || []).map((c) => String(c).toUpperCase())),
      derived: new Set((row.derived || []).map((c) => String(c).toUpperCase())),
    });
  }
  return prev;
}

function splitLetters(letters, prevRow) {
  const direct = [];
  const derived = [];
  const sorted = [...letters].sort();
  for (const L of sorted) {
    if (prevRow) {
      if (prevRow.direct.has(L)) {
        direct.push(L);
        continue;
      }
      if (prevRow.derived.has(L)) {
        derived.push(L);
        continue;
      }
    }
    direct.push(L);
  }
  return { direct, derived };
}

function parseXmlGrid(xml) {
  const rows = [];
  const sourceRe = /<source concept="([^"]+)">([\s\S]*?)<\/source>/g;
  let m;
  while ((m = sourceRe.exec(xml))) {
    const from = pascalToMatrixName(m[1]);
    const block = m[2];
    const tgtRe = /<target concept="([^"]+)" relations="([^"]*)"\s*\/>/g;
    let t;
    while ((t = tgtRe.exec(block))) {
      const to = pascalToMatrixName(t[1]);
      const letters = relationsToLetterSet(t[2]);
      if (letters.size === 0) continue;
      rows.push({ from, to, letters });
    }
  }
  rows.sort((a, b) => {
    const c = a.from.localeCompare(b.from);
    return c !== 0 ? c : a.to.localeCompare(b.to);
  });
  return rows;
}

function jsString(s) {
  return JSON.stringify(s);
}

function main() {
  const xml = fs.readFileSync(XML_PATH, "utf8");
  if (!xml.includes('version="3.2"')) {
    console.error("Expected ArchiMate 3.2 relationships file at", XML_PATH);
    process.exit(1);
  }

  const prevSplits = loadPreviousMatrixSplits();
  const grid = parseXmlGrid(xml);

  const header = `// === data/matrix.js ===
/**
 * ArchiMate 3.2 — Relationship validity matrix (directed source → target)
 *
 * **Source of truth:** \`data/relationships-3.2.xml\` (normative machine-readable grid).
 * **Regenerate:** \`node scripts/build-matrix-3.2.js\`
 *
 * **Direct vs derived:** letters are split using the *previous* \`matrix.js\` row for the same
 * pair when present; any letter new in 3.2 for that pair is placed in \`direct\` (Explicit).
 * Association (O) is universally permitted (§5.2.4) and is not stored per cell.
 *
 * Each entry: { from, to, direct:[codes], derived:[codes] }
 * Pure O-only cells are omitted (Association handled separately in the UI / pathfinder).
 *
 * Letter codes: S C G I R V A N T F (same as prior releases; O excluded here).
 */

const MATRIX = [
`;

  const bodyParts = [];
  let lastFrom = null;
  for (const { from, to, letters } of grid) {
    if (from !== lastFrom) {
      if (lastFrom !== null) bodyParts.push("\n");
      bodyParts.push(`  // FROM ${from}\n`);
      lastFrom = from;
    }
    const prev = prevSplits.get(`${from}\t${to}`);
    const { direct, derived } = splitLetters(letters, prev);
    const d = JSON.stringify(direct);
    const der = JSON.stringify(derived);
    bodyParts.push(
      `  { from:${jsString(from)}, to:${jsString(to)}, direct:${d}, derived:${der} },\n`
    );
  }

  const footer = `];

/**
 * Lookup map for efficient querying.
 * Key: "FromElement→ToElement"
 * Value: { direct:[codes], derived:[codes] }
 */
const MATRIX_MAP = Object.fromEntries(
  MATRIX.map(e => [\`\${e.from}→\${e.to}\`, { direct: e.direct, derived: e.derived }])
);
`;

  fs.writeFileSync(MATRIX_OUT, header + bodyParts.join("") + footer, "utf8");
  console.log(
    "Wrote",
    MATRIX_OUT,
    "| rows:",
    grid.length,
    "| prev split rows loaded:",
    prevSplits.size
  );
}

main();
