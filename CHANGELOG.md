# Changelog

What changed in each release, written for people who run Axlebook. Versions follow
[semantic versioning](https://semver.org): upgrading within 1.x never needs manual steps, and the
database upgrades itself on start.

## 1.1.0 - 2026-11-13

Upgrading from 1.0: pull the new image and start it. Five migrations run on first start and keep
everything you have. Nothing that goes online is switched on by the upgrade.

### Added

- **Switching from another app.** The CSV import reads Fuelly, Drivvo and Simply Auto exports as
  well as LubeLogger's. A file that covers several vehicles asks which one belongs here.
- **Saved column mappings.** The spreadsheet import remembers how you mapped a layout and starts
  the next file with the same headers from it, going into the same vehicles.
- **VIN decoding and recall checks** through NHTSA. Off until an admin allows online lookups in
  Settings. Recalls are listed on the vehicle and can be marked done or dismissed.
- **Parts and fluids** on each vehicle: oil, filters, tire size and pressure, wipers, battery and
  anything else worth having at the parts counter. Vehicles also get an engine field.
- **Predicted due dates.** A reminder due by distance shows the date it's expected, from how much
  the vehicle has been driven lately, and appears in the calendar feed on that day.
- **Cost of ownership** tab: everything spent since purchase by line and by year, with
  depreciation once the vehicle has a purchase price and a current value.
- **Fuel price and station history** on the fuel page, and spending by year in reports.
- **Business vehicles**: mark a vehicle as used for business to get a trip log (start and end
  odometer, purpose) and a yearly mileage report with a CSV for the tax return.
- **Documents**: registration, insurance, DOT annual inspection, permits and emissions tests with
  an expiry date and a scan. They notify before they run out, show on the reminders page and in
  the calendar feed.
- **Service history report** for selling a vehicle: print it or save it as a PDF, or hand out a
  read-only link that expires and can be switched off.
- **Notifications**: Apprise as a channel, quiet hours, a weekly digest, and a per-vehicle mute.
- **Photos from the camera** on the record form and the quick fuel log, including while offline.
  The quick log also remembers the station.
- **Scheduled backups** to the data volume with a number to keep, and restoring a stored backup
  over a running instance. Backups now include each vehicle's records as CSV.
- **Running under a subpath** such as `https://example.com/axlebook`, set with `BASE_URL` or
  `BASE_PATH`.
- **Home Assistant integration** and `GET /api/v1/status`, a one-call summary for dashboards.
- **Per-person formats**: date order and currency symbol, next to units.
- **Albanian** as a second interface language.

### Changed

- The web app is built with relative URLs, so the same image serves the root or a subpath.
- Webhook payloads carry `event` values `reminder.status`, `document.status`, `digest` and `test`.
  `reminder.status` and `test` are unchanged from 1.0.
- The demo data includes a work truck with trips, documents and a parts sheet.

### Fixed

- The calendar feed link opened the app instead of the feed when followed inside the installed
  app.
- On the trip and fuel forms, a reading's error stayed on screen after the reading was corrected.

### Security

- A shared history link is read-only, limited to one vehicle's report, answers the same for
  unknown, expired and revoked links, and slows down guessing per address.
- Restoring a stored backup needs an admin, and saves what's there first.

## 1.0.0 - 2026-11-09

First release: vehicles of every kind with engine hours and EV support, records with receipts,
full-to-full fuel economy, reminders by date or distance, parts and a planner, reports, spreadsheet
and CSV import, backups, accounts with roles and sharing, single sign-on, notifications by email,
ntfy, Gotify, Discord and webhook, a calendar feed, DVIR inspections and an IFTA worksheet, an
optional local assistant through Ollama, an installable app with offline fuel entry, and a
documented REST API.
