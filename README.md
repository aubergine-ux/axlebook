# Axlebook

**A self-hosted logbook for your vehicles.** Track service, repairs, upgrades, fuel, and running
costs, and get reminded before things are due. Your data stays on your server.

> **Status: early development.** The foundation is in place (API server, database, web app
> shell, Docker image). Features are landing in the order shown under [Roadmap](#roadmap).
> Don't run it for real records yet.

<!-- Screenshots: add images to docs/screenshots/ and reference them here. -->
| Garage              | Vehicle history     | Log fuel (phone)    |
| ------------------- | ------------------- | ------------------- |
| _screenshot coming_ | _screenshot coming_ | _screenshot coming_ |

## Features

- **Garage view:** a card for each vehicle with photo, odometer, next reminder, and cost to date.
- **Records:** service, repairs, upgrades, fuel fill-ups, taxes, registration, insurance, and
  other costs, each with date, odometer, cost, notes, tags, and attachments (receipts, photos,
  PDFs).
- **Accurate fuel economy:** full-to-full MPG (or L/100 km) that handles partial fills and
  missed fill-ups correctly.
- **Reminders** by date, distance, or whichever comes first, with recurring intervals. A
  reminder resets when you log the work. Optional email and webhook notifications (ntfy,
  Gotify, Discord, generic).
- **Odometer log** that updates automatically from any record with a reading.
- **Parts and supplies inventory**, deducted when used in a record.
- **Planner** for upcoming jobs, which turn into records once done.
- **Reports:** cost by month and category, cost per mile, MPG trends, and lifetime totals.
  Printable and exportable.
- **Import/export:** CSV per record type, full backup and restore, and an experimental
  LubeLogger importer.
- **Multi-user:** admin, editor, and viewer roles, per-vehicle sharing, and optional OIDC login
  (Authentik, Authelia, Keycloak, …).
- **REST API** for everything, documented with OpenAPI at `/api/docs`.
- **Phone-first and installable:** logging fuel at the pump takes seconds, and it works as a PWA.
- Dark and light themes, imperial or metric units, any currency, keyboard-accessible, and
  translatable.
- **Private by design:** no telemetry and no calls to outside services unless you configure
  notifications.

## Quick start

You need Docker with Compose v2.

```bash
git clone https://github.com/aubergine-ux/axlebook.git
cd axlebook
docker compose up -d
```

Then open **http://localhost:8080**. Data lives in the `axlebook-data` Docker volume.

To try it with sample data (a 2015 Toyota Tacoma and a 2018 Honda Civic with a few years of
history), add `SEED_DEMO_DATA=true` to `.env` before the first start. _(The demo seed ships
with the first release.)_

### Using the published image

Release images for `linux/amd64` and `linux/arm64` are published to GitHub Container Registry. If
you don't want to clone the repo, save this as `docker-compose.yml`:

```yaml
services:
  axlebook:
    image: ghcr.io/aubergine-ux/axlebook:latest # or pin a version, e.g. :0.1
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      BASE_URL: https://cars.example.com # your public URL
    volumes:
      - axlebook-data:/data
volumes:
  axlebook-data:
```

### Using Postgres instead of SQLite

SQLite is the default and fine for a household. To use Postgres:

```bash
POSTGRES_PASSWORD=pick-something docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

Or point `DATABASE_URL` at an existing server. Migrations run automatically on startup with
either database.

### Behind a reverse proxy

Set `BASE_URL` to the public URL and `TRUST_PROXY=true`. Axlebook rejects state-changing
requests whose `Origin` doesn't match `BASE_URL` (CSRF protection), so the URL must match exactly
what users type: scheme, host, and port.

## Configuration

All settings are environment variables and all are optional. Put them in `.env` next to
`docker-compose.yml`. [`.env.example`](.env.example) lists every one with comments.

| Variable              | Default    | Description                                                                                      |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `PORT`                | `8080`     | Port the server listens on inside the container                                                  |
| `AXLEBOOK_PORT`       | `8080`     | Host port published by `docker-compose.yml`                                                      |
| `BASE_URL`            | (unset)    | Public URL, e.g. `https://cars.example.com`. Pins the CSRF origin check; used in emails and OIDC |
| `TRUST_PROXY`         | `false`    | Trust `X-Forwarded-*` headers from a reverse proxy                                               |
| `LOG_LEVEL`           | `info`     | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`                                     |
| `DATA_DIR`            | `/data`    | SQLite database and attachments                                                                  |
| `DATABASE_URL`        | (unset)    | `postgres://…` to use Postgres; unset means SQLite in `DATA_DIR`                                 |
| `MAX_UPLOAD_MB`       | `25`       | Maximum size of a single attachment                                                              |
| `DEFAULT_UNIT_SYSTEM` | `imperial` | `imperial` or `metric`, for new users                                                            |
| `DEFAULT_CURRENCY`    | `USD`      | ISO 4217 code. Instance-wide; admins can change it later                                         |
| `DEFAULT_LOCALE`      | `en`       | Interface language for new users                                                                 |
| `SEED_DEMO_DATA`      | `false`    | Seed demo vehicles on startup (skipped if they already exist)                                    |

Settings for login (OIDC), email, and notifications will be added as those features land.

## Backups

Everything Axlebook stores is in the data volume (the SQLite database and the attachments) or,
with Postgres, the database plus the volume's `attachments/` folder.

**SQLite (default)**

```bash
docker compose stop axlebook                       # stop first so the database is consistent
docker compose cp axlebook:/data ./axlebook-backup-$(date +%F)
docker compose start axlebook
```

To restore, stop the container, copy the folder back with
`docker compose cp ./axlebook-backup-YYYY-MM-DD/. axlebook:/data`, and start it again.

**Postgres**

```bash
docker compose exec db pg_dump -U axlebook axlebook > axlebook-$(date +%F).sql
docker compose cp axlebook:/data/attachments ./attachments-$(date +%F)
```

A one-click full backup and restore (JSON plus attachments, portable between SQLite and
Postgres) is planned. See [Roadmap](#roadmap).

## API

The REST API is under `/api/v1`. Interactive docs are at **`/api/docs`** and the OpenAPI document
at `/api/openapi.json`. Errors always have the shape `{ "error": { "code": "…", "params": {…} } }`.

## Roadmap

1. ✅ Foundation: API server, SQLite and Postgres, migrations, web shell, PWA, Docker, CI
2. Vehicles and garage view
3. Service, repair, upgrade, and expense records with tags and attachments
4. Odometer log, fuel fill-ups, and fuel economy
5. Reminders
6. Parts inventory and planner
7. Reports
8. Import/export, backup and restore, LubeLogger import, and search
9. Accounts, roles, sharing, API tokens, and OIDC
10. Notifications (email, ntfy, Gotify, Discord, webhooks)
11. Demo data and first release
12. Offline fuel entry (queue at the pump, sync later)

## Development

```bash
npm ci
npm run dev       # API on :8080, web on :5173
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions, and how to add a translation.

## License

[AGPL-3.0](LICENSE). You can use, modify, and self-host Axlebook freely. If you run a modified
version as a service for others, you must share your changes under the same license.
