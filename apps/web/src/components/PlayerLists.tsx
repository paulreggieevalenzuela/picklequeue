"use client";

import { formatRoster, makeId, parsePlayerList, type SessionState } from "@pickle-queue/core";
import { useMemo, useState } from "react";
import { toast, toastError } from "@/lib/toast";
import { Button, Dialog, SkillBadge } from "./ui";
import type { Run } from "./types";

/** Check in a whole list at once, e.g. pasted from the group chat. One undo removes them all. */
export function PasteList({ state, run, open, onClose }: { state: SessionState; run: Run; open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [defaultSkill, setDefaultSkill] = useState(3);
  const entries = useMemo(() => parsePlayerList(text, state), [text, state]);
  const adding = entries.filter((e) => !e.skip);
  const rejoining = adding.filter((e) => e.existingId);
  const fresh = adding.filter((e) => !e.existingId);

  function checkIn() {
    let ok = true;
    if (fresh.length) {
      ok = run({
        type: "AddPlayers",
        players: fresh.map((e) => ({ id: makeId("p_"), name: e.name, skill: e.skill ?? defaultSkill })),
      });
    }
    for (const e of rejoining) ok = run({ type: "ReturnPlayer", playerId: e.existingId! }) && ok;
    if (ok) {
      toast(`${adding.length} ${adding.length === 1 ? "player" : "players"} checked in`);
      setText("");
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Paste a list">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          One name per line, or separated by commas. Numbers, bullets and emoji are ignored. Add a skill level after a name if you know it, like
          &ldquo;Maria Santos 3.5&rdquo; or &ldquo;Jun Reyes - 4&rdquo;.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"1. Maria Santos 3.5\n2. Jun Reyes\n3. Ana Cruz"}
          aria-label="Player list"
          className="w-full rounded-lg border border-line bg-surface p-3 text-ink placeholder:text-muted"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold">Skill for names without one</span>
          <select
            value={defaultSkill}
            onChange={(e) => setDefaultSkill(Number(e.target.value))}
            className="min-h-9 rounded-lg border border-line bg-surface px-2"
          >
            {[2, 2.5, 3, 3.5, 4, 4.5, 5].map((s) => (
              <option key={s} value={s}>
                {s.toFixed(1)}
              </option>
            ))}
          </select>
        </label>
        {entries.length > 0 && (
          <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg ring-1 ring-line">
            {entries.map((e, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className={e.skip ? "text-muted line-through" : "font-semibold"}>{e.name}</span>
                {!e.skip && <SkillBadge skill={e.skill ?? defaultSkill} />}
                <span className="ml-auto text-xs text-muted">
                  {e.skip === "duplicate" ? "Listed twice" : e.skip === "already_here" ? "Already checked in" : e.existingId ? "Checking back in" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button variant="primary" onClick={checkIn} disabled={adding.length === 0}>
            {adding.length ? `Check in ${adding.length} ${adding.length === 1 ? "player" : "players"}` : "Check in"}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Copies the current roster (courts, line with waiting times, resting, checked out) for the group chat. */
export function CopyListButton({ state, size = "sm" }: { state: SessionState; size?: "sm" | "md" }) {
  async function copy() {
    const text = formatRoster(state, Date.now());
    try {
      await navigator.clipboard.writeText(text);
      toast("Player list copied. Paste it in your group chat.");
    } catch {
      toastError("Couldn't copy: the browser blocked clipboard access.");
    }
  }
  return (
    <Button size={size} onClick={copy}>
      Copy list
    </Button>
  );
}
