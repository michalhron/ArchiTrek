# Relationship data

This page is for people who maintain ArchiTrek or want to check where its answers come from. To use the app you do not need it.

`data/matrix.js` is generated. Do not edit it by hand. It holds one record per ordered element pair with three code lists: `direct`, `derived` (valid) and `derivedPotential`. Association (O) is always permitted (§5.2.4), so the matrix leaves it out. Junction is not a concept pair, so it is left out too.

## Where the allowed set comes from

`data/source/relationships.xml` is the Appendix B relationship table of the ArchiMate® 3.2 Specification, as encoded by [AlbertoDMendoza/archimate_ontology](https://github.com/AlbertoDMendoza/archimate_ontology). It decides which codes a pair may have at all. Its letters match upstream's current table on every pair. The only difference is a Junction row, which ArchiTrek does not use.

## Where direct versus derived comes from

`data/source/relationships-cased.xml` is upstream's `derivation/relationships.xml`, copied unmodified. In that file the case is significant:

- UPPERCASE means direct: drawn explicitly in the chapter 3–12 metamodel figures.
- lowercase means derived.

Upstream checked it cell by cell against all ten Appendix B table figures. The vendored commit, licence and attribution are in `data/source/UPSTREAM.md`.

## How valid versus potential is computed

The table marks a code as derived but not which kind. `scripts/build-buckets.py` (dev-only, never deployed) decides this with upstream's own rules:

1. Load upstream's files in its documented load order: `ontology/archimate.ttl`, derivation axioms, strengths, provenance, the rules, then `conformance/fixture-direct.ttl` (every direct relationship at type level) as the model.
2. Run the SPARQL CONSTRUCT rules unmodified with Apache Jena `arq`. Before the rules run, `rdf:type` is closed over `rdfs:subClassOf`, because the rules test domain membership through it.
3. Run DR1–DR8 (Appendix B.2) to a fixed point. Every lowercase code they produce is derived (valid).
4. Run DR1–DR8 and PDR1–PDR12 (Appendix B.3) together to a fixed point. A lowercase code produced only then is derivedPotential.
5. Cross-check: the derived and potential codes together should equal the lowercase set. If a rule produces anything outside it, the script refuses to write. If some lowercase code is produced by no rule, it also refuses by default. With `--unexplained keep-old` (used for the current data) it keeps that code's previous derived/potential bucket, turns a previous "direct" into potential, and lists the code in `data/source/unexplained-codes.json`.

The rules themselves, with an example for each, are in [derivation-rules.md](derivation-rules.md).

## Current numbers

At upstream commit `e2135eb` the data holds 2,066 direct, 4,158 valid derived and 345 potential codes. 4,117 valid and 285 potential come straight from the rules.

The other 101 lowercase codes are produced by no rule over upstream's fixture:

- 88 are self-pairs such as Node → Node. Every rule requires two distinct elements, and the fixture has one per type.
- 13 are cross-type codes involving Grouping, Location, Plateau, Stakeholder and Constraint, reported upstream as [AlbertoDMendoza/archimate_ontology#11](https://github.com/AlbertoDMendoza/archimate_ontology/issues/11).

They keep their previous valid/potential bucket, and any that were previously marked direct become potential. They are listed in `data/source/unexplained-codes.json`. Compared with the previous buckets, 2,596 codes changed.

## How to regenerate

```bash
brew install jena                     # Apache Jena (arq, riot); needs a JDK
git clone https://github.com/AlbertoDMendoza/archimate_ontology ../archimate_ontology
git -C ../archimate_ontology checkout e2135eb0ea09da1e71ad7bc83917f679f6b27d72
python3 scripts/build-buckets.py --upstream ../archimate_ontology --unexplained keep-old --write   # about 15 min
node scripts/build-matrix.mjs
node --test scripts/test-matrix-buckets.mjs
```

To move to a newer upstream commit:

1. Copy its `derivation/relationships.xml` over `data/source/relationships-cased.xml`.
2. Update the commit and dates in `data/source/UPSTREAM.md`.
3. Run the commands above.

`node scripts/compare-buckets.mjs` lists every code whose direct/derived side differs between the cased table and the current buckets.

## Credit

The relationship tables and derivation rules are from The Open Group's ArchiMate® 3.2 Specification, Appendix B (© 2012–2023 The Open Group; ArchiMate is a registered trademark of The Open Group). The machine-readable encoding and the SPARQL rules are by Alberto D. Mendoza ([archimate_ontology](https://github.com/AlbertoDMendoza/archimate_ontology), Apache-2.0). ArchiTrek is not affiliated with or endorsed by The Open Group.
