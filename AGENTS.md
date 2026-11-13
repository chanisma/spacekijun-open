# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React + TypeScript app; feature folders (`components/`, `pages/`, `hooks/`, `services/`, `types/`, `utils/`) are imported through the `@/` alias.
- `supabase/` keeps SQL migrations and RPC helpers; follow chronological filenames and explain effects in matching docs under `docs/`.
- `public/` serves static assets, `config/` stores deployment presets, and `dist/` is build output; do not edit generated files.
- Tests live alongside code in `src/**/__tests__`, mirroring the feature they cover.

## Build, Test & Development Commands
- `npm install` or `npm ci` syncs dependencies; keep `package-lock.json` as the source of truth.
- `npm run dev` launches Vite on http://localhost:5173 with hot reload.
- `npm run build` compiles the production bundle; `npm run build:dev` produces a debug-friendly build.
- `npm run preview` serves the latest build for manual QA.
- `npm run lint` runs ESLint with the shared TypeScript ruleset.
- `npx jest --runInBand` executes the hook and service suites; append `--watch` for TDD loops.

## Coding Style & Naming Conventions
- Respect the ESLint stack (`@eslint/js`, `typescript-eslint`, React Hooks); avoid adding new disable comments without consensus.
- Prefer 2-space indentation, PascalCase components, camelCase utilities, and a `use` prefix for hooks.
- Keep Tailwind classes grouped layout -> color -> state, and colocate styling with its component.

## Testing Guidelines
- Author Jest + Testing Library specs in `__tests__` files ending with `*.test.ts`.
- Mock Supabase and React Query APIs to stay deterministic, modeling patterns in `services/__tests__/useUnifiedAuth.test.ts`.
- Focus coverage on auth, scheduling, and permission flows; mention outstanding gaps in the PR.

## Commit & Pull Request Guidelines
- Existing commits use brief, imperative summaries (e.g., `Event-Task Update`, `time change`); follow that tone and add a scope like `Schedule:` when helpful.
- PRs must include a purpose summary, linked issue, UI evidence when applicable, a checklist for `supabase/` changes, and the tests you ran.
- Call out generated artifacts (e.g., refreshed Supabase client) and update supporting docs (`CURRENT_STATUS_README.md`, feature briefs) before review.

## Supabase & Configuration Notes
- Create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using non-production credentials; never commit secrets.
- `src/integrations/supabase/client.ts` is generated; regenerate via Lovable or Supabase tooling whenever schemas move.
- Keep `MIGRATION_EXECUTION_ORDER.md` aligned with actual SQL changes so deployers can replay migrations safely.
