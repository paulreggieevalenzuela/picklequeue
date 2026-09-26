# Pickle Queue

- Monorepo: pnpm workspaces + Turborepo. Node 22 (the machine's default `node` is v12; use `~/.nvm/versions/node/v22.22.0/bin`).
- `packages/core` is the only place for queue/scoring rules. Keep it pure (no I/O, no `Date.now()`), deterministic, and tested (`pnpm test`).
- Web app: see `apps/web/AGENTS.md` (Next.js 16 — read bundled docs in `node_modules/next/dist/docs/`).
- Mobile app: see `apps/mobile/AGENTS.md` (Expo 57 — use `npx expo install`).
- Checks before finishing: `pnpm turbo run typecheck test lint`.
- Database: Neon Postgres via `@neondatabase/serverless` (HTTP). Schema in `db/migrations/*.sql`, applied with `pnpm db:migrate`. `DATABASE_URL` lives only in `apps/web/.env.local` (git-ignored).
