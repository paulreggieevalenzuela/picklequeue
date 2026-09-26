"use client";

import type { SessionState } from "@pickle-queue/core";
import Link from "next/link";
import { useSession } from "@/lib/hooks";
import { SessionGate } from "./SessionGate";
import { Button } from "./ui";

function toCsv(state: SessionState): string {
  const esc = (v: string | number) => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
  const name = (id: string) => state.players[id]?.name ?? id;
  const rows: (string | number)[][] = [["Ended", "Court", "Team A", "Team B", "Score A", "Score B", "Winner"]];
  for (const m of state.matches.filter((x) => x.status === "completed" && x.result)) {
    rows.push([
      new Date(m.endedAt!).toISOString(),
      state.courts.find((c) => c.id === m.courtId)?.name ?? "",
      m.teamA.map(name).join(" & "),
      m.teamB.map(name).join(" & "),
      m.result!.scoreA,
      m.result!.scoreB,
      m.result!.winner,
    ]);
  }
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function StatsScreen({ sessionId }: { sessionId: string }) {
  const { status, state } = useSession(sessionId);
  const players = state ? Object.values(state.players).sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed) : [];
  const completed = state?.matches.filter((m) => m.status === "completed").length ?? 0;

  function download() {
    if (!state) return;
    const url = URL.createObjectURL(new Blob([toCsv(state)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.name.replace(/[^\w-]+/g, "-")}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SessionGate status={status}>
      {state && (
        <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
          <header className="flex flex-col gap-1">
            <Link href={`/s/${sessionId}`} className="font-semibold text-muted hover:text-ink">
              Back to board
            </Link>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 className="font-display text-5xl font-extrabold">Stats</h1>
              <Button onClick={download} disabled={completed === 0}>
                Download results (CSV)
              </Button>
            </div>
            <p className="text-muted">{completed} games played this session.</p>
          </header>
          <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
            <table className="tabular w-full text-left">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Player</th>
                  <th className="px-3 py-2 text-right font-semibold">Games</th>
                  <th className="px-3 py-2 text-right font-semibold">Won</th>
                  <th className="px-3 py-2 text-right font-semibold">Lost</th>
                  <th className="px-3 py-2 text-right font-semibold">Points +/−</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {players.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-semibold">{p.name}</td>
                    <td className="px-3 py-2 text-right">{p.gamesPlayed}</td>
                    <td className="px-3 py-2 text-right">{p.wins}</td>
                    <td className="px-3 py-2 text-right">{p.losses}</td>
                    <td className="px-3 py-2 text-right">{p.pointsFor - p.pointsAgainst}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}
    </SessionGate>
  );
}
