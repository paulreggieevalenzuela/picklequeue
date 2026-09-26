"use client";

import { makeId } from "@pickle-queue/core";
import { useState } from "react";
import { SKILLS } from "./PlayerDialog";
import { Button, Input, Select } from "./ui";
import type { Run } from "./types";

export function AddPlayer({ run, onAdded }: { run: Run; onAdded?: (id: string) => void }) {
  const [name, setName] = useState("");
  const [skill, setSkill] = useState("3");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        const id = makeId("p_");
        if (run({ type: "AddPlayer", player: { id, name: trimmed, skill: Number(skill) } }, `${trimmed} checked in`)) {
          setName("");
          onAdded?.(id);
        }
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" aria-label="Player name" maxLength={40} />
      <div className="w-24 shrink-0">
      <Select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill level">
        {SKILLS.map((s) => (
          <option key={s} value={s}>
            {s.toFixed(1)}
          </option>
        ))}
      </Select>
      </div>
      <Button variant="court" type="submit" disabled={!name.trim()}>
        Add
      </Button>
    </form>
  );
}
