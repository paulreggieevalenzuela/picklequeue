"use client";

import { QUEUE_MODE_LABELS, type QueueMode, type ScoringRules, type SessionSettings } from "@pickle-queue/core";
import Link from "next/link";
import { useSession } from "@/lib/hooks";
import { SessionGate } from "./SessionGate";
import { Button, Field, Input, Select } from "./ui";
import { useRun } from "./useRun";

export function SettingsScreen({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId);
  const run = useRun(session);
  const { state } = session;
  const s = state?.settings;

  const set = (settings: Partial<Omit<SessionSettings, "scoring" | "weights">>) => run({ type: "UpdateSettings", settings }, "Settings saved");
  const setScoring = (scoring: Partial<ScoringRules>) => run({ type: "UpdateSettings", settings: { scoring } }, "Scoring rules saved");
  const num = (v: string) => Math.max(1, Number(v) || 1);

  return (
    <SessionGate status={session.status}>
      {state && s && (
        <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
          <header className="flex flex-col gap-1">
            <Link href={`/s/${sessionId}`} className="font-semibold text-muted hover:text-ink">
              Back to board
            </Link>
            <h1 className="font-display text-5xl font-extrabold">Settings</h1>
            <p className="text-muted">Changes apply to upcoming matches. Matches already called or on court stay as they are.</p>
          </header>

          <section className="flex flex-col gap-4">
            <h2 className="font-display text-3xl font-bold">Queue</h2>
            <Field label="Who plays next">
              <Select value={s.queueMode} onChange={(e) => set({ queueMode: e.target.value as QueueMode })}>
                {(Object.keys(QUEUE_MODE_LABELS) as QueueMode[]).map((m) => (
                  <option key={m} value={m}>
                    {QUEUE_MODE_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Format">
              <Select value={s.format} onChange={(e) => set({ format: e.target.value as SessionSettings["format"] })}>
                <option value="doubles">Doubles</option>
                <option value="singles">Singles</option>
              </Select>
            </Field>
            <Field label="Max games in a row" hint="After this many back-to-back games, a player sits out one rotation when others are waiting.">
              <Select
                value={s.maxConsecutive ?? ""}
                onChange={(e) => set({ maxConsecutive: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">No limit</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Upcoming matches to show per court">
              <Input type="number" min={1} max={5} defaultValue={s.lookAheadPerCourt} onBlur={(e) => set({ lookAheadPerCourt: Math.min(5, num(e.target.value)) })} />
            </Field>
            <Field label="Typical game length (minutes)" hint="Used for wait estimates until real games have been played.">
              <Input type="number" min={3} max={60} defaultValue={s.defaultMatchMinutes} onBlur={(e) => set({ defaultMatchMinutes: Math.min(60, Math.max(3, num(e.target.value))) })} />
            </Field>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="size-5 accent-court" checked={s.autoCall} onChange={(e) => set({ autoCall: e.target.checked })} />
              <span>Call the next match automatically when a court opens</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="size-5 accent-court" checked={s.lateArrivalRule} onChange={(e) => set({ lateArrivalRule: e.target.checked })} />
              <span>Late arrivals don&apos;t jump ahead of people already waiting</span>
            </label>
            <Button className="self-start" onClick={() => run({ type: "Regenerate" }, "Upcoming matches rebuilt")}>
              Rebuild upcoming matches
            </Button>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-display text-3xl font-bold">Scoring</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="System">
                <Select value={s.scoring.system} onChange={(e) => setScoring({ system: e.target.value as ScoringRules["system"] })}>
                  <option value="sideout">Side-out (traditional)</option>
                  <option value="rally">Rally</option>
                </Select>
              </Field>
              <Field label="Game to">
                <Select value={s.scoring.pointsToWin} onChange={(e) => setScoring({ pointsToWin: Number(e.target.value), switchSidesAt: Math.ceil(Number(e.target.value) / 2) })}>
                  {[11, 15, 21].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Win by">
                <Select value={s.scoring.winBy} onChange={(e) => setScoring({ winBy: Number(e.target.value) })}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </Select>
              </Field>
              <Field label="Point cap">
                <Select value={s.scoring.cap ?? ""} onChange={(e) => setScoring({ cap: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">None</option>
                  {[13, 15, 17, 23, 25].filter((n) => n > s.scoring.pointsToWin).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Match">
                <Select value={s.scoring.bestOf} onChange={(e) => setScoring({ bestOf: Number(e.target.value) as 1 | 3 })}>
                  <option value={1}>One game</option>
                  <option value={3}>Best of 3</option>
                </Select>
              </Field>
            </div>
          </section>
        </main>
      )}
    </SessionGate>
  );
}
