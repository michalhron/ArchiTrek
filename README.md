# ArchiTrek (ArchiMate Navigator)

**ArchiTrek** is a browser-based **ArchiMate study engine**: an interactive workspace for exploring the ArchiMate metamodel, checking relationship validity, reasoning about derivation rules, and visualizing **step-by-step pathfinding** between concepts you select. **Relationship validity is aligned with ArchiMate 3.2**, from the normative grid in `data/relationships-3.2.xml` (compiled into `data/matrix.js` via `node scripts/build-matrix-3.2.js`).

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

- **Plain static site** — no bundler. Scripts load in order from `index.html`. Regenerate `data/matrix.js` after editing `data/relationships-3.2.xml` with `node scripts/build-matrix-3.2.js`.
- **Vanilla JavaScript**, HTML, and CSS (`ui/styles.css`).
- Deploy anywhere that can serve static files (object storage + CDN, Apache with `.htaccess`, nginx, GitHub Pages in a subpath, etc.).

## Repository layout

| Path | Role |
|------|------|
| `index.html` | Application shell, script includes, base-URL handling for subdirectory deploys |
| `ui/` | Main app (`app.js`), styles, renderer modules, components, export controller |
| `logic/` | Graph model, pathfinder, layout engine, lightweight store, path export helpers |
| `data/` | Metamodel: elements, relationships, **3.2** `relationships-3.2.xml` → generated `matrix.js`, viewpoints, derivation logic, scenarios, renderer visuals |
| `scripts/` | Maintenance utilities (e.g. `build-matrix-3.2.js` to compile the relationship XML into `data/matrix.js`) |
| `tools/archimate-relationship-extractor/` | Optional Node tool: extract **direct vs derived** links from `.archimate` / JSON / ontology TTL (`npm install` in that folder, then `node src/cli.mjs --help`) |
| `config/` | Analytics, feedback, renderer tuning |
| `assets/` | Favicon, vendor libraries |
| `.htaccess` | Example Apache rules (adjust for your host) |

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
