import type { Court, Match, PlayerId, SessionPlayer, SessionState, Timestamp } from "../types";
import { courtMatch, matchPlayers, proposedMatches } from "./engine";
import { teamSize } from "./matchmaking";
import { rankWaiting } from "./priority";

export interface CourtView {
  court: Court;
  match: Match | null;
  /** Minutes since the match was called/started. */
  elapsedMin: number | null;
}

export interface QueueEntry {
  player: SessionPlayer;
  /** 1-based place in line. */
  position: number;
  /** Estimated minutes until on court. */
  etaMin: number;
  /** Index into `upNext`, if already slotted into a proposed match. */
  upNextIndex: number | null;
}

export interface Board {
  courts: CourtView[];
  upNext: { match: Match; etaMin: number }[];
  queue: QueueEntry[];
  onCourt: SessionPlayer[];
  resting: SessionPlayer[];
  away: SessionPlayer[];
  avgMatchMin: number;
}

export function averageMatchMinutes(state: SessionState): number {
  const done = state.matches.filter((m) => m.status === "completed" && m.startedAt && m.endedAt).slice(-20);
  if (done.length < 3) return state.settings.defaultMatchMinutes;
  const total = done.reduce((s, m) => s + (m.endedAt! - m.startedAt!), 0);
  return Math.max(4, Math.round(total / done.length / 60000));
}

/** Read model for dashboards, TV mode and the player "my status" screen. */
export function getBoard(state: SessionState, now: Timestamp): Board {
  const avg = averageMatchMinutes(state);
  const active = state.courts.filter((c) => c.active);

  const courts: CourtView[] = state.courts.map((court) => {
    const match = courtMatch(state, court.id) ?? null;
    const since = match?.startedAt ?? match?.calledAt ?? null;
    return { court, match, elapsedMin: since ? Math.floor((now - since) / 60000) : null };
  });

  // When does each active court next free up?
  const freeAt = active
    .map((c) => {
      const cv = courts.find((x) => x.court.id === c.id)!;
      if (!cv.match) return 0;
      return Math.max(1, avg - (cv.elapsedMin ?? 0));
    })
    .sort((a, b) => a - b);
  const lanes = Math.max(1, freeAt.length);
  const etaForSlot = (i: number) => Math.round((freeAt[i % lanes] ?? 0) + Math.floor(i / lanes) * avg);

  const upNext = proposedMatches(state).map((match, i) => ({ match, etaMin: etaForSlot(i) }));

  const slotted = new Map<PlayerId, number>();
  upNext.forEach(({ match }, i) => matchPlayers(match).forEach((id) => slotted.set(id, i)));

  const ranked = rankWaiting(state);
  const inUpNext = ranked
    .filter((p) => slotted.has(p.id))
    .sort((a, b) => slotted.get(a.id)! - slotted.get(b.id)!);
  const rest = ranked.filter((p) => !slotted.has(p.id));
  const perMatch = teamSize(state.settings.format) * 2;

  const queue: QueueEntry[] = [...inUpNext, ...rest].map((player, i) => {
    const up = slotted.get(player.id) ?? null;
    const virtualSlot = up ?? upNext.length + Math.floor((i - inUpNext.length) / perMatch);
    return { player, position: i + 1, etaMin: etaForSlot(virtualSlot), upNextIndex: up };
  });

  const players = Object.values(state.players);
  return {
    courts,
    upNext,
    queue,
    onCourt: players.filter((p) => p.status === "called" || p.status === "playing"),
    resting: players.filter((p) => p.status === "resting"),
    away: players.filter((p) => p.status === "away"),
    avgMatchMin: avg,
  };
}

export interface PlayerStatusView {
  player: SessionPlayer;
  entry: QueueEntry | null;
  liveMatch: Match | null;
  courtName: string | null;
}

export function getPlayerStatus(state: SessionState, playerId: PlayerId, now: Timestamp): PlayerStatusView | null {
  const player = state.players[playerId];
  if (!player) return null;
  const board = getBoard(state, now);
  const liveMatch =
    state.matches.find((m) => (m.status === "called" || m.status === "in_progress") && matchPlayers(m).includes(playerId)) ?? null;
  return {
    player,
    entry: board.queue.find((q) => q.player.id === playerId) ?? null,
    liveMatch,
    courtName: liveMatch ? (state.courts.find((c) => c.id === liveMatch.courtId)?.name ?? null) : null,
  };
}
