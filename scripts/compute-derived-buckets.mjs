#!/usr/bin/env node
/**
 * Recompute matrix code buckets from Appendix B derivation rules.
 *
 * Output bucket tags:
 *  - "d"   : explicit baseline (seed)
 *  - "der" : valid derivation (DR1-DR8, Appendix B.2)
 *  - "pdr" : potential derivation (PDR1-PDR12, Appendix B.3)
 *
 * Inputs:
 *  - data/source/relationships.xml
 *  - data/source/matrix-code-buckets.json (seed baseline "d")
 *
 * Run from repo root:
 *   node scripts/compute-derived-buckets.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const STRUCTURAL = new Set(["R", "I", "G", "C"]);
const DEPENDENCY = new Set(["V", "A", "N"]);
const DYNAMIC = new Set(["F", "T"]);
const STRUCTURAL_WEAK_RANK = { R: 1, I: 2, G: 3, C: 4 };
const DEPENDENCY_WEAK_RANK = { O: 1, N: 2, A: 3, V: 4 };

const APPENDIX_CODE_ORDER = ["A", "C", "F", "G", "I", "N", "R", "S", "T", "V"];

function loadGraphElementMeta() {
  const g = fs.readFileSync(path.join(root, "logic", "graph.js"), "utf8");
  const out = Object.create(null);
  const re =
    /^\s{2}"([^"]+)":\s+\{\s+layer:\s+"([^"]+)",\s+aspect:\s+"([^"]+)",\s+color:\s+"[^"]+",\s+metamodelRole:\s+"([^"]+)"\s+\},?$/gm;
  let m;
  while ((m = re.exec(g))) {
    out[m[1]] = { layer: m[2], aspect: m[3], metamodelRole: m[4] };
  }
  out.Grouping = { layer: "Composite", aspect: "Composite", metamodelRole: "composite" };
  return out;
}

function loadAppElementNames(meta) {
  return Object.keys(meta);
}

function appNameToExchangeId(name) {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function buildExchangeToAppMap(names) {
  const map = Object.create(null);
  for (const n of names) map[appNameToExchangeId(n)] = n;
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

function key(from, to) {
  return `${from}|${to}`;
}

function getOrCreateSet(map, k) {
  let s = map.get(k);
  if (!s) {
    s = new Set();
    map.set(k, s);
  }
  return s;
}

function addFact(map, k, code) {
  const s = getOrCreateSet(map, k);
  if (s.has(code)) return false;
  s.add(code);
  return true;
}

function hasFact(map, k, code) {
  const s = map.get(k);
  return !!s && s.has(code);
}

function allFactsForPair(from, to, directFacts, drFacts, pdrFacts, includePdr = false) {
  const k = key(from, to);
  const out = new Set();
  for (const c of directFacts.get(k) || []) out.add(c);
  for (const c of drFacts.get(k) || []) out.add(c);
  if (includePdr) {
    for (const c of pdrFacts.get(k) || []) out.add(c);
  }
  return out;
}

function isStructural(code) {
  return STRUCTURAL.has(code);
}
function isDependency(code) {
  return DEPENDENCY.has(code);
}
function isDynamic(code) {
  return DYNAMIC.has(code);
}
function weakerStructural(a, b) {
  return STRUCTURAL_WEAK_RANK[a] <= STRUCTURAL_WEAK_RANK[b] ? a : b;
}
function weakerDependency(a, b) {
  return DEPENDENCY_WEAK_RANK[a] <= DEPENDENCY_WEAK_RANK[b] ? a : b;
}

function domainOfElement(name, meta) {
  if (name === "Grouping" || name === "Location") return "Core";
  if (name === "Plateau" || name === "Work Package" || name === "Deliverable" || name === "Implementation Event" || name === "Gap") {
    return "Implementation";
  }
  const layer = meta[name]?.layer || "Unknown";
  if (layer === "Motivation") return "Motivation";
  if (layer === "Strategy") return "Strategy";
  if (layer === "Business" || layer === "Application" || layer === "Technology" || layer === "Composite") return "Core";
  if (layer === "Implementation") return "Implementation";
  return "Unknown";
}

function isPassiveStructure(name, meta) {
  return String(meta[name]?.aspect || "") === "Passive Structure";
}

function isGroupingLocationPlateau(name) {
  return name === "Grouping" || name === "Location" || name === "Plateau";
}

function isRelationshipDomainElement(name) {
  return name === "Relationship" || name === "Junction";
}

function allowedByB4SourceTarget(source, target, code, meta) {
  const ds = domainOfElement(source, meta);
  const dt = domainOfElement(target, meta);
  const passiveS = isPassiveStructure(source, meta);
  const passiveT = isPassiveStructure(target, meta);

  if ((ds === "Implementation" || ds === "Core" || ds === "Strategy") && dt === "Motivation" && !["I", "R", "N", "O"].includes(code)) return false;
  if (ds === "Motivation" && (dt === "Implementation" || dt === "Core" || dt === "Strategy") && code !== "O") return false;
  if ((ds === "Implementation" || ds === "Core") && dt === "Strategy" && !["R", "O"].includes(code)) return false;
  if (ds === "Strategy" && (dt === "Implementation" || dt === "Core") && code !== "O") return false;
  if (ds === "Implementation" && dt === "Core" && !["R", "O"].includes(code)) return false;
  if (ds === "Core" && dt === "Implementation" && !["I", "O"].includes(code)) return false;
  if (isGroupingLocationPlateau(source) && isRelationshipDomainElement(target) && !["C", "G", "O"].includes(code)) return false;
  if (!isGroupingLocationPlateau(source) && isRelationshipDomainElement(target) && code !== "O") return false;
  if (isRelationshipDomainElement(source) && code !== "O") return false;
  if (code === "N" && dt !== "Motivation") return false;
  if (code === "A" && !passiveT) return false;
  if (!passiveS && passiveT && !["A", "I", "O"].includes(code)) return false;
  if (passiveS && passiveT && !["R", "O"].includes(code)) return false;
  if (passiveS && !passiveT && !["R", "N", "O"].includes(code)) return false;
  return true;
}

function allowedByB4Intermediate(source, target, intermediate, meta) {
  const ds = domainOfElement(source, meta);
  const dt = domainOfElement(target, meta);
  const di = domainOfElement(intermediate, meta);

  if (di !== "Unknown" && ds !== "Unknown" && dt !== "Unknown") {
    if (di !== ds && di !== dt) {
      const special = ds === "Implementation" && di === "Core" && (dt === "Motivation" || dt === "Strategy");
      if (!special) return false;
    }
  }

  if (ds === "Implementation" && (dt === "Motivation" || dt === "Strategy") && (intermediate === "Location" || intermediate === "Grouping")) {
    return false;
  }
  return true;
}

function candidateAllowed(source, target, intermediate, code, allowedMap, directFacts, drFacts, pdrFacts, meta, mode) {
  const k = key(source, target);
  const allowed = allowedMap.get(k);
  if (!allowed || !allowed.has(code)) return false;
  if (!allowedByB4SourceTarget(source, target, code, meta)) return false;
  if (!allowedByB4Intermediate(source, target, intermediate, meta)) return false;
  if (hasFact(directFacts, k, code)) return false;
  if (hasFact(drFacts, k, code)) return mode !== "dr";
  if (mode === "pdr" && hasFact(pdrFacts, k, code)) return false;
  return true;
}

function main() {
  const xml = fs.readFileSync(path.join(root, "data", "source", "relationships.xml"), "utf8");
  const existingBuckets = JSON.parse(
    fs.readFileSync(path.join(root, "data", "source", "matrix-code-buckets.json"), "utf8")
  );

  const meta = loadGraphElementMeta();
  const appNames = loadAppElementNames(meta);
  const exToApp = buildExchangeToAppMap(appNames);
  const elementSet = new Set(appNames);

  const allowedMap = new Map();
  const nodes = new Set();

  for (const { fromEx, toEx, rel } of parseRelationshipsXml(xml)) {
    const from = exToApp[fromEx] ?? null;
    const to = exToApp[toEx] ?? null;
    if (!from || !to) continue;
    if (!elementSet.has(from) || !elementSet.has(to)) continue;
    const letters = relationLetters(rel);
    if (!letters.length) continue;
    const k = key(from, to);
    const s = getOrCreateSet(allowedMap, k);
    for (const c of letters) s.add(c);
    nodes.add(from);
    nodes.add(to);
  }

  const nodeList = [...nodes].sort();
  const directFacts = new Map();
  const drFacts = new Map();
  const pdrFacts = new Map();

  // Baseline explicit seed from existing buckets.
  for (const [k, letterMap] of Object.entries(existingBuckets || {})) {
    const allowed = allowedMap.get(k);
    if (!allowed) continue;
    for (const [codeRaw, tagRaw] of Object.entries(letterMap || {})) {
      const code = String(codeRaw).toUpperCase();
      const tag = String(tagRaw || "");
      if (!allowed.has(code)) continue;
      if (tag === "d") addFact(directFacts, k, code);
    }
  }

  // DR closure: DR1-DR8.
  let changed = true;
  let drIterations = 0;
  while (changed && drIterations < 30) {
    changed = false;
    drIterations++;

    for (const a of nodeList) {
      for (const b of nodeList) {
        const ab = allFactsForPair(a, b, directFacts, drFacts, pdrFacts, false);
        if (!ab.size) continue;

        for (const c of nodeList) {
          const bc = allFactsForPair(b, c, directFacts, drFacts, pdrFacts, false);
          const cb = allFactsForPair(c, b, directFacts, drFacts, pdrFacts, false);

          // In-line A->B + B->C => A->C
          if (bc.size) {
            for (const r1 of ab) {
              for (const r2 of bc) {
                const out = [];
                if (r1 === "S" && r2 === "S") out.push("S"); // DR1
                if (isStructural(r1) && isStructural(r2)) out.push(weakerStructural(r1, r2)); // DR2
                if (isStructural(r1) && isDependency(r2)) out.push(r2); // DR3
                if (isStructural(r1) && isDynamic(r2)) out.push(r2); // DR5
                if (r1 === "T" && isStructural(r2)) out.push("T"); // DR7
                if (r1 === "T" && r2 === "T") out.push("T"); // DR8

                for (const code of out) {
                  if (!candidateAllowed(a, c, b, code, allowedMap, directFacts, drFacts, pdrFacts, meta, "dr")) continue;
                  if (addFact(drFacts, key(a, c), code)) changed = true;
                }
              }
            }
          }

          // Opposing A->B + C->B => C->A
          if (cb.size) {
            for (const r1 of ab) {
              for (const r2 of cb) {
                const out = [];
                if (isStructural(r1) && isDependency(r2)) out.push(r2); // DR4
                if (isStructural(r1) && r2 === "F") out.push("F"); // DR6
                for (const code of out) {
                  if (!candidateAllowed(c, a, b, code, allowedMap, directFacts, drFacts, pdrFacts, meta, "dr")) continue;
                  if (addFact(drFacts, key(c, a), code)) changed = true;
                }
              }
            }
          }
        }
      }
    }
  }

  // PDR closure: PDR1-PDR12.
  changed = true;
  let pdrIterations = 0;
  while (changed && pdrIterations < 30) {
    changed = false;
    pdrIterations++;

    for (const a of nodeList) {
      for (const b of nodeList) {
        const ab = allFactsForPair(a, b, directFacts, drFacts, pdrFacts, true);
        if (!ab.size) continue;

        for (const c of nodeList) {
          const bc = allFactsForPair(b, c, directFacts, drFacts, pdrFacts, true);
          const cb = allFactsForPair(c, b, directFacts, drFacts, pdrFacts, true);
          const ca = allFactsForPair(c, a, directFacts, drFacts, pdrFacts, true);
          const ac = allFactsForPair(a, c, directFacts, drFacts, pdrFacts, true);

          // PDR1
          if (ab.has("S") && bc.size) {
            for (const t of bc) {
              if (!(isStructural(t) || isDependency(t) || isDynamic(t))) continue;
              if (!candidateAllowed(a, c, b, t, allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
              if (addFact(pdrFacts, key(a, c), t)) changed = true;
            }
          }

          // PDR2
          if (ab.has("S") && cb.size) {
            for (const t of cb) {
              if (!(isStructural(t) || isDependency(t) || isDynamic(t))) continue;
              if (!candidateAllowed(c, a, b, t, allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
              if (addFact(pdrFacts, key(c, a), t)) changed = true;
            }
          }

          // PDR3
          if (ab.has("S") && ac.size) {
            for (const t of ac) {
              if (!(isStructural(t) || isDependency(t) || isDynamic(t))) continue;
              if (!candidateAllowed(b, c, a, t, allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
              if (addFact(pdrFacts, key(b, c), t)) changed = true;
            }
          }

          // PDR4
          if (ab.has("S") && ca.size) {
            for (const t of ca) {
              if (!(isStructural(t) || isDependency(t) || isDynamic(t))) continue;
              if (!candidateAllowed(c, b, a, t, allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
              if (addFact(pdrFacts, key(c, b), t)) changed = true;
            }
          }

          // PDR5
          if (ca.size && ab.size) {
            for (const s of ab) {
              if (!isStructural(s)) continue;
              for (const t of ca) {
                if (!isDependency(t)) continue;
                if (!candidateAllowed(c, b, a, t, allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
                if (addFact(pdrFacts, key(c, b), t)) changed = true;
              }
            }
          }

          // PDR6
          if (ab.size && ac.size) {
            for (const s of ab) {
              if (!isStructural(s)) continue;
              for (const t of ac) {
                if (!isDependency(t)) continue;
                if (!candidateAllowed(b, c, a, t, allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
                if (addFact(pdrFacts, key(b, c), t)) changed = true;
              }
            }
          }

          // PDR7
          if (ab.size && bc.size) {
            for (const s of ab) {
              if (!isDependency(s)) continue;
              for (const t of bc) {
                if (!isDependency(t)) continue;
                const u = weakerDependency(s, t);
                if (!candidateAllowed(a, c, b, u, allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
                if (addFact(pdrFacts, key(a, c), u)) changed = true;
              }
            }
          }

          // PDR8
          if (ab.has("F") && bc.size) {
            for (const t of bc) {
              if (!isStructural(t)) continue;
              if (!candidateAllowed(a, c, b, "F", allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
              if (addFact(pdrFacts, key(a, c), "F")) changed = true;
            }
          }

          // PDR9
          if (ab.size && ac.size) {
            for (const s of ab) {
              if (!isStructural(s)) continue;
              for (const t of ac) {
                if (!isDynamic(t)) continue;
                if (!candidateAllowed(b, c, a, t, allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
                if (addFact(pdrFacts, key(b, c), t)) changed = true;
              }
            }
          }

          // PDR10
          if (ab.has("F") && bc.has("F")) {
            if (candidateAllowed(a, c, b, "F", allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) {
              if (addFact(pdrFacts, key(a, c), "F")) changed = true;
            }
          }

          // PDR11
          if (ab.has("T") && cb.size) {
            for (const t of cb) {
              if (!isStructural(t)) continue;
              if (!candidateAllowed(a, c, b, "T", allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
              if (addFact(pdrFacts, key(a, c), "T")) changed = true;
            }
          }
        }
      }
    }

    // PDR12 (Grouping)
    const group = "Grouping";
    if (nodeList.includes(group)) {
      for (const a of nodeList) {
        for (const c of nodeList) {
          const ga = allFactsForPair(group, a, directFacts, drFacts, pdrFacts, true);
          const gc = allFactsForPair(group, c, directFacts, drFacts, pdrFacts, true);
          const hasAggComp = ga.has("C") || ga.has("G");
          if (!hasAggComp) continue;
          for (const t of gc) {
            if (t !== "R" && t !== "I") continue;
            if (!candidateAllowed(a, c, group, t, allowedMap, directFacts, drFacts, pdrFacts, meta, "pdr")) continue;
            if (addFact(pdrFacts, key(a, c), t)) changed = true;
          }
        }
      }
    }
  }

  const outBuckets = Object.create(null);
  const unexplained = [];

  const pairKeys = [...allowedMap.keys()].sort((a, b) => a.localeCompare(b));
  for (const k of pairKeys) {
    const allowed = [...(allowedMap.get(k) || [])].sort((a, b) => {
      const ia = APPENDIX_CODE_ORDER.indexOf(a);
      const ib = APPENDIX_CODE_ORDER.indexOf(b);
      if (ia === -1 || ib === -1) return a.localeCompare(b);
      return ia - ib;
    });
    const row = Object.create(null);
    for (const code of allowed) {
      if (hasFact(directFacts, k, code)) {
        row[code] = "d";
      } else if (hasFact(drFacts, k, code)) {
        row[code] = "der";
      } else if (hasFact(pdrFacts, k, code)) {
        row[code] = "pdr";
      } else {
        // Keep matrix partition complete for the app; report as unexplained.
        row[code] = "d";
        unexplained.push({ key: k, code });
      }
    }
    outBuckets[k] = row;
  }

  const outPath = path.join(root, "data", "source", "matrix-code-buckets.json");
  fs.writeFileSync(outPath, JSON.stringify(outBuckets), "utf8");

  console.log(
    `Buckets recomputed: ${pairKeys.length} pairs · DR iterations=${drIterations} · PDR iterations=${pdrIterations}`
  );
  if (unexplained.length) {
    console.warn(`Unexplained allowed codes (fallback to direct): ${unexplained.length}`);
  } else {
    console.log("Unexplained allowed codes: 0");
  }
}

main();
