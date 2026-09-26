import type { PlayerId, QueueMode, SessionPlayer, SessionState } from "../types";

/** Games used for priority: real games + late-arrival credit − organizer boost. */
export function effectiveGames(p: SessionPlayer): number {
  return p.gamesPlayed + p.gamesCredit - p.priorityBoost;
}

/** When the player started waiting (last game end, or check-in). */
export function waitingSince(p: SessionPlayer): number {
  return p.lastPlayedAt ?? p.checkedInAt;
}

export function comparePriority(mode: QueueMode) {
  return (x: SessionPlayer, y: SessionPlayer): number => {
    if (mode !== "fifo") {
      const g = effectiveGames(x) - effectiveGames(y);
      if (g !== 0) return g;
    }
    const w = waitingSince(x) - waitingSince(y);
    if (w !== 0) return w;
    return x.seq - y.seq;
  };
}

/** All players who could be put into a match right now, best priority first. */
export function rankWaiting(state: SessionState, exclude: ReadonlySet<PlayerId> = new Set()): SessionPlayer[] {
  return Object.values(state.players)
    .filter((p) => p.status === "waiting" && !exclude.has(p.id))
    .sort(comparePriority(state.settings.queueMode));
}

/** Late-arrival rule: newcomers start at the median games of people already here. */
export function lateArrivalCredit(state: SessionState): number {
  const present = Object.values(state.players)
    .filter((p) => p.status === "waiting" || p.status === "called" || p.status === "playing")
    .map((p) => p.gamesPlayed + p.gamesCredit)
    .sort((a, b) => a - b);
  if (present.length === 0) return 0;
  const mid = Math.floor(present.length / 2);
  const median = present.length % 2 ? present[mid]! : (present[mid - 1]! + present[mid]!) / 2;
  return Math.floor(median);
}
