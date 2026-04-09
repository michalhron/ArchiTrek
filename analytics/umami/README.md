## Umami (self-hosted) for ArchiTrek

This folder runs **Umami + Postgres** behind **Caddy** (automatic HTTPS).

### 1) On your server (one-time)

- Install Docker + Docker Compose plugin.
- Point DNS for your stats subdomain (e.g. `stats.yourdomain.com`) to this server.
- Ensure ports **80/443** are reachable.

### 2) Configure

In this folder:

```bash
cp .env.example .env
```

Edit `.env`:
- `UMAMI_DOMAIN`: your stats hostname (no `https://`)
- `UMAMI_DB_PASSWORD`: strong password
- `UMAMI_APP_SECRET`: strong random string

### 3) Start

```bash
docker compose up -d
docker compose ps
```

Then open:
- `https://$UMAMI_DOMAIN/`

Create your admin user, then add your ArchiTrek site in Umami. Umami will show you a script snippet like:

```html
<script defer src="https://YOUR_UMAMI_DOMAIN/script.js" data-website-id="YOUR_WEBSITE_ID"></script>
```

### 4) Add tracking to ArchiTrek

Add the Umami `<script ...>` to `index.html` (typically in `<head>`).

Optional: track key actions as Umami events from `ui/app.js`:
- `find_path`
- `download_diagram`
- `feedback_submit_success` / `feedback_submit_error`

### Operations

- **Logs**:

```bash
docker compose logs -f --tail=200 umami
docker compose logs -f --tail=200 caddy
```

- **Update Umami**:

```bash
docker compose pull
docker compose up -d
```

- **Backups**: the Postgres data is in the `umami_db` Docker volume. Back it up using your preferred approach (volume snapshot, `pg_dump`, etc.).
