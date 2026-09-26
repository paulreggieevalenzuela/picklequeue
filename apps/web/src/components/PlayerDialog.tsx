"use client";

import type { SessionPlayer, SessionState } from "@pickle-queue/core";
import { useState } from "react";
import { Button, Dialog, Field, Input, Select } from "./ui";
import type { Run } from "./types";

export const SKILLS = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export function PlayerDialog({ state, player, open, onClose, run }: { state: SessionState; player: SessionPlayer; open: boolean; onClose: () => void; run: Run }) {
  const [name, setName] = useState(player.name);
  const [skill, setSkill] = useState(String(player.skill));
  const [boost, setBoost] = useState(String(player.priorityBoost));
  const [partner, setPartner] = useState(player.partnerRequestId ?? "");
  const others = Object.values(state.players).filter((p) => p.id !== player.id && p.status !== "left");

  function save() {
    const ok =
      run({ type: "UpdatePlayer", playerId: player.id, name, skill: Number(skill), priorityBoost: Number(boost) }) &&
      ((partner || null) === player.partnerRequestId || run({ type: "SetPartnerRequest", playerId: player.id, partnerId: partner || null }));
    if (ok) onClose();
  }

  const act = (type: "SetAway" | "RemovePlayer", msg: string) => {
    if (run({ type, playerId: player.id }, msg)) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={player.name}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {player.gamesPlayed} games, {player.wins} won, {player.losses} lost, points {player.pointsFor}–{player.pointsAgainst}
        </p>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Skill level">
          <Select value={skill} onChange={(e) => setSkill(e.target.value)}>
            {SKILLS.map((s) => (
              <option key={s} value={s}>
                {s.toFixed(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Play with" hint="The queue tries to put them on the same team.">
          <Select value={partner} onChange={(e) => setPartner(e.target.value)}>
            <option value="">No preference</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority boost" hint="Each point moves them up as if they'd played one game fewer.">
          <Input type="number" min={-5} max={5} value={boost} onChange={(e) => setBoost(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={save}>
            Save changes
          </Button>
          <Button onClick={() => act("SetAway", `${player.name} is away and keeps their place`)}>Mark away</Button>
          <Button variant="danger" onClick={() => act("RemovePlayer", `${player.name} checked out`)}>
            Check out
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
