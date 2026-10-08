# ArchiTrek (ArchiMate Navigator)

**ArchiTrek** is a browser-based **ArchiMate study engine**: an interactive workspace for exploring the ArchiMate metamodel, checking relationship validity, reasoning about derivation rules (including Appendix B style routing), and visualizing **step-by-step pathfinding** between concepts you select.

The UI is optimized for **desktop** screen space (a mobile gate explains why and offers a reminder link).

## Highlights

- **Pathfinding** across the metamodel with tunable search depth, alternative routes, effort presets, and semantic rigor options (academic / pragmatic / discovery / custom).
- **Viewpoints** and allowed-element filtering to study the model from standard ArchiMate lenses.
- **Diagram rendering** with configurable overlays (hops, flips, relationship names, lock/unpin hints, composite sub-components).
- **Export** to PDF (via bundled [jsPDF](https://github.com/parallax/jsPDF) + [svg2pdf.js](https://github.com/yWorks/svg2pdf.js)); see `assets/vendor/README.vendor.md` for vendor notes.
- **Thematic scenarios** and perspective storytelling helpers driven by data in `data/scenarios.js`.
- **Optional analytics**: self-hosted [Umami](https://umami.is/) when `config/analytics-config.js` is configured.
- **Feedback / reminders**: optional [Web3Forms](https://web3forms.com/) access key in `config/feedback-config.js` (domain-restrict in their dashboard; treat the key as public-in-page).

## Tech stack

- **Plain static site** — no bundler, no build step. Scripts are loaded in order from `index.html`.
- **Vanilla JavaScript**, HTML, and CSS (`ui/styles.css`).
- Deploy anywhere that can serve static files (object storage + CDN, Apache with `.htaccess`, nginx, GitHub Pages in a subpath, etc.).

## Repository layout

| Path | Role |
|------|------|
| `index.html` | Application shell, script includes, base-URL handling for subdirectory deploys |
| `ui/` | Main app (`app.js`), styles, renderer modules, components, export controller |
| `logic/` | Graph model, pathfinder, layout engine, lightweight store, path export helpers |
| `data/` | Metamodel: elements, relationships, matrix, viewpoints, derivation logic, scenarios, renderer visuals |
| `config/` | Analytics, feedback, renderer tuning |
| `assets/` | Favicon, vendor libraries |
| `.htaccess` | Example Apache rules (adjust for your host) |

## Relationship data

`data/matrix.js` is generated. Do not edit it by hand. It holds one record per ordered element pair with three code lists: `direct`, `derived` (valid) and `derivedPotential`. Association (O) is always permitted (§5.2.4), so the matrix leaves it out. Junction is not a concept pair, so it is left out too.

**Where the allowed set comes from.** `data/source/relationships.xml` is the Appendix B relationship table of the ArchiMate® 3.2 Specification, as encoded by [AlbertoDMendoza/archimate_ontology](https://github.com/AlbertoDMendoza/archimate_ontology). It decides which codes a pair may have at all. Its letters match upstream's current table on every pair. The only difference is a Junction row, which ArchiTrek does not use.

**Where direct versus derived comes from.** `data/source/relationships-cased.xml` is upstream's `derivation/relationships.xml`, copied unmodified. In that file the case is significant:

- UPPERCASE = direct: drawn explicitly in the chapter 3–12 metamodel figures.
- lowercase = derived.

Upstream checked it cell by cell against all ten Appendix B table figures. The vendored commit, licence and attribution are in `data/source/UPSTREAM.md`.

**How valid versus potential is computed.** The table marks a code as derived but not which kind. `scripts/build-buckets.py` (dev-only, never deployed) decides this with upstream's own rules:

1. Load upstream's files in its documented load order: `ontology/archimate.ttl`, derivation axioms, strengths, provenance, the rules, then `conformance/fixture-direct.ttl` (every direct relationship at type level) as the model.
2. Run the SPARQL CONSTRUCT rules unmodified with Apache Jena `arq`. Before the rules run, `rdf:type` is closed over `rdfs:subClassOf`, because the rules test domain membership through it.
3. Run DR1–DR8 (Appendix B.2) to a fixed point. Every lowercase code they produce is **derived** (valid).
4. Run DR1–DR8 and PDR1–PDR12 (Appendix B.3) together to a fixed point. A lowercase code produced only then is **derivedPotential**.
5. Cross-check: the derived and potential codes together should equal the lowercase set. If a rule produces anything outside it, the script refuses to write. If some lowercase code is produced by no rule, it also refuses by default; with `--unexplained keep-old` (used for the current data) it keeps that code's previous derived/potential bucket, turns a previous "direct" into potential, and lists the code in `data/source/unexplained-codes.json`.

Result at upstream commit `e2135eb`: 2,066 direct, 4,158 valid derived and 345 potential codes. 4,117 valid and 285 potential come straight from the rules. The other 101 lowercase codes are produced by no rule over upstream's fixture: 88 are self-pairs such as Node -> Node (every rule requires two distinct elements, and the fixture has one per type), and 13 are cross-type codes involving Grouping, Location, Plateau, Stakeholder and Constraint (reported upstream as AlbertoDMendoza/archimate_ontology#11). They keep their previous valid/potential bucket, and any that were previously marked direct become potential. They are listed in `data/source/unexplained-codes.json`. Compared with the previous buckets, 2,596 codes changed.

**How to regenerate.**

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

**Credit.** The relationship tables and derivation rules are from The Open Group's ArchiMate® 3.2 Specification, Appendix B (© 2012–2023 The Open Group; ArchiMate is a registered trademark of The Open Group). The machine-readable encoding and the SPARQL rules are by Alberto D. Mendoza ([archimate_ontology](https://github.com/AlbertoDMendoza/archimate_ontology), Apache-2.0). ArchiTrek is not affiliated with or endorsed by The Open Group.

## Run locally

From the repository root, serve the folder over HTTP (file URLs will break module loading assumptions in many browsers):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/` (or `http://127.0.0.1:8080/`).

Any static file server works (for example `npx --yes serve -p 8080`).

## Deploying

- **Subdirectory hosting**: `index.html` injects a `<base href>` so assets resolve correctly when the app is not at the site root (for example `/ArchiTrek/`). Keep trailing-slash behavior of your host in mind.
- **Apache**: review `.htaccess` and adapt paths and directives to your environment.
- **Secrets**: do **not** commit FTP credentials, API keys for private backends, or personal deploy configs. Prefer environment-specific files that stay local or use your CI/CD secret store. (This repo’s `.gitignore` already ignores common local env patterns.)

## Configuration (no build)

Edit the checked-in `config/*.js` files as needed:

- **`config/analytics-config.js`** — optional Umami `host` + `websiteId`.
- **`config/feedback-config.js`** — optional Web3Forms access key for contact / reminder forms.
- **`config/renderer-config.js`** — renderer-related defaults.

## Development notes

- **`node_modules/`** may exist locally for editor tooling or optional dev scripts; the shipped app does not require Node to run in the browser.
- **`assets/vendor/README.vendor.md`** documents third-party bundles and how to update them.

## License

Add a `LICENSE` file to this repository if you intend to open-source the project under explicit terms.

## Name

The product name in the UI is **ArchiTrek**. This GitHub repository is named **archimate-navigator**; you can align naming in the repo settings or keep both names as you prefer.
