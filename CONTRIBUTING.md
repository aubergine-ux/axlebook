# Contributing to Axlebook

Thanks for helping. Bug reports, translations, docs fixes, and code are all welcome.

## Ground rules

- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- For anything bigger than a small fix, **open an issue first** so we can agree on the approach
  before you spend time on it.
- Axlebook keeps a few promises: **no telemetry, no calls to outside services by default, and all
  data stays on the user's server**. Changes that break one of these won't be merged.
- By contributing, you agree that your contribution is licensed under the
  [AGPL-3.0](LICENSE), the same as the rest of the project.

## Development setup

Requirements: Node.js 22.12+ (24 recommended) and npm 10+. Docker is optional.

```bash
npm ci
npm run dev          # API on :8080 (tsx watch) + web on :5173 (Vite, proxies /api)
```

Open http://localhost:5173. Data goes to `./data/` (gitignored). To use Postgres locally:

```bash
docker run -d --name axlebook-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17-alpine
DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres npm run dev
```

## Before you open a PR

```bash
npm run lint         # Biome: lint + format check (npm run lint:fix to auto-fix)
npm run typecheck
npm test             # unit + API integration tests (SQLite, in memory)
npm run test:pg      # same API tests against Postgres (needs TEST_DATABASE_URL)
```

CI runs all of these, including the Postgres suite.

## Conventions

- **TypeScript strict everywhere.** Shared types and Zod schemas live in `packages/shared`.
- **API:** every route declares Zod schemas for its params, body, and response. These schemas
  are the OpenAPI docs. Errors are `{ error: { code, params } }`, never English text.
- **Database:** portable SQL only (it must run on SQLite _and_ Postgres). Add a new migration
  file. Never edit one that has shipped. Money and fuel volume are integer milli-units.
- **UI text:** never hardcode user-visible strings. Add keys to
  `packages/shared/locales/en/common.json` and use `t('…')`. Lint fails on string literals in
  JSX text and in `aria-label`/`placeholder`/`title`/`alt`/`label`.
- **Accessibility:** use the React Aria-based components, label every control, keep it
  keyboard-operable, and never signal status with color alone.
- **Tests:** domain logic (MPG, reminders, imports) needs table-driven unit tests. New API
  routes need integration tests.

## Brand

The brand kit lives in `logo-assets/` (see its README and `brand-guide/`). The web app is generated from it:

- `npm run tokens` turns `logo-assets/tokens.json` into `apps/web/src/theme/tokens.css` and checks colour contrast.
- `npm run icons` turns `logo-assets/icons/svg/*.svg` into the typed `<Icon name="…">` set.
- `npm run brand:sync` copies app icons, logos and fonts into `apps/web/public/` (runs automatically before dev and build).

Don't edit the generated files by hand. Use token classes only (`bg-surface`, `text-ink`, `text-ink-muted`, `bg-orange text-on-orange`, `text-orange-text`, …); Tailwind's default palette is switched off. Orange is scarce: one primary button per view, the active nav item, the last odometer digit. Every number uses the mono font.

## Commits and pull requests

- Small, focused commits in the [Conventional Commits](https://www.conventionalcommits.org) style:
  `feat(fuel): handle missed fill-ups`, `fix(api): …`, `docs: …`.
- Fill in the PR template. Include screenshots for UI changes, in light and dark themes and on
  a phone-width viewport.

## Translations

Copy `packages/shared/locales/en/` to a new folder named after the language tag (for example
`de/`), translate the values, and register the language in `apps/web/src/i18n/index.ts`. A test
checks that every locale has exactly the same keys as English.
