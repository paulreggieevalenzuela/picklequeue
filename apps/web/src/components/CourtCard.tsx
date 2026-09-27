"use client";

import { matchScore, type CourtView, type SessionPlayer, type SessionState } from "@pickle-queue/core";
import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { Elapsed, clockTime } from "./Clock";
import { CourtDiagram } from "./CourtDiagram";
import { MatchEditor } from "./MatchEditor";
import { PlayerDialog } from "./PlayerDialog";
import { QuickScore } from "./QuickScore";
import { Button } from "./ui";
import type { Run } from "./types";

export function CourtCard({ state, view, run, organizer }: { state: SessionState; view: CourtView; run: Run; organizer: boolean }) {
  const { court, match } = view;
  const [editing, setEditing] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [selected, setSelected] = useState<SessionPlayer | null>(null);
  const p = (id: string) => state.players[id];
  const size = match?.format === "singles" ? 1 : 2;
  const pad = (ids: string[]) => Array.from({ length: size }, (_, i) => (ids[i] ? p(ids[i]!) : undefined));
  const vacancies = match ? size * 2 - match.teamA.length - match.teamB.length : 0;
  const live = match?.status === "in_progress";
  const score = match && live ? matchScore(state, match) : null;
  const leaving = match ? [...match.teamA, ...match.teamB].map(p).filter((x) => x?.leaveAfterMatch) : [];

  return (
    <article
      className={clsx(
        "flex flex-col gap-3 rounded-xl bg-surface p-3 ring-1 ring-line",
        match?.status === "called" && "ring-4 ring-ball called-pulse",
      )}
    >
      <header className="flex items-start justify-between gap-2 px-1">
        <CourtName name={court.name} editable={organizer} onRename={(name) => run({ type: "RenameCourt", courtId: court.id, name })} />
        <CourtStatus view={view} vacancies={vacancies} />
      </header>

      <CourtDiagram
        teamA={match ? pad(match.teamA) : []}
        teamB={match ? pad(match.teamB) : []}
        scoreA={score?.a}
        scoreB={score?.b}
        serving={score?.servingTeam}
        dim={!court.active}
        onSelect={organizer ? setSelected : undefined}
      >
        {!match && court.active && (
          <p className="absolute inset-0 grid place-items-center font-display text-lg font-semibold text-white/80">
            Waiting for 4 players
          </p>
        )}
      </CourtDiagram>

      {leaving.length > 0 && (
        <p className="px-1 text-sm font-semibold text-danger">
          {leaving.map((x) => x!.name).join(" & ")} {leaving.length > 1 ? "check" : "checks"} out after this game
        </p>
      )}

      {organizer && (
        <div className="flex flex-wrap gap-2">
          {match?.status === "called" && vacancies === 0 && (
            <Button variant="primary" onClick={() => run({ type: "StartMatch", matchId: match.id })}>
              Start match
            </Button>
          )}
          {match && vacancies > 0 && (
            <Button variant="primary" onClick={() => run({ type: "FillVacancies", matchId: match.id }, "Filled from the front of the line")}>
              Fill from queue
            </Button>
          )}
          {match && vacancies === 0 && (
            <>
              <Link
                href={`/s/${state.id}/court/${court.id}`}
                className="inline-flex min-h-11 items-center rounded-lg bg-court px-4 font-semibold text-white hover:bg-court-deep"
              >
                Keep score
              </Link>
              <Button onClick={() => setScoring(true)}>Final score</Button>
            </>
          )}
          {match && match.status === "called" && <Button onClick={() => setEditing(true)}>Edit</Button>}
          {match && (
            <Button variant="danger" onClick={() => run({ type: "CancelMatch", matchId: match.id }, "Match cancelled. Players kept their place.")}>
              Cancel
            </Button>
          )}
          {!match && (
            <Button
              variant="quiet"
              className="ml-auto"
              onClick={() => run({ type: court.active ? "DisableCourt" : "EnableCourt", courtId: court.id })}
            >
              {court.active ? "Close court" : "Reopen court"}
            </Button>
          )}
        </div>
      )}

      {match && editing && <MatchEditor state={state} match={match} open onClose={() => setEditing(false)} run={run} />}
      {match && scoring && <QuickScore state={state} match={match} open onClose={() => setScoring(false)} run={run} />}
      {selected && <PlayerDialog key={selected.id} state={state} player={selected} open onClose={() => setSelected(null)} run={run} />}
    </article>
  );
}

function CourtStatus({ view, vacancies }: { view: CourtView; vacancies: number }) {
  const { court, match } = view;
  if (!court.active) return <span className="text-sm font-semibold text-muted">Closed</span>;
  if (!match) return <span className="text-sm font-semibold text-muted">Open</span>;
  if (match.status === "in_progress" && match.startedAt) {
    return (
      <span className="text-right">
        <Elapsed since={match.startedAt} className="block font-display text-2xl leading-none font-bold" />
        <span className="text-xs text-muted">Started {clockTime(match.startedAt)}</span>
      </span>
    );
  }
  return (
    <span className="text-right text-sm font-semibold">
      {vacancies > 0 ? `${vacancies} open seat${vacancies > 1 ? "s" : ""}` : "Called, waiting for players"}
      {match.calledAt && (
        <span className="block text-xs font-normal text-muted">
          Called <Elapsed since={match.calledAt} /> ago
        </span>
      )}
    </span>
  );
}

/** Tap the name to rename the court (organizers only). */
function CourtName({ name, editable, onRename }: { name: string; editable: boolean; onRename: (name: string) => boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!editable) return <h3 className="font-display text-2xl font-bold">{name}</h3>;
  if (draft === null) {
    return (
      <h3>
        <button
          type="button"
          onClick={() => setDraft(name)}
          title="Rename court"
          className="rounded font-display text-2xl font-bold decoration-muted decoration-dotted underline-offset-4 hover:underline"
        >
          {name}
        </button>
      </h3>
    );
  }
  const save = () => {
    const next = draft.trim();
    if (next && next !== name && !onRename(next)) return;
    setDraft(null);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="min-w-0 flex-1"
    >
      <input
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        value={draft}
        maxLength={30}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
        aria-label="Court name"
        className="w-full rounded-md border border-line bg-surface px-2 py-1 font-display text-2xl font-bold"
      />
    </form>
  );
}
