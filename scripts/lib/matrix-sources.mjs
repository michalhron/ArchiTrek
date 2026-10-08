// Shared helpers for the dev-only matrix tooling (compare-buckets.mjs, build-buckets.mjs).
// Mirrors the element-name and XML handling in scripts/build-matrix.mjs.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadAppElementNames() {
  const g = fs.readFileSync(path.join(root, "logic", "graph.js"), "utf8");
  const keys = [];
  const re = /^\s{2}"([^"]+)":\s+\{\s+layer:/gm;
  let m;
  while ((m = re.exec(g))) keys.push(m[1]);
  return keys;
}

export const appNameToExchangeId = (name) =>
  name.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");

/** exchange id (BusinessActor) -> app name (Business Actor) */
export function exchangeToAppMap() {
  const map = Object.create(null);
  for (const n of loadAppElementNames()) map[appNameToExchangeId(n)] = n;
  map.Grouping = "Grouping";
  return map;
}

/** Returns [{fromEx,toEx,rel}] with the relations string exactly as written (case kept). */
export function parseRelationshipsXml(file) {
  const xml = fs.readFileSync(file, "utf8");
  const rows = [];
  const blockRe = /<source concept="([^"]+)">([\s\S]*?)<\/source>/g;
  let bm;
  while ((bm = blockRe.exec(xml))) {
    const targetRe = /<target concept="([^"]+)" relations="([^"]*)" \/>/g;
    let tm;
    while ((tm = targetRe.exec(bm[2]))) rows.push({ fromEx: bm[1], toEx: tm[1], rel: tm[2] || "" });
  }
  return rows;
}

/** Map "From|To" (app names) -> { CODE: "d" | "x" } where "d" = uppercase, "x" = lowercase. Association (O) dropped. */
export function casedCodes(file = path.join(root, "data/source/relationships-cased.xml")) {
  const ex = exchangeToAppMap();
  const out = new Map();
  for (const { fromEx, toEx, rel } of parseRelationshipsXml(file)) {
    const from = ex[fromEx], to = ex[toEx];
    if (!from || !to) continue;
    const m = {};
    for (const ch of rel) {
      if (!/[a-zA-Z]/.test(ch) || ch.toLowerCase() === "o") continue;
      m[ch.toUpperCase()] = ch === ch.toUpperCase() ? "d" : "x";
    }
    out.set(`${from}|${to}`, m);
  }
  return out;
}

/** Production allowed set (case-folded) as Map "From|To" -> Set(CODE), Association dropped. */
export function prodAllowed(file = path.join(root, "data/source/relationships.xml")) {
  const ex = exchangeToAppMap();
  const out = new Map();
  for (const { fromEx, toEx, rel } of parseRelationshipsXml(file)) {
    const from = ex[fromEx], to = ex[toEx];
    if (!from || !to) continue;
    const s = new Set([...rel.toUpperCase()].filter((c) => /[A-Z]/.test(c) && c !== "O"));
    out.set(`${from}|${to}`, s);
  }
  return out;
}

export function oldBuckets() {
  return JSON.parse(fs.readFileSync(path.join(root, "data/source/matrix-code-buckets.json"), "utf8"));
}
