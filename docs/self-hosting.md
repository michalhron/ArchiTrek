# Running and hosting ArchiTrek

ArchiTrek is a plain static site. There is no bundler and no build step. `index.html` loads the scripts in order, and any server that can serve files can host it.

## Run it locally

Serve the repository folder over HTTP. Opening `index.html` as a `file://` URL breaks script loading in most browsers.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`. Any static server works, for example `npx --yes serve -p 8080`.

## Repository layout

| Path | Role |
|------|------|
| `index.html` | Application shell, script includes, base-URL handling for subdirectory deploys |
| `ui/` | Main app (`app.js`), styles, renderer modules, components, export controller |
| `logic/` | Graph model, pathfinder, layout engine, lightweight store, path export helpers |
| `data/` | Metamodel: elements, relationships, matrix, viewpoints, derivation logic, scenarios, renderer visuals |
| `data/source/` | Vendored upstream tables the matrix is built from (see [relationship-data.md](relationship-data.md)) |
| `config/` | Analytics, feedback, renderer tuning |
| `assets/` | Logo, favicon, vendor libraries |
| `scripts/` | Dev-only build and test scripts, never deployed |
| `docs/` | This documentation and its images |
| `.htaccess` | Example Apache rules (adjust for your host) |

The stack is vanilla JavaScript, HTML and CSS (`ui/styles.css`).

## Deploying

- Subdirectory hosting works. `index.html` injects a `<base href>` so assets resolve when the app is not at the site root, for example `/ArchiTrek/`. Keep your host's trailing-slash behaviour in mind.
- On Apache, review `.htaccess` and adapt paths and directives to your environment.
- Do not commit FTP credentials, private API keys or personal deploy configs. Keep them in local files or your CI secret store. The `.gitignore` already ignores common local env patterns.
- `docs/` is not needed on the server, and `scripts/deploy-ftp.sh` leaves it out.

## Configuration

Edit the checked-in `config/*.js` files. All three are optional. The checked-in analytics file holds the measurement ID of the hosted site, so clear it before you deploy your own copy.

| File | What it sets |
|---|---|
| `config/analytics-config.js` | Analytics. Either a self-hosted [Umami](https://umami.is/) `host` and `websiteId`, or a Google Analytics 4 `measurementId`. Scripts load only when a value is set. |
| `config/feedback-config.js` | [Web3Forms](https://web3forms.com/) access key for the feedback and reminder forms. Restrict it to your domain in their dashboard and treat it as public. |
| `config/renderer-config.js` | Renderer defaults |

## Development notes

- `node_modules/` may exist locally for editor tooling or optional dev scripts. The app itself does not need Node.
- `assets/vendor/README.vendor.md` documents the third-party bundles and how to update them.
- `node --test scripts/test-matrix-buckets.mjs` checks the relationship buckets.
- The images in `docs/assets/` are generated. Run `python3 scripts/build-docs-assets.py` after changing them. The screenshots in `docs/assets/screenshots/` are taken from the running app.
