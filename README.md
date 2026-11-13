<picture>
  <source media="(prefers-color-scheme: dark)" srcset="logo-assets/social/readme-banner-dark-1600x400.png">
  <img alt="Axlebook" src="logo-assets/social/readme-banner-light-1600x400.png">
</picture>

<p align="center">
  A self-hosted logbook for your cars, bikes, sleds and semis.<br>
  Fuel, service, reminders and what it all costs, on your own server.
</p>

<p align="center">
  <a href="https://github.com/aubergine-ux/axlebook/actions/workflows/ci.yml"><img alt="CI status" src="https://img.shields.io/github/actions/workflow/status/aubergine-ux/axlebook/ci.yml?branch=main&label=ci&labelColor=1c1f22&color=5b6168"></a>
  <a href="CHANGELOG.md"><img alt="Latest version" src="https://img.shields.io/github/v/tag/aubergine-ux/axlebook?label=version&sort=semver&labelColor=1c1f22&color=ff8a00"></a>
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-5b6168?labelColor=1c1f22"></a>
  <a href="https://github.com/aubergine-ux/axlebook/pkgs/container/axlebook"><img alt="Docker image for amd64 and arm64" src="https://img.shields.io/badge/docker-amd64%20%7C%20arm64-5b6168?labelColor=1c1f22"></a>
  <img alt="No telemetry" src="https://img.shields.io/badge/telemetry-none-5b6168?labelColor=1c1f22">
</p>

<p align="center">
  <a href="#getting-started"><b>Getting started</b></a> ·
  <a href="#what-it-does">What it does</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/tour-dark.gif">
  <img alt="A tour of Axlebook: the garage, a pickup's overview, what it has cost to own, its trip log, a semi's documents with one about to expire, and a service history ready to hand to a buyer" src="docs/screenshots/tour-light.gif">
</picture>

## Why I made this

For years my truck's history lived in three places: a spreadsheet I stopped updating, a shoebox
of receipts, and a sticker in the corner of the windshield that was usually wrong. I wanted one
place that knew when the oil was actually due, what the truck really gets per gallon, and what it
has cost me since I bought it, without handing that to yet another app that wants an account and
a subscription.

Axlebook is that place. It runs on your own server or a Raspberry Pi in the closet, it doesn't
phone home, and your records never leave your network unless you send them somewhere.

## What it does

<table>
  <tr>
    <td width="33%" valign="top">
      <img src="logo-assets/icons/png/orange/fuel-96.png" width="32" alt=""><br>
      <b>Fuel economy you can trust</b><br>
      Log a fill-up in a few seconds at the pump, even with no signal. MPG (or L/100 km) is worked out full tank to full tank, so a partial fill or a fill-up you forgot to log doesn't wreck your average.
    </td>
    <td width="33%" valign="top">
      <img src="logo-assets/icons/png/orange/reminder-96.png" width="32" alt=""><br>
      <b>Reminders that know the odometer</b><br>
      Due by date, by distance, or whichever comes first, with a predicted date for the distance ones. Log the oil change and the next one schedules itself. Nudges arrive by email, ntfy, Gotify, Discord, Apprise or a webhook.
    </td>
    <td width="33%" valign="top">
      <img src="logo-assets/icons/png/orange/garage-96.png" width="32" alt=""><br>
      <b>Yours, on your hardware</b><br>
      One <code>docker compose up</code>. SQLite out of the box, Postgres if you'd rather. No telemetry, and nothing goes online unless you switch it on. Backups on a schedule, kept as long as you say, restored in one click. The optional assistant runs on your box too.
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/service-96.png" width="28" alt=""><br>
      <b>Every job, with the receipt</b><br>
      Service, repairs, upgrades, fuel, and running costs like registration, insurance and tolls. Tag them, add notes, attach the PDF or take a photo of the receipt from your phone.
    </td>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/odometer-96.png" width="28" alt=""><br>
      <b>An odometer log that keeps itself</b><br>
      Every record with a reading adds to it. Type a number lower than last time and it saves, but asks if you meant it.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/vehicle-96.png" width="28" alt=""><br>
      <b>Every kind of vehicle</b><br>
      Cars and pickups, motorcycles, dirt bikes, ATVs, snowmobiles, semis and trailers, each in its own garage section. Engine hours for the machines that don't count miles, mi/kWh for EVs, and nicknames so "Old Blue" is what you see. Lay the garage out your way: cards, compact or a list, sorted how you like or in your own order, showing the figures you care about.
    </td>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/planner-96.png" width="28" alt=""><br>
      <b>A schedule that fits it</b><br>
      A maintenance schedule for each type of vehicle, checked against your own records: when you last did each job and when it's next due. Tick the ones you want and they become reminders.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/repair-96.png" width="28" alt=""><br>
      <b>Built for owner-operators too</b><br>
      Pre-trip and post-trip inspections (DVIR) with defects tracked until they're fixed, unit numbers, and an IFTA worksheet that splits each quarter's miles and fuel by state or province.
    </td>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/upgrade-96.png" width="28" alt=""><br>
      <b>Tips from its own numbers</b><br>
      Economy slipping, too many partial fills, an overdue job that's costing you fuel, a sled that needs putting away for summer. Advice for that vehicle, not a generic list. Don't want them? Hide them with one tap.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/parts-96.png" width="28" alt=""><br>
      <b>A parts shelf</b><br>
      Oil, filters and spares, taken off the shelf automatically when a record uses them. A planner holds the jobs you mean to get to.
    </td>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/reports-96.png" width="28" alt=""><br>
      <b>Reports worth printing</b><br>
      Spending by month, year and category, cost per mile, fuel economy over time, and what you pay where you fill up. Print them or download the CSV.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/export-96.png" width="28" alt=""><br>
      <b>Bring your spreadsheet</b><br>
      .xlsx or .csv, one sheet per vehicle or all of them in one. Axlebook works out the columns, units and vehicles, shows a preview, skips anything already in there, and remembers your mapping for next time. Coming from LubeLogger, Fuelly, Drivvo or Simply Auto? Their exports import directly.
    </td>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/search-96.png" width="28" alt=""><br>
      <b>Find anything</b><br>
      Search every record in the garage by text, tag or type. Subscribe to a calendar link and due dates show up on your phone next to everything else.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/settings-96.png" width="28" alt=""><br>
      <b>For the whole household</b><br>
      Admin, editor and viewer accounts, per-vehicle sharing, and optional single sign-on through Authentik, Authelia, Keycloak or any OpenID Connect provider.
    </td>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/tag-96.png" width="28" alt=""><br>
      <b>Your units, your way</b><br>
      Imperial or metric, your own currency and date order, light and dark, installable on your phone. Keyboard-accessible, in English and Albanian, with every word in a translation file. A REST API covers all of it.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/expense-96.png" width="28" alt=""><br>
      <b>What it really costs to own</b><br>
      Fuel, upkeep, insurance, registration and the depreciation nobody adds up, since the day you bought it: in total, per month, per mile and year by year.
    </td>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/attachment-96.png" width="28" alt=""><br>
      <b>Papers that don't lapse</b><br>
      Registration, insurance, the DOT annual inspection and permits, each with its expiry date and a scan. You hear about them before they run out, and they sit in your calendar.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/odometer-96.png" width="28" alt=""><br>
      <b>A mileage log for the tax return</b><br>
      Mark a vehicle as used for business and log trips by start and end odometer. The yearly report gives business miles, the share of everything driven, and a CSV for your accountant.
    </td>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/export-96.png" width="28" alt=""><br>
      <b>A history to hand to the buyer</b><br>
      Every service with its date and mileage on one clean page. Print it, save it as a PDF, or send a read-only link that expires and that you can switch off.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/parts-96.png" width="28" alt=""><br>
      <b>The right part, first trip</b><br>
      Oil grade and capacity, filter numbers, tire and wiper sizes, kept on the vehicle for when you're standing at the parts counter. Type a VIN and the year, make, model and engine fill themselves in.
    </td>
    <td width="50%" valign="top">
      <img src="logo-assets/icons/png/orange/repair-96.png" width="28" alt=""><br>
      <b>Recalls, checked</b><br>
      Open safety recalls for each vehicle from NHTSA, rechecked weekly, with a nudge when a new one appears. Like VIN lookup, it stays off until an admin allows it.
    </td>
  </tr>
</table>

### Optional local assistant (Ollama)

If you run [Ollama](https://ollama.com) next to Axlebook, a model on your own machine can:

- **scan a receipt**: take a photo at the pump or the shop and the date, station, amounts and fuel
  go into the form, with the photo kept on the record;
- **fill in a record from a sentence**: "filled up 10.8 gal at 3.49, 61402 mi, civic";
- **answer questions from your logbook**: "when did I last change the oil on the Tacoma?", with
  links to the records it used, and a plain "that isn't in your records" when it isn't;
- help read a messy spreadsheet, tailor the maintenance schedule to your exact make and model,
  and give tips for each vehicle.

> [!NOTE]
> It's off unless you turn it on, and everything else works the same without it. Requests go only
> to your Ollama server, never to a cloud service. Whatever it reads is a suggestion: nothing is
> saved until you check the form and press Save.

## Screenshots

<table>
  <tr>
    <td colspan="4">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/vehicle-dark.png">
        <img alt="A vehicle's overview: odometer, average economy, cost per mile, what's coming up, and tips for that vehicle" src="docs/screenshots/vehicle-light.png">
      </picture>
    </td>
  </tr>
  <tr>
    <td colspan="2" width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/schedule-dark.png">
        <img alt="A semi truck's maintenance schedule, with when each job was last done and when it's next due" src="docs/screenshots/schedule-light.png">
      </picture>
      <p align="center"><sub>A schedule that knows what you've already done</sub></p>
    </td>
    <td colspan="2" width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/import-dark.png">
        <img alt="Importing a workbook with a pickup and a snowmobile, previewed before anything is saved" src="docs/screenshots/import-light.png">
      </picture>
      <p align="center"><sub>Two vehicles from one workbook, previewed first</sub></p>
    </td>
  </tr>
  <tr>
    <td width="25%" valign="top"><img alt="Logging fuel on a phone" src="docs/screenshots/phone-log.png"></td>
    <td width="25%" valign="top"><img alt="Fuel history with economy per fill-up" src="docs/screenshots/phone-fuel.png"></td>
    <td width="25%" valign="top"><img alt="Reminders grouped by overdue and upcoming" src="docs/screenshots/phone-reminders.png"></td>
    <td width="25%" valign="top"><img alt="A pre-trip inspection with one open defect" src="docs/screenshots/phone-inspections.png"></td>
  </tr>
  <tr>
    <td colspan="2" width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/costs-dark.png">
        <img alt="Cost of ownership for a pickup: total, per month, per mile and depreciation, with spending by line and by year" src="docs/screenshots/costs-light.png">
      </picture>
      <p align="center"><sub>What it has really cost, depreciation included</sub></p>
    </td>
    <td colspan="2" width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/history-dark.png">
        <img alt="A printable service history report with the vehicle's particulars and every job on record" src="docs/screenshots/history-light.png">
      </picture>
      <p align="center"><sub>A service history to print or share with a link</sub></p>
    </td>
  </tr>
  <tr>
    <td colspan="2" width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/trips-dark.png">
        <img alt="A work truck's trip log with business distance, its share of total driving and trips by purpose" src="docs/screenshots/trips-light.png">
      </picture>
      <p align="center"><sub>Business trips and the yearly mileage report</sub></p>
    </td>
    <td colspan="2" width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/documents-dark.png">
        <img alt="A semi's documents: a DOT annual inspection that expires soon, an IFTA license and insurance" src="docs/screenshots/documents-light.png">
      </picture>
      <p align="center"><sub>Documents, with the one that's about to expire on top</sub></p>
    </td>
  </tr>
  <tr>
    <td colspan="4">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/reports-dark.png">
        <img alt="Reports: spending by month, where the money went and fuel economy over time" src="docs/screenshots/reports-light.png">
      </picture>
    </td>
  </tr>
</table>

## Getting started

You need Docker with Compose v2.

```bash
git clone https://github.com/aubergine-ux/axlebook.git
cd axlebook
docker compose up -d
```

Open **http://localhost:8080** and create your account. That's it: everything you enter is kept
in the `axlebook-data` volume.

Want to look around first? Start it with `SEED_DEMO_DATA=true` in `.env` and you'll get a 2015
Tacoma and a 2018 Civic with a couple of years of fill-ups, services, a repair or two, a reminder
that's already overdue, and the Tacoma set up as a work truck with trips and documents.

<details>
<summary><b>Use the published image instead of building</b></summary>

<br>

Images for `linux/amd64` and `linux/arm64` (so a Raspberry Pi 4 or 5 works) are published to
GitHub Container Registry with each release:

```yaml
services:
  axlebook:
    image: ghcr.io/aubergine-ux/axlebook:latest # or pin a major version, e.g. :1
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      BASE_URL: https://cars.example.com
      TZ: America/Chicago
    volumes:
      - axlebook-data:/data
volumes:
  axlebook-data:
```
</details>

<details>
<summary><b>Windows and macOS</b></summary>

<br>

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (on Windows it uses
WSL 2) and run the same `docker compose up -d`. It's the same Linux image everyone else runs.
Running from source works on Windows, macOS and Linux too, and CI tests every change on both
Linux and Windows.
</details>

<details>
<summary><b>Turn on the local assistant (Ollama)</b></summary>

<br>

```bash
echo "OLLAMA_URL=http://ollama:11434" >> .env
docker compose --profile ollama up -d
```

That starts Ollama on a private network (no published port) next to Axlebook. On first start it
downloads the model once, about 3.3 GB for the default `gemma3:4b`, which also reads receipt
photos; Settings shows the progress, lets an admin pick another model and has a Test button.
After that it never needs the internet. Already running Ollama on the host? See
[docs/configuration.md](docs/configuration.md#local-assistant-ollama).

A small model on a CPU takes from a few seconds to a minute per answer; a GPU makes it much faster.
Treat what it says the way you'd treat advice from a friend who knows cars: useful, and worth
checking.
</details>

<details>
<summary><b>Postgres instead of SQLite</b></summary>

<br>

SQLite is plenty for a household. If you'd like Postgres:

```bash
POSTGRES_PASSWORD=pick-something docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

Or point `DATABASE_URL` at a server you already run. The database is set up and upgraded
automatically every time Axlebook starts.
</details>

<details>
<summary><b>Behind a reverse proxy</b></summary>

<br>

Set `BASE_URL` to the address people type (scheme, host and port all count) and
`TRUST_PROXY=true`. Axlebook refuses changes coming from any other origin, which is what keeps
other websites from acting on your behalf.

**At a subpath**, such as `https://example.com/axlebook`: put the path in `BASE_URL` and that's
all. The same image serves it, whether your proxy strips the prefix or passes it through.

```bash
BASE_URL=https://example.com/axlebook
TRUST_PROXY=true
```

nginx, Caddy and Traefik examples are in
[docs/configuration.md](docs/configuration.md#running-under-a-subpath).
</details>

<details>
<summary><b>VIN lookup and recall checks</b></summary>

<br>

Out of the box Axlebook contacts nothing outside your server. To decode VINs and check for safety
recalls, an admin turns on **Settings → Online lookups**. Only the VIN (for decoding) or the make,
model and year (for recalls) is sent, to NHTSA, a US government service, so it covers vehicles
sold in the United States. [What goes online and when](docs/configuration.md#things-that-go-online-and-how-to-switch-them-on).
</details>

<details>
<summary><b>Home Assistant</b></summary>

<br>

Each vehicle becomes a device with sensors for its odometer, next service and whether anything
needs attention. Copy [`integrations/home-assistant/custom_components/axlebook`](integrations/home-assistant)
into your Home Assistant `custom_components` folder, restart, add the **Axlebook** integration and
give it your server's address and an API token from Settings. Prefer not to install anything? The
[same page](integrations/home-assistant#without-installing-anything) has a REST sensor example.
</details>

<details>
<summary><b>Single sign-on</b></summary>

<br>

Register Axlebook with your provider using the redirect URI
`<BASE_URL>/api/v1/auth/oidc/callback`, then set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and
`OIDC_CLIENT_SECRET`. A "Continue with …" button appears on the sign-in page. Accounts are created
on first sign-in, and members of `OIDC_ADMIN_GROUP` become admins.
</details>

## Configuration

Everything is an environment variable and everything is optional. Put them in a `.env` file next
to `docker-compose.yml`; [`.env.example`](.env.example) lists all of them with notes, and
[docs/configuration.md](docs/configuration.md) explains each one.

| Variable                                                                       | Default                    |                                                                                                                                |
| ------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `BASE_URL`                                                                     |                            | The address people use, e.g. `https://cars.example.com` or `https://example.com/axlebook`. Needed for single sign-on and links |
| `TZ`                                                                           | `UTC`                      | Your time zone, so "due today" means your today                                                                                |
| `TRUST_PROXY`                                                                  | `false`                    | Trust `X-Forwarded-*` headers from a reverse proxy                                                                             |
| `DATABASE_URL`                                                                 |                            | `postgres://…` to use Postgres; leave unset for SQLite                                                                         |
| `DATA_DIR`                                                                     | `/data`                    | Database, photos and receipts                                                                                                  |
| `MAX_UPLOAD_MB`                                                                | `25`                       | Largest single upload                                                                                                          |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`                                             |                            | Create the first admin without the setup screen                                                                                |
| `SESSION_DAYS`                                                                 | `30`                       | How long a sign-in lasts without use                                                                                           |
| `DISABLE_LOCAL_LOGIN`                                                          | `false`                    | Only allow single sign-on                                                                                                      |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`                          |                            | Single sign-on. See also `OIDC_SCOPES`, `OIDC_LABEL`, `OIDC_AUTO_CREATE_USERS`, `OIDC_DEFAULT_ROLE`, `OIDC_ADMIN_GROUP`        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` |                            | Only needed for email notifications                                                                                            |
| `OLLAMA_URL`                                                                   |                            | Address of an Ollama server for the optional local assistant. Unset means off                                                  |
| `OLLAMA_MODEL`, `OLLAMA_PULL`, `OLLAMA_TIMEOUT_SEC`                            | `gemma3:4b`, `true`, `300` | Default model (an admin can change it in Settings), whether to download it on first start, and how long to wait for an answer  |
| `REMINDER_SCAN_INTERVAL_MIN`                                                   | `60`                       | How often reminders and documents are checked for notifications                                                                |
| `DEFAULT_UNIT_SYSTEM`                                                          | `imperial`                 | `imperial` or `metric` for new accounts                                                                                        |
| `DEFAULT_LOCALE`                                                               | `en`                       | Interface language for new accounts: `en` or `sq`                                                                              |
| `DEFAULT_CURRENCY`                                                             | `USD`                      | Currency for the instance (changeable in Settings)                                                                             |
| `SEED_DEMO_DATA`                                                               | `false`                    | Add the demo Tacoma and Civic on first start                                                                                   |
| `PORT` / `AXLEBOOK_PORT`                                                       | `8080`                     | Port inside the container / port published by Compose                                                                          |
| `LOG_LEVEL`                                                                    | `info`                     | `debug` when something's odd                                                                                                   |

## Backups

**On a schedule:** an admin switches on **Settings → Your data → Back up on a schedule**, picks how
often and how many to keep, and Axlebook writes full backups to the `backups` folder of its data
volume and clears out the old ones. Any of them can be downloaded, or restored over the running
instance in one click; what was there is saved first, so a restore can be undone.

**By hand:** Settings → Your data → Download backup. You get a zip with every record, reminder,
part, photo, receipt and document scan, plus each vehicle's records as a plain CSV, so nothing is
locked in. On a fresh instance an admin can restore it from the same screen. It works across
SQLite and Postgres, so it's also how you move between them.

> [!TIP]
> A backup on the same disk doesn't survive the disk. Point your usual backup job (rsync, restic,
> a NAS snapshot) at the `backups` folder inside the `axlebook-data` volume.

## The API

Everything the app does goes through a REST API under `/api/v1`. Browse it at `/api/docs` on your
instance, or grab the OpenAPI spec from `/api/openapi.json`. For scripts, create a token in
Settings and send it as `Authorization: Bearer …`. Logging a fill-up from a shortcut on your
phone looks like this:

```bash
curl -X POST https://cars.example.com/api/v1/vehicles/1/records \
  -H "Authorization: Bearer $AXLEBOOK_TOKEN" -H "Content-Type: application/json" \
  -d '{"kind":"fuel","date":"2026-11-04","odometer":84217,"fuel":{"volume":10820,"pricePerUnit":3499}}'
```

Amounts and fuel volumes are in thousandths (10820 = 10.82 gal, 3499 = $3.499), so nothing gets
rounded on the way in.

## What's next

Things I'd like to add, roughly in order: more languages (if you'd like to translate, see
[CONTRIBUTING.md](CONTRIBUTING.md)), recurring costs that log themselves, and a VIN decoder that
works offline. Ideas and requests are welcome in
[Discussions](https://github.com/aubergine-ux/axlebook/discussions).

## Built with

TypeScript all the way through: [Fastify](https://fastify.dev) and [Kysely](https://kysely.dev) on
the server, [React](https://react.dev), [TanStack Router](https://tanstack.com/router) and
[React Aria](https://react-spectrum.adobe.com/react-aria/) in the browser, styled with
[Tailwind CSS](https://tailwindcss.com) from the [Axlebook brand tokens](logo-assets/tokens.json).
Type is Archivo and IBM Plex Mono, both served by Axlebook itself.

## Contributing

Bug reports, translations, docs fixes and code are all welcome. [CONTRIBUTING.md](CONTRIBUTING.md)
covers getting a dev setup running (`npm ci && npm run dev`), and [ARCHITECTURE.md](ARCHITECTURE.md)
is the map of how the project fits together.
Please read the [code of conduct](CODE_OF_CONDUCT.md) too.

## License

[AGPL-3.0](LICENSE). Use it, change it and host it for yourself or your family. If you run a
modified version as a service for other people, share your changes under the same license.

<br>

<p align="center">
  <img src="logo-assets/logo/svg/axlebook-mark-flat.svg" width="40" alt=""><br>
  <sub>Axlebook · every mile, on the record</sub>
</p>
