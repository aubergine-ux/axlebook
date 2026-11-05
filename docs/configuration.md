# Configuration

Everything is an environment variable and everything is optional. Put them in a `.env` file next
to `docker-compose.yml` (Compose reads it automatically). [`.env.example`](../.env.example) has
every variable with a short note.

## Server

| Variable        | Default | What it does                                                                                                                                                                |
| --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`          | `8080`  | Port inside the container                                                                                                                                                   |
| `AXLEBOOK_PORT` | `8080`  | Port Compose publishes on the host                                                                                                                                          |
| `BASE_URL`      |         | The address people use, e.g. `https://cars.example.com`. Needed for single sign-on and links in notifications; it also pins the check that refuses changes from other sites |
| `TRUST_PROXY`   | `false` | Trust `X-Forwarded-*` headers from a reverse proxy                                                                                                                          |
| `LOG_LEVEL`     | `info`  | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`                                                                                                              |
| `TZ`            | `UTC`   | Your time zone, so "due today" means your today                                                                                                                             |

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

| Variable                                                                       | Default | What it does                                                              |
| ------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |         | Only needed for email. ntfy, Gotify, Discord and webhooks work without it |
| `REMINDER_SCAN_INTERVAL_MIN`                                                   | `60`    | How often reminders are checked                                           |

## Defaults and demo

| Variable              | Default    | What it does                                       |
| --------------------- | ---------- | -------------------------------------------------- |
| `DEFAULT_UNIT_SYSTEM` | `imperial` | `imperial` or `metric` for new accounts            |
| `DEFAULT_CURRENCY`    | `USD`      | Currency for the instance (changeable in Settings) |
| `DEFAULT_LOCALE`      | `en`       | Interface language for new accounts                |
| `SEED_DEMO_DATA`      | `false`    | Add a demo Tacoma and Civic on first start         |

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
