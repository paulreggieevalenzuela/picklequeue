"use client";

import { getBoard, makeId, teamSize, type Match, type SessionState } from "@pickle-queue/core";
import { useMemo, useState } from "react";
import { Button, Dialog, Field, Select } from "./ui";
import type { Run } from "./types";

/**
 * Create or edit a match. Everyone picked here is pinned: the auto-queue
 * rebuilds the other upcoming matches around them, and anyone swapped out
 * keeps their original place in line.
 */
export function MatchEditor({
  state,
  match,
  open,
  onClose,
  run,
}: {
  state: SessionState;
  match?: Match;
  open: boolean;
  onClose: () => void;
  run: Run;
}) {
  const format = match?.format ?? state.settings.format;
  const size = teamSize(format);
  const [seats, setSeats] = useState<string[]>(() => {
    const pad = (ids: string[]) => Array.from({ length: size }, (_, i) => ids[i] ?? "");
    return [...pad(match?.teamA ?? []), ...pad(match?.teamB ?? [])];
  });
  const [courtId, setCourtId] = useState<string>(match?.courtId ?? "");

  const options = useMemo(() => {
    // Queue order doesn't depend on the clock (only ETAs do).
    const board = getBoard(state, state.createdAt);
    const pos = new Map(board.queue.map((q) => [q.player.id, q.position]));
    const inThis = new Set([...(match?.teamA ?? []), ...(match?.teamB ?? [])]);
    return Object.values(state.players)
      .filter((p) => p.status === "waiting" || inThis.has(p.id))
      .sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
      .map((p) => ({
        id: p.id,
        label: `${p.name} (${p.skill.toFixed(1)})${pos.has(p.id) ? `, #${pos.get(p.id)} in line` : ""}${p.gamesPlayed ? `, ${p.gamesPlayed} played` : ""}`,
      }));
  }, [state, match]);

  const isNew = !match;
  const freeCourts = state.courts.filter(
    (c) => c.active && !state.matches.some((m) => m.courtId === c.id && (m.status === "called" || m.status === "in_progress") && m.id !== match?.id),
  );
  const teamA = seats.slice(0, size).filter(Boolean);
  const teamB = seats.slice(size).filter(Boolean);

  function save() {
    const ok = isNew
      ? run({ type: "CreateMatch", matchId: makeId("m_"), teamA, teamB, courtId: courtId || null }, "Match created. The queue was rebuilt around it.")
      : run(
          { type: "EditMatch", matchId: match.id, teamA, teamB, courtId: match.status === "called" ? courtId || match.courtId : courtId || null },
          "Match updated. Anyone swapped out kept their place.",
        );
    if (ok) onClose();
  }

  const seat = (i: number, label: string) => (
    <Field key={i} label={label}>
      <Select value={seats[i]} onChange={(e) => setSeats((s) => s.map((v, j) => (j === i ? e.target.value : v)))}>
        <option value="">Open seat (fill from queue)</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={seats.includes(o.id) && seats[i] !== o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Dialog open={open} onClose={onClose} title={isNew ? "New match" : "Edit match"}>
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-display text-xl font-bold">Team A</legend>
          {Array.from({ length: size }, (_, i) => seat(i, `Player ${i + 1}`))}
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-display text-xl font-bold">Team B</legend>
          {Array.from({ length: size }, (_, i) => seat(size + i, `Player ${i + 1}`))}
        </fieldset>
        {(isNew || match.status !== "in_progress") && (
          <Field
            label="Court"
            hint={match?.status === "called" ? undefined : "Pick a free court to start now, or leave it for the next court that opens."}
          >
            <Select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
              {match?.status !== "called" && <option value="">Next free court</option>}
              {state.courts
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id} disabled={!freeCourts.some((f) => f.id === c.id) && match?.status === "called"}>
                    {c.name}
                    {freeCourts.some((f) => f.id === c.id) ? " (free)" : ""}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <p className="text-sm text-muted">
          Players you pick stay fixed. The rest of the upcoming matches are rebuilt around them.
        </p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={save} disabled={teamA.length + teamB.length === 0}>
            {isNew ? "Create match" : "Save changes"}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
