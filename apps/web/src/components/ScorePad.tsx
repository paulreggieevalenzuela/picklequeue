"use client";

import { callout, courtMatch, finalScore, matchScore, type Team } from "@pickle-queue/core";
import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/lib/hooks";
import { QuickScore } from "./QuickScore";
import { SessionGate } from "./SessionGate";
import { Button } from "./ui";
import { useRun } from "./useRun";

const now = () => Date.now();

/**
 * Courtside scoring. Tap the team that won the rally; the engine works out
 * points, side-outs and server numbers from the rules. Stays on this court,
 * so when a match ends the next one called here shows up automatically.
 */
export function ScorePad({ sessionId, courtId }: { sessionId: string; courtId: string }) {
  const session = useSession(sessionId, 5_000);
  const run = useRun(session);
  const [quick, setQuick] = useState(false);
  const { state } = session;

  const court = state?.courts.find((c) => c.id === courtId);
  const match = state ? courtMatch(state, courtId) : undefined;
  const score = state && match ? matchScore(state, match) : null;
  const names = (ids: string[]) => ids.map((id) => state?.players[id]?.name ?? "?").join(" & ");

  const rally = (winner: Team) => {
    if (!match) return;
    if (run({ type: "RecordScoreEvent", matchId: match.id, event: { type: "RALLY", winner, at: now() } })) {
      navigator.vibrate?.(15);
    }
  };

  return (
    <SessionGate status={session.status}>
      <main className="flex min-h-dvh flex-col gap-4 p-3 sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <Link href={`/s/${sessionId}`} className="font-semibold text-muted hover:text-ink">
            Back to board
          </Link>
          <h1 className="font-display text-3xl font-extrabold">{court?.name ?? "Court"}</h1>
          <span className="w-24" />
        </header>

        {!match || !score || !state ? (
          <p className="m-auto max-w-sm text-center text-lg text-muted">
            Nothing on this court yet. The next match called here will show up on this screen.
          </p>
        ) : (
          <>
            <div className="text-center">
              <p className="tabular font-display text-6xl font-extrabold sm:text-7xl" aria-live="polite">
                {score.finished ? `${score.a}–${score.b}` : callout(score)}
              </p>
              <p className="text-muted">
                {score.finished
                  ? `${names(score.winner === "A" ? match.teamA : match.teamB)} win`
                  : `${state.settings.scoring.system === "rally" ? "Rally scoring" : "Side-out scoring"} to ${state.settings.scoring.pointsToWin}${
                      state.settings.scoring.bestOf > 1 ? `, game ${score.gameNumber} of ${state.settings.scoring.bestOf}` : ""
                    }`}
              </p>
            </div>

            {score.sideSwitchDue && !score.finished && (
              <p role="alert" className="rounded-xl bg-ball px-4 py-3 text-center font-display text-2xl font-bold text-ball-ink">
                Switch sides
              </p>
            )}
            {!score.finished && (score.matchPoint || score.gamePoint) && (
              <p className="text-center font-display text-xl font-bold text-surround">{score.matchPoint ? "Match point" : "Game point"}</p>
            )}

            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              {(["A", "B"] as const).map((t) => {
                const serving = score.servingTeam === t && !score.finished;
                const pts = t === "A" ? score.a : score.b;
                return (
                  <button
                    key={t}
                    onClick={() => rally(t)}
                    disabled={score.finished}
                    className={clsx(
                      "flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl p-4 text-white transition-transform active:scale-[0.98] disabled:opacity-60",
                      "bg-court",
                      serving && "ring-4 ring-ball",
                    )}
                    aria-label={`Rally won by ${names(t === "A" ? match.teamA : match.teamB)}`}
                  >
                    <span className="text-center text-lg font-semibold">{names(t === "A" ? match.teamA : match.teamB)}</span>
                    <span className="tabular font-display text-8xl leading-none font-extrabold">{pts}</span>
                    <span className="h-6 text-sm font-semibold text-ball">
                      {serving ? (score.doubles && state.settings.scoring.system === "sideout" ? `Serving, server ${score.serverNumber}` : "Serving") : ""}
                    </span>
                    {score.games.length > 0 && <span className="text-sm text-white/70">Games won: {score.gamesWon[t]}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-center text-sm text-muted">Tap the team that won the rally.</p>

            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => run({ type: "RecordScoreEvent", matchId: match.id, event: { type: "UNDO", at: now() } })}
                disabled={score.effectiveEvents.length === 0}
              >
                Undo last rally
              </Button>
              {(["A", "B"] as const).map((t) => (
                <Button
                  key={t}
                  variant="quiet"
                  disabled={score.finished || score.timeoutsUsed[t] >= state.settings.scoring.timeoutsPerGame}
                  onClick={() => run({ type: "RecordScoreEvent", matchId: match.id, event: { type: "TIMEOUT", team: t, at: now() } }, "Timeout")}
                >
                  Timeout {t === "A" ? "left" : "right"} ({state.settings.scoring.timeoutsPerGame - score.timeoutsUsed[t]} left)
                </Button>
              ))}
              <Button variant="quiet" onClick={() => setQuick(true)}>
                Enter final score
              </Button>
            </div>

            {score.finished && (
              <Button
                variant="primary"
                size="lg"
                className="mx-auto"
                onClick={() => {
                  const f = finalScore(score)!;
                  run({ type: "CompleteMatch", matchId: match.id, scoreA: f.a, scoreB: f.b }, "Result saved. Next match is being called.");
                }}
              >
                Save result
              </Button>
            )}
            {quick && <QuickScore state={state} match={match} open onClose={() => setQuick(false)} run={run} />}
          </>
        )}
      </main>
    </SessionGate>
  );
}
