#!/usr/bin/env python3
"""
Dev-only tool (never deployed). Rebuilds data/source/matrix-code-buckets.json from upstream's
case-significant Appendix B table and upstream's own derivation rules.

Sources
  data/source/relationships-cased.xml   vendored from AlbertoDMendoza/archimate_ontology
                                        (UPPERCASE = direct, lowercase = derived)
  --upstream <checkout>                 the same upstream repository at the vendored commit; its
                                        rule files are run UNMODIFIED with Apache Jena `arq`.

Classification per (from | to | CODE), Association (O) and Junction left out:
  UPPERCASE                                        -> "d"
  lowercase, produced by DR1-DR8 at fixed point    -> "der"  (valid derivation, Appendix B.2)
  lowercase, produced only once PDR1-PDR12 also run -> "pdr" (potential derivation, Appendix B.3)
  lowercase, produced by neither                   -> reported; buckets are NOT written

Engine set-up, following upstream derivation/README.md:
  load order  ontology/archimate.ttl, derivation axioms, strengths, provenance, rules,
              then the model = derivation/conformance/fixture-direct.ttl
  RDFS        the rules test domain / PassiveStructure membership through rdf:type and expect an
              RDFS-aware store, so rdf:type is closed over rdfs:subClassOf (rdfs9) once, by a SPARQL
              CONSTRUCT, before any rule runs.
  DR1         has no CONSTRUCT body upstream (Specialization is owl:TransitiveProperty); DR2 already
              derives S from an S.S chain (the weaker of two equal strengths), so nothing is added.
  fixed point each round runs every selected rule's sh:construct text as-is against the base
              files plus every relationship derived so far (annotations are not fed back, see
              fixed_point); stops when a round adds no relationship triple.

Requirements: Apache Jena (`arq` on PATH, e.g. `brew install jena`; Jena 6 needs a JDK).
Usage:
  python3 scripts/build-buckets.py --upstream ../archimate_ontology            # dry run, report only
  python3 scripts/build-buckets.py --upstream ../archimate_ontology --write    # write buckets JSON
"""
import argparse, json, os, re, subprocess, sys, tempfile, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NS = "https://purl.org/archimate#"
# Diagnostic only (--instances N): individuals T__1..T__N of each type T.
INST = "urn:architrek:instance#"
LETTER = {"access": "A", "composition": "C", "flow": "F", "aggregation": "G", "assignment": "I",
          "influence": "N", "association": "O", "realization": "R", "specialization": "S",
          "triggering": "T", "serving": "V"}
PREFIXES = f"""PREFIX archimate: <{NS}>
PREFIX archi: <{NS}>
PREFIX deriv: <https://purl.org/archimate/derivation#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX sh: <http://www.w3.org/ns/shacl#>
"""
LOAD_ORDER = ["ontology/archimate.ttl",
              "derivation/archimate_derivation_axioms.ttl",
              "derivation/archimate_derivation_strengths.ttl",
              "derivation/archimate_derivation_provenance.ttl",
              "derivation/archimate_derivation_rules.ttl",
              "derivation/conformance/fixture-direct.ttl"]
# Plain N-Triples line between two IRIs (quoted-triple / reifier lines never match this).
REL_LINE = re.compile(r"^<(?:" + re.escape(NS) + r"|" + re.escape(INST) + r")(\w+)> <" + re.escape(NS) + r"(\w+)> <(?:" + re.escape(NS) + r"|" + re.escape(INST) + r")(\w+)> \.$")


def arq(files, query_text, fmt, work):
    qf = Path(work) / "q.rq"
    qf.write_text(query_text)
    cmd = ["arq"]
    for f in files:
        cmd += ["--data", str(f)]
    cmd += ["--query", str(qf), f"--results={fmt}"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"arq failed:\n{r.stderr[:2000]}")
    return r.stdout


def to_nt(ttl_text, work):
    f = Path(work) / "conv.ttl"
    f.write_text(ttl_text)
    r = subprocess.run(["riot", "--syntax=turtle", "--output=ntriples", str(f)], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"riot failed:\n{r.stderr[:2000]}")
    return r.stdout


def rel_triples(nt_text):
    out = set()
    for line in nt_text.splitlines():
        m = REL_LINE.match(line.strip())
        if m and m.group(2) in LETTER:
            out.add((m.group(1), LETTER[m.group(2)], m.group(3)))
    return out


def instance_model(up, n, work):
    """Diagnostic model: n individuals per concept type, every direct relationship between all copies.
    Lets the rules' FILTER(?a != ?c) see two distinct elements of the same type (e.g. Node -> Node)."""
    src = (up / "derivation/conformance/fixture-direct.ttl").read_text()
    out = []
    for line in src.splitlines():
        m = re.match(r"^archi:(\w+) (a|archi:\w+) archi:(\w+) \.$", line)
        if not m:
            continue
        a, p, b = m.groups()
        if p == "a":
            out += [f"<{INST}{a}__{i}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <{NS}{b}> ." for i in range(1, n + 1)]
        else:
            out += [f"<{INST}{a}__{i}> <{NS}{p[6:]}> <{INST}{b}__{j}> ." for i in range(1, n + 1) for j in range(1, n + 1)]
    f = Path(work) / f"model-x{n}.nt"
    f.write_text("\n".join(out) + "\n")
    return f


def fixed_point(up, rules, prefixes, work, label, instances=1):
    base = [up / f for f in LOAD_ORDER]
    if instances > 1:
        base = base[:-1] + [instance_model(up, instances, work)]
    types = Path(work) / "types.ttl"
    types.write_text(arq(base, PREFIXES + "CONSTRUCT { ?x a ?d } WHERE { ?x a ?c . ?c rdfs:subClassOf+ ?d }", "TTL", work))
    derived_file = Path(work) / f"derived-{label}.ttl"
    derived_file.write_text("")
    known = set()
    chosen = sorted(n for n in rules if any(re.match(p + r"\d+_", n) for p in prefixes))
    rnd = 0
    while True:
        rnd += 1
        # Rules in one round all read the same snapshot, so they can run in parallel.
        def run(n):
            t0 = time.time()
            sub = Path(work) / f"{label}-{n}"
            sub.mkdir(exist_ok=True)
            out = to_nt(arq(base + [types, derived_file], PREFIXES + rules[n], "TTL", sub), sub)
            print(f"  [{label}] round {rnd} {n}: {len(rel_triples(out))} rel triples, {time.time()-t0:.1f}s", file=sys.stderr, flush=True)
            return out
        with ThreadPoolExecutor(max_workers=max(1, (os.cpu_count() or 2) - 1)) as pool:
            produced_lines = list(pool.map(run, chosen))
        new = set()
        for out in produced_lines:
            new |= rel_triples(out)
        fresh = new - known
        print(f"  [{label}] round {rnd}: {len(fresh)} new relationship triples", file=sys.stderr, flush=True)
        if not fresh:
            break
        known |= fresh
        # Feed back only the derived relationships, not their provenance annotations: no rule
        # premise can match an annotation (each premise requires a relation with
        # archimate:permittedBy), but with variable predicates the shared annotation objects
        # (e.g. archimate:ValidDerivation on every result) make the joins quadratic.
        with derived_file.open("a") as fh:
            for (x, l, y) in sorted(fresh):
                rel = next(k for k, v in LETTER.items() if v == l)
                iri = lambda n: f"<{INST if '__' in n else NS}{n}>"
                fh.write(f"{iri(x)} <{NS}{rel}> {iri(y)} .\n")
    return known


def app_names():
    g = (ROOT / "logic/graph.js").read_text()
    names = re.findall(r'^\s{2}"([^"]+)":\s+\{\s+layer:', g, re.M)
    m = {"".join(w.capitalize() for w in n.split()): n for n in names}
    m["Grouping"] = "Grouping"
    return m


def cased_codes(ex):
    xml = (ROOT / "data/source/relationships-cased.xml").read_text()
    out = {}
    for sm in re.finditer(r'<source concept="([^"]+)">([\s\S]*?)</source>', xml):
        for tm in re.finditer(r'<target concept="([^"]+)" relations="([^"]*)" />', sm.group(2)):
            a, b = ex.get(sm.group(1)), ex.get(tm.group(1))
            if not a or not b:
                continue
            out[f"{a}|{b}"] = {ch.upper(): ("d" if ch.isupper() else "x")
                               for ch in tm.group(2) if ch.isalpha() and ch.lower() != "o"}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--upstream", required=True, type=Path)
    ap.add_argument("--write", action="store_true", help="write data/source/matrix-code-buckets.json")
    ap.add_argument("--report", type=Path, help="write a JSON report here")
    ap.add_argument("--unexplained", choices=["stop", "keep-old"], default="stop",
                    help="lowercase codes no rule produces: 'stop' (default) refuses to write; 'keep-old' keeps the "
                         "previous der/pdr bucket and turns a previous 'd' into 'pdr' (derived per upstream, validity "
                         "not confirmed by the rules). Every such code is listed in data/source/unexplained-codes.json")
    ap.add_argument("--instances", type=int, default=1,
                    help="diagnostic: use N individuals per type instead of upstream's fixture (never with --write)")
    a = ap.parse_args()
    up = a.upstream.resolve()
    commit = subprocess.run(["git", "-C", str(up), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    vendored = (ROOT / "data/source/relationships-cased.xml").read_bytes()
    if vendored != (up / "derivation/relationships.xml").read_bytes():
        raise SystemExit("data/source/relationships-cased.xml differs from the upstream checkout; check out the vendored commit.")

    with tempfile.TemporaryDirectory() as work:
        rj = json.loads(arq([up / "derivation/archimate_derivation_rules.ttl"],
                            "PREFIX sh: <http://www.w3.org/ns/shacl#> SELECT ?r ?q WHERE { ?r sh:construct ?q }", "JSON", work))
        rules = {b["r"]["value"].split("#")[-1]: b["q"]["value"] for b in rj["results"]["bindings"]}
        print(f"{len(rules)} rules with a CONSTRUCT body: {', '.join(sorted(rules))}", file=sys.stderr)
        if a.instances > 1 and a.write:
            raise SystemExit("--instances is a diagnostic; it cannot be combined with --write")
        dr = fixed_point(up, rules, ["DR"], work, "DR", a.instances)
        allr = fixed_point(up, rules, ["DR", "PDR"], work, "DR+PDR", a.instances)

    ex = app_names()
    def keyed(triples):
        s = set()
        for (x, l, y) in triples:
            x, y = x.split("__")[0], y.split("__")[0]   # instance -> type (diagnostic mode)
            if l == "O" or x not in ex or y not in ex:
                continue
            s.add((f"{ex[x]}|{ex[y]}", l))
        return s
    der, derall = keyed(dr), keyed(allr)

    cased = cased_codes(ex)
    previous = json.loads((ROOT / "data/source/matrix-code-buckets.json").read_text())
    buckets, unexplained, fallback = {}, [], []
    lower, direct = set(), set()
    for key, codes in cased.items():
        for c, case in codes.items():
            if case == "d":
                direct.add((key, c)); buckets.setdefault(key, {})[c] = "d"
            else:
                lower.add((key, c))
                if (key, c) in der:
                    buckets.setdefault(key, {})[c] = "der"
                elif (key, c) in derall:
                    buckets.setdefault(key, {})[c] = "pdr"
                else:
                    unexplained.append(f"{key}|{c}")
                    if a.unexplained == "keep-old":
                        prev = previous.get(key, {}).get(c, "d")
                        buckets.setdefault(key, {})[c] = prev if prev in ("der", "pdr") else "pdr"
                        fallback.append({"from": key.split("|")[0], "to": key.split("|")[1], "code": c,
                                         "previous": prev, "assigned": buckets[key][c]})
    # The rules skip conclusions already asserted (FILTER NOT EXISTS), so they never re-produce a
    # direct code; anything produced outside the lowercase set is "permitted nowhere" upstream.
    extra = sorted(f"{k}|{c}" for (k, c) in derall if (k, c) not in lower)
    totals = {b: sum(v == b for m in buckets.values() for v in m.values()) for b in ("d", "der", "pdr")}
    report = {"upstream_commit": commit, "totals": totals, "lowercase": len(lower),
              "unexplained_lowercase": sorted(unexplained), "produced_outside_lowercase": extra,
              "der": sorted(f"{k}|{c}" for (k, c) in der), "der_or_pdr": sorted(f"{k}|{c}" for (k, c) in derall)}
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in report.items()}, indent=1))
    if a.report:
        a.report.write_text(json.dumps(report, indent=1))
    if extra or (unexplained and a.unexplained == "stop"):
        print("Mismatch between rules and the cased table; buckets not written.", file=sys.stderr)
        return 2
    if a.write:
        out = ROOT / "data/source/matrix-code-buckets.json"
        out.write_text(json.dumps({k: dict(sorted(buckets[k].items())) for k in sorted(buckets)}, separators=(",", ":")))
        print(f"wrote {out.relative_to(ROOT)}")
        un = ROOT / "data/source/unexplained-codes.json"
        un.write_text(json.dumps({
            "note": "Lowercase (derived) in relationships-cased.xml, but produced by none of upstream's DR/PDR rules "
                    "over conformance/fixture-direct.ttl. Self-pairs (X -> X) cannot be produced there because every "
                    "rule requires ?a != ?c and the fixture has one individual per type. Bucket: previous der/pdr kept; "
                    "a previous 'd' becomes 'pdr'.",
            "upstream_commit": commit, "codes": fallback}, indent=1) + "\n")
        print(f"wrote {un.relative_to(ROOT)} ({len(fallback)} codes)")


if __name__ == "__main__":
    sys.exit(main() or 0)
