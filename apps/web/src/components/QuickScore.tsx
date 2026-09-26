"use client";

import { finalScore, matchScore, type Match, type SessionState } from "@pickle-queue/core";
import { useState } from "react";
import { Button, Dialog, Input } from "./ui";
import type { Run } from "./types";

/** "Final score only" mode: type 11–7 and move on. */
export function QuickScore({ state, match, open, onClose, run }: { state: SessionState; match: Match; open: boolean; onClose: () => void; run: Run }) {
  const live = matchScore(state, match);
  const known = finalScore(live);
  const target = state.settings.scoring.pointsToWin;
  const [a, setA] = useState(String(known?.a ?? (match.scoreEvents.length ? live.a : "")));
  const [b, setB] = useState(String(known?.b ?? (match.scoreEvents.length ? live.b : "")));
  const names = (ids: string[]) => ids.map((id) => state.players[id]?.name ?? "?").join(" & ");
  const na = Number(a);
  const nb = Number(b);
  const valid = a !== "" && b !== "" && na !== nb && na >= 0 && nb >= 0;

  function save() {
    if (run({ type: "CompleteMatch", matchId: match.id, scoreA: na, scoreB: nb }, `Result saved: ${na}–${nb}`)) onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Final score">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save();
        }}
      >
        {[
          { label: names(match.teamA), value: a, set: setA },
          { label: names(match.teamB), value: b, set: setB },
        ].map((t, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 font-semibold">{t.label}</span>
            <div className="w-24 shrink-0">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              className="tabular text-center font-display text-3xl font-bold"
              value={t.value}
              onChange={(e) => t.set(e.target.value)}
              aria-label={`Score for ${t.label}`}
            />
            </div>
            <Button type="button" size="sm" variant="quiet" onClick={() => t.set(String(target))}>
              {target}
            </Button>
          </div>
        ))}
        {a !== "" && b !== "" && na === nb && <p className="text-sm text-danger">A game can&apos;t end in a tie.</p>}
        <div className="flex gap-2">
          <Button variant="primary" type="submit" disabled={!valid}>
            Save result
          </Button>
          <Button variant="quiet" type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
