"use client";

import type { Board, Match, SessionPlayer, SessionState } from "@pickle-queue/core";
import clsx from "clsx";
import { useState } from "react";
import { MatchEditor } from "./MatchEditor";
import { PlayerDialog } from "./PlayerDialog";
import { Button, Empty, SkillBadge, minutes } from "./ui";
import type { Run } from "./types";

const names = (state: SessionState, ids: string[]) => ids.map((id) => state.players[id]?.name ?? "Open seat").join(" & ") || "Open seat";

export function UpNext({ state, board, run, organizer }: { state: SessionState; board: Board; run: Run; organizer: boolean }) {
  const [editing, setEditing] = useState<Match | null>(null);
  return (
    <section aria-labelledby="up-next" className="flex flex-col gap-3">
      <h2 id="up-next" className="font-display text-2xl font-bold">
        Up next
      </h2>
      {board.upNext.length === 0 ? (
        <Empty>Upcoming matches appear here once enough players are waiting.</Empty>
      ) : (
        <ol className="flex flex-col gap-2">
          {board.upNext.map(({ match, etaMin }, i) => (
            <li key={match.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{names(state, match.teamA)}</p>
                  <p className="text-sm text-muted">vs</p>
                  <p className="font-semibold">{names(state, match.teamB)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-xl font-bold">{i === 0 ? "Next" : `Match ${i + 1}`}</p>
                  <p className="text-sm text-muted">{minutes(etaMin)}</p>
                  {match.locked.length > 0 && <p className="text-xs font-semibold text-surround">Set by organizer</p>}
                  {match.courtId && <p className="text-xs text-muted">For {state.courts.find((c) => c.id === match.courtId)?.name}</p>}
                </div>
              </div>
              {organizer && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => setEditing(match)}>
                    Edit
                  </Button>
                  {match.locked.length > 0 && (
                    <Button size="sm" variant="danger" onClick={() => run({ type: "CancelMatch", matchId: match.id }, "Match removed. The queue was rebuilt.")}>
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {editing && <MatchEditor key={editing.id} state={state} match={editing} open onClose={() => setEditing(null)} run={run} />}
    </section>
  );
}

export function QueueList({ state, board, run, organizer }: { state: SessionState; board: Board; run: Run; organizer: boolean }) {
  const [selected, setSelected] = useState<SessionPlayer | null>(null);
  return (
    <section aria-labelledby="queue" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="queue" className="font-display text-2xl font-bold">
          Waiting
        </h2>
        <span className="text-sm text-muted">{board.queue.length} in line</span>
      </div>
      {board.queue.length === 0 ? (
        <Empty>Nobody is waiting. Add players or share the join code.</Empty>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
          {board.queue.map(({ player, position, etaMin, upNextIndex }) => (
            <li key={player.id} className="flex items-center gap-3 px-3 py-2">
              <span className={clsx("tabular w-8 text-center font-display text-2xl font-bold", upNextIndex === 0 ? "text-ink" : "text-muted")}>
                {position}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-semibold">
                  {player.name} <SkillBadge skill={player.skill} />
                </p>
                <p className="text-sm text-muted">
                  {player.gamesPlayed} {player.gamesPlayed === 1 ? "game" : "games"}, {minutes(etaMin)}
                  {player.partnerRequestId && `, with ${state.players[player.partnerRequestId]?.name ?? "partner"}`}
                </p>
              </div>
              {organizer && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="quiet" onClick={() => run({ type: "SetRest", playerId: player.id }, `${player.name} is resting and keeps their place`)}>
                    Rest
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setSelected(player)}>
                    More
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {selected && <PlayerDialog key={selected.id} state={state} player={selected} open onClose={() => setSelected(null)} run={run} />}
    </section>
  );
}

export function OffQueue({ board, run, organizer }: { board: Board; run: Run; organizer: boolean }) {
  const groups = [
    { label: "Resting", players: board.resting },
    { label: "Away", players: board.away },
  ].filter((g) => g.players.length > 0);
  if (groups.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.label}>
          <h2 className="mb-2 font-display text-xl font-bold">{g.label}</h2>
          <ul className="flex flex-wrap gap-2">
            {g.players.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-full bg-surface py-1 pr-1 pl-3 ring-1 ring-line">
                <span className="font-semibold">{p.name}</span>
                {organizer && (
                  <Button size="sm" variant="court" className="rounded-full" onClick={() => run({ type: "ReturnPlayer", playerId: p.id }, `${p.name} is back in line`)}>
                    Back in line
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
