# Pickle Queue

Fair rotation, live scoring and a courtside board for pickleball open play.
Web app (installable PWA) now, native iOS/Android app with Expo, one shared engine.

## Structure

```
apps/
  web/       Next.js 16 (App Router) + Tailwind v4 + Zustand. Organizer, player, TV and scoring screens + API routes.
  mobile/    Expo 57 + Expo Router. Join by code, live "my status", offline courtside scorer.
packages/
  core/      Pure TypeScript queue + scoring engines, Zod command schemas. No I/O. Used by web, mobile and server.
db/          Neon Postgres schema + migration runner (optional cloud sync).
```

The rule from the architecture plan holds: anything that decides who plays, who wins or what the score is lives in
`packages/core` and has tests.

## Run it

Requires Node 22 (`nvm use`) and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm db:migrate     # create tables on Neon (needs DATABASE_URL, see below)
pnpm dev            # web app on http://localhost:3000
pnpm test           # core engine tests (unit + property-based)
pnpm simulate       # 3-hour session simulation: games spread, repeat partners, wait times
pnpm dev:mobile     # Expo dev server (press i / a for simulators)
```

## How it works

- **Engine** (`packages/core`): `nextState = applyCommand(state, command)`. Deterministic, never reads the clock
  (commands carry `at`). Only `proposed` matches are ever rebuilt automatically; `called` and `in_progress` matches
  are frozen. Undo restores snapshots.
- **Local-first web app**: with no backend configured, sessions live in the browser (localStorage) and sync across
  tabs on the same device, so an organizer laptop + a TV window, or a check-in tablet, work with no Wi-Fi at all.
- **Cloud sync** (optional, Neon Postgres): put `DATABASE_URL` in `apps/web/.env.local` (see `apps/web/.env.example`)
  and run `pnpm db:migrate`. Cloud mode switches on automatically when the server has a database. The API routes
  validate commands with Zod, run the engine, and write with optimistic concurrency on `version` (409 on conflict) in
  a single atomic statement that also appends to the event log. Devices stay live by asking for anything newer than
  their version every 2 s (the server answers 204 when nothing changed; polling pauses in background tabs). Commands
  made offline are queued and replayed on reconnect (they're deterministic, so they rebase cleanly).
- **Mobile**: set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to the web app's URL.

## What's built (MVP + some of 1.1)

| Area | Status |
| --- | --- |
| Queue modes: fair rotation (default), FIFO, skill-balanced, winners stay, paddle stack | Done |
| Late-arrival rule, rest/away with place kept, partner requests, max games in a row | Done |
| Auto-rebuild on join/leave/rest/court changes; called matches never change | Done |
| Manual create/edit with pinned players; displaced players keep priority; undo | Done |
| Variety (repeat partner/opponent penalties) and balanced team split | Done |
| Scoring: side-out (0-0-2) and rally, to 11/15/21, win by 1/2, cap, best of 3, timeouts, side switch, undo, quick final score | Done |
| Courts: add, close/reopen (called match returns to the front of the line) | Done |
| Check-in screen with QR + join code, TV board, player status with "You're up" notification | Done |
| Stats + CSV export, change log, offline banner, PWA manifest | Done |
| Cloud sync (Neon + API + live updates) | Done, tested end to end against Neon |
| Web Push from the server, native push, accounts/auth, ratings, payments, tournaments | Later phases |

## Open decisions (from the plan, §15)

1. Default queue mode: implemented as fair rotation.
2. Who can score: in cloud mode, organizer only for now (players can check in, rest, return and set partner requests).
3. Accounts: guest-first; the organizer is identified by a per-session token.
4. Rating: self-rated only.
5. Backend: Neon Postgres, with the engine behind thin API routes so it can move to a Node service later.
6. Monetization: not started.
