-- Pickle Queue: initial schema (Neon Postgres).
--
-- MVP storage model: each session is one row holding the engine's full
-- SessionState as JSONB, plus an append-only event log. The API routes are the
-- single writer (optimistic concurrency on `version`); clients pick up changes
-- by asking for anything newer than the version they have. The normalized
-- tables from the architecture doc (matches, match_players, pair_history, ...)
-- can be added later as read models fed from session_events.

create table if not exists sessions (
  id           text primary key,
  join_code    text not null unique,
  name         text not null,
  version      integer not null default 0,
  state        jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Organizer credentials, kept apart from `sessions` so no read path ever returns them.
create table if not exists session_secrets (
  session_id       text primary key references sessions (id) on delete cascade,
  admin_token_hash text not null
);

-- Audit log + undo: every accepted command with the state before it.
create table if not exists session_events (
  id           bigint generated always as identity primary key,
  session_id   text not null references sessions (id) on delete cascade,
  version      integer not null,
  type         text not null,
  payload      jsonb not null,
  actor        text,
  state_before jsonb,
  undone       boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists session_events_session_version_idx on session_events (session_id, version desc);
