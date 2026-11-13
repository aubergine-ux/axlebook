# Configuration

Everything is an environment variable and everything is optional. Put them in a `.env` file next
to `docker-compose.yml` (Compose reads it automatically). [`.env.example`](../.env.example) has
every variable with a short note.

## Server

| Variable        | Default | What it does                                                                                                                                                                                                                                                                                                      |
| --------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`          | `8080`  | Port inside the container                                                                                                                                                                                                                                                                                         |
| `AXLEBOOK_PORT` | `8080`  | Port Compose publishes on the host                                                                                                                                                                                                                                                                                |
| `BASE_URL`      |         | The address people use, e.g. `https://cars.example.com` or `https://example.com/axlebook`. Needed for single sign-on and links in notifications; it also pins the check that refuses changes from other sites. A path here is where Axlebook is mounted (see [Running under a subpath](#running-under-a-subpath)) |
| `BASE_PATH`     |         | The mount path on its own, e.g. `/axlebook`, when you'd rather not set `BASE_URL`. Defaults to the path of `BASE_URL`                                                                                                                                                                                             |
| `TRUST_PROXY`   | `false` | Trust `X-Forwarded-*` headers from a reverse proxy                                                                                                                                                                                                                                                                |
| `LOG_LEVEL`     | `info`  | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`                                                                                                                                                                                                                                                    |
| `TZ`            | `UTC`   | Your time zone, so "due today" means your today                                                                                                                                                                                                                                                                   |

## Storage

| Variable        | Default | What it does                                           |
| --------------- | ------- | ------------------------------------------------------ |
| `DATA_DIR`      | `/data` | Database, photos and receipts                          |
| `DATABASE_URL`  |         | `postgres://…` to use Postgres; leave unset for SQLite |
| `MAX_UPLOAD_MB` | `25`    | Largest single upload (photos, receipts, backups)      |

## Accounts and single sign-on

| Variable                                              | Default                | What it does                                                                                                            |
| ----------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`                    |                        | Create the first admin without the setup screen                                                                         |
| `SESSION_DAYS`                                        | `30`                   | How long a sign-in lasts without use                                                                                    |
| `DISABLE_LOCAL_LOGIN`                                 | `false`                | Only allow single sign-on                                                                                               |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` |                        | Single sign-on through any OpenID Connect provider. Register `<BASE_URL>/api/v1/auth/oidc/callback` as the redirect URI |
| `OIDC_SCOPES`                                         | `openid profile email` | Scopes to request                                                                                                       |
| `OIDC_LABEL`                                          | `Single sign-on`       | Text on the sign-in button                                                                                              |
| `OIDC_AUTO_CREATE_USERS`                              | `true`                 | Create an account on first sign-in                                                                                      |
| `OIDC_DEFAULT_ROLE`                                   | `editor`               | Role for those accounts                                                                                                 |
| `OIDC_ADMIN_GROUP`                                    |                        | Members of this group become admins                                                                                     |

## Notifications

| Variable                                                                       | Default | What it does                                                                             |
| ------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |         | Only needed for email. ntfy, Gotify, Discord, Apprise and webhooks work without it       |
| `REMINDER_SCAN_INTERVAL_MIN`                                                   | `60`    | How often reminders and documents are checked, held messages are sent and digests go out |

## Defaults and demo

| Variable              | Default    | What it does                                       |
| --------------------- | ---------- | -------------------------------------------------- |
| `DEFAULT_UNIT_SYSTEM` | `imperial` | `imperial` or `metric` for new accounts            |
| `DEFAULT_CURRENCY`    | `USD`      | Currency for the instance (changeable in Settings) |
| `DEFAULT_LOCALE`      | `en`       | Interface language for new accounts: `en` or `sq`  |
| `SEED_DEMO_DATA`      | `false`    | Add a demo Tacoma and Civic on first start         |

## Running under a subpath

Axlebook can live at `https://example.com/axlebook` instead of its own hostname. Set `BASE_URL`
to that full address (or just `BASE_PATH=/axlebook`) and `TRUST_PROXY=true`; no rebuild and no
separate image. Pages, the API, the calendar feed, shared history links and the installable app
all follow the path. It works whether your proxy strips the prefix or passes it through.

```nginx
# nginx: pass the prefix through
location /axlebook/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 30m;
}
```

```caddyfile
# Caddy: strip it, either works
example.com {
    handle_path /axlebook/* {
        reverse_proxy 127.0.0.1:8080
    }
}
```

```yaml
# Traefik labels on the axlebook service
- traefik.http.routers.axlebook.rule=Host(`example.com`) && PathPrefix(`/axlebook`)
- traefik.http.services.axlebook.loadbalancer.server.port=8080
```

For single sign-on the redirect URI includes the path:
`https://example.com/axlebook/api/v1/auth/oidc/callback`.

## Things that go online, and how to switch them on

Out of the box Axlebook contacts nothing outside your server. Each of these is off until someone
turns it on:

| What            | Who turns it on                     | What leaves the server                                                             |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| VIN decoding    | An admin: Settings → Online lookups | The VIN, to NHTSA vPIC (`vpic.nhtsa.dot.gov`), a US government service             |
| Recall checks   | The same switch                     | Make, model and year, to NHTSA (`api.nhtsa.gov`). No VIN, no account details       |
| Notifications   | Each person, by adding a channel    | The reminder's title, vehicle name and due details, to the channel that person set |
| Single sign-on  | You, with the `OIDC_*` variables    | The sign-in exchange with your identity provider                                   |
| Local assistant | You, with `OLLAMA_URL`              | Requests to your own Ollama server only                                            |

NHTSA covers vehicles sold in the United States. A recall is matched by make, model and year, so
it may not apply to your exact vehicle; a dealer can confirm by VIN.

## Notifications

Channels are per person, under Settings → Notifications: email, ntfy, Gotify, Discord, Apprise
and signed webhooks. Each has a Test button.

- **Apprise**: enter the notify endpoint of an [Apprise API](https://github.com/caronc/apprise-api)
  server. With a saved configuration that's `http://apprise:8000/notify/<key>`. Without one, use
  `http://apprise:8000/notify` and list the Apprise URLs in the channel.
- **Quiet hours**: nothing is sent between the two times; what would have been sent is held and
  goes out when quiet hours end. Times are on the server's clock, so set `TZ`.
- **Weekly digest**: one message a week, on the day and hour you pick, listing everything overdue,
  due soon or about to expire. It's skipped when there's nothing to report.
- **Per vehicle**: the "Notify me about this vehicle" switch on a vehicle's overview mutes it for
  you alone. Other people it's shared with are not affected.
- **Documents**: registration, insurance, inspection certificates and permits with an expiry date
  notify when they enter the "due soon" window and again when they expire.

Webhooks receive `event`: `reminder.status`, `document.status`, `digest` or `test`.

## Backups

Settings → Data downloads a backup at any time: a zip with `backup.json` (what restore reads), a
CSV of each vehicle's records, and every photo, receipt and document scan.

An admin can also have the server keep backups itself:

- **Back up on a schedule** writes one to `backups/` inside `DATA_DIR` every 6 hours to weekly.
- **Keep** sets how many are kept; older ones are deleted.
- **Restore** on a stored backup replaces every vehicle and record with what it holds. What's
  there now is saved first as a backup ending in `-prerestore`, so it can be undone. Accounts and
  sign-ins are kept.

A backup on the same disk doesn't survive the disk. Copy the `backups/` folder somewhere else
(rsync, restic, your NAS's snapshot job).

## Sharing a vehicle's history

The History tab of a vehicle lays out every service, repair and upgrade for a buyer. Print it or
save it as a PDF from the browser's print dialog. The owner can also create a read-only link:
anyone holding it can read that report without an account and nothing else. Links expire (a week
to a year, or never), can be switched off at any moment, and leave out costs, the VIN and notes
unless you switch those on before creating the link. Set `BASE_URL` so the links carry your
public address.

## Home Assistant

[integrations/home-assistant](../integrations/home-assistant) turns each vehicle into a Home
Assistant device with sensors for its odometer, next service and alerts. It reads
`GET /api/v1/status` with an API token; the same endpoint works with Home Assistant's built-in
REST sensor if you'd rather not install anything.

## Local assistant (Ollama)

Optional, and off unless `OLLAMA_URL` is set. When it's on, a model running on your own machine
through [Ollama](https://ollama.com) can:

- read a photo of a receipt into a fuel or service record,
- turn a sentence like "filled up 10.8 gal at 3.49, 61402 mi, civic" into a record,
- answer questions such as "when did I last change the oil on the Tacoma?" from your own records,
  with links to the records it used,
- help with spreadsheet imports, tailor maintenance schedules, and give tips for each vehicle.

Whatever it reads is a suggestion: it fills in the normal form, and nothing is saved until you
check it and press Save. Requests go only to `OLLAMA_URL`. There's no cloud fallback, and if
Ollama is slow or gives a bad answer you get the empty form instead. Viewers can ask questions but
not create records, and questions only see vehicles you can see.

| Variable             | Default     | What it does                                                                                               |
| -------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `OLLAMA_URL`         |             | Address of the Ollama server. Unset means the assistant is off                                             |
| `OLLAMA_MODEL`       | `gemma3:4b` | Default model. An admin can pick any installed model in Settings; receipt scan needs one that reads photos |
| `OLLAMA_PULL`        | `true`      | Download the model on first start. Set `false` for offline installs and pull it yourself                   |
| `OLLAMA_TIMEOUT_SEC` | `300`       | How long to wait for an answer                                                                             |

The older names `AI_URL`, `AI_MODEL`, `AI_PULL` and `AI_TIMEOUT_SEC` still work.

### With the bundled Ollama service

`docker-compose.yml` has an `ollama` service under a profile, so it only runs when you ask for it:

```bash
echo "OLLAMA_URL=http://ollama:11434" >> .env
docker compose --profile ollama up -d
```

The model (gemma3:4b, about 3.3 GB) downloads once on first start; Settings shows the progress.
Ollama isn't published on any port: only Axlebook can reach it. Its models live in the
`axlebook-ollama` volume.

**GPU:** with an NVIDIA card and the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
installed, uncomment the `deploy` block under the `ollama` service. On a CPU, expect a receipt to
take 10–60 seconds depending on the machine.

### With Ollama already running on the host

1. Let Ollama accept connections from containers. By default it listens on `127.0.0.1` only. With
   the systemd service:

   ```bash
   sudo systemctl edit ollama
   ```

   add

   ```ini
   [Service]
   Environment="OLLAMA_HOST=0.0.0.0"
   ```

   then `sudo systemctl restart ollama`. Make sure your firewall doesn't expose port 11434 to the
   internet.

2. In `docker-compose.yml`, uncomment the `extra_hosts` lines under `axlebook`:

   ```yaml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```

3. In `.env`: `OLLAMA_URL=http://host.docker.internal:11434`, then `docker compose up -d`.

Pull the model on the host (`ollama pull gemma3:4b`) or leave `OLLAMA_PULL=true`.

### Choosing and testing the model

Settings → Local assistant (Ollama) shows whether Axlebook can reach Ollama, lists the installed
models (marking the ones that read photos), lets an admin switch model, and has a Test button
that sends a tiny request and shows how long it took.

### Troubleshooting

- **"Can't reach Ollama"**: check `OLLAMA_URL` from inside the container:
  `docker compose exec axlebook sh -c 'wget -qO- "$OLLAMA_URL/api/tags"'`. For a host install, see
  `OLLAMA_HOST` above.
- **Receipt scan isn't offered**: the chosen model can't read photos. Pick one marked
  "reads photos" in Settings (gemma3:4b, qwen2.5vl, llama3.2-vision, …).
- **Answers time out**: raise `OLLAMA_TIMEOUT_SEC`, use a smaller model, or add a GPU.
