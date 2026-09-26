/**
 * Simulation harness: a 3-hour session, 40 players, 4 courts.
 * Reports games-per-player spread, repeat-partner rate and average wait,
 * so queue weights can be tuned with data.
 *
 *   pnpm simulate            # all modes
 *   pnpm simulate fair 60 5  # mode, players, courts
 */
import {
  applyCommand,
  createSession,
  matchPlayers,
  type Command,
  type QueueMode,
  type SessionState,
} from "../src/index";

const MODES: QueueMode[] = ["fair", "fifo", "skill", "winners_stay"];
const [modeArg, playersArg, courtsArg] = process.argv.slice(2);
const PLAYERS = Number(playersArg ?? 40);
const COURTS = Number(courtsArg ?? 4);
const HOURS = 3;

// Deterministic PRNG so runs are comparable.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(mode: QueueMode) {
  const rand = mulberry32(42);
  const t0 = Date.UTC(2026, 0, 1, 18);
  let s: SessionState = createSession({ id: "sim", name: "Sim", joinCode: "SIM", now: t0, courts: COURTS, queueMode: mode });
  const apply = (c: Command) => (s = applyCommand(s, c));

  // Arrivals spread over the first hour; ~10% leave after 2 hours.
  const arrivals = Array.from({ length: PLAYERS }, (_, i) => ({
    id: `p${i}`,
    at: t0 + (i < PLAYERS * 0.6 ? 0 : Math.floor(rand() * 60)) * 60_000,
    skill: Math.round((2.5 + rand() * 2.5) * 2) / 2,
  })).sort((a, b) => a.at - b.at);

  const ends = new Map<string, number>(); // matchId → finish time
  const waits: number[] = [];
  const waitStart = new Map<string, number>();

  for (let t = t0; t < t0 + HOURS * 3_600_000; t += 60_000) {
    for (const a of arrivals.filter((x) => x.at === t)) {
      apply({ type: "AddPlayer", at: t, player: { id: a.id, name: a.id, skill: a.skill } });
      waitStart.set(a.id, t);
    }
    if (t === t0 + 2 * 3_600_000) {
      for (const p of Object.values(s.players).slice(0, Math.floor(PLAYERS / 10))) {
        if (p.status === "waiting") apply({ type: "RemovePlayer", at: t, playerId: p.id });
      }
    }
    for (const m of s.matches.filter((x) => x.status === "called")) {
      apply({ type: "StartMatch", at: t, matchId: m.id });
      for (const id of matchPlayers(m)) {
        const since = waitStart.get(id);
        if (since !== undefined) waits.push((t - since) / 60_000);
      }
      ends.set(m.id, t + (10 + Math.floor(rand() * 10)) * 60_000);
    }
    for (const m of s.matches.filter((x) => x.status === "in_progress" && (ends.get(x.id) ?? Infinity) <= t)) {
      const aWins = rand() < 0.5;
      const loser = Math.floor(rand() * 10);
      apply({ type: "CompleteMatch", at: t, matchId: m.id, scoreA: aWins ? 11 : loser, scoreB: aWins ? loser : 11 });
      for (const id of matchPlayers(m)) waitStart.set(id, t);
    }
  }

  const present = Object.values(s.players).filter((p) => p.checkedInAt <= t0);
  const games = present.map((p) => p.gamesPlayed);
  const pairs = Object.values(s.pairHistory);
  const partnerships = pairs.filter((p) => p.partner > 0);
  const repeats = partnerships.filter((p) => p.partner > 1).length;
  const completed = s.matches.filter((m) => m.status === "completed").length;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

  return {
    mode,
    matches: completed,
    "games min/avg/max (on-time arrivals)": `${Math.min(...games)} / ${avg(games).toFixed(1)} / ${Math.max(...games)}`,
    "repeat partner rate": `${((repeats / Math.max(1, partnerships.length)) * 100).toFixed(1)}%`,
    "avg wait (min)": avg(waits).toFixed(1),
    "max wait (min)": Math.max(...waits).toFixed(0),
  };
}

const modes = modeArg ? [modeArg as QueueMode] : MODES;
console.log(`\n${PLAYERS} players · ${COURTS} courts · ${HOURS}h\n`);
console.table(modes.map(simulate));
