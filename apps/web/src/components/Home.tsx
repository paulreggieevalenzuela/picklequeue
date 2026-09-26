"use client";

import { QUEUE_MODE_LABELS, SCORING_PRESETS, type Format, type QueueMode } from "@pickle-queue/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as cloud from "@/lib/cloud";
import { useHydrated } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { toastError } from "@/lib/toast";
import { Button, Field, Input, Select } from "./ui";

const MODE_HINTS: Record<QueueMode, string> = {
  fair: "Whoever has played the fewest games goes next, then whoever has waited longest.",
  fifo: "Strictly first come, first served, like a paddle rack.",
  skill: "Fair rotation, but tries harder to keep each match within a skill band.",
  winners_stay: "Winners stay on for up to 2 games in a row; challengers come from the line.",
  stack: "Groups of 4 queue together; everyone else is matched up fairly.",
};

function dayName() {
  return new Date().toLocaleDateString(undefined, { weekday: "long" });
}

export function Home() {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessions = useStore((s) => s.sessions);
  const createSession = useStore((s) => s.createSession);
  const removeSession = useStore((s) => s.removeSession);

  const [name, setName] = useState("");
  const [courts, setCourts] = useState(4);
  const [mode, setMode] = useState<QueueMode>("fair");
  const [format, setFormat] = useState<Format>("doubles");
  const [preset, setPreset] = useState(Object.keys(SCORING_PRESETS)[0]!);
  const [code, setCode] = useState("");

  const list = Object.values(sessions)
    .map((h) => h.present)
    .sort((a, b) => b.createdAt - a.createdAt);

  function start(e: React.FormEvent) {
    e.preventDefault();
    const id = createSession({
      name: name.trim() || `${dayName()} open play`,
      courts,
      queueMode: mode,
      format,
      scoring: SCORING_PRESETS[preset]!,
    });
    router.push(`/s/${id}`);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    const local = list.find((s) => s.joinCode === c);
    if (local) return router.push(`/s/${local.id}/join`);
    const id = cloud.enabled ? await cloud.findByJoinCode(c) : null;
    if (id) router.push(`/s/${id}/join`);
    else toastError(`No session found with code ${c}. Check the code on the organizer's screen.`);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pt-10 pb-24 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-6xl leading-none font-extrabold tracking-tight sm:text-7xl">Pickle Queue</h1>
        <p className="max-w-xl text-lg text-muted">
          Run open play without the whiteboard. Everyone gets a fair turn, the line fixes itself when people come and go, and scores are kept
          courtside.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <form onSubmit={start} className="flex flex-col gap-5 rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-6">
          <h2 className="font-display text-3xl font-bold">Start a session</h2>
          <Field label="Session name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${dayName()} open play`} maxLength={60} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Courts">
              <Input type="number" min={1} max={30} value={courts} onChange={(e) => setCourts(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="Format">
              <Select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                <option value="doubles">Doubles</option>
                <option value="singles">Singles</option>
              </Select>
            </Field>
          </div>
          <Field label="Who plays next" hint={MODE_HINTS[mode]}>
            <Select value={mode} onChange={(e) => setMode(e.target.value as QueueMode)}>
              {(Object.keys(QUEUE_MODE_LABELS) as QueueMode[]).map((m) => (
                <option key={m} value={m}>
                  {QUEUE_MODE_LABELS[m]}
                  {m === "fair" ? " (recommended)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scoring">
            <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {Object.keys(SCORING_PRESETS).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" size="lg" type="submit">
            Start session
          </Button>
        </form>

        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-3xl font-bold">Your sessions</h2>
            {!hydrated ? null : list.length === 0 ? (
              <p className="text-muted">Sessions you start on this device show up here.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.map((s) => {
                  const here = Object.values(s.players).filter((p) => p.status !== "left").length;
                  return (
                    <li key={s.id} className="flex items-center gap-3 rounded-xl bg-surface p-3 ring-1 ring-line">
                      <Link href={`/s/${s.id}`} className="min-w-0 flex-1">
                        <p className="truncate font-display text-xl font-bold">{s.name}</p>
                        <p className="text-sm text-muted">
                          {new Date(s.createdAt).toLocaleDateString()}, {s.courts.length} courts, {here} players
                        </p>
                      </Link>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          if (confirm(`Delete "${s.name}" from this device?`)) removeSession(s.id);
                        }}
                      >
                        Delete
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <form onSubmit={join} className="flex flex-col gap-3">
            <h2 className="font-display text-3xl font-bold">Join a session</h2>
            <p className="text-muted">Enter the 6-letter code shown at the desk or on the courtside screen.</p>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC234"
                maxLength={6}
                aria-label="Join code"
                className="tabular font-display text-xl font-bold tracking-widest uppercase"
              />
              <Button variant="court" type="submit" disabled={code.trim().length < 6}>
                Join
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
