#!/usr/bin/env node
/**
 * Dev-only. Compares ArchiTrek's bucket per (from|to|code) with upstream's case-significant table.
 *   agree    : same direct/derived side
 *   promoted : derived upstream, direct in ArchiTrek ("d")
 *   demoted  : direct upstream, der/pdr in ArchiTrek
 * Usage: node scripts/compare-buckets.mjs   (prints counts and every disagreement)
 */
import { casedCodes, prodAllowed, oldBuckets } from "./lib/matrix-sources.mjs";

const cased = casedCodes();
const prod = prodAllowed();
const old = oldBuckets();
let agree = 0;
const promoted = [], demoted = [];
let setMismatch = 0;

for (const [key, allowed] of prod) {
  const up = cased.get(key) || {};
  const upCodes = new Set(Object.keys(up));
  for (const c of new Set([...allowed, ...upCodes])) {
    if (allowed.has(c) !== upCodes.has(c)) { setMismatch++; console.error("allowed-set mismatch", key, c); }
  }
  for (const code of allowed) {
    if (!up[code]) continue;
    const mine = (old[key] || {})[code] || "d";
    const mineDirect = mine === "d";
    const upDirect = up[code] === "d";
    if (mineDirect === upDirect) agree++;
    else if (mineDirect) promoted.push({ key, code, mine, upstream: "derived" });
    else demoted.push({ key, code, mine, upstream: "direct" });
  }
}
console.log(`agree=${agree} promoted(direct here, derived upstream)=${promoted.length} demoted(der/pdr here, direct upstream)=${demoted.length} allowed-set-mismatches=${setMismatch}`);
const fmt = (r) => `${r.key.replace("|", " -> ")}  ${r.code}  here=${r.mine} upstream=${r.upstream}`;
console.log("\n# PROMOTED (direct here, derived upstream)"); promoted.forEach((r) => console.log(fmt(r)));
console.log("\n# DEMOTED (der/pdr here, direct upstream)"); demoted.forEach((r) => console.log(fmt(r)));
