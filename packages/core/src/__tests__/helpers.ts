import { applyCommand, createSession, matchPlayers } from "../queue/engine";
import type { Command, QueueMode, SessionSettings, SessionState } from "../types";

export const T0 = Date.UTC(2026, 0, 1, 18, 0, 0);
export const min = (n: number) => T0 + n * 60_000;

export function session(opts: { courts?: number; mode?: QueueMode; settings?: Partial<SessionSettings> } = {}) {
  return createSession({
    id: "s1",
    name: "Friday open play",
    joinCode: "ABC234",
    now: T0,
    courts: opts.courts ?? 2,
    queueMode: opts.mode,
    settings: opts.settings,
  });
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

export function run(state: SessionState, ...cmds: DistributiveOmit<Command, "at">[]): SessionState {
  let s = state;
  let t = s.log.at(-1)?.at ?? T0;
  for (const c of cmds) s = applyCommand(s, { ...c, at: ++t } as Command);
  return s;
}

export function addPlayers(state: SessionState, n: number, skill = (i: number) => 3 + (i % 4) * 0.5) {
  let s = state;
  const start = Object.keys(s.players).length;
  for (let i = start; i < start + n; i++) {
    s = run(s, { type: "AddPlayer", player: { id: `p${i + 1}`, name: `Player ${i + 1}`, skill: skill(i) } });
  }
  return s;
}

export const byStatus = (s: SessionState, status: SessionState["matches"][number]["status"]) =>
  s.matches.filter((m) => m.status === status);

/** Invariant: nobody is in two unfinished matches at once. */
export function assertNoDoubleBooking(s: SessionState) {
  const seen = new Set<string>();
  for (const m of s.matches) {
    if (m.status === "completed" || m.status === "cancelled") continue;
    for (const id of matchPlayers(m)) {
      if (seen.has(id)) throw new Error(`${id} is in two matches`);
      seen.add(id);
    }
  }
}
