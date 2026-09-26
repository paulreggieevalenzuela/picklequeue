"use client";

import { matchScore, type CourtView, type SessionState } from "@pickle-queue/core";
import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { CourtDiagram } from "./CourtDiagram";
import { MatchEditor } from "./MatchEditor";
import { QuickScore } from "./QuickScore";
import { Button } from "./ui";
import type { Run } from "./types";

export function CourtCard({ state, view, run, organizer }: { state: SessionState; view: CourtView; run: Run; organizer: boolean }) {
  const { court, match, elapsedMin } = view;
  const [editing, setEditing] = useState(false);
  const [scoring, setScoring] = useState(false);
  const p = (id: string) => state.players[id];
  const size = match?.format === "singles" ? 1 : 2;
  const pad = (ids: string[]) => Array.from({ length: size }, (_, i) => (ids[i] ? p(ids[i]!) : undefined));
  const vacancies = match ? size * 2 - match.teamA.length - match.teamB.length : 0;
  const live = match?.status === "in_progress";
  const score = match && live ? matchScore(state, match) : null;

  const status = !court.active
    ? "Closed"
    : !match
      ? "Open"
      : live
        ? `Playing, ${elapsedMin ?? 0} min`
        : vacancies > 0
          ? `Called, ${vacancies} open seat${vacancies > 1 ? "s" : ""}`
          : "Called, waiting for players";

  return (
    <article
      className={clsx(
        "flex flex-col gap-3 rounded-xl bg-surface p-3 ring-1 ring-line",
        match?.status === "called" && "ring-4 ring-ball called-pulse",
      )}
    >
      <header className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="font-display text-2xl font-bold">{court.name}</h3>
        <span className={clsx("text-sm font-semibold", match?.status === "called" ? "text-ink" : "text-muted")}>{status}</span>
      </header>

      <CourtDiagram
        teamA={match ? pad(match.teamA) : []}
        teamB={match ? pad(match.teamB) : []}
        scoreA={score?.a}
        scoreB={score?.b}
        serving={score?.servingTeam}
        dim={!court.active}
      >
        {!match && court.active && (
          <p className="absolute inset-0 grid place-items-center font-display text-lg font-semibold text-white/80">
            Waiting for 4 players
          </p>
        )}
      </CourtDiagram>

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
    </article>
  );
}
