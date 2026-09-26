"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/lib/hooks";
import { AddPlayer } from "./AddPlayer";
import { CourtCard } from "./CourtCard";
import { MatchEditor } from "./MatchEditor";
import { OffQueue, QueueList, UpNext } from "./Queue";
import { SessionGate } from "./SessionGate";
import { Button } from "./ui";
import { useRun } from "./useRun";

export function Dashboard({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId);
  const run = useRun(session);
  const [creating, setCreating] = useState(false);
  const { state, board, isOrganizer } = session;

  return (
    <SessionGate status={session.status}>
      {state && board && (
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
              <Link href="/" className="hidden font-display text-lg font-bold text-muted hover:text-ink sm:inline">
                Pickle Queue
              </Link>
              <h1 className="min-w-0 flex-1 truncate font-display text-3xl font-extrabold">{state.name}</h1>
              <Link
                href={`/s/${state.id}/join`}
                className="rounded-lg bg-surface px-3 py-1.5 ring-1 ring-line hover:ring-muted"
                title="Open the check-in screen with a QR code"
              >
                <span className="text-sm text-muted">Join code </span>
                <span className="tabular font-display text-xl font-bold tracking-widest">{state.joinCode}</span>
              </Link>
            </div>
            {isOrganizer && (
              <nav className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 pb-3 sm:px-6" aria-label="Session actions">
                <Button size="sm" variant="court" onClick={() => setCreating(true)}>
                  New match
                </Button>
                <Button size="sm" onClick={session.undo} disabled={!session.canUndo} title={state.log.at(-1)?.summary}>
                  Undo
                </Button>
                <Link href={`/s/${state.id}/tv`} target="_blank" className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-2.5 text-sm font-semibold hover:border-muted">
                  TV board
                </Link>
                <Link href={`/s/${state.id}/settings`} className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-2.5 text-sm font-semibold hover:border-muted">
                  Settings
                </Link>
                <Link href={`/s/${state.id}/stats`} className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-2.5 text-sm font-semibold hover:border-muted">
                  Stats
                </Link>
              </nav>
            )}
          </header>

          <main className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
            <section aria-labelledby="courts" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h2 id="courts" className="font-display text-2xl font-bold">
                  Courts
                </h2>
                <span className="text-sm text-muted">Average game {board.avgMatchMin} min</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {board.courts.map((view) => (
                  <CourtCard key={`${view.court.id}:${view.match?.id ?? ""}`} state={state} view={view} run={run} organizer={isOrganizer} />
                ))}
              </div>
              {isOrganizer && (
                <Button
                  variant="quiet"
                  className="self-start"
                  onClick={() =>
                    run(
                      { type: "AddCourt", court: { id: `c${Date.now().toString(36)}`, name: `Court ${state.courts.length + 1}` } },
                      "Court added",
                    )
                  }
                >
                  Add a court
                </Button>
              )}
              <ActivityLog entries={state.log} />
            </section>

            <aside className="flex flex-col gap-8">
              {isOrganizer && (
                <section aria-labelledby="add" className="flex flex-col gap-2">
                  <h2 id="add" className="font-display text-2xl font-bold">
                    Check someone in
                  </h2>
                  <AddPlayer run={run} />
                </section>
              )}
              <UpNext state={state} board={board} run={run} organizer={isOrganizer} />
              <QueueList state={state} board={board} run={run} organizer={isOrganizer} />
              <OffQueue board={board} run={run} organizer={isOrganizer} />
            </aside>
          </main>

          {creating && <MatchEditor state={state} open onClose={() => setCreating(false)} run={run} />}
        </div>
      )}
    </SessionGate>
  );
}

function ActivityLog({ entries }: { entries: { version: number; at: number; summary: string }[] }) {
  if (entries.length === 0) return null;
  return (
    <details className="mt-4 rounded-xl bg-surface ring-1 ring-line">
      <summary className="cursor-pointer px-4 py-3 font-display text-xl font-bold">Change log</summary>
      <ol className="max-h-80 divide-y divide-line overflow-y-auto border-t border-line">
        {[...entries].reverse().map((e) => (
          <li key={e.version} className="flex gap-3 px-4 py-2 text-sm">
            <time className="tabular w-16 shrink-0 text-muted">
              {new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </time>
            <span>{e.summary}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
