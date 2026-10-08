// Tests for the generated relationship matrix and its bucket sources.
// Run from the repo root:  node --test scripts/test-matrix-buckets.mjs
// Uses only Node built-ins. Test (a) runs scripts/build-matrix.mjs and restores data/matrix.js afterwards.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { root, casedCodes } from "./lib/matrix-sources.mjs";

const matrixFile = path.join(root, "data/matrix.js");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

function loadMatrix() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(matrixFile, "utf8") + "\n;globalThis.__M = MATRIX;", ctx);
  return ctx.__M;
}
const MATRIX = loadMatrix();
const row = (from, to) => MATRIX.find((r) => r.from === from && r.to === to);
const same = (actual, expected, msg) => assert.deepEqual([...actual].sort(), [...expected].sort(), msg);

test("build-matrix.mjs reproduces data/matrix.js byte for byte", () => {
  const before = fs.readFileSync(matrixFile);
  try {
    execFileSync("node", [path.join(root, "scripts/build-matrix.mjs")], { cwd: root, stdio: "pipe" });
    const after = fs.readFileSync(matrixFile);
    assert.ok(before.equals(after), "regenerated data/matrix.js differs from the one on disk");
  } finally {
    fs.writeFileSync(matrixFile, before);
  }
});

test("known buckets", () => {
  const b = (f, t) => { const r = row(f, t); assert.ok(r, `${f} -> ${t} missing`); return r; };
  let r = b("Node", "Business Function");
  same(r.direct, []); same(r.derived, ["F", "I", "R", "T", "V"]); same(r.derivedPotential, []);

  r = b("Application Component", "Application Function");
  assert.ok(r.direct.includes("I"));
  assert.ok(r.derived.includes("R") && r.derived.includes("V"));

  r = b("Artifact", "Application Component");
  assert.ok(r.derived.includes("R")); assert.ok(!r.direct.includes("R"));

  r = b("Application Service", "Business Function");
  same(r.derived, ["F", "T", "V"]); same(r.derivedPotential, []);

  same(b("Value Stream", "Capability").direct, ["F", "T", "V"]);
  same(b("Capability", "Value Stream").direct, ["F", "T", "V"]);

  r = b("Device", "Business Service");
  same(r.derived, ["F", "R", "T", "V"]); same(r.direct, []);
});

test("bucket totals are d=2066, der=4158, pdr=345", () => {
  const tot = { d: 0, der: 0, pdr: 0 };
  for (const codes of Object.values(readJson("data/source/matrix-code-buckets.json")))
    for (const v of Object.values(codes)) tot[v]++;
  assert.deepEqual(tot, { d: 2066, der: 4158, pdr: 345 });
});

test("101 unexplained codes, each assigned der or pdr", () => {
  const { codes } = readJson("data/source/unexplained-codes.json");
  assert.equal(codes.length, 101);
  for (const c of codes) assert.ok(["der", "pdr"].includes(c.assigned), `${c.from}|${c.to}|${c.code}: ${c.assigned}`);
});

test("matrix agrees with upstream's case-significant table", () => {
  let checked = 0;
  for (const [key, codes] of casedCodes()) {
    const [from, to] = key.split("|");
    const r = row(from, to);
    if (!r) continue;
    for (const [code, kind] of Object.entries(codes)) {
      checked++;
      if (kind === "d") assert.ok(r.direct.includes(code), `${key} ${code} should be direct`);
      else assert.ok(r.derived.includes(code) || r.derivedPotential.includes(code), `${key} ${code} should be derived/potential`);
    }
  }
  assert.ok(checked > 5000, `only ${checked} codes checked`);
});
