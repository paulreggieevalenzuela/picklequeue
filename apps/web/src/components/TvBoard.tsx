"use client";

import { matchScore } from "@pickle-queue/core";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/hooks";
import { CourtDiagram } from "./CourtDiagram";
import { SessionGate } from "./SessionGate";
import { minutes } from "./ui";

/** Read-only, high-contrast board for a courtside TV. Always dark. */
export function TvBoard({ sessionId }: { sessionId: string }) {
  const { status, state, board } = useSession(sessionId, 10_000);
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const name = (id: string) => state?.players[id]?.name ?? "Open seat";

  return (
    <SessionGate status={status}>
      {state && board && (
        <main className="flex min-h-dvh flex-col gap-6 bg-court-deep p-6 text-white xl:p-10">
          <header className="flex items-end justify-between gap-6">
            <h1 className="font-display text-5xl font-extrabold xl:text-6xl">{state.name}</h1>
            <p className="font-display text-2xl text-white/80">
              {board.queue.length} waiting, games about {board.avgMatchMin} min
            </p>
          </header>

          <div className="grid flex-1 gap-8 xl:grid-cols-[1.8fr_1fr]">
            <section className="grid content-start gap-5 md:grid-cols-2">
              {board.courts
                .filter((c) => c.court.active)
                .map(({ court, match }) => {
                  const score = match?.status === "in_progress" ? matchScore(state, match) : null;
                  return (
                    <div key={court.id} className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between">
                        <h2 className="font-display text-3xl font-bold">{court.name}</h2>
                        {match?.status === "called" && (
                          <span className="rounded bg-ball px-2 py-0.5 font-display text-xl font-bold text-ball-ink">Come to court</span>
                        )}
                      </div>
                      <CourtDiagram
                        teamA={match ? match.teamA.map((id) => state.players[id]) : []}
                        teamB={match ? match.teamB.map((id) => state.players[id]) : []}
                        scoreA={score?.a}
                        scoreB={score?.b}
                        serving={score?.servingTeam}
                      >
                        {!match && <p className="absolute inset-0 grid place-items-center font-display text-2xl text-white/70">Open</p>}
                      </CourtDiagram>
                    </div>
                  );
                })}
            </section>

            <aside className="flex flex-col gap-6">
              <section>
                <h2 className="mb-3 font-display text-4xl font-extrabold text-ball">Up next</h2>
                <ol className="flex flex-col gap-3">
                  {board.upNext.slice(0, 4).map(({ match, etaMin }) => (
                    <li key={match.id} className="rounded-xl bg-white/10 px-4 py-3">
                      <p className="font-display text-2xl font-semibold">
                        {match.teamA.map(name).join(" & ")} <span className="text-white/60">vs</span> {match.teamB.map(name).join(" & ")}
                      </p>
                      <p className="text-lg text-white/70">{minutes(etaMin)}</p>
                    </li>
                  ))}
                  {board.upNext.length === 0 && <li className="text-xl text-white/70">Waiting for more players</li>}
                </ol>
              </section>
              <section className="min-h-0 flex-1">
                <h2 className="mb-2 font-display text-3xl font-bold">In line</h2>
                <ol className="columns-2 gap-6 text-xl">
                  {board.queue
                    .filter((q) => q.upNextIndex === null)
                    .slice(0, 24)
                    .map((q) => (
                      <li key={q.player.id} className="flex gap-3 py-0.5">
                        <span className="tabular w-8 text-right text-white/60">{q.position}</span>
                        <span className="truncate">{q.player.name}</span>
                      </li>
                    ))}
                </ol>
              </section>
              {origin && (
                <section className="flex items-center gap-5 rounded-xl bg-white p-4 text-court-deep">
                  <QRCodeSVG value={`${origin}/s/${state.id}/join`} size={120} marginSize={0} />
                  <div>
                    <p className="font-display text-2xl font-bold">Scan to check in</p>
                    <p className="text-lg">
                      or enter code <span className="tabular font-display text-3xl font-extrabold tracking-widest">{state.joinCode}</span>
                    </p>
                  </div>
                </section>
              )}
            </aside>
          </div>
        </main>
      )}
    </SessionGate>
  );
}
